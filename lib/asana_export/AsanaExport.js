var ae = require("./");

var fs = require('fs');
var crypto = require('crypto');
function hashFile(path, algorithm) {
    var future = new ae.aei.Future;
    var hash = crypto.createHash(algorithm || "sha1");
    var input = fs.ReadStream(path);
    input.on("data", function(d) { hash.update(d); });
    input.on("end", function() { future.return(hash.digest("hex")); });
    input.on("error", function(e) { future.throw(e); });
    return future.wait();
}

var AsanaExport = module.exports = ae.aei.Export.extend().newSlots({
    db: null,
    dbDirectory: "db"
}).setSlots({
    init: function() {
        this.setDb(ae.AsanaExportDb.clone());
        this._caches = {};
    },

    prepareForImport: function() {
        this._processExportFile();
    },

    cleanupAfterImport: function() {
        // this.db().destroy();
    },

    _processExportFile: function() {
        this.db().setPath(this.dbDirectory() + "/importer-" + hashFile(this.path()) + ".sqlite3");

        if (this.db().exists()) {
            return;
        }

        try {
            this.db().create();
            var lineReader = ae.LineReader.clone().setPath(this.path());
            this._readLines(lineReader);
        } catch (e) {
            this.db().destroy();
            throw e;
        }
    },

    _readLines: function(lineReader) {
        var i = 0;
        var importedTypes = {};
        var skippedTypes = {};

        var line = null;
        while(line = lineReader.readLine()) {
            var obj = JSON.parse(line);

            if (obj.__trashed_at || obj.deactivated) {
                skippedTypes[obj.__type] = (skippedTypes[obj.__type] || 0) + 1;
                continue;
            }

            importedTypes[obj.__type] = (importedTypes[obj.__type] || 0) + 1;

            this.db().insert(obj);

            i++;
            if (i % 1000 == 0) {
                console.log("Read line " + i);
            }
        }

        // console.log("imported: ", importedTypes);
        // console.log("skipped: ", skippedTypes);
    },

    _callMethodCached: function(name) {
        if (!this._caches[name]) {
            this._caches[name] = this[name]();
        }
        return this._caches[name];
    },

    users: function() {
        return this._callMethodCached("_users");
    },

    _users: function() {
        var self = this;
        return this.db().findByType("User").map(function(obj){
            var du = self.db().findByType("DomainUser").filterProperty("user", obj.__object_id).first();
            if (!du || du.active === false) {
                return null;
            } else {
                return ae.aei.User.clone().performSets({
                    sourceId: obj.__object_id,
                    name: obj.name,
                    email: du.email,
                    sourceItemIds: du.task_list ? self.db().findById(du.task_list).items : []
                });
            }
        }).emptiesRemoved();
    },

    teams: function() {
        var self = this;
        return this.db().findByType("Team").map(function(obj){
            var teamName = obj.name === "" ? "Unnamed team" : obj.name;
            return ae.aei.Team.clone().performSets({
                sourceId: obj.__object_id,
                name: teamName,
                teamType: obj.team_type,
                sourceMemberIds: self.db().findByType("TeamMembership").filter(function(tm) { return tm.team === obj.__object_id && tm.limited_access !== true; }).map(function(tm){ return Object.perform(self._userForDomainUserId(tm.member), "sourceId") }).emptiesRemoved()
            });
        });
    },

    projects: function() {
        var self = this;
        return this.db().findByType("ItemList").map(function(obj){
            if (obj.is_project && !obj.assignee) {
                var sourceMemberIds = self.db().findByType("ProjectMembership").filterProperty("project", obj.__object_id).map(function(pm){ return Object.perform(self._userForDomainUserId(pm.member), "sourceId") }).emptiesRemoved();
                // In product we filter the followers list and only count as valid those which are also members. However
                // the export includes all followers regardless of whether or not they are members. Everyone who is added
                // as a follower via the API is automatically added as a member, so to avoid granting people additional
                // access we need to filter out non-member followers.
                var sourceFollowerIds = obj.followers_du.map(function(duid){ return Object.perform(self._userForDomainUserId(duid), "sourceId") }).filter(function(uid){ return sourceMemberIds.contains(uid); }).emptiesRemoved();
                return ae.aei.Project.clone().performSets({
                    sourceId: obj.__object_id,
                    name: obj.name,
                    notes: obj.description || "",
                    archived: obj.is_archived || false,
                    public: obj.is_public_to_workspace || false,
                    color: obj.color || null,
                    sourceTeamId: obj.team || null,
                    sourceItemIds: obj.items,
                    sourceMemberIds: sourceMemberIds,
                    sourceFollowerIds: sourceFollowerIds
                });
            }
        }).filter(function(project) { return project && project.sourceTeamId(); });
    },

    tags: function() {
        return this.db().findByType("ItemList").map(function(obj){
            if (!obj.is_project && !obj.assignee) {
                return ae.aei.Tag.clone().performSets({
                    sourceId: obj.__object_id,
                    name: obj.name,
                    sourceTeamId: obj.team,
                    sourceItemIds: obj.items
                });
            }
        }).emptiesRemoved();
    },

    taskDataSource: function() {
        var self = this;
        return function(position, chunkSize) {
            return self.db().findByType("Task", position, chunkSize).map(function(obj){
                var storyTexts = {};
                if (obj.stories.length > 0) {
                    self.db().findChildrenByTypesLike(obj.__object_id, ["Comment", "Story"]).forEach(function(story) {
                        if (story.__type === "AddAttachmentStory") {
                            return;
                        }
                        storyTexts[story.__object_id] = self._formatStory(story);
                    });
                }

                var creationStory = self._formatStory({
                    __creation_time: obj.__creation_time || 0,
                    creator_du: obj.creator_du,
                    text: "created task."
                });
                var realStories = obj.stories.map(function (storyId) {
                    return storyTexts[storyId];
                }).emptiesRemoved();

                return ae.aei.Task.clone().performSets({
                    sourceId: obj.__object_id,
                    name: obj.name,
                    notes: obj.rich_description || "",
                    completed: obj.completed !== undefined,
                    dueOn: obj.due_date || null,
                    public: obj.force_public_to_workspace || false,
                    assigneeStatus: self._assigneeStatusForScheduleStatus(obj.schedule_status) || null,
                    sourceAssigneeId: Object.perform(self._userForDomainUserId(obj.assignee), "sourceId") || null,
                    sourceItemIds: obj.items,
                    sourceFollowerIds: obj.followers_du.map(function(duid){ return Object.perform(self._userForDomainUserId(duid), "sourceId") }).emptiesRemoved(),
                    stories: [creationStory].concat(realStories),
                    recurrenceType: obj.recurrence_type || null,
                    recurrenceData: obj.recurrence_json || null
                });
            });
        }
    },

    attachmentDataSource: function() {
        var self = this;
        return function(position, chunkSize) {
            return self.db().findByType("Asset", position, chunkSize).map(function(obj){
                var sourceParentId = self.db().findParentsByType(obj.__object_id, "Task").mapProperty("__object_id").first();

                if (!sourceParentId) {
                    // This attachment has a parent which doesn't exist in the export. The task was probably trashed.
                    return ae.aei.Attachment.clone().performSets({
                        sourceId: obj.__object_id,
                        skip: true
                    });
                } else {
                    return ae.aei.Attachment.clone().performSets({
                        sourceId: obj.__object_id,
                        sourceParentId: sourceParentId
                    });
                }
            });
        }
    },

    _formatStory: function(obj) {
        var user = this._userForDomainUserId(obj.creator_du);
        var pretty_date = new Date(obj.__creation_time).toAsanaString();
        if (user) {
            if (obj.__type === "Comment") {
                return user.name() + "\n" + obj.text + "\n" + pretty_date;
            } else {
                return user.name() + " " + obj.text + "\n" + pretty_date;
            }
        } else {
            return obj.text + "\n" + pretty_date;
        }
    },

    _userForDomainUserId: function(domainUserId) {
        var du = this.db().findById(domainUserId);
        return this.users().detectSlot("sourceId", du && du.user);
    },

    _assigneeStatusForScheduleStatus: function(scheduleStatus) {
        switch (scheduleStatus) {
            case "INBOX": return "inbox";
            case "TODAY": return "today";
            case "UPCOMING": return "upcoming";
            case "OK": return "later";
        }
        return undefined;
    }
});
