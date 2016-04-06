var aei = require("../");

var Tag = module.exports = aei.ImportObject.extend().performSets({
    type: "Tag",
    resourceName: "tags"
}).newSlots({
    workspaceId: null,
    name: null,
    sourceTeamId: null,
    sourceItemIds: null,
    asanaTeamId: null
}).setSlots({
    addItem: function(taskAsanaId) {
        return aei.Future.withPromise(this._resourceNamed("tasks", this.creatorDu()).addTag(taskAsanaId, {
            tag: this.asanaId()
        })).wait();
    },

    _createResource: function(resourceData) {
        return aei.Future.withPromise(this._resource().createInWorkspace(this.workspaceId(), resourceData)).wait();
    },

    _resourceData: function() {
        return {
            name: this.name(),
            team: this.asanaTeamId()
        };
    }
});
