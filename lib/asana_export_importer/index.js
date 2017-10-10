module.exports.ideal = require("ideal");
module.exports.Future = require("fibers/future");
module.exports.asana = require("asana");

[
    "App",
    "AsanaApiExt",
    "BatchIterable",
    "AsanaClientWrapper",
    "AsanaClientMock",
    "DateExt",
    "Export",
    "FutureExt",
    "Importer",
    "MockExport",
    "SourceToAsanaMap",
    "SQLiteDb",
    "models/ImportObject",
    "models/Attachment",
    "models/Column",
    "models/CustomFieldProto",
    "models/Project",
    "models/Tag",
    "models/Task",
    "models/Team",
    "models/User"
].forEach(function(name) {
    module.exports[name.match(/[^\/]+$/)[0]] = require("./" + name);
});
