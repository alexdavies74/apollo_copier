var aei = require("../");

var Project = module.exports = aei.ImportObject.extend().performSets({
    type: "Project",
    resourceName: "projects"
}).newSlots({
    workspaceId: null,
    name: null,
    notes: null,
    archived: null,
    public: false,
    color: null,
    isBoard: false,
    defaultView: "list",
    sourceTeamId: null,
    sourceItemIds: null,
    sourceMemberIds: null,
    sourceFollowerIds: null,
    // [ { sourceCustomFieldProtoId:.., isImportant:.., sourceId:... } ] (ordered)
    customFieldSettings: null,
    asanaTeamId: null
}).setSlots({
    addMembers: function(memberAsanaIds) {
        return aei.Future.withPromise(this._resource().addMembers(this.asanaId(), {
            members: memberAsanaIds,
            silent: true
        })).wait();
    },

    addFollowers: function(followerAsanaIds) {
        return aei.Future.withPromise(this._resource().addFollowers(this.asanaId(), {
            followers: followerAsanaIds,
            silent: true
        })).wait();
    },

    addCustomFieldSettings: function() {
        var self = this;
        var sourceToAsanaMap = self.app().sourceToAsanaMap();

        self.customFieldSettings().forEach(function(customFieldSetting) {
            var sourceCustomField = customFieldSetting.sourceCustomFieldProto;
            if (sourceCustomField && sourceCustomField.isPublishedToDomain() === false) {
                // If the field is local we must create a new field and store its information here
                sourceCustomField.setWorkspaceId(self.workspaceId());
                var response = aei.Future.withPromise(self._resource().addCustomFieldSetting(self.asanaId(), {
                    custom_field: sourceCustomField.creationData(),
                    is_important: customFieldSetting.isImportant,
                    _sourceId: customFieldSetting.sourceId
                })).wait();
                // node-asana does not currently support getting extra fields back from post
                // requests so we need to make a get request to learn what enum options were created.
                var custom_field_response = aei.Future.withPromise(
                    self.app().apiClient().customFields.findById(response.custom_field.id)
                ).wait();

                self.app().sourceToAsanaMap().atPut(sourceCustomField.sourceId(), response.custom_field.id);
                sourceCustomField.storeAdditionalIdsCreated(custom_field_response);
            } else if (sourceCustomField) {
                // If the field is global we simply attach the existing field to this project
                var customFieldProtoAsanaId = sourceToAsanaMap.at(sourceCustomField.sourceId());

                // Skip if the proto wasn't imported, because we assume it was trashed in the export
                if (customFieldProtoAsanaId !== null) {
                    aei.Future.withPromise(self._resource().addCustomFieldSetting(self.asanaId(), {
                        custom_field: customFieldProtoAsanaId,
                        is_important: customFieldSetting.isImportant,
                        _sourceId: customFieldSetting.sourceId
                    })).wait();
                }
            }
        });
    },

    addItem: function(taskId) {
        // We aren't responsible for adding tasks to boards, Column.js will do that later. If we did it here too,
        // it'd be hard to correct the ordering of tasks in the first column.
        if (!this.isBoard()) {
            return aei.Future.withPromise(this._resourceNamed("tasks").addProject(taskId, {
                project: this.asanaId()
            })).wait();
        }
    },

    _resourceData: function() {
        return {
            workspace: this.workspaceId(),
            name: this.name(),
            notes: this.notes(),
            archived: this.archived(),
            public: this.public(),
            color: this.color(),
            team: this.asanaTeamId(),
            default_view: this.defaultView(),
            layout: this.isBoard() ? "BOARD" : "LIST"
        };
    },
});
