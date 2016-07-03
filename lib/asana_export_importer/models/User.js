var aei = require("../");

var User = module.exports = aei.ImportObject.extend().performSets({
    type: "User",
    resourceName: "users"
}).newSlots({
    workspaceId: null,
    name: null,
    email: null,
    sourceItemIds: null
}).setSlots({
    addItem: function(taskId, creatorId) {
        return aei.Future.withPromise(this._resourceNamed("tasks", creatorId).update(taskId, {
            assignee: this.asanaId(),
            silent: true
        })).wait();
    },

    _createResource: function(resourceData) {
        return aei.Future.withPromise(this._resourceNamed("workspaces", -1).addUser(this.workspaceId(), resourceData)).wait();
    },

    _resourceData: function() {
        return {
            user: this.email(),
            silent: true
        };
    },
});
