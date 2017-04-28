var aei = require("../");

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

    _resourceData: function() {
        var data = {
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
