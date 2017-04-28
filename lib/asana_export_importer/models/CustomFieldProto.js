var aei = require("../");
var fs = require("fs");

/**
 * This represents all three kinds of custom field, because subclassing
 * would cause more complexity than it would save.
 */
var CustomFieldProto = module.exports = aei.ImportObject.extend().performSets({
    type: "CustomFieldProto",
    resourceName: "custom_fields"
}).newSlots({
    workspaceId: null,
    name: null,
    description: null,
    type: null,
    precision: null, // null if type is not "number"
    options: null // null if type if type is not "enum" TODO otherwise, what is this????
}).setSlots({
    _createResource: function(resourceData) {
        var self = this;
        // The current version of the Asana node client library is not aware of CustomFieldProtos, so we have to do it manually
        var dispatcher = this.app().apiClient().dispatcher;

        var response;

        // First, try with the original name
        try {
            response = aei.Future.withPromise(dispatcher.post('/custom_fields', resourceData)).wait();
        } catch (ex) {
            // If that fails, there must already be a custom field with that name.
            // Add some unique string to the name and try again.
            var uniqueString;
            if (self.app().apiClient().dbPath) {
                // Hack: If available, we choose the inode number
                // of the sqlite db file containing the cache, because that will remain
                // the same as long as the cache is intact, and will be new for completely
                // separate import attempts.
                var dbPath = self.app().apiClient().dbPath();
                uniqueString = aei.Future.wrap(function (callback) {
                    fs.stat(dbPath, callback);
                })().wait().ino;
            } else {
                uniqueString = new Date().getTime();
            }

            resourceData.name = resourceData.name + " (Imported " + uniqueString + ")";
            response = aei.Future.withPromise(dispatcher.post('/custom_fields', resourceData)).wait();
        }
        return response;
    },

    _resourceData: function() {
        var data = {
            workspace: this.workspaceId(),
            name: this.name(),
            // TODO description
            type: this.type()
        };

        if (this.type() === "number") {
            data.precision = this.precision();
        } else if (this.type() === "enum") {
            data.enum_options = []; // TODO translate from intermediate representation?
        }

        return data;
    }
});
