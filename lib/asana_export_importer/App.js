var aei = require("./");
var fs = require("fs");

var App = module.exports = aei.ideal.Proto.extend().setType("App").newSlots({
    importer: null,
    attachmentsPath: null,
    sourceToAsanaMap: null,
    clients: {}
}).setSlots({
    shared: function() {
        if (!this._shared) {
            this._shared = App.clone();
        }
        return this._shared;
    },

    init: function() {
        this._clients = {};
        this.setImporter(aei.Importer.clone());
        this.setSourceToAsanaMap(aei.SourceToAsanaMap.clone());
    },

    start: function() {
        var self = this;
        if (fs.existsSync(this.attachmentsPath())) {
            fs.unlinkSync(this.attachmentsPath());
        }
        return aei.Future.task(function(){
            self.importer().run();
        });
    },

    apiClient: function(id) {
        if (this._clients[id] === undefined) {
          return this._clients[-1];
        }
        console.log("ApiClient: " + id);
        return this._clients[id];
    },

    addClient: function(id, client) {
        this._clients[id] = client;
    }
});

aei.ideal.Proto.app = function() {
    return App.shared();
};
