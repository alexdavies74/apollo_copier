var aei = require("./")

var crypto = require("crypto");
var Promise = require("bluebird");

function hashParams(params) {
    return crypto.createHash('sha1').update(JSON.stringify(params)).digest("hex");
}

var x = {}

var AsanaClientCache = module.exports = aei.AsanaClientWrapper.extend().setType("AsanaClientCache").newSlots({
    dbPath: "db/cache.sqlite",
    readOnly: false
}).setSlots({
    db: function() {
        var self = this;
        if (self._db) {
            return Promise.resolve(self._db);
        } else {
            var db = aei.SQLiteDb.clone().performSets({ path: self.dbPath() });
            var dbPromise = db.runAsync("CREATE TABLE IF NOT EXISTS cache(hash TEXT, asanaId BIGINTEGER, UNIQUE(hash))").then(function() {
                return db.runAsync("CREATE INDEX IF NOT EXISTS cache_hash ON cache(hash)");
            }).then(function() {
                // swap for the real db once we've created the tables
                return self._db = db;
            });
            // return the promise for now
            return self._db = dbPromise;
        }
    },

    dispatch: function(params) {
        var self = this;
        var hash = hashParams(params);
        return self.db().then(function(db) {
            return db.allAsync("SELECT asanaId FROM cache WHERE hash = ?", [hash]).then(function(results) {
                if (results.length > 0) {
                    self.log("hit", params, hash + " => " + results[0].asanaId);
                    return { id: results[0].asanaId };
                } else {
                    self.log("miss", params, hash);
                    return self._dispatch(params).then(function(result) {
                        if (!self.readOnly() && params.method !== "GET") {
                            self.log("set", params, hash + " => " + result.id);
                            return db.runAsync("INSERT INTO cache(hash, asanaId) VALUES(?,?)", [hash, result.id || null]).then(function() {
                                return result;
                            })
                        } else {
                            return result;
                        }
                    });
                }
            });
        });
    }
});
