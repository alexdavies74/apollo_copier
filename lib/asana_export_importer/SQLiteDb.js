
var aei = require("./");

var fs = require("fs");
var path = require("path");
var sqlite3 = require("sqlite3");
var Promise = require("bluebird");

var SQLiteDb = module.exports = aei.ideal.Proto.extend().newSlots({
    path: ":memory:"
}).setSlots({
    db: function() {
        if (!this._db) {
            if (this.path() !== ":memory:") {
                var dir = path.dirname(this.path());
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir);
                }
            }
            this._db = new sqlite3.Database(this.path());
            Promise.promisifyAll(this._db);
        }
        return this._db;
    },

    exists: function() {
        if (this.path() === ":memory:") {
            return true;
        } else {
            return fs.existsSync(this.path());
        }
    },

    destroy: function() {
        if (this.path() === ":memory:") {
            return true;
        } else {
            return fs.unlinkSync(this.path());
        }
    },

    close: function() {
        return this.db().close.bind(this.db()).futureWrap().apply(this, arguments).wait();
    },

    all: function() {
        return this.db().all.bind(this.db()).futureWrap().apply(this, arguments).wait();
    },

    run: function(sql, params) {
        return this.db().run.bind(this.db()).futureWrap().apply(this, arguments).wait();
    },

    allAsync: function() {
        return this.db().allAsync.apply(this.db(), arguments);
    },

    runAsync: function() {
        return this.db().runAsync.apply(this.db(), arguments);
    }
});
