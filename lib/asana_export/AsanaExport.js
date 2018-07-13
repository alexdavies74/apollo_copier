var ae = require("./");

var fs = require('fs');
var crypto = require('crypto');
var htmlEscape = require('html-escape');

function hashFile(path, algorithm) {
    var future = new ae.aei.Future;
    var hash = crypto.createHash(algorithm || "sha1");
    var input = fs.ReadStream(path);
    input.on("data", function(d) { hash.update(d); });
    input.on("end", function() { future.return(hash.digest("hex")); });
    input.on("error", function(e) { future.throw(e); });
    return future.wait();
}

/**
 * The library thinks that it's ok to leave > characters. Lazy.
 */
function htmlEscapeFully(unescaped) {
    if (unescaped === undefined || unescaped === null) {
        return unescaped;
    }

    return htmlEscape(unescaped).replace(">", "&gt;");
}

var AsanaExport = module.exports = ae.aei.Export.extend().newSlots({
    db: null,
    dbDirectory: "db",
    referenceDate: Date.parse("2016-01-01"),
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
            this._populateJoinObjectRelationships();
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

    _populateJoinObjectRelationships: function() {
        console.log("Populating join objects");
        this._populateColumnTaskRelationships();
        this._populateTaskDependencyRelationships();
        this._populateCustomPropertyEnumOptions();
        this._populateCustomPropertyProjectSettings();
        this._populateCustomPropertyValues();
    },

    _populateColumnTaskRelationships: function() {
        var self = this;
        this.db().findByType("ColumnTask").forEach(function(obj) {
            self.db().insertOrderedRelationship("column_task", obj.column, obj.task, obj.rank);
        });
    },

    _populateTaskDependencyRelationships: function() {
        var self = this;
        this.db().findByType("TaskDependency").forEach(function(obj) {
            self.db().insertRelationship("task_dependency", obj.dependent, obj.precedent);
        });
    },

    _populateCustomPropertyEnumOptions: function() {
        var self = this;
        this.db().findByType("CustomPropertyEnumOption").forEach(function(obj) {
            self.db().insertOrderedRelationship("custom_field_enum_option", obj.proto, obj.__object_id, obj.rank);
        });
    },

    _populateCustomPropertyProjectSettings: function() {
        var self = this;
        this.db().findByType("CustomPropertyProjectSetting").forEach(function(obj) {
            self.db().insertOrderedRelationship("custom_field_project_settings", obj.project, obj.__object_id, obj.rank);
        });
    },

    _populateCustomPropertyValues: function() {
        var self = this;
        ["CustomPropertyTextValue", "CustomPropertyNumberValue", "CustomPropertyEnumValue"].forEach(function(typeName) {
            self.db().findByType(typeName).forEach(function(obj) {
                self.db().insertRelationship("custom_field_values", obj.object, obj.__object_id);
            });
        });
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

    customFieldProtos: function() {
        var self = this;
        var createBasicCustomFieldProto = function(obj) {
            return ae.aei.CustomFieldProto.clone().performSets({
                sourceId: obj.__object_id,
                name: obj.name,
                description: obj.description,
                creationSource: obj.creation_source
            });
        };

        var textProtos = self.db().findByType("CustomPropertyTextProto").map(function(obj) {
            return createBasicCustomFieldProto(obj).performSets({
                type: "text"
            });
        });

        var numberProtos = self.db().findByType("CustomPropertyNumberProto").map(function(obj) {
            return createBasicCustomFieldProto(obj).performSets({
                type: "number",
                precision: obj.precision
            });
        });

        var enumProtos = self.db().findByType("CustomPropertyEnumProto").map(function(obj) {
            var options = self.db().findOrderedChildrenByType("custom_field_enum_option", obj.__object_id, "CustomPropertyEnumOption").map(function(option) {
                return {
                    sourceId: option.__object_id,
                    name: option.name,
                    enabled: !option.is_archived,
                    color: option.color
                };
            });
            return createBasicCustomFieldProto(obj).performSets({
                type: "enum",
                options: options
            });
        });

        return textProtos.concat(numberProtos, enumProtos);
    },

    projects: function() {
        var self = this;
        var columnsBySourceProjectId = this.columnsBySourceProjectId();
        return this.db().findByType("ItemList").map(function(obj){
            if (obj.is_project && !obj.assignee) {
                var sourceMemberIds = self.db().findByType("ProjectMembership").filterProperty("project", obj.__object_id).map(function(pm){
                    return Object.perform(self._userForDomainUserId(pm.member), "sourceId")
                }).emptiesRemoved();
                // In product we filter the followers list and only count as valid those which are also members. However
                // the export includes all followers regardless of whether or not they are members. Everyone who is added
                // as a follower via the API is automatically added as a member, so to avoid granting people additional
                // access we need to filter out non-member followers.
                var sourceFollowerIds = obj.followers_du.map(function(duid){
                    return Object.perform(self._userForDomainUserId(duid), "sourceId")
                }).filter(function(uid){
                    return sourceMemberIds.contains(uid);
                }).emptiesRemoved();

                var isBoard = columnsBySourceProjectId[obj.__object_id] !== undefined;

                var customFieldSettings = self.db().findOrderedChildrenByType("custom_field_project_settings", obj.__object_id, "CustomPropertyProjectSetting").map(function(projectSetting) {
                    return {
                        sourceCustomFieldProtoId: projectSetting.proto,
                        isImportant: projectSetting.is_important,
                        sourceId: projectSetting.__object_id
                    };
                });

                return ae.aei.Project.clone().performSets({
                    creator: Object.perform(self._userForDomainUserId(obj.creator_du), "sourceId"),
                    sourceId: obj.__object_id,
                    name: obj.name,
                    notes: obj.description || "",
                    archived: obj.is_archived || false,
                    public: obj.is_public_to_workspace || false,
                    color: obj.color || null,
                    isBoard: isBoard,
                    sourceTeamId: obj.team || null,
                    sourceItemIds: obj.items,
                    sourceMemberIds: sourceMemberIds,
                    sourceFollowerIds: sourceFollowerIds,
                    customFieldSettings: customFieldSettings
                });
            }
        }).filter(function(project) { return project && project.sourceTeamId(); });
    },

    columns: function() {
        var self = this;
        return self.db().findByType("Column").filter(function(column) {
            var pot  = self.db().findById(column.pot);
            // If the pot is missing, it was probably trashed in the export, and so we should skip all its
            // columns, including (importantly) adding tasks to them.
            return pot !== undefined;
        }).sort(function(columnA, columnB) {
            return columnA.rank.localeCompare(columnB.rank);
        }).map(function(obj) {
            var tasks = self.db().findOrderedChildrenByType("column_task", obj.__object_id, "Task").map(function(task) {
                return task.__object_id;
            });

            var columnName = obj.name === "" ? "Unnamed column" : obj.name;
            return ae.aei.Column.clone().performSets({
                sourceId: obj.__object_id,
                name: columnName,
                sourceProjectId: obj.pot,
                sourceItemIds: tasks
            });
        });
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
                    self.db().findChildrenByType("story", obj.__object_id, "Comment").forEach(function(story) {
                        storyTexts[story.__object_id] = { creator: Object.perform(self._userForDomainUserId(story.creator_du), "sourceId"), text: story.text };
                    });
                }

                var realStories = obj.stories.map(function (storyId) {
                    return storyTexts[storyId];
                }).emptiesRemoved();

                var blockingTaskIds = self.db().findChildrenByType("task_dependency", obj.__object_id, "Task").map(function(task) {
                    return task.__object_id;
                });

                var customFieldValues = self.db().findChildrenByTypesLike("custom_field_values", obj.__object_id, ["CustomProperty%Value"]).map(function(value) {
                    var toReturn = {
                        protoSourceId: value.proto
                    };

                    if (value.__type === "CustomPropertyTextValue") {
                        toReturn.type = "text";
                        toReturn.value = value.text;
                    } else  if (value.__type === "CustomPropertyNumberValue") {
                        toReturn.type = "number";
                        toReturn.value = value.digits;
                    } else if (value.__type === "CustomPropertyEnumValue") {
                        var option  = self.db().findById(value.option);
                        if (option.is_archived !== false) {
                            // Filter out values which are archived options
                            return null;
                        }

                        toReturn.type = "enum";
                        toReturn.value = value.option;
                    }

                    return toReturn;
                }).emptiesRemoved();

                return ae.aei.Task.clone().performSets({
                    creator: Object.perform(self._userForDomainUserId(obj.creator_du), "sourceId"),
                    sourceId: obj.__object_id,
                    name: obj.name,
                    // Some tasks don't have a rich_description https://app.asana.com/0/2002711484875/282123039183487
                    // We fall back to the description for those. Description could have unescaped html special
                    // characters, while in rich_description they should be escaped, so we escape them.
                    notes: obj.rich_description || htmlEscapeFully(obj.description) || "",
                    completed: obj.completed !== undefined,
                    startOn: self._fixDateTimeToReference(obj.start_date) || null,
                    dueOn: self._fixDateTimeToReference(obj.due_date) || null,
                    public: obj.force_public_to_workspace || false,
                    assigneeStatus: self._assigneeStatusForScheduleStatus(obj.schedule_status) || null,
                    sourceAssigneeId: Object.perform(self._userForDomainUserId(obj.assignee), "sourceId") || null,
                    sourceItemIds: obj.items,
                    sourceFollowerIds: obj.followers_du.map(function(duid){ return Object.perform(self._userForDomainUserId(duid), "sourceId") }).emptiesRemoved(),
                    sourceBlockingTaskIds: blockingTaskIds,
                    stories: realStories,
                    recurrenceType: obj.recurrence_type || null,
                    recurrenceData: obj.recurrence_json || null,
                    customFieldValues: customFieldValues
                });
            });
        }
    },

    attachmentDataSource: function() {
        var self = this;
        return function(position, chunkSize) {
            return self.db().findByType("Asset", position, chunkSize).map(function(obj){
                var sourceParentId = self.db().findParentsByType("attachment", obj.__object_id, "Task").mapProperty("__object_id").first();

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

    _fixDateTimeToReference: function(date) {
        if (date) {
            var refDate = this.referenceDate();
            var newDate = new Date(Date.now() - refDate + Date.parse(date + " GMT"));
            return newDate.toISOString().replace("T", " ").replace(/\..*/, "");
        } else {
            return date;
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
