var asana = require("asana");
var aei = require("./");

var AsanaClientWrapper = module.exports = aei.ideal.Proto.extend().setType("AsanaClientWrapper").newSlots({
    client: null,
    debug: true
}).setSlots({
    init: function() {
        // create a dispatcher that never actually calls the Asana API, but provides a hook, so our subclasses
        // can implement dispatch
        var dispatcher = new asana.Dispatcher();
        dispatcher.dispatch = this.dispatch.bind(this);

        // Call the constructor of the asana client on ourself with this shim dispatcher, so we get all the
        // resources that a normal asana client would
        asana.Client.call(this, dispatcher);
    },

    _dispatch: function(params) {
        return this.client().dispatcher.dispatch(params).then(function(result) {
            if (params.method !== "GET" && (result === undefined)) {
                // We expect all non-GET requests to return a result. Fail fast if they don't, so we get
                // retry behavior
                throw new Error("Request against the Asana API did not return a result (and it wasn't a GET)", params);
            }
            return result;
        });
    },

    log: function(message, params) {
        if (this.debug()) {
            try {
                var header = this.type() + " " + message + ": ";
                var args = [header + pad(30 - header.length) + params.method + " " + params.url + " " + JSON.stringify(params.json.data)]
                console.log.apply(console, args.concat(Array.prototype.slice.call(arguments, 2)));
            } catch (e) {
                console.log("Logging error: " + e);
            }
        }
    }
});

function pad(n) {
    return Array(n).join(" ");
}

// Usage:

//  var AsanaClientMiddleware = aei.AsanaClientWrapper.clone().setSlots({
//      dispatch: function(params) {
//          // do stuff before request
//          return this._dispatch(params).then(function(result) {
//              // do stuff after request
//              return result;
//          });
//      }
//  });

