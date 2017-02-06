var aei = require("../");

var Column = module.exports = aei.ImportObject.extend().performSets({
    type: "Column",
    resourceName: "columns"
}).newSlots({
    name: null,
    sourceProjectId: null,
    project: null
}).setSlots({
    _createResource: function(resourceData) {
        // The current version of the Asana node client library is not aware of Columns, so we have to do it manually
        var dispatcher = this.app().apiClient().dispatcher;

        return aei.Future.withPromise(dispatcher.post('/columns', resourceData)).wait();
    },

    _resourceData: function() {
        return {
            name: this.name(),
            project: this.project()
        };
    }
});
