
describe("Importer", function() {
    var app, importer, exp, client;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();

        app = createApp();
        exp = aei.MockExport.clone();
        importer = app.importer();
        importer.setExport(exp);

        client = aei.AsanaClientMock.clone();
        app.addClient(-1, client);

        sinon.spy(client.teams, "create");
        sinon.spy(client.teams, "addUser");
        sinon.spy(client.projects, "create");
        sinon.spy(client.projects, "addMembers");
        sinon.spy(client.projects, "addFollowers");
        sinon.spy(client.tags, "create");
        sinon.spy(client.tags, "createInWorkspace");
        sinon.spy(client.tasks, "create");
        sinon.spy(client.tasks, "setParent");
        sinon.spy(client.tasks, "addTag");
        sinon.spy(client.tasks, "addFollowers");
        sinon.spy(client.tasks, "addProject");
        sinon.spy(client.tasks, "update");
        sinon.spy(client.stories, "createOnTask");
        sinon.spy(client.workspaces, "addUser");

        sinon.spy(client.dispatcher, "post");
    });
    
    afterEach(function() {
        sandbox.restore();
    });

    describe("#run()", function() {
        it("should run with no data", function() {
            importer.run();

            ["teams", "projects", "tags", "tasks", "stories", "users"].forEach(function(type) {
                client.teams.create.should.not.have.been.called;
            });
            client.tags.createInWorkspace.should.not.have.been.called;
            client.stories.createOnTask.should.not.have.been.called;
            client.workspaces.addUser.should.not.have.been.called;
        });
    });

    describe("#_importTeams()", function() {
        it("should create some teams", function() {
            exp.setMockData({
                teams: [
                    { sourceId: 1, name: "team foo", teamType: "PUBLIC", sourceMemberIds: [] },
                    { sourceId: 2, name: "team bar", teamType: "PUBLIC", sourceMemberIds: [] }
                ]
            });

            importer._importTeams();

            client.teams.create.should.have.been.calledTwice;
        });
    });

    describe("#_importProjects()", function() {
        it("should not create a project without a team", function() {
            exp.setMockData({
                teams: [],
                projects: [{ sourceId: 1, archived: false, name: "project foo", sourceTeamId: null, sourceMemberIds: [] }]
            });

            importer._importTeams();
            importer._importProjects();

            client.projects.create.should.not.have.been.called;
        });

        it("should create a project with a corresponding team", function() {
            exp.setMockData({
                teams: [{ sourceId: 100, name: "team1", teamType: "PUBLIC", sourceMemberIds: [] }],
                projects: [{ sourceId: 101, name: "project1", sourceTeamId: 100, sourceMemberIds: [] }]
            });

            importer._importTeams();
            importer._importProjects();

            client.projects.create.should.have.been.calledOnce;
            client.tags.create.should.not.have.been.called;
            var resourceData = client.projects.create.getCall(0).args[0];
            resourceData['team'].should.equal(app.sourceToAsanaMap().at(100));

            // Since we didn't specify that it was a board, it should have list layout
            resourceData['layout'].should.equal("LIST");
        });

        it("should create a board", function() {
            exp.setMockData({
                teams: [{ sourceId: 100, name: "team1", teamType: "PUBLIC", sourceMemberIds: [] }],
                projects: [{ sourceId: 101, name: "project1", sourceTeamId: 100, sourceMemberIds: [], isBoard: true }]
            });

            importer._importTeams();
            importer._importProjects();

            client.projects.create.should.have.been.calledOnce;
            client.projects.create.getCall(0).args[0]['layout'].should.equal("BOARD");
        });
    });

    describe("#_importColumns()", function() {
        it("should create a column", function() {
            exp.setMockData({
                projects: [{sourceId: 101, name: "project1", sourceTeamId: 100, sourceMemberIds: [], isBoard: true}],
                columns: [{sourceId: 102, name: "column1", sourceProjectId: 101, sourceItemIds: []}]
            });

            importer._importColumns();

            // The client library doesn't support boards/columns yet, so we expect the dispatcher to have been
            // used directly
            client.dispatcher.post.should.have.been.calledOnce;
            client.dispatcher.post.should.have.been.calledWithExactly("/sections", {
                _sourceId: 102,
                name: "column1",
                project: app.sourceToAsanaMap().at(101)
            });
        });
    });

    describe("#_addTasksToColumns()", function() {
        it("should put some tasks in a column", function() {
            exp.setMockData({
                projects: [{sourceId: 103, name: "project1", sourceTeamId: 100, sourceMemberIds: [], isBoard: true}],
                tasks: [
                    { sourceId: 100, name: "task1", sourceFollowerIds: [], sourceItemIds: [] },
                    { sourceId: 101, name: "task2", sourceFollowerIds: [], sourceItemIds: [] }
                ],
                columns: [{sourceId: 102, name: "column1", sourceProjectId: 103, sourceItemIds: [100, 101]}]
            });

            importer._importTasks();
            importer._importColumns();
            importer._addTasksToColumns();

            // The client library doesn't support boards/columns yet, so we expect the dispatcher to have been
            // used directly
            // The first two calls to dispatcher.post will be to create the tasks, then one for the column.
            // Calls 3 and 4 should be adding to columns, in forward order
            client.dispatcher.post.should.have.callCount(5);
            app.sourceToAsanaMap().at(102).should.not.be.null;
            client.dispatcher.post.getCall(3).args.should.deep.equal([
                "/tasks/" + app.sourceToAsanaMap().at(100) + "/addProject",
                { section: app.sourceToAsanaMap().at(102), project: app.sourceToAsanaMap().at(103) }
            ]);
            client.dispatcher.post.getCall(4).args.should.deep.equal([
                "/tasks/" + app.sourceToAsanaMap().at(101) + "/addProject",
                { section: app.sourceToAsanaMap().at(102), project: app.sourceToAsanaMap().at(103) }
            ]);
        });
    });

    describe("#_importTags()", function() {
        it("should create a tag with name", function() {
            exp.setMockData({
                tags: [{ sourceId: 100, name: "tag1", sourceTeamId: null }]
            });

            importer._importTags();

            client.tags.createInWorkspace.should.have.been.calledOnce;
            client.tags.createInWorkspace.should.have.been.calledWithExactly(importer.organizationId(), { _sourceId: 100, name: "tag1", team: null });
        });

        it("should create a tag with name and team", function() {
            exp.setMockData({
                tags: [{ sourceId: 100, name: "tag1", sourceTeamId: 200 }],
                teams: [{ sourceId: 200, name: "team1", teamType: "PUBLIC", sourceMemberIds: [] }]
            });

            importer._importTeams();
            importer._importTags();

            client.tags.createInWorkspace.should.have.been.calledOnce;
            client.tags.createInWorkspace.should.have.been.calledWithExactly(importer.organizationId(), {
                _sourceId: 100,
                name: "tag1",
                team: app.sourceToAsanaMap().at(200)
            });
        });

        it("should not create duplicate tags", function() {
            exp.setMockData({
                tags: [{ sourceId: 1, name: "tag foo", sourceTeamId: null }]
            });
            sinon.stub(client.workspaces, "tags", function() { return Promise.resolve([ { name: "tag foo", id: 1 } ]); });

            importer._importTags();

            client.tags.create.should.not.have.been.called;
            client.tags.createInWorkspace.should.not.have.been.called;
        });
    });

    describe("#_importTasks()", function() {
        it("should create a task", function() {
            exp.setMockData({
                tasks: [{ sourceId: 1, name: "task foo", sourceFollowerIds: [], sourceItemIds: [] }]
            });

            importer._importTasks();

            client.tasks.create.should.have.been.calledOnce;
        });
    });

    describe("#_importStories", function() {
        it("should add a story to the correct task", function() {
            exp.setMockData({
                tasks: [{ sourceId: 100, name: "task foo", sourceFollowerIds: [], stories: [{ creator: 123, text: "story 1" }, { creator: 123, text: "story 2" }] }]
            });

            importer._importTasks();
            importer._importStories();

            client.stories.createOnTask.should.have.been.calledTwice;
            client.stories.createOnTask.getCall(0).args.should.deep.equal([app.sourceToAsanaMap().at(100), { text: "story 1" }]);
            client.stories.createOnTask.getCall(1).args.should.deep.equal([app.sourceToAsanaMap().at(100), { text: "story 2" }]);
        });
    });

    describe("#_importAttachments", function() {
        var fs = require("fs");

        it("should write the attachment ids to a file", function() {
            sandbox.stub(fs, "appendFile", function (path, text, callback) {
                callback(null);
            });

            exp.setMockData({
                tasks: [{ sourceId: 100, name: "task1", sourceFollowerIds: [], sourceItemIds: [] }],
                attachments: [{ sourceId: 200, sourceParentId: 100 }]
            });

            app.setAttachmentsPath("attachments.json");

            importer._importTasks();
            importer._importAttachments();

            fs.appendFile.getCall(0).args[0].should.equal("attachments.json");
            fs.appendFile.getCall(0).args[1].should.match(/^\{[^\n]+\}\n$/);
            JSON.parse(fs.appendFile.getCall(0).args[1]).should.deep.equal({ sourceId: 200, task: app.sourceToAsanaMap().at(100) });
        });
    });

    describe("#_addSubtasksToTasks", function() {
        it("should add subtasks in the correct order", function() {
            exp.setMockData({
                tasks: [
                    { sourceId: 100, name: "task2",    sourceFollowerIds: [], sourceItemIds: [201, 200] },
                    { sourceId: 200, name: "subtask1", sourceFollowerIds: [], sourceItemIds: [] },
                    { sourceId: 201, name: "subtask2", sourceFollowerIds: [], sourceItemIds: [] }
                ]
            });

            importer._importTasks();
            importer._addSubtasksToTasks();

            client.tasks.setParent.callCount.should.equal(2);

            // reversed to get correct order
            client.tasks.setParent.getCall(1).args.should.deep.equal([app.sourceToAsanaMap().at(201), { parent: app.sourceToAsanaMap().at(100) }])
            client.tasks.setParent.getCall(0).args.should.deep.equal([app.sourceToAsanaMap().at(200), { parent: app.sourceToAsanaMap().at(100) }])
        });
    });

    describe("#_addDependenciesToTasks", function() {
        it("should add dependencies", function() {
            exp.setMockData({
                tasks: [
                    { sourceId: 100, name: "task1", sourceBlockingTaskIds: [] },
                    { sourceId: 200, name: "task2", sourceBlockingTaskIds: [100] }
                ]
            });

            importer._importTasks();
            importer._addDependenciesToTasks();

            client.tasks.update.should.have.been.calledOnce;

            client.tasks.update.should.have.been.calledWithExactly(app.sourceToAsanaMap().at(200), {
                tasks_blocking_this: [app.sourceToAsanaMap().at(100)]
            });
        });
    });

    describe("#_addTasksToProjects", function() {
        it("should add tasks to projects in the correct order", function() {
            exp.setMockData({
                teams: [{ sourceId: 100, name: "team1", teamType: "PUBLIC", sourceMemberIds: [] }],
                projects: [
                    { sourceId: 200, name: "project1", sourceTeamId: 100, sourceMemberIds: [], sourceItemIds: [300, 301] }
                ],
                tasks: [
                    { sourceId: 300, name: "task1", sourceFollowerIds: [], sourceItemIds: [] },
                    { sourceId: 301, name: "task2", sourceFollowerIds: [], sourceItemIds: [] }
                ]
            });

            importer._importTeams();
            importer._importProjects();
            importer._importTasks();
            importer._addTasksToProjects();

            client.tasks.addProject.should.have.been.called;
            // reversed to get correct order
            client.tasks.addProject.getCall(1).args.should.deep.equal([app.sourceToAsanaMap().at(300), { project: app.sourceToAsanaMap().at(200) }]);
            client.tasks.addProject.getCall(0).args.should.deep.equal([app.sourceToAsanaMap().at(301), { project: app.sourceToAsanaMap().at(200) }]);
        });
    });

    describe("#_addTasksToTags", function() {
        it("should add the correct tag to a task", function() {
            exp.setMockData({
                tags: [{ sourceId: 100, name: "tag foo", sourceTeamId: null, sourceItemIds: [101] }],
                tasks: [{ sourceId: 101, name: "task foo", sourceFollowerIds: [], sourceItemIds: [] }]
            });

            importer._importTags();
            importer._importTasks();
            importer._addTasksToTags();

            client.tasks.addTag.should.have.been.calledOnce;
        });
    });

    describe("#_importUsers", function() {
        it("should add a user to the correct workspace", function() {
            exp.setMockData({
                users: [{ sourceId: 100, name: "mike", email: "mike@example.com" }]
            });

            importer._importUsers();

            client.workspaces.addUser.should.have.been.calledOnce;
            client.workspaces.addUser.should.have.been.calledWithExactly(importer.organizationId(), {
                _sourceId: 100,
                user: "mike@example.com",
                silent: true
            });
        });
    });

    describe("#_addAssigneesToTasks", function() {
        it("should set the assignee of a task", function() {
            exp.setMockData({
                users: [{ sourceId: 100, name: "user1", email: "user1@example.com", sourceItemIds: [101] }],
                tasks: [{ sourceId: 101, name: "task1", sourceFollowerIds: [] }]
            });

            importer._importTasks();
            importer._importUsers();
            importer._addAssigneesToTasks();

            client.tasks.update.should.have.been.calledOnce;
            client.tasks.update.should.have.been.calledWithExactly(app.sourceToAsanaMap().at(101), {
                assignee: app.sourceToAsanaMap().at(100),
                silent: true
            });
        });
    });

    describe("#_addAssigneeStatusesToTasks", function() {
        it("should set the assignee status of a task", function() {
            exp.setMockData({
                users: [{ sourceId: 100, name: "user1", email: "user1@example.com", sourceitemids: [] }],
                tasks: [{ sourceId: 101, name: "task1", sourcefollowerids: [], assigneeStatus: "today", sourceAssigneeId: 100 }]
            });

            importer._importTasks();
            importer._importUsers();
            importer._addTaskAssigneeStatuses();

            client.tasks.update.should.have.been.calledOnce;
            client.tasks.update.should.have.been.calledWithExactly(app.sourceToAsanaMap().at(101), {
                assignee_status: "today"
            });
        });

        it("should not set the assignee status of a task with no assignee", function() {
            exp.setMockData({
                tasks: [{ sourceId: 101, name: "task1", sourcefollowerids: [], assigneeStatus: "today" }]
            });

            importer._importTasks();
            importer._importUsers();
            importer._addTaskAssigneeStatuses();

            client.tasks.update.should.not.have.been.called;
        });
    });

    describe("#_addFollowersToTasks", function() {
        it("should add multiple followers to a task with a single request", function() {
            exp.setMockData({
                users: [
                    { sourceId: 100, name: "user1", email: "user1@example.com" },
                    { sourceId: 101, name: "user2", email: "user2@example.com" }
                ],
                tasks: [{ sourceId: 200, name: "task1", sourceFollowerIds: [100, 101] }]
            });

            importer._importTasks();
            importer._importUsers();
            importer._addFollowersToTasks();

            client.tasks.addFollowers.should.have.been.calledOnce;
            client.tasks.addFollowers.should.have.been.calledWithExactly(app.sourceToAsanaMap().at(200), {
                followers: [100, 101].map(function(id) { return app.sourceToAsanaMap().at(id); }),
                silent: true
            });
        });
    });

    describe("#_addMembersToTeams", function() {
        it("should add two members to a team with two API calls", function() {
            exp.setMockData({
                users: [
                    { sourceId: 100, name: "user1", email: "user1@example.com" },
                    { sourceId: 101, name: "user2", email: "user2@example.com" }
                ],
                teams: [{ sourceId: 200, name: "team1", teamType: "PUBLIC", sourceMemberIds: [100, 101] }]
            });

            importer._importTeams();
            importer._importUsers();
            importer._addMembersToTeams();

            client.teams.addUser.should.have.been.calledTwice
            client.teams.addUser.should.have.been.calledWithExactly(app.sourceToAsanaMap().at(200), {
                user: app.sourceToAsanaMap().at(100),
                silent: true
            });
        });
    });

    describe("#_addMembersToProjects", function() {
        it("should add two members to a project with one API call", function() {
            exp.setMockData({
                users: [
                    { sourceId: 100, name: "user1", email: "user1@example.com" },
                    { sourceId: 101, name: "user2", email: "user2@example.com" }
                ],
                projects: [{ sourceId: 200, archived: false, name: "project1", sourceTeamId: null, sourceMemberIds: [100, 101] }]
            });

            importer._importTasks();
            importer._importUsers();
            importer._addMembersToProjects();

            client.projects.addMembers.should.have.been.calledOnce;
            client.projects.addMembers.should.have.been.calledWithExactly(app.sourceToAsanaMap().at(200), {
                members: [100, 101].map(function(id) { return app.sourceToAsanaMap().at(id); }),
                silent: true
            });
        });
    });

    describe("#_addFollowersToProjects", function() {
        it("should add two followers to a project with one API call", function() {
            exp.setMockData({
                users: [
                    { sourceId: 100, name: "user1", email: "user1@example.com" },
                    { sourceId: 101, name: "user2", email: "user2@example.com" }
                ],
                projects: [{ sourceId: 200, archived: false, name: "project1", sourceTeamId: null, sourceMemberIds: [], sourceFollowerIds: [100, 101] }]
            });

            //importer._importTasks();
            importer._importUsers();
            importer._addFollowersToProjects();

            client.projects.addFollowers.should.have.been.calledOnce;
            client.projects.addFollowers.should.have.been.calledWithExactly(app.sourceToAsanaMap().at(200), {
                followers: [100, 101].map(function(id) { return app.sourceToAsanaMap().at(id); }),
                silent: true
            });
        });
    });
});
