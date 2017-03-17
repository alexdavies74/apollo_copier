
var ae = require("./");

var ImporterDb = module.exports = ae.aei.SQLiteDb.extend().newSlots({
    path: "db/importer.sqlite3"
}).setSlots({
    create: function() {
        this.run("CREATE TABLE objects(sourceId BIGINTEGER, type TEXT, data TEXT)");
        this.run("CREATE INDEX objects_sourceId ON objects(sourceId)");
        this.run("CREATE INDEX objects_type ON objects(type)");
        this.run("CREATE TABLE relationships(kind TEXT, parentId BIGINTEGER, childId BIGINTEGER)");
        this.run("CREATE INDEX relationships_parentId ON relationships(kind, parentId)");
        this.run("CREATE INDEX relationships_childId ON relationships(kind, childId)");
        this.run("CREATE TABLE ordered_relationships(kind TEXT, parentId BIGINTEGER, childId BIGINTEGER, rank TEXT)");
        this.run("CREATE INDEX ordered_relationships_parentId ON ordered_relationships(kind, parentId, rank)");
    },

    insert: function(obj) {
        this.run("INSERT INTO objects(sourceId, type, data) VALUES(?,?,?)", [obj.__object_id, obj.__type, JSON.stringify(obj)]);

        this.insertRelationships("item", obj, obj.items);
        this.insertRelationships("story", obj, obj.stories);
        this.insertRelationships("attachment", obj, obj.attachments);
    },

    insertRelationships: function(kind, parent, children) {
        if (children) {
            var self = this;
            children.forEach(function(childId){
                self.insertRelationship(kind, parent.__object_id, childId);
            });
        }
    },

    insertRelationship: function(parentId, childId) {
        this.run("INSERT INTO relationships(parentId, childId) VALUES(?,?)", [parentId, childId]);
    },

    insertOrderedRelationship: function(kind, parentId, childId, rank) {
        this.run("INSERT INTO ordered_relationships(kind, parentId, childId, rank) VALUES(?,?,?,?)", [kind, parentId, childId, rank]);
    },

    findByType: function(type, offset, limit) {
        var sql = "SELECT data FROM objects WHERE type = ?";
        var params = [type];

        if (limit != undefined) {
            sql += " LIMIT ?";
            params.push(limit);
        }

        if (offset !== undefined) {
            sql += " OFFSET ?";
            params.push(offset);
        }

        return this.allObjects(sql, params);
    },

    /**
     * TODO this isn't really necessary now relationships have kinds, as only story-like objects are in the "story" relationship
     */
    findChildrenByTypesLike: function(relationshipKind, parentId, types) {
        var sql = "SELECT data FROM objects, relationships WHERE kind = ? AND parentId = ? AND sourceId = childId AND (" + types.map(function(){ return "type LIKE ?" }).join(" OR ") + ")";
        var params = [relationshipKind, parentId].concat(types.map(function(type){ return "%" + type + "%" }));

        return this.allObjects(sql, params);
    },

    findParentsByType: function(relationshipKind, childId, type) {
        return this.allObjects("SELECT data FROM objects, relationships WHERE kind = ? AND childId = ? AND sourceId = parentId AND type = ?",
            [relationshipKind, childId, type]);
    },

    findOrderedChildrenByType: function(relationshipKind, parentId, type) {
        return this.allObjects("SELECT data FROM objects, ordered_relationships WHERE kind = ? AND parentId = ? AND sourceId = childId AND type = ? ORDER BY rank",
            [relationshipKind, parentId, type]);
    },

    findById: function(sourceId) {
        return this.allObjects("SELECT data FROM objects WHERE sourceId = ? LIMIT 1", [sourceId]).first();
    },

    allObjects: function() {
        return this.all.apply(this, arguments).map(function(row){ return JSON.parse(row.data) });
    }
});
