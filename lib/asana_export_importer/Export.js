var aei = require("./");

var Export = module.exports = aei.ideal.Proto.extend().setType("Export").newSlots({
    path: null,
    batchSize: 100
}).setSlots({
    prepareForImport: function() {
        throw "Clones should override";
    },

    cleanupAfterImport: function() {
        throw "Clones should override";
    },

    users: function() {
        throw "Clones should override";
    },

    teams: function() {
        throw "Clones should override";
    },

    projects: function() {
        throw "Clones should override";
    },

    columnsBySourceProjectId: function() {
        throw "Clones should override, returning an object with values being arrays of Columns, and keys being the value of the sourceProjectId slot";
    },

    tags: function() {
        throw "Clones should override";
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
        throw "Clones should return a function with the following signature: function(position, chunkSize) returns [aei.Task, ...]";
    },

    attachmentDataSource: function() {
        throw "Clones should return a function with the following signature: function(position, chunkSize) returns [aei.Attachment, ...]";
    }
});
