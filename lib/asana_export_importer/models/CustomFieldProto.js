var aei = require("../");
var asana = require("asana");
var fs = require("fs");

/**
 * This represents all three kinds of custom field, because subclassing
 * would cause more complexity than it would save.
 */
var CustomFieldProto = module.exports = aei.ImportObject.extend().performSets({
    type: "CustomFieldProto",
    resourceName: "customFields"
}).newSlots({
    workspaceId: null,
    name: null,
    description: null,
    type: null,
    precision: null, // null if type is not "number"
    // null if type if type is not "enum"
    // otherwise, [ { sourceId:.., name:.., enabled:.., color:.. }, ...] (ordered)
    options: null,
    // We can't actually choose the creation source of the copied CF, but some source data has duplicate CFs with
    // different creation_sources, so our "disambiguate and retry" logic need to incorporate it.
    creationSource: null
}).setSlots({
    _createResource: function(resourceData) {
        var self = this;

        var response;

        // First, try with the original name. Sadly, if it fails, it'll retry multiple times with backoff, but
        // that's not a huge deal.
        try {
            response = aei.Future.withPromise(this._resource().create(resourceData)).wait();
        } catch (ex) {
            // If that fails, there must already be a custom field with that name.
            // Add some unique string to the name and try again.
            var uniqueString;
            var asana_client = this.app().apiClient();
            if (asana_client.dbPath) {
                // Hack: If available, we choose the inode number
                // of the sqlite db file containing the cache, because that will remain
                // the same as long as the cache is intact, and will be new for completely
                // separate import attempts.
                var dbPath = asana_client.dbPath();
                uniqueString = aei.Future.wrap(function (callback) {
                    fs.stat(dbPath, callback);
                })().wait().ino;
            } else {
                uniqueString = new Date().getTime();
            }

            // Do this the hard way or the mockers in testing will be confused
            var amendedResourceData = {
                name: resourceData.name + " (Imported " + uniqueString + " " + self.creationSource() + ")",
                description: resourceData.description,
                workspace: resourceData.workspace,
                type: resourceData.type,
                precision: resourceData.precision,
                enum_options: resourceData.enum_options
            };
            response = aei.Future.withPromise(this._resource().create(amendedResourceData)).wait();
        }

        if (self.type() === "enum") {
            // Enum options are created during the creation of the enum proto.
            // However, we need their IDs, to reference them in values later.
            // So we manually parse the response from the API, which contains the
            // new asana ID, and write that to the sourceToAsanaMap manually.
            self.options().forEach(function(exportOption, i) {
                // Check whether the option is already in the map before looking up
                // in the API response. If this is a re-run, and the response was
                // returned by the cache, it doesn't contain the option IDs, but
                // the previous run will have already put them in the map.
                if (self.app().sourceToAsanaMap().at(exportOption.sourceId) === null) {
                    var apiOption = response.enum_options[i];
                    self.app().sourceToAsanaMap().atPut(exportOption.sourceId, apiOption.id);
                }
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
