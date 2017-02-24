var aei = require("../");
var util = require('util');

var Column = module.exports = aei.ImportObject.extend().performSets({
    type: "Column",
    resourceName: "columns"
}).newSlots({
    name: null,
    sourceProjectId: null,
    sourceItemIds: null,
    project: null
}).setSlots({
    _createResource: function(resourceData) {
        // The current version of the Asana node client library is not aware of Columns, so we have to do it manually
        var dispatcher = this.app().apiClient().dispatcher;

        return aei.Future.withPromise(dispatcher.post('/columns', resourceData)).wait();
    },

    // Adds a task at the top of the column
    addItem: function(taskAsanaId) {
        // The current version of the Asana node client library is not aware of Columns, so we have to do it manually
        var path = util.format('/columns/%s/addTask', this.asanaId());
        var dispatcher = this.app().apiClient().dispatcher;
        return aei.Future.withPromise(dispatcher.post(path, {
            task: taskAsanaId
        })).wait();
    },

    _resourceData: function() {
        return {
            name: this.name(),
            project: this.project()
        };
    }
});
