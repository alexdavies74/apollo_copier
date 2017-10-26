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
    // null if type if type is not "enum"
    // otherwise, [ { sourceId:.., name:.., enabled:.., color:.. }, ...] (ordered)
    options: null
}).setSlots({
    _createResource: function(resourceData) {
        var self = this;
        // The current version of the Asana node client library is not aware of CustomFieldProtos, so we have to do it manually
        var dispatcher = this.app().apiClient().dispatcher;

        var response;

        // First, try with the original name. Sadly, if it fails, it'll retry multiple times with backoff, but
        // that's not a huge deal.
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

            // Do this the hard way or the mockers in testing will be confused
            var amendedResourceData = {
                name: resourceData.name + " (Imported " + uniqueString + ")",
                description: resourceData.description,
                workspace: resourceData.workspace,
                type: resourceData.type,
                precision: resourceData.precision,
                enum_options: resourceData.enum_options
            };
            response = aei.Future.withPromise(dispatcher.post('/custom_fields', amendedResourceData)).wait();
        }

        if (self.type() === "enum") {
            // Enum options are created during the creation of the enum proto.
            // However, we need their IDs, to reference them in values later.
            // So we manually parse the response from the API, which contains the
            // new asana ID, and write that to the sourceToAsanaMap manually.
            response.enum_options.forEach(function(apiOption, i) {
                var exportOption = self.options()[i];
                self.app().sourceToAsanaMap().atPut(exportOption.sourceId, apiOption.id);
            });
        }

        return response;
    },

    _resourceData: function() {
        var data = {
            workspace: this.workspaceId(),
            name: this.name(),
            description: this.description(),
            type: this.type()
        };

        if (this.type() === "number") {
            data.precision = this.precision();
        } else if (this.type() === "enum") {
            data.enum_options = this.options();
        }

        return data;
    }
});
