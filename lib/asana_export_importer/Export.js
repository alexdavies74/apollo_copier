var aei = require("./");

var Export = module.exports = aei.ideal.Proto.extend().setType("Export").newSlots({
    path: null,
    batchSize: 100
}).setSlots({
    prepareForImport: function() {
        throw new Error("Clones should override");
    },

    cleanupAfterImport: function() {
        throw new Error("Clones should override");
    },

    users: function() {
        throw new Error("Clones should override");
    },

    teams: function() {
        throw new Error("Clones should override");
    },

    projects: function() {
        throw new Error("Clones should override");
    },

    columns: function() {
        throw new Error("Clones should override");
    },

    columnsBySourceProjectId: function() {
        var bySourceProjectId = {};
        this.columns().forEach(function(column) {
            var existing = bySourceProjectId[column.sourceProjectId()];
            if (existing === undefined) {
                bySourceProjectId[column.sourceProjectId()] = existing = [];
            }
            existing.push(column);
        });
        return bySourceProjectId;
    },

    tags: function() {
        throw new Error("Clones should override");
    },

    taskIterable: function() {
        if (!this._taskIterable) {
            this._taskIterable = aei.BatchIterable.clone().performSets({
                dataSource: this.taskDataSource(),
                batchSize: this.batchSize()
            });
        }

        return this._taskIterable;
    },

    attachmentIterable: function() {
        if (!this._attachmentIterable) {
            this._attachmentIterable = aei.BatchIterable.clone().performSets({
                dataSource: this.attachmentDataSource(),
                batchSize: this.batchSize()
            });
        }

        return this._attachmentIterable;
    },

    taskDataSource: function() {
        throw new Error("Clones should return a function with the following signature: function(position, chunkSize) returns [aei.Task, ...]");
    },

    attachmentDataSource: function() {
        throw new Error("Clones should return a function with the following signature: function(position, chunkSize) returns [aei.Attachment, ...]");
    }
});
