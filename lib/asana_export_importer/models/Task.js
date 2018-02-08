var aei = require("../");

var Task = module.exports = aei.ImportObject.extend().performSets({
    type: "Task",
    resourceName: "tasks"
}).newSlots({
    workspaceId: null,
    name: "",
    notes: "", // These are rich text html
    completed: false,
    startOn: null,
    dueOn: null,
    public: false,
    assigneeStatus: "upcoming",
    sourceAssigneeId: null,
    sourceItemIds: null,
    sourceFollowerIds: null,
    sourceBlockingTaskIds: null,
    stories: null,
    recurrenceType: null,
    recurrenceData: null,
    // [ { protoSourceId:.., value: string|number|sourceEnumOptionID, type: "text"|"number"|"enum" }, ...]
    customFieldValues: null
}).setSlots({
    addItem: function(itemId, creatorId) {
        return aei.Future.withPromise(this._resourceNamed("tasks", creatorId).setParent(itemId, {
            parent: this.asanaId()
        })).wait();
    },

    addFollowers: function(followerAsanaIds) {
        return aei.Future.withPromise(this._resource().addFollowers(this.asanaId(), {
            followers: followerAsanaIds,
            silent: true
        })).wait();
    },

    addStory: function(story) {
        console.log("add story: " + story.creator);
        return aei.Future.withPromise(this._resourceNamed("stories", story.creator).createOnTask(this.asanaId(), {
            text: story.text
        })).wait();
    },

    addAssigneeStatus: function() {
        // If this was called setAssigneeStatus it would override the default setter on assigneeStatus()
        // We need to check whether there is a asana id for the assignee, as they may have been
        // deprovisioned or otherwise broken, in which case we can't set this.
        if (this.sourceAssigneeId() !== null && this.app().sourceToAsanaMap().at(this.sourceAssigneeId())) {
            return aei.Future.withPromise(this._resourceNamed("tasks", this.creator()).update(this.asanaId(), {
                assignee_status: this.assigneeStatus()
            })).wait();
        }
    },

    addBlockingTasks: function(blockingTaskAsanaIds) {
        return aei.Future.withPromise(this._resourceNamed("tasks", this.creator()).update(this.asanaId(), {
            tasks_blocking_this: blockingTaskAsanaIds
        })).wait();
    },

    addCustomFieldValues: function() {
        if (this.customFieldValues().length === 0) {
            // No need to wait for the API call
            return;
        }

        var sourceToAsanaMap = this.app().sourceToAsanaMap();
        var customFields = {};
        this.customFieldValues().forEach(function(fieldValue) {
            var protoAsanaId = sourceToAsanaMap.at(fieldValue.protoSourceId);

            // Skip if the proto wasn't imported, because we assume it was trashed in the export
            if (protoAsanaId !== null) {
                var valueToSend = fieldValue.value;

                if (fieldValue.type === "enum") {
                    // Only enum values need a translation, to the asanaId of the correct option
                    valueToSend = sourceToAsanaMap.at(valueToSend);
                }
                customFields[protoAsanaId] = valueToSend;
            }
        });

        return aei.Future.withPromise(this._resourceNamed("tasks").update(this.asanaId(), {
            custom_fields: customFields,
            // Allows us to create orphaned custom fields, where no project containing the task has the field
            force_write_custom_fields: true
        })).wait();
    },

    _resourceData: function() {
        return {
            workspace: this.workspaceId(),
            name: this.name(),
            html_notes: this.notes(),
            completed: this.completed(),
            start_on: this.startOn(),
            due_on: this.dueOn(),
            force_public: this.public(),
            hearted: false,
            recurrence: {
                type: this.recurrenceType(),
                data: this.recurrenceData()
            }
        };
    }
});
