var aei = require("../");

var ImportObject = module.exports = aei.ideal.Proto.extend().setType("ImportObject").newSlots({
    creator: -1,
    resourceName: "Clones should set",
    sourceId: null,
    asanaId: null
}).setSlots({
    setSourceId: function(sourceId) {
        this._sourceId = sourceId;
        var asanaId = this.app().sourceToAsanaMap().at(sourceId);
        if (asanaId) {
            this._asanaId = asanaId;
        }
        return this;
    },

    setAsanaId: function(asanaId) {
        this._asanaId = asanaId;
        if (asanaId) {
            this.app().sourceToAsanaMap().atPut(this.sourceId(), asanaId, this.creator());
        }
        return this;
    },

    create: function() {
        var data = this._resourceData();
        // disambiguates requests when caching for resuming
        // If we aren't using a cache, this is unnecessary, but not destructive.
        data._sourceId = this.sourceId();
        var response;
        try {
            response = this._createResource(data);
        } catch (ex) {
            console.log("Crashed while creating resource", data);
            throw ex;
        }

        // I have no idea why some resources wrap the response in {data:
        // when created, and some don't. I can't even find the implementation
        // of the create method of half the resources.
        if (response.data) {
            this.setAsanaId(response.data.id);
        } else {
            this.setAsanaId(response.id);
        }

        return this;
    },

    _createResource: function(resourceData) {
        return aei.Future.withPromise(this._resource().create(resourceData)).wait();
    },

    _resource: function() {
        return this._resourceNamed(this.resourceName(), this.creator());
    },

    _resourceNamed: function(name, clientId) {
        return this.app().apiClient(clientId)[name];
    },

    _resourceData: function() {
        throw "Clones should override";
    }
});
