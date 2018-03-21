var aei = require("../");
var util = require('util');

var Column = module.exports = aei.ImportObject.extend().performSets({
    type: "Column",
    resourceName: "sections"
}).newSlots({
    name: null,
    sourceProjectId: null,
    sourceItemIds: null,
    project: null
}).setSlots({
    _createResource: function(resourceData) {
        // The current version of the Asana node client library is not aware of Columns, so we have to do it manually
        var dispatcher = this.app().apiClient().dispatcher;

        return aei.Future.withPromise(dispatcher.post('/sections', resourceData)).wait();
    },

    // Adds a task at the top of the column
    addItem: function(taskAsanaId, creatorId) {
        // The current version of the Asana node client library is not aware of Columns, so we have to do it manually
        // The only way to insert a task to a column on the current API is to "add" it to the project, specifying the
        // column. So, for board projects, we take responsibility for adding to the project here, and Project.js knows
        // not to do it. If we just did it twice, it'd be hard to correct the ordering of tasks in the first column.
        var path = util.format('/tasks/%s/addProject', taskAsanaId);
        var dispatcher = this.app().apiClient(creatorId).dispatcher;

        // We already mapped the project when creating the column, but that was a different instance of Column
        // so we have to do it again.
        var project = this.app().sourceToAsanaMap().at(this.sourceProjectId());

        aei.Future.withPromise(dispatcher.post(path, {
            project: project,
            section: this.asanaId()
        })).wait();

        console.log("Completed adding task", taskAsanaId, "to section", this.asanaId())
    },

    _resourceData: function() {
        return {
            name: this.name(),
            project: this.project()
        };
    }
});
