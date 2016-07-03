var aei = require("./");

var SourceToAsanaMap = module.exports = aei.ideal.Proto.extend().setType("SourceToAsanaMap").newSlots({
    dbPath: ":memory:",
    readOnly: false
}).setSlots({
    db: function() {
        if (!this._db) {
            this._db = aei.SQLiteDb.clone().performSets({ path: this.dbPath() });
            // we should never insert the same sourceId more than once
            this._db.run("CREATE TABLE IF NOT EXISTS map(sourceId BIGINTEGER, asanaId BIGINTEGER, creatorId BIGINTEGER, UNIQUE(sourceId))");
            this._db.run("CREATE INDEX IF NOT EXISTS map_sourceId ON map(sourceId)");
        }
        return this._db;
    },

    at: function(sourceId) {
        var results = this.db().all("SELECT asanaId FROM map WHERE sourceId = ?", [sourceId]);
        return results[0] && results[0].asanaId || null;
    },

    creatorAt: function(sourceId) {
        var results = this.db().all("SELECT creatorId FROM map WHERE sourceId = ?", [sourceId]);
        return results[0] && results[0].creatorId || null;
    },

    atPut: function(sourceId, asanaId, creatorId) {
        if (!this.readOnly()) {
            this.db().run("INSERT OR IGNORE INTO map(sourceId, asanaId, creatorId) VALUES(?,?,?)", [sourceId, asanaId, creatorId]);
        }
    }
});
