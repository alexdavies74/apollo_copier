var aei = require("./");

var Promise = require("bluebird");

var AsanaClientMock = module.exports = aei.AsanaClientWrapper.extend().setType("AsanaClientMock").newSlots({
    counter: 0,
    latencyMean: 0,
    latencyStdev: 0
}).setSlots({
    dispatch: function(params) {
        var promise;
        if (params.method === "GET") {
            promise = Promise.resolve([]);
        } else {
            this.log("request", params)
            this.setCounter(this.counter() + 1);
            promise = Promise.resolve({ data: { id: this.counter() } });
        }
        if (this.latencyMean() || this.latencyStdev()) {
            var delay = Math.max(0, rnd(this.latencyMean(), this.latencyStdev()));
            this.log("delay", params, delay);
            return promise.delay(delay);
        } else {
            return promise;
        }
    }
});

function rnd_snd() {
    return (Math.random()*2-1)+(Math.random()*2-1)+(Math.random()*2-1);
}

function rnd(mean, stdev) {
    return Math.round(rnd_snd()*stdev+mean);
}
