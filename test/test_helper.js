var chai = require("chai");
chai.should();

global.expect = chai.expect;
global.sinon = require("sinon");

var sinonChai = require("sinon-chai");
chai.use(sinonChai);

var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);

global.ae = require("../lib/asana_export");
global.aei = require("../lib/asana_export_importer");
global.sqlite3 = require("sqlite3");
global.Promise = require("bluebird");

global.AsanaExportInMemory = ae.AsanaExport.extend().setSlots({
    init: function() {
        ae.AsanaExport.init.call(this);
        this._lines = [];
        this.db()._db = new sqlite3.Database(":memory:");
    },
    prepareForImport: function() {
        var self = this;
        this.db().create();
        this._readLines({ readLine: function() { return JSON.stringify(self._lines.shift()); } });
        this._populateJoinObjectRelationships();
    },
    cleanupAfterImport: function() {
    },
    addObject: function(id, type, object) {
        object.__object_id = id;
        object.__type = type;
        this._lines.push(object);
    },
    addUserAndDomainUser: function(userId, domainUserId, name, email, taskList) {
        this.addObject(userId, "User", { name: name });
        this.addObject(domainUserId, "DomainUser", { user: userId, task_list: taskList, email: email });
    }
});

global.createApp = function() {
    // var app = aei.App.shared();
    // app.setSourceToAsanaMap(aei.SourceToAsanaMap.clone());
    // app.setImporter(aei.Importer.clone());
    var app = aei.App._shared = aei.App.clone();
    return app;
}

global.sleep = function(ms) {
    aei.Future.wrap(function(cb) {
        setTimeout(function() {
            cb();
        }, ms);
    })().wait();
}

aei.ideal.Proto.setSlots({
    toJS: function() {
        var object = {};
        Object.getOwnPropertyNames(this).forEach(function(name){
            if (name !== "_uniqueId") {
                name = name.slice(1);
                object[name] = this[name]();
            }
        }, this);
        return object;
    }
});
