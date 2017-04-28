var aei = require("../");

var Project = module.exports = aei.ImportObject.extend().performSets({
    type: "Project",
    resourceName: "projects"
}).newSlots({
    workspaceId: null,
    name: null,
    notes: null,
    archived: null,
    public: false,
    color: null,
    isBoard: false,
    sourceTeamId: null,
    sourceItemIds: null,
    sourceMemberIds: null,
    sourceFollowerIds: null,
    // [ { sourceCustomFieldId:.., isImportant:.. } ] (ordered)
    customFieldSettings: null,
    asanaTeamId: null
}).setSlots({
    addMembers: function(memberAsanaIds) {
        return aei.Future.withPromise(this._resource().addMembers(this.asanaId(), {
            members: memberAsanaIds,
            silent: true
        })).wait();
    },

    addFollowers: function(followerAsanaIds) {
        return aei.Future.withPromise(this._resource().addFollowers(this.asanaId(), {
            followers: followerAsanaIds,
            silent: true
        })).wait();
    },

    addCustomFieldSettings: function() { //TODO how to map to asana IDs for each setting???

    },

    addItem: function(taskId) {
        return aei.Future.withPromise(this._resourceNamed("tasks").addProject(taskId, {
            project: this.asanaId()
        })).wait();
    },

    _resourceData: function() {
        return {
            workspace: this.workspaceId(),
            name: this.name(),
            notes: this.notes(),
            archived: this.archived(),
            public: this.public(),
            color: this.color(),
            team: this.asanaTeamId(),
            layout: this.isBoard() ? "BOARD" : "LIST"
        };
    },
});
