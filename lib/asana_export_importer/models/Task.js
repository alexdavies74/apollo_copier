var aei = require("../");

var Task = module.exports = aei.ImportObject.extend().performSets({
    type: "Task",
    resourceName: "tasks"
}).newSlots({
    workspaceId: null,
    name: "",
    // These are rich text html per https://asana.com/developers/documentation/getting-started/rich-text
    notes: "",
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
    resourceSubtype: null,
    isRenderedAsSeparator: false,
    recurrenceType: null,
    recurrenceData: null,
    // [ { protoSourceId:.., value: string|number|sourceEnumOptionID, type: "text"|"number"|"enum" }, ...]
    customFieldValues: null
}).setSlots({
    addItem: function(itemId) {
        return aei.Future.withPromise(this._resource().setParent(itemId, {
            parent: this.asanaId()
        })).wait();
    },

    addFollowers: function(followerAsanaIds) {
        return aei.Future.withPromise(this._resource().addFollowers(this.asanaId(), {
            followers: followerAsanaIds,
            silent: true
        })).wait();
    },

    addStory: function(text) {
        if (this._countUtf8Bytes(text) > 65500) {
            text = this._truncateToByteLength(text, 65500);
        }

        return aei.Future.withPromise(this._resourceNamed("stories").createOnTask(this.asanaId(), {
            text: text
        })).wait();
    },

    addAssigneeStatus: function() {
        // If this was called setAssigneeStatus it would override the default setter on assigneeStatus()
        // We need to check whether there is a asana id for the assignee, as they may have been
        // deprovisioned or otherwise broken, in which case we can't set this.
        if (this.sourceAssigneeId() !== null && this.app().sourceToAsanaMap().at(this.sourceAssigneeId())) {
            return aei.Future.withPromise(this._resourceNamed("tasks").update(this.asanaId(), {
                assignee_status: this.assigneeStatus()
            })).wait();
        }
    },

    addBlockingTasks: function(blockingTaskAsanaIds) {
        return aei.Future.withPromise(this._resourceNamed("tasks").update(this.asanaId(), {
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
        var data = {
            workspace: this.workspaceId(),
            name: this.name(),
            completed: this.completed(),
            start_on: (this.startOn() === this.dueOn()) ? null : this.startOn(),
            due_on: this.dueOn(),
            force_public: this.public(),
            hearted: false,
            resource_subtype: this.resourceSubtype() || undefined,
            is_rendered_as_separator: this.isRenderedAsSeparator(),
            recurrence: {
                type: this.recurrenceType(),
                data: this.recurrenceData()
            }
        };

        if (this._countUtf8Bytes(this.notes()) > 65500) {
            // This could mess up html validity, so just write to
            // notes instead. It'll have html tags, but will still be legible, and users
            // probably don't care about this description anyway.
            data.notes = this._truncateToByteLength(this.notes(), 65500);
        } else {
            // The set of tags appearing in exports is currently identical to those accepted by the API, so just wrap.
            data.html_notes = "<body>" + this.notes() + "</body>";
        }

        return data;
    },

    _truncateToByteLength: function(input, maxBytes) {
        // We need to truncate to a number of bytes. But string.substring operates on characters. Take 65500 characters,
        // then repeatedly chop 1000 more until we're under the byte limit.
        var notes = input.substring(0, maxBytes);

        while (this._countUtf8Bytes(notes) > maxBytes) {
            notes = notes.substring(0, notes.length - 1000);
        }
        return notes;
    },

    _countUtf8Bytes: function(text) {
        return (new Buffer(text, "utf-8")).length;
    }
});
