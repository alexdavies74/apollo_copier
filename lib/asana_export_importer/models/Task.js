var aei = require("../");

var Task = module.exports = aei.ImportObject.extend().performSets({
    type: "Task",
    resourceName: "tasks"
}).newSlots({
    workspaceId: null,
    name: "",
    notes: "", // These are rich text html
    completed: false,
    dueOn: null,
    public: false,
    assigneeStatus: "upcoming",
    sourceAssigneeId: null,
    sourceItemIds: null,
    sourceFollowerIds: null,
    sourceBlockingTaskIds: null,
    stories: null,
    recurrenceType: null,
    recurrenceData: null
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

    _resourceData: function() {
        return {
            workspace: this.workspaceId(),
            name: this.name(),
            html_notes: this.notes(),
            completed: this.completed(),
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
