
describe("Integration", function() {
    var app, importer, exp, client;
    var asanaIdCounter, orgId = 12345;

    function createMock() { return Promise.resolve({ id: asanaIdCounter++ }); }
    function emptyMock() { return Promise.resolve({}); }

    beforeEach(function() {
        sandbox = sinon.sandbox.create();

        asanaIdCounter = 1;

        app = createApp();
        exp = AsanaExportInMemory.clone();
        importer = app.importer();
        importer.setOrganizationId(orgId);
        importer.setExport(exp);

        client = { workspaces: {}, users: {}, teams: {}, projects: {}, tags: {}, tasks: {}, stories: {}, dispatcher: {} };
        app.addClient(-1, client);

        // There needs to always be a user, to be the creator
        client.workspaces.addUser = sinon.spy(createMock);
        exp.addUserAndDomainUser(1234, 1235, "creator", "creator@example.com");
    });
    
    afterEach(function() {
        sandbox.restore();
    });

    describe("#run()", function() {
        it("should run with no data", function() {
            client.workspaces.tags = sinon.stub().returns(Promise.resolve([]));

            importer.run();

            // expect(exp.users()).to.deep.equal([]);
            expect(exp.teams()).to.deep.equal([]);
            expect(exp.projects()).to.deep.equal([]);
            expect(exp.taskDataSource()(0,50)).to.deep.equal([]);
            expect(exp.attachmentDataSource()(0,50)).to.deep.equal([]);
        });
    });

    describe("#_importTeams()", function() {
        it("should create some teams", function() {
            client.teams.create = sinon.spy(createMock);

            exp.addObject(100, "Team", { name: "team1", team_type: "PUBLIC" });
            exp.addObject(101, "Team", { name: "team2", team_type: "REQUEST_TO_JOIN" });
            exp.addObject(102, "Team", { name: "team3", team_type: "SECRET" });
            exp.prepareForImport();

            expect(exp.teams().mapPerform("toJS")).to.deep.equal([
                { sourceId: 100, name: "team1", teamType: "PUBLIC", sourceMemberIds: [] },
                { sourceId: 101, name: "team2", teamType: "REQUEST_TO_JOIN", sourceMemberIds: [] },
                { sourceId: 102, name: "team3", teamType: "SECRET", sourceMemberIds: [] },
            ]);

            importer._importTeams();

            expect(client.teams.create).to.have.callCount(3);
            expect(client.teams.create).to.have.been.calledWithExactly({ _sourceId: 100, organization: orgId, name: "team1", type: "PUBLIC" });
            expect(client.teams.create).to.have.been.calledWithExactly({ _sourceId: 101, organization: orgId, name: "team2", type: "REQUEST_TO_JOIN" });
            expect(client.teams.create).to.have.been.calledWithExactly({ _sourceId: 102, organization: orgId, name: "team3", type: "SECRET" });
        });
    });

    describe("#_importCustomFieldProtos", function() {
        it("should create text and number field protos", function() {
            client.dispatch = sinon.spy(createMock);

            exp.addObject(100, "CustomPropertyTextProto", { name: "Teddy", description: "A text field", creation_source: "web" });
            exp.addObject(101, "CustomPropertyNumberProto", { name: "Noddy", description: "A number field", precision: 3, creation_source: "web" });
            exp.prepareForImport();

            expect(exp.customFieldProtos().mapPerform("toJS")).to.deep.equal([
                { sourceId: 100, name: "Teddy", description: "A text field", type: "text", creationSource: "web" },
                { sourceId: 101, name: "Noddy", description: "A number field", type: "number", precision: 3, creationSource: "web" }
            ]);

            importer._importCustomFieldProtos();

            // The client library doesn't support custom fields yet, so we expect the dispatcher to have been
            // used directly
            expect(client.dispatch).to.have.callCount(2);
            expect(client.dispatch).to.have.been.calledWithExactly({
                    method: 'POST',
                    url: "https://app.asana.com/api/1.0/custom_fields",
                    json: {
                        data: {
                            _sourceId: 100,
                            name: "Teddy",
                            description: "A text field",
                            type: "text",
                            workspace: orgId
                        }
                    }});
            expect(client.dispatch).to.have.been.calledWithExactly({
                method: 'POST',
                url: "https://app.asana.com/api/1.0/custom_fields",
                json: {
                    data: {
                        _sourceId: 101,
                        name: "Noddy",
                        description: "A number field",
                        type: "number",
                        precision: 3,
                        workspace: orgId
                    }
                }});
        });

        it("should create enum field protos", function() {
            // Enum options are the most complex case for what we expect in return from the API. When creating the
            // enum proto, we expect all the options to also be created and assigned IDs, which we need to read
            // from the response
            client.dispatch = sinon.spy(function() {
                return Promise.resolve({
                    id: asanaIdCounter++,
                    enum_options: [
                        { id: 201 },
                        { id: 202 }
                    ]
                });
            });

            exp.addObject(102, "CustomPropertyEnumProto", { name: "Eddy", description: "A enum field", creation_source: "web" });
            exp.addObject(103, "CustomPropertyEnumOption", { name: "Red Pill", proto: 102, is_archived: false, color: "red", rank: "C" });
            exp.addObject(104, "CustomPropertyEnumOption", { name: "Blue Pill", proto: 102, is_archived: false, color: "blue", rank: "B" });
            exp.prepareForImport();

            expect(exp.customFieldProtos().mapPerform("toJS")).to.deep.equal([
                { sourceId: 102, name: "Eddy", description: "A enum field", type: "enum", creationSource: "web", options: [
                    { sourceId: 104, name: "Blue Pill", enabled: true, color: "blue" },
                    { sourceId: 103, name: "Red Pill", enabled: true, color: "red" }
                ] }
            ]);

            importer._importCustomFieldProtos();

            // The client library doesn't support custom fields yet, so we expect the dispatcher to have been
            // used directly
            expect(client.dispatch).to.have.callCount(1);
            expect(client.dispatch).to.have.been.calledWithExactly({
                method: 'POST',
                url: "https://app.asana.com/api/1.0/custom_fields",
                json: {
                    data: {
                        _sourceId: 102,
                        name: "Eddy",
                        description: "A enum field",
                        type: "enum",
                        workspace: orgId,
                        enum_options: [
                            { color: "blue", enabled: true, name: "Blue Pill", sourceId: 104 },
                            { color: "red", enabled: true, name: "Red Pill", sourceId: 103 }
                        ]
                    }
                }});

            // Check that we parsed the IDs of the newly created enum options correctly, and stored them for setting values later
            expect(app.sourceToAsanaMap().at(104)).to.equal(201);
            expect(app.sourceToAsanaMap().at(103)).to.equal(202);
        });

        it("should try again if proto name is already used", function() {
            // We don't parse the error message, we just assume all errors are caused by name conflicts
            var attempt = 0;
            client.dispatch = sinon.spy(function(params) {
                console.log(params)
                attempt++;
                if (attempt === 1) {
                    return Promise.reject("Error message about proto name being already used");
                } else {
                    return createMock();
                }
            });

            exp.addObject(100, "CustomPropertyTextProto", { name: "Teddy", description: "A text field", creation_source: "web" });
            exp.prepareForImport();

            importer._importCustomFieldProtos();

            // The client library doesn't support custom fields yet, so we expect the dispatcher to have been
            // used directly
            expect(client.dispatch).to.have.callCount(2);

            // First attempt with name "Teddy"
            expect(client.dispatch).to.have.been.calledWithExactly({
                method: 'POST',
                url: "https://app.asana.com/api/1.0/custom_fields",
                json: {
                    data: {
                        _sourceId: 100,
                        name: "Teddy",
                        description: "A text field",
                        type: "text",
                        workspace: orgId
                    }
                }});

            // Second attempt with name like "Teddy (Imported 12345 web)"
            expect(client.dispatch).to.have.been.calledWithExactly({
                method: 'POST',
                url: "https://app.asana.com/api/1.0/custom_fields",
                json: {
                    data: {
                        name: sinon.match(/Teddy \(Imported .* web\)/),
                        description: "A text field",
                        type: "text",
                        workspace: orgId,
                        precision: undefined,
                        enum_options: undefined
                    }
                }});
        });
    });

    describe("#_importProjects()", function() {
        beforeEach(function() {
            client.projects.create = sinon.spy(createMock);
            client.teams.create = sinon.spy(createMock);
        });

        it("should not create a project without a team", function() {
            exp.addObject(200, "ItemList", { name: "project1", description: "desc", is_project: true, is_archived: false, team: null, items: [], assignee: null, followers_du: [] });
            exp.prepareForImport();

            expect(exp.projects().length).to.equal(0);

            importer._importTeams();
            importer._importProjects();

            expect(client.projects.create).to.have.callCount(0);
        });

        it("should create a project with a corresponding team", function() {
            exp.addObject(100, "Team", { name: "team1", team_type: "PUBLIC" });
            exp.addObject(200, "ItemList", { name: "project1", creator_du: 1235, description: "desc", is_project: true, is_archived: false, team: 100, items: [], followers_du: [], assignee: null });
            exp.prepareForImport();

            expect(exp.projects().mapPerform("toJS")).to.deep.equal([
                { sourceId: 200, name: "project1", notes: "desc", creator: 1234, archived: false, public: false, color: null, isBoard: false, sourceTeamId: 100, sourceItemIds: [], sourceMemberIds: [], sourceFollowerIds: [], customFieldSettings: [] }
            ]);

            importer._importTeams();
            importer._importProjects();

            expect(client.teams.create).to.have.callCount(1);
            expect(client.projects.create).to.have.callCount(1);
            expect(client.projects.create).to.have.been.calledWithExactly({ _sourceId: 200, workspace: orgId, name: "project1", notes: "desc", archived: false, public: false, color: null, layout: "LIST", team: app.sourceToAsanaMap().at(100) });
        });

        it("should create projects with correct 'public' fields (and defaults to false)", function() {
            exp.addObject(100, "Team", { name: "team1", team_type: "PUBLIC" });
            exp.addObject(200, "ItemList", { name: "project1", creator_du: 1235, description: "desc", is_project: true, is_archived: false, team: 100, items: [], followers_du: [], is_public_to_workspace: true });
            exp.addObject(201, "ItemList", { name: "project2", creator_du: 1235, description: "desc", is_project: true, is_archived: false, team: 100, items: [], followers_du: [], is_public_to_workspace: false });
            exp.addObject(202, "ItemList", { name: "project3", creator_du: 1235, description: "desc", is_project: true, is_archived: false, team: 100, items: [], followers_du: [] });
            exp.prepareForImport();

            expect(exp.projects().mapPerform("toJS")).to.deep.equal([
                { sourceId: 200, name: "project1", creator: 1234, notes: "desc", archived: false, public: true, color: null, isBoard: false, sourceTeamId: 100, sourceItemIds: [], sourceMemberIds: [], sourceFollowerIds: [], customFieldSettings: [] },
                { sourceId: 201, name: "project2", creator: 1234, notes: "desc", archived: false, public: false, color: null, isBoard: false, sourceTeamId: 100, sourceItemIds: [], sourceMemberIds: [], sourceFollowerIds: [], customFieldSettings: [] },
                { sourceId: 202, name: "project3", creator: 1234, notes: "desc", archived: false, public: false, color: null, isBoard: false, sourceTeamId: 100, sourceItemIds: [], sourceMemberIds: [], sourceFollowerIds: [], customFieldSettings: [] }
            ]);

            importer._importTeams();
            importer._importProjects();

            expect(client.projects.create).to.have.callCount(3);
            expect(client.projects.create).to.have.been.calledWithExactly({ _sourceId: 200, workspace: orgId, name: "project1", notes: "desc", archived: false, public: true, color: null, layout: "LIST", team: app.sourceToAsanaMap().at(100) });
            expect(client.projects.create).to.have.been.calledWithExactly({ _sourceId: 201, workspace: orgId, name: "project2", notes: "desc", archived: false, public: false, color: null, layout: "LIST", team: app.sourceToAsanaMap().at(100) });
            expect(client.projects.create).to.have.been.calledWithExactly({ _sourceId: 202, workspace: orgId, name: "project3", notes: "desc", archived: false, public: false, color: null, layout: "LIST", team: app.sourceToAsanaMap().at(100) });
        });

        it("should not create projects for tags or ATMs", function() {
            exp.addUserAndDomainUser(100, 200, "user1", "user1@example.com");
            exp.addObject(400, "ItemList", { name: "tag1",     description: "desc", is_project: false, assignee: null, team: null, is_archived: false, items: [], followers_du: [] });
            exp.addObject(401, "ItemList", { name: "My Tasks", description: "desc", is_project: true,  assignee: 200, team: null, is_archived: false, items: [], followers_du: [] });
            exp.prepareForImport();

            expect(exp.projects().mapPerform("toJS")).to.deep.equal([]);
            expect(exp.tags().mapPerform("toJS")).to.deep.equal([
                { sourceId: 400, name: "tag1", sourceItemIds: [], sourceTeamId: null }
            ]);

            importer._importProjects();

            expect(client.projects.create).to.have.callCount(0);
        });
    });

    describe("#_addCustomFieldSettingsToProjects()", function() {
        it("should add custom field settings to projects", function() {
            client.projects.create = sinon.spy(createMock);
            client.projects.addCustomFieldSetting = sinon.spy(createMock);
            client.teams.create = sinon.spy(createMock);
            client.dispatch = sinon.spy(createMock);

            exp.addObject(100, "CustomPropertyTextProto", { name: "Teddy", description: "A text field" });
            exp.addObject(101, "CustomPropertyNumberProto", { name: "Noddy", description: "A number field", precision: 3 });
            exp.addObject(102, "Team", { name: "team1", team_type: "PUBLIC" });
            exp.addObject(103, "ItemList", { name: "project1", creator_du: 1235, description: "desc", is_project: true, is_archived: false, team: 101, items: [], followers_du: [], assignee: null });
            exp.addObject(104, "CustomPropertyProjectSetting", { project: 103, proto: 100, is_important: true, rank: "B" });
            exp.addObject(105, "CustomPropertyProjectSetting", { project: 103, proto: 101, is_important: true, rank: "A" });
            exp.prepareForImport();

            expect(exp.projects().mapPerform("toJS")).to.deep.equal([
                { sourceId: 103, name: "project1", creator: 1234, notes: "desc", archived: false, public: false, color: null, isBoard: false, sourceTeamId: 101, sourceItemIds: [], sourceMemberIds: [], sourceFollowerIds: [], customFieldSettings: [
                    { sourceCustomFieldProtoId: 101, isImportant: true, sourceId: 105 },
                    { sourceCustomFieldProtoId: 100, isImportant: true, sourceId: 104 }
                ] }
            ]);

            importer._importTeams();
            importer._importCustomFieldProtos();
            importer._importProjects();
            importer._addCustomFieldSettingsToProjects();

            // The client library doesn't support custom field settings yet, so we expect the dispatcher to have been
            // used directly
            expect(client.projects.addCustomFieldSetting).to.have.callCount(2);
            expect(client.projects.addCustomFieldSetting).to.have.been.calledWithExactly(app.sourceToAsanaMap().at(103), {
                custom_field: app.sourceToAsanaMap().at(101),
                is_important: true,
                _sourceId: 105
            });
            expect(client.projects.addCustomFieldSetting).to.have.been.calledWithExactly(app.sourceToAsanaMap().at(103), {
                custom_field: app.sourceToAsanaMap().at(100),
                is_important: true,
                _sourceId: 104
            });
        });

        it("should skip custom field settings for trashed protos", function() {
            client.projects.create = sinon.spy(createMock);
            client.projects.addCustomFieldSetting = sinon.spy(createMock);
            client.teams.create = sinon.spy(createMock);
            client.dispatch = sinon.spy(createMock);

            exp.addObject(100, "CustomPropertyTextProto", { name: "Teddy", description: "A text field", __trashed_at: "2023-11-30 00:00:00"});
            exp.addObject(101, "CustomPropertyNumberProto", { name: "Noddy", description: "A number field", precision: 3 });
            exp.addObject(102, "Team", { name: "team1", team_type: "PUBLIC" });
            exp.addObject(103, "ItemList", { name: "project1", creator_du: 1235, description: "desc", is_project: true, is_archived: false, team: 101, items: [], followers_du: [], assignee: null });
            exp.addObject(104, "CustomPropertyProjectSetting", { project: 103, proto: 100, is_important: true, rank: "B" });
            exp.addObject(105, "CustomPropertyProjectSetting", { project: 103, proto: 101, is_important: true, rank: "A" });
            exp.prepareForImport();

            expect(exp.projects().mapPerform("toJS")).to.deep.equal([
                { sourceId: 103, name: "project1", creator: 1234, notes: "desc", archived: false, public: false, color: null, isBoard: false, sourceTeamId: 101, sourceItemIds: [], sourceMemberIds: [], sourceFollowerIds: [], customFieldSettings: [
                    { sourceCustomFieldProtoId: 101, isImportant: true, sourceId: 105 },
                    // We expect the setting to still exist here, it's filtered at a later stage (for perf)
                    { sourceCustomFieldProtoId: 100, isImportant: true, sourceId: 104 }
                ] }
            ]);

            importer._importTeams();
            importer._importCustomFieldProtos();
            importer._importProjects();
            importer._addCustomFieldSettingsToProjects();

            // The client library doesn't support custom field settings yet, so we expect the dispatcher to have been
            // used directly
            expect(client.projects.addCustomFieldSetting).to.have.callCount(1);
            expect(client.projects.addCustomFieldSetting).to.have.been.calledWithExactly(app.sourceToAsanaMap().at(103), {
                custom_field: app.sourceToAsanaMap().at(101),
                is_important: true,
                _sourceId: 105
            });
        });
    });

    describe("#_importColumns()", function() {
        beforeEach(function() {
            client.projects.create = sinon.spy(createMock);
            client.dispatcher.post = sinon.spy(createMock);
            client.teams.create = sinon.spy(createMock);
        });

        it("should create a column", function() {
            exp.addObject(100, "Team", { name: "team1", team_type: "PUBLIC" });
            exp.addObject(101, "ItemList", { name: "project1", description: "desc", is_project: true, is_archived: false, team: 100, items: [], assignee: null, followers_du: [] });
            exp.addObject(1, "Column", { name: "column1", pot: 101, rank: "V" });
            exp.prepareForImport();

            expect(exp.columns().mapPerform("toJS")).to.deep.equal([
                { sourceId: 1, name: "column1", sourceProjectId: 101, sourceItemIds: [] }
            ]);

            importer._importColumns();

            // The client library doesn't support boards/columns yet, so we expect the dispatcher to have been
            // used directly
            expect(client.dispatcher.post).to.have.been.calledOnce;
            expect(client.dispatcher.post).to.have.been.calledWithExactly("/sections", {
                _sourceId: 1,
                name: "column1",
                project: app.sourceToAsanaMap().at(101)
            });
        });
    });

    describe("#_importTags()", function() {
        it("should create a tag with and without a team", function() {
            client.teams.create = sinon.spy(createMock);
            client.tags.createInWorkspace = sinon.spy(createMock);
            client.workspaces.tags = sinon.stub().returns(Promise.resolve([]));

            exp.addObject(100, "Team", { name: "team1", is_project: false, assignee: null, team_type: null });
            exp.addObject(200, "ItemList", { name: "tag1", is_project: false, assignee: null, team: null, items: [], followers_du: [] });
            exp.addObject(201, "ItemList", { name: "tag2", is_project: false, assignee: null, team: 100, items: [], followers_du: [] });
            exp.prepareForImport();

            expect(exp.tags().mapPerform("toJS")).to.deep.equal([
                { sourceId: 200, name: "tag1", sourceTeamId: null, sourceItemIds: [] },
                { sourceId: 201, name: "tag2", sourceTeamId: 100, sourceItemIds: [] }
            ]);

            importer._importTeams();
            importer._importTags();

            expect(client.teams.create).to.have.callCount(1);
            expect(client.tags.createInWorkspace).to.have.callCount(2);
            expect(client.workspaces.tags).to.have.callCount(1);
            expect(client.tags.createInWorkspace).to.have.been.calledWithExactly(orgId, { _sourceId: 200, name: "tag1", team: null });
            expect(client.tags.createInWorkspace).to.have.been.calledWithExactly(orgId, { _sourceId: 201, name: "tag2", team: app.sourceToAsanaMap().at(100) });
        });

        it("should not create duplicate tags", function() {
            client.tags.createInWorkspace = sinon.spy(createMock);
            client.workspaces.tags = sinon.stub().returns(Promise.resolve([
                { name: "tag1", id: 1 }
            ]));

            exp.addObject(100, "ItemList", { name: "tag1", is_project: false, assignee: null, team: null, items: [], followers_du: [] });
            exp.prepareForImport();

            expect(exp.tags().mapPerform("toJS")).to.deep.equal([
                { sourceId: 100, name: "tag1", sourceTeamId: null, sourceItemIds: [] }
            ]);

            importer._importTags();

            expect(client.tags.createInWorkspace).to.have.callCount(0);
            expect(client.workspaces.tags).to.have.callCount(1);
            expect(app.sourceToAsanaMap().at(100)).to.equal(1);
        });
    });

    describe("#_importTasks()", function() {
        beforeEach(function() {
            client.tasks.create = sinon.spy(createMock);
        });

        it("should create a task with and without various properties", function() {
            exp.addObject(100, "Task", { name: "task1", creator_du: 1235, items: [], stories: [], attachments: [], followers_du: [], __creation_time: "2014-11-16 22:44:11" });
            exp.addObject(101, "Task", { name: "task2", creator_du: 1235, rich_description: "desc", completed: true, schedule_status: "UPCOMING", start_date: "2023-11-15 00:00:00", due_date: "2023-11-30 00:00:00", items: [], stories: [], attachments: [], followers_du: [], __creation_time: "2014-11-16 22:44:11" });
            exp.prepareForImport();

            expect(exp.taskDataSource()(0,50).mapPerform("toJS")).to.deep.equal([
                { sourceId: 100, name: "task1", creator: 1234, notes: "", completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null, customFieldValues: [] },
                { sourceId: 101, name: "task2", creator: 1234, notes: "desc", completed: true, startOn: "2023-11-15 00:00:00", dueOn: "2023-11-30 00:00:00", public: false, assigneeStatus: "upcoming", sourceAssigneeId: null, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null, customFieldValues: [] }
            ]);

            importer._importTasks();

            expect(client.tasks.create).to.have.callCount(2);
            expect(client.tasks.create).to.have.been.calledWithExactly({ _sourceId: 100, workspace: orgId, name: "task1", html_notes: "", completed: false, start_on: null, due_on: null, force_public: false, hearted: false, recurrence: { type: null, data: null } });
            expect(client.tasks.create).to.have.been.calledWithExactly({ _sourceId: 101, workspace: orgId, name: "task2", html_notes: "desc", completed: true, start_on: "2023-11-15 00:00:00", due_on: "2023-11-30 00:00:00", force_public: false, hearted: false, recurrence: { type: null, data: null } });
        });

        it("should not create trashed tasks", function() {
            exp.addObject(100, "Task", { name: "task1", __trashed_at: "2023-11-30 00:00:00", items: [], stories: [], attachments: [], followers_du: [] });
            exp.prepareForImport();

            expect(exp.taskDataSource()(0,50).mapPerform("toJS")).to.deep.equal([]);

            importer._importTasks();

            expect(client.tasks.create).to.have.callCount(0);
        });

        it("should create tasks with the correct 'force_public' fields (defaults to false)", function() {
            exp.addObject(100, "Task", { name: "task1", creator_du: 1235, items: [], stories: [], attachments: [], followers_du: [], force_public_to_workspace: true });
            exp.addObject(101, "Task", { name: "task2", creator_du: 1235, items: [], stories: [], attachments: [], followers_du: [], force_public_to_workspace: false });
            exp.addObject(102, "Task", { name: "task3", creator_du: 1235, items: [], stories: [], attachments: [], followers_du: [] });
            exp.prepareForImport();

            expect(exp.taskDataSource()(0,50).mapPerform("toJS")).to.deep.equal([
                { sourceId: 100, name: "task1", notes: "", creator: 1234, completed: false, startOn: null, dueOn: null, public: true, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null, customFieldValues: [] },
                { sourceId: 101, name: "task2", notes: "", creator: 1234, completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null, customFieldValues: [] },
                { sourceId: 102, name: "task3", notes: "", creator: 1234, completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null, customFieldValues: [] }
            ]);

            importer._importTasks();

            expect(client.tasks.create).to.have.callCount(3);
            expect(client.tasks.create).to.have.been.calledWithExactly({ _sourceId: 100, workspace: orgId, name: "task1", html_notes: "", completed: false, start_on: null, due_on: null, hearted: false, force_public: true, recurrence: { type: null, data: null } });
            expect(client.tasks.create).to.have.been.calledWithExactly({ _sourceId: 101, workspace: orgId, name: "task2", html_notes: "", completed: false, start_on: null, due_on: null, hearted: false, force_public: false, recurrence: { type: null, data: null } });
            expect(client.tasks.create).to.have.been.calledWithExactly({ _sourceId: 102, workspace: orgId, name: "task3", html_notes: "", completed: false, start_on: null, due_on: null, hearted: false, force_public: false, recurrence: { type: null, data: null } });
        });

        it("should create tasks with the correct recurrence fields", function() {
            exp.addObject(100, "Task", { name: "task1", creator_du: 1235, items: [], stories: [], attachments: [], followers_du: [], recurrence_type: "NEVER" });
            exp.addObject(101, "Task", { name: "task2", creator_du: 1235, items: [], stories: [], attachments: [], followers_du: [], recurrence_type: "PERIODICALLY", recurrence_json: "{\"days_after_completion\":4,\"original_due_date\":1418342400000}" });
            exp.addObject(102, "Task", { name: "task3", creator_du: 1235, items: [], stories: [], attachments: [], followers_du: [], recurrence_type: "WEEKLY", recurrence_json: "{\"days_of_week\":[3,5],\"original_due_date\":1418342400000}" });
            exp.prepareForImport();

            expect(exp.taskDataSource()(0,50).mapPerform("toJS")).to.deep.equal([
                { sourceId: 100, name: "task1", creator: 1234, notes: "", completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: "NEVER", customFieldValues: [] },
                { sourceId: 101, name: "task2", creator: 1234, notes: "", completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: "{\"days_after_completion\":4,\"original_due_date\":1418342400000}", recurrenceType: "PERIODICALLY", customFieldValues: [] },
                { sourceId: 102, name: "task3", creator: 1234, notes: "", completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: "{\"days_of_week\":[3,5],\"original_due_date\":1418342400000}", recurrenceType: "WEEKLY", customFieldValues: [] }
            ]);

            importer._importTasks();

            expect(client.tasks.create).to.have.callCount(3);
            expect(client.tasks.create).to.have.been.calledWithExactly({ _sourceId: 101, workspace: orgId, name: "task2", html_notes: "", completed: false, start_on: null, due_on: null, hearted: false, force_public: false, recurrence: { type: "PERIODICALLY", data: "{\"days_after_completion\":4,\"original_due_date\":1418342400000}" } });
            expect(client.tasks.create).to.have.been.calledWithExactly({ _sourceId: 102, workspace: orgId, name: "task3", html_notes: "", completed: false, start_on: null, due_on: null, hearted: false, force_public: false, recurrence: { type: "WEEKLY", data: "{\"days_of_week\":[3,5],\"original_due_date\":1418342400000}" } });
            expect(client.tasks.create).to.have.been.calledWithExactly({ _sourceId: 100, workspace: orgId, name: "task1", html_notes: "", completed: false, start_on: null, due_on: null, hearted: false, force_public: false, recurrence: { type: "NEVER", data: null } });
        });
    });

    describe("#_importStories", function() {
        it("should add stories to the correct task in the correct order, excluding AddAttachmentStory", function() {
            client.workspaces.addUser = sinon.spy(emptyMock);
            client.tasks.create = sinon.spy(createMock);
            client.stories.createOnTask = sinon.spy(createMock);

            exp.addUserAndDomainUser(100, 200, "user1", "user1@example.com");
            exp.addObject(300, "Task", { name: "task1", creator_du: 1235, items: [], stories: [400, 401, 402], attachments: [], followers_du: [] });
            exp.addObject(400, "Comment", { creator_du: 200, __creation_time: "2014-11-17 22:44:22", text: "comment1" });
            exp.addObject(401, "Comment", { creator_du: 200, __creation_time: "2014-11-17 22:44:22", text: "comment2" });
            exp.addObject(402, "AddAttachmentStory", { creator_du: 200, __creation_time: "2014-11-17 22:44:22", text: "add attachment" });
            exp.prepareForImport();

            expect(exp.taskDataSource()(0,50).mapPerform("toJS")).to.deep.equal([
                {
                    sourceId: 300, name: "task1", notes: "", creator: 1234, completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], recurrenceData: null, recurrenceType: null, customFieldValues: [],  stories: [
                        { creator: 100, text: "comment1" },
                        { creator: 100, text: "comment2" }
                    ]
                }
            ]);

            importer._importUsers();
            importer._importTasks();
            importer._importStories();

            // user1 plus creator
            expect(client.workspaces.addUser).to.have.callCount(2);
            expect(client.tasks.create).to.have.callCount(1);
            expect(client.stories.createOnTask).to.have.callCount(2);
            expect(client.stories.createOnTask.getCall(0).args[0]).to.equal(app.sourceToAsanaMap().at(300));
            expect(client.stories.createOnTask.getCall(0).args[1]).to.deep.equal({ text: "comment1" });
            expect(client.stories.createOnTask.getCall(1).args[0]).to.equal(app.sourceToAsanaMap().at(300));
            expect(client.stories.createOnTask.getCall(1).args[1]).to.deep.equal({ text: "comment2" });
        });
    });

    describe("#_importAttachments", function() {
        var fs = require("fs");

        it("should write the attachment ids to a file", function() {
            client.tasks.create = sinon.spy(createMock);
            sandbox.stub(fs, "appendFile", function (path, text, callback) { callback(null); });

            exp.addObject(100, "Task", { name: "task1", creator_du: 1234, items: [], stories: [], attachments: [200], followers_du: [] });
            exp.addObject(200, "Asset", { name: "asset1.png", download_url: "http://example.com/asset1.png" });
            exp.prepareForImport();

            expect(exp.attachmentDataSource()(0,50).mapPerform("toJS")).to.deep.equal([
                { sourceId: 200, sourceParentId: 100 }
            ]);

            app.setAttachmentsPath("attachments.json");

            importer._importTasks();
            importer._importAttachments();

            expect(client.tasks.create).to.have.callCount(1)
            expect(fs.appendFile).to.have.callCount(1)
            expect(fs.appendFile.getCall(0).args[0]).to.equal("attachments.json");
            expect(fs.appendFile.getCall(0).args[1]).to.match(/^\{[^\n]+\}\n$/);
            expect(JSON.parse(fs.appendFile.getCall(0).args[1])).to.deep.equal({ sourceId: 200, task: app.sourceToAsanaMap().at(100) });
        });
    });

    describe("#_addSubtasksToTasks", function() {
        it("should add subtasks in the correct order", function() {
            client.tasks.create = sinon.spy(createMock);
            client.tasks.setParent = sinon.spy(emptyMock);

            exp.addObject(100, "Task", { name: "task1", creator_du: 1235, items: [202, 201], attachments: [], followers_du: [], stories: [] });
            exp.addObject(201, "Task", { name: "subtask2", creator_du: 1235, items: [],         attachments: [], followers_du: [], stories: [] });
            exp.addObject(202, "Task", { name: "subtask3", creator_du: 1235, items: [],         attachments: [], followers_du: [], stories: [] });
            exp.prepareForImport();

            expect(exp.taskDataSource()(0,50).mapPerform("toJS")).to.deep.equal([
                { sourceId: 100, name: "task1", creator: 1234,    notes: "", completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [202, 201], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null, customFieldValues: []  },
                { sourceId: 201, name: "subtask2", creator: 1234, notes: "", completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [],         sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null, customFieldValues: []  },
                { sourceId: 202, name: "subtask3", creator: 1234, notes: "", completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [],         sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null, customFieldValues: []  }
            ]);

            importer._importTasks();
            importer._addSubtasksToTasks();

            expect(client.tasks.create).to.have.callCount(3);
            expect(client.tasks.setParent).to.have.callCount(2);
            // reversed to get correct order
            expect(client.tasks.setParent.getCall(1).args).to.deep.equal([app.sourceToAsanaMap().at(202), { parent: app.sourceToAsanaMap().at(100) }])
            expect(client.tasks.setParent.getCall(0).args).to.deep.equal([app.sourceToAsanaMap().at(201), { parent: app.sourceToAsanaMap().at(100) }])
        });
    });

    describe("#_addDependenciesToTasks", function() {
        it("should add dependencies", function() {
            client.tasks.create = sinon.spy(createMock);
            client.tasks.update = sinon.spy(emptyMock);

            exp.addObject(100, "Task", { name: "precedent", creator_du: 1235, description: "", attachments: [], items: [], stories: [], followers_du: [] });
            exp.addObject(101, "Task", { name: "dependent", creator_du: 1235, description: "", attachments: [], items: [], stories: [], followers_du: [] });
            exp.addObject(102, "TaskDependency", { precedent:100, dependent:101 });
            exp.prepareForImport();

            expect(exp.taskDataSource()(0,50).mapPerform("toJS")).to.deep.equal([
                { sourceId: 100, name: "precedent", creator: 1234, notes: "", completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null, customFieldValues: []  },
                { sourceId: 101, name: "dependent", creator: 1234, notes: "", completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [100], stories: [], recurrenceData: null, recurrenceType: null, customFieldValues: []  }
            ]);

            importer._importTasks();
            importer._addDependenciesToTasks();

            client.tasks.update.should.have.been.calledOnce;

            client.tasks.update.should.have.been.calledWithExactly(app.sourceToAsanaMap().at(101), {
                tasks_blocking_this: [app.sourceToAsanaMap().at(100)]
            });
        });
    });

    describe("#_addTasksToProjects", function() {
        it("should add tasks to projects in the correct order", function() {
            client.teams.create = sinon.spy(createMock);
            client.projects.create = sinon.spy(createMock);
            client.tasks.create = sinon.spy(createMock);
            client.tasks.addProject = sinon.spy(emptyMock);

            exp.addObject(100, "Team", { name: "team1", team_type: "PUBLIC" });
            exp.addObject(200, "ItemList", { name: "project1", creator_du: 1235, description: "desc", is_project: true, is_archived: false, team: 100, items: [301, 300], followers_du: [], assignee: null });
            exp.addObject(300, "Task", { name: "task1", creator_du: 1235, description: null, items: [], attachments: [], followers_du: [], stories: [] });
            exp.addObject(301, "Task", { name: "task2", creator_du: 1235, description: null, items: [], attachments: [], followers_du: [], stories: [] });
            exp.prepareForImport();

            expect(exp.projects().mapPerform("toJS")).to.deep.equal([
                { sourceId: 200, name: "project1", creator: 1234, notes: "desc", sourceTeamId: 100, sourceMemberIds: [], sourceItemIds: [301, 300], sourceFollowerIds: [], archived: false, color: null, isBoard: false, public: false, customFieldSettings: [] }
            ]);

            importer._importTeams();
            importer._importProjects();
            importer._importTasks();
            importer._addTasksToProjects();

            expect(client.teams.create).to.have.callCount(1);
            expect(client.projects.create).to.have.callCount(1);
            expect(client.tasks.create).to.have.callCount(2);
            expect(client.tasks.addProject).to.have.callCount(2);
            // reversed to get correct order
            expect(client.tasks.addProject.getCall(1).args).to.deep.equal([app.sourceToAsanaMap().at(301), { project: app.sourceToAsanaMap().at(200) }]);
            expect(client.tasks.addProject.getCall(0).args).to.deep.equal([app.sourceToAsanaMap().at(300), { project: app.sourceToAsanaMap().at(200) }]);
        });
    });

    describe("#_addCustomFieldValuesToTasks", function() {
        it("should add custom field values to tasks", function() {
            client.teams.create = sinon.spy(createMock);
            client.projects.create = sinon.spy(createMock);
            client.projects.addCustomFieldSetting = sinon.spy(createMock);
            client.tasks.create = sinon.spy(createMock);
            client.tasks.addProject = sinon.spy(emptyMock);
            client.tasks.update = sinon.spy(emptyMock);

            // Not every usage of dispatcher.post is to create an enum custom field, but the rest ignore this response
            client.dispatch = sinon.spy(function() {
                return Promise.resolve({
                    id: asanaIdCounter++,
                    enum_options: [
                        { id: 1201 },
                        { id: 1202 },
                        { id: 1203 }
                    ]
                });
            });

            // This requires an annoying amount of preparation, because tasks outside projects can't get custom field values
            exp.addObject(100, "CustomPropertyTextProto", { name: "Teddy", description: "A text field" });
            exp.addObject(101, "CustomPropertyNumberProto", { name: "Noddy", description: "A number field", precision: 3 });
            exp.addObject(102, "CustomPropertyEnumProto", { name: "Eddy", description: "A enum field" });
            exp.addObject(110, "CustomPropertyEnumOption", { name: "Red Pill", proto: 102, is_archived: false, color: "red", rank: "C" });
            exp.addObject(111, "CustomPropertyEnumOption", { name: "Blue Pill", proto: 102, is_archived: false, color: "blue", rank: "B" });
            exp.addObject(112, "CustomPropertyEnumOption", { name: "Archived Pill", proto: 102, is_archived: true, color: "green", rank: "D" });
            exp.addObject(105, "CustomPropertyTextProto", { name: "Teddy", description: "A trashed text field", __trashed_at: "2023-11-30 00:00:00" });
            exp.addObject(150, "Team", { name: "team1", team_type: "PUBLIC" });
            exp.addObject(200, "ItemList", { name: "project1", creator_du: 1235, description: "desc", is_project: true, is_archived: false, team: 150, items: [301, 300], followers_du: [], assignee: null });
            exp.addObject(130, "CustomPropertyProjectSetting", { project: 200, proto: 100, is_important: true, rank: "B" });
            exp.addObject(131, "CustomPropertyProjectSetting", { project: 200, proto: 101, is_important: true, rank: "A" });
            exp.addObject(300, "Task", { name: "task1", creator_du: 1235, description: null, items: [], attachments: [], followers_du: [], stories: [] });
            exp.addObject(301, "Task", { name: "task2", creator_du: 1235, description: null, items: [], attachments: [], followers_du: [], stories: [] });
            exp.addObject(400, "CustomPropertyTextValue", { object: 300, proto: 100, text: "Yo"});
            exp.addObject(401, "CustomPropertyNumberValue", { object: 301, proto: 101, digits: "3.142"});
            exp.addObject(402, "CustomPropertyEnumValue", { object: 301, proto: 102, option: 111});
            exp.addObject(403, "CustomPropertyEnumValue", { object: 300, proto: 102, option: 112});
            exp.addObject(404, "CustomPropertyTextValue", { object: 300, proto: 105, text: "Garbage"});
            exp.prepareForImport();

            expect(exp.taskDataSource()(0,50).mapPerform("toJS")).to.deep.equal([
                { sourceId: 300, name: "task1", creator: 1234, notes: "", completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null,
                    customFieldValues: [
                        {
                            protoSourceId: 100,
                            type: "text",
                            value: "Yo"
                        },
                        // This is for a trashed proto, and will be filtered out later
                        {
                            protoSourceId: 105,
                            type: "text",
                            value: "Garbage"
                        }
                    ]  },
                { sourceId: 301, name: "task2", creator: 1234, notes: "", completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null,
                    customFieldValues: [
                        {
                            protoSourceId: 101,
                            type: "number",
                            value: "3.142"
                        },
                        {
                            protoSourceId: 102,
                            type: "enum",
                            value: 111
                        }
                    ]  }
            ]);

            expect(exp.projects().mapPerform("toJS")).to.deep.equal([
                { sourceId: 200, name: "project1", creator: 1234, notes: "desc", archived: false, public: false, color: null, isBoard: false, sourceTeamId: 150, sourceItemIds: [301, 300], sourceMemberIds: [], sourceFollowerIds: [], customFieldSettings: [
                    { sourceCustomFieldProtoId: 101, isImportant: true, sourceId: 131 },
                    { sourceCustomFieldProtoId: 100, isImportant: true, sourceId: 130 }
                ] }
            ]);

            importer._importTeams();
            importer._importCustomFieldProtos();
            importer._importProjects();
            importer._addCustomFieldSettingsToProjects();
            importer._importTasks();
            importer._addTasksToProjects();
            importer._addCustomFieldValuesToTasks();

            expect(client.teams.create).to.have.callCount(1);
            expect(client.projects.create).to.have.callCount(1);
            expect(client.tasks.create).to.have.callCount(2);
            expect(client.tasks.addProject).to.have.callCount(2);

            var task1CustomFields = {};
            task1CustomFields[app.sourceToAsanaMap().at(100)] = "Yo";
            client.tasks.update.should.have.been.calledWithExactly(app.sourceToAsanaMap().at(300), {
                custom_fields: task1CustomFields,
                force_write_custom_fields: true
            });

            var task2CustomFields = {};
            task2CustomFields[app.sourceToAsanaMap().at(101)] = "3.142";
            task2CustomFields[app.sourceToAsanaMap().at(102)] = app.sourceToAsanaMap().at(111);
            client.tasks.update.should.have.been.calledWithExactly(app.sourceToAsanaMap().at(301), {
                custom_fields: task2CustomFields,
                force_write_custom_fields: true
            });
        });
    });

    describe("#_addTasksToTags", function() {
        it("should add tasks to tags in the correct order", function() {
            client.tags.createInWorkspace = sinon.spy(createMock);
            client.workspaces.tags = sinon.stub().returns(Promise.resolve([]));
            client.tasks.create = sinon.spy(createMock);
            client.tasks.addTag = sinon.spy(emptyMock);

            exp.addObject(100, "ItemList", { name: "tag1", is_project: false, assignee: null, team: null, items: [301, 300], followers_du: []});
            exp.addObject(300, "Task", { name: "task1", description: null, items: [], attachments: [], followers_du: [], stories: [] });
            exp.addObject(301, "Task", { name: "task2", description: null, items: [], attachments: [], followers_du: [], stories: [] });
            exp.prepareForImport();

            expect(exp.tags().mapPerform("toJS")).to.deep.equal([
                { sourceId: 100, name: "tag1", sourceTeamId: null, sourceItemIds: [301, 300] }
            ]);

            importer._importTags();
            importer._importTasks();
            importer._addTasksToTags();

            expect(client.tags.createInWorkspace).to.have.callCount(1);
            expect(client.workspaces.tags).to.have.callCount(1);
            expect(client.tasks.create).to.have.callCount(2);
            expect(client.tasks.addTag).to.have.callCount(2);
            // reversed to get correct order
            expect(client.tasks.addTag.getCall(1).args).to.deep.equal([app.sourceToAsanaMap().at(301), { tag: app.sourceToAsanaMap().at(100) }]);
            expect(client.tasks.addTag.getCall(0).args).to.deep.equal([app.sourceToAsanaMap().at(300), { tag: app.sourceToAsanaMap().at(100) }]);
        });
    });

    describe("#_addTasksToColumns", function() {
        beforeEach(function() {
            client.projects.create = sinon.spy(createMock);
            client.tasks.create = sinon.spy(createMock);
            client.dispatcher.post = sinon.spy(createMock);
            client.teams.create = sinon.spy(createMock);
        });

        it("should add tasks to columns in the correct order", function() {
            exp.addObject(100, "Team", { name: "team1", team_type: "PUBLIC" });
            exp.addObject(101, "ItemList", { name: "project1", description: "desc", is_project: true, is_archived: false, team: 100, items: [], assignee: null, followers_du: [] });
            exp.addObject(1, "Column", { name: "column1", pot: 101, rank: "V" });
            exp.addObject(2, "ColumnTask", { column: 1, pot: 101, task: 10, rank: "a" });
            exp.addObject(3, "ColumnTask", { column: 1, pot: 101, task: 12, rank: "c" });
            exp.addObject(4, "ColumnTask", { column: 1, pot: 101, task: 11, rank: "b" });
            exp.addObject(10, "Task", { followers_du: [], stories: [] });
            exp.addObject(11, "Task", { followers_du: [], stories: [] });
            exp.addObject(12, "Task", { followers_du: [], stories: [] });
            exp.prepareForImport();

            expect(exp.columns().mapPerform("toJS")).to.deep.equal([
                { sourceId: 1, name: "column1", sourceProjectId: 101, sourceItemIds: [10,11,12] }
            ]);

            importer._importTasks();
            importer._importColumns();
            importer._addTasksToColumns();

            // The client library doesn't support boards/columns yet, so we expect the dispatcher to have been
            // used directly
            // The first call to dispatcher.post will be to create the column.
            // Calls 1, 2 & 3 should be adding to columns, in forward order.
            expect(client.dispatcher.post).to.have.callCount(4);
            client.dispatcher.post.getCall(1).args.should.deep.equal([
                "/tasks/" + app.sourceToAsanaMap().at(10) + "/addProject",
                { section: app.sourceToAsanaMap().at(1), project: app.sourceToAsanaMap().at(101) }
            ]);
            client.dispatcher.post.getCall(2).args.should.deep.equal([
                "/tasks/" + app.sourceToAsanaMap().at(11) + "/addProject",
                { section: app.sourceToAsanaMap().at(1), project: app.sourceToAsanaMap().at(101) }
            ]);
            client.dispatcher.post.getCall(3).args.should.deep.equal([
                "/tasks/" + app.sourceToAsanaMap().at(12) + "/addProject",
                { section: app.sourceToAsanaMap().at(1), project: app.sourceToAsanaMap().at(101) }
            ]);
        });

        it("should skip adding tasks to columns in trashed projects", function() {
            exp.addObject(100, "Team", { name: "team1", team_type: "PUBLIC" });
            exp.addObject(101, "ItemList", { name: "project1", description: "desc", is_project: true, is_archived: false, team: 100, items: [], assignee: null, followers_du: [], __trashed_at: "2023-11-30 00:00:00" });
            exp.addObject(1, "Column", { name: "column1", pot: 101, rank: "V" });
            exp.addObject(2, "ColumnTask", { column: 1, pot: 101, task: 10, rank: "a" });
            exp.addObject(10, "Task", { followers_du: [], stories: [] });
            exp.prepareForImport();

            // It should be skipped at the very beginning, by AsanaExport
            expect(exp.columns().mapPerform("toJS")).to.deep.equal([ ]);

            importer._importTasks();
            importer._importColumns();
            importer._addTasksToColumns();

            // The client library doesn't support boards/columns yet, so we expect the dispatcher to have been
            // used directly
            // There should be no call to create the column
            // Then, there should be no call to put the task in it (this is where there was a bug)
            expect(client.dispatcher.post).to.have.callCount(0);
        });
    });

    describe("#_importUsers", function() {
        it("should add a user to the correct workspace", function() {
            client.workspaces.addUser = sinon.spy(createMock);

            exp.addUserAndDomainUser(100, 200, "user1", "user1@example.com");
            exp.prepareForImport();

            expect(exp.users().mapPerform("toJS")).to.deep.equal([
                { sourceId: 1234, name: "creator", email: "creator@example.com", sourceItemIds: [] },
                { sourceId: 100, name: "user1", email: "user1@example.com", sourceItemIds: [] }
            ]);

            importer._importUsers();

            expect(client.workspaces.addUser).to.have.callCount(2);
            expect(client.workspaces.addUser).to.have.been.calledWithExactly(importer.organizationId(), { _sourceId: 1234, user: "creator@example.com", silent: true });
            expect(client.workspaces.addUser).to.have.been.calledWithExactly(importer.organizationId(), { _sourceId: 100, user: "user1@example.com", silent: true });
        });

        it("should not return deactivated Users", function() {
            client.workspaces.addUser = sinon.spy(createMock);

            exp.addObject(100, "User", { name: "user1", deactivated: true });
            exp.addObject(300, "DomainUser", { user: 100, task_list: null, email: "user1@example.com" });
            exp.prepareForImport();

            expect(exp.users().mapPerform("toJS")).to.deep.equal([
                { sourceId: 1234, name: "creator", email: "creator@example.com", sourceItemIds: [] }
            ]);

            importer._importUsers();

            expect(client.workspaces.addUser).to.have.callCount(1);
            expect(client.workspaces.addUser).to.have.been.calledWithExactly(importer.organizationId(), { _sourceId: 1234, user: "creator@example.com", silent: true });
        });

        it("should not return active=false DomainUsers", function() {
            client.workspaces.addUser = sinon.spy(createMock);

            exp.addObject(100, "User", { name: "user1", deactivated: false });
            exp.addObject(300, "DomainUser", { user: 100, task_list: null, active: false, email: "user1@example.com" });
            exp.prepareForImport();

            expect(exp.users().mapPerform("toJS")).to.deep.equal([
                { sourceId: 1234, name: "creator", email: "creator@example.com", sourceItemIds: [] }
            ]);

            importer._importUsers();

            expect(client.workspaces.addUser).to.have.callCount(1);
            expect(client.workspaces.addUser).to.have.been.calledWithExactly(importer.organizationId(), { _sourceId: 1234, user: "creator@example.com", silent: true });
        });
    });

    describe("#_addAssigneesToTasks", function() {
        it("should assign tasks to users in the correct order", function() {
            client.workspaces.addUser = sinon.spy(createMock);
            client.tasks.create = sinon.spy(createMock);
            client.tasks.update = sinon.spy(emptyMock);

            exp.addUserAndDomainUser(100, 200, "user1", "user1@example.com", 300);
            exp.addObject(300, "ItemList", { name: "My Tasks", description: "", is_project: true, is_archived: false, assignee: 200, items: [401, 400], followers_du: [], is_public_to_workspace: true, is_shared_with_link: false, remind_owner_to_update_status: true });
            exp.addObject(400, "Task", { name: "task1", description: null, items: [], attachments: [], followers_du: [], stories: [] });
            exp.addObject(401, "Task", { name: "task2", description: null, items: [], attachments: [], followers_du: [], stories: [] });
            exp.prepareForImport();

            expect(exp.users().mapPerform("toJS")).to.deep.equal([
                { sourceId: 1234, name: "creator", email: "creator@example.com", sourceItemIds: [] },
                { sourceId: 100, name: "user1", email: "user1@example.com", sourceItemIds: [401, 400] }
            ]);

            importer._importTasks();
            importer._importUsers();
            importer._addAssigneesToTasks();

            expect(client.workspaces.addUser).to.have.callCount(2);
            expect(client.tasks.create).to.have.callCount(2);
            expect(client.tasks.update).to.have.callCount(2);
            // reversed to get correct order
            expect(client.tasks.update.getCall(1).args).to.deep.equal([app.sourceToAsanaMap().at(401), { assignee: app.sourceToAsanaMap().at(100), silent: true }]);
            expect(client.tasks.update.getCall(0).args).to.deep.equal([app.sourceToAsanaMap().at(400), { assignee: app.sourceToAsanaMap().at(100), silent: true }]);
        });
    });

    describe("#_addAssigneeStatusesToTasks", function() {
        it("should set the assignee status of tasks", function() {
            client.workspaces.addUser = sinon.spy(createMock);
            client.tasks.create = sinon.spy(createMock);
            client.tasks.update = sinon.spy(createMock);

            exp.addUserAndDomainUser(100, 200, "user1", "user1@example.com", 300);
            exp.addObject(300, "Task", { name: "task1", creator_du: 1235, items: [], stories: [], attachments: [], followers_du: [], schedule_status: "UPCOMING" });
            exp.addObject(301, "Task", { name: "task2", creator_du: 1235, items: [], stories: [], attachments: [], followers_du: [], schedule_status: "UPCOMING", assignee: 200 });
            exp.addObject(302, "Task", { name: "task3", creator_du: 1235, items: [], stories: [], attachments: [], followers_du: [], schedule_status: "OK", assignee: 200 });
            exp.addObject(303, "Task", { name: "task4", creator_du: 1235, items: [], stories: [], attachments: [], followers_du: [], schedule_status: "TODAY", assignee: 200 });
            exp.prepareForImport();

            expect(exp.taskDataSource()(0,50).mapPerform("toJS")).to.deep.equal([
                { sourceId: 300, name: "task1", notes: "", creator: 1234, completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: "upcoming", sourceAssigneeId: null, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null, customFieldValues: [] },
                { sourceId: 301, name: "task2", notes: "", creator: 1234, completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: "upcoming", sourceAssigneeId: 100, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null, customFieldValues: [] },
                { sourceId: 302, name: "task3", notes: "", creator: 1234, completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: "later", sourceAssigneeId: 100, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null, customFieldValues: [] },
                { sourceId: 303, name: "task4", notes: "", creator: 1234, completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: "today", sourceAssigneeId: 100, sourceItemIds: [], sourceFollowerIds: [], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null, customFieldValues: [] },
            ]);

            importer._importTasks();
            importer._importUsers();
            importer._addTaskAssigneeStatuses();

            expect(client.tasks.update).to.have.callCount(3);
            expect(client.tasks.update).to.have.been.calledWithExactly(app.sourceToAsanaMap().at(301), { assignee_status: "upcoming" });
            expect(client.tasks.update).to.have.been.calledWithExactly(app.sourceToAsanaMap().at(302), { assignee_status: "later" });
            expect(client.tasks.update).to.have.been.calledWithExactly(app.sourceToAsanaMap().at(303), { assignee_status: "today" });
        });
    });

    describe("#_addFollowersToTasks", function() {
        it("should add multiple followers to a task with a single request", function() {
            client.workspaces.addUser = sinon.spy(createMock);
            client.tasks.create = sinon.spy(createMock);
            client.tasks.addFollowers = sinon.spy(emptyMock);

            exp.addUserAndDomainUser(100, 200, "user1", "user1@example.com");
            exp.addUserAndDomainUser(101, 201, "user2", "user2@example.com");
            exp.addObject(300, "Task", { name: "task1", creator_du: 1235, description: null, items: [], attachments: [], followers_du: [200, 201], stories: [] });
            exp.prepareForImport();

            expect(exp.taskDataSource()(0,50).mapPerform("toJS")).to.deep.equal([
                { sourceId: 300, name: "task1", notes: "", creator: 1234, completed: false, startOn: null, dueOn: null, public: false, assigneeStatus: null, sourceAssigneeId: null, sourceItemIds: [], sourceFollowerIds: [100, 101], sourceBlockingTaskIds: [], stories: [], recurrenceData: null, recurrenceType: null, customFieldValues: []  }
            ]);

            importer._importTasks();
            importer._importUsers();
            importer._addFollowersToTasks();

            expect(client.workspaces.addUser).to.have.callCount(3);
            expect(client.tasks.create).to.have.callCount(1);
            expect(client.tasks.addFollowers).to.have.callCount(1);
            expect(client.tasks.addFollowers).to.have.been.calledWithExactly(app.sourceToAsanaMap().at(300), {
                followers: [100, 101].map(function(id) { return app.sourceToAsanaMap().at(id); }),
                silent: true
            });
        });
    });

    describe("#_addMembersToTeams", function() {
        it("should add two members to a team with two API calls", function() {
            client.workspaces.addUser = sinon.spy(createMock);
            client.teams.create = sinon.spy(createMock);
            client.teams.addUser = sinon.spy(emptyMock);

            exp.addUserAndDomainUser(100, 200, "user1", "user1@example.com");
            exp.addUserAndDomainUser(101, 201, "user2", "user2@example.com");
            exp.addObject(300, "Team", { name: "team1", team_type: "PUBLIC" });
            exp.addObject(400, "TeamMembership", { team: 300, member: 200 });
            exp.addObject(401, "TeamMembership", { team: 300, member: 201 });
            exp.prepareForImport();

            expect(exp.teams().mapPerform("toJS")).to.deep.equal([
                { sourceId: 300, name: "team1", teamType: "PUBLIC", sourceMemberIds: [100, 101] }
            ]);

            importer._importTeams();
            importer._importUsers();
            importer._addMembersToTeams();

            expect(client.workspaces.addUser).to.have.callCount(3);
            expect(client.teams.create).to.have.callCount(1);
            expect(client.teams.addUser).to.have.callCount(2);
            expect(client.teams.addUser).to.have.been.calledWithExactly(app.sourceToAsanaMap().at(300), {
                user: app.sourceToAsanaMap().at(100),
                silent: true
            });
            expect(client.teams.addUser).to.have.been.calledWithExactly(app.sourceToAsanaMap().at(300), {
                user: app.sourceToAsanaMap().at(101),
                silent: true
            });
        });

        it("should not include 'limited_access=true' users in a team", function() {
            client.workspaces.addUser = sinon.spy(createMock);
            client.teams.create = sinon.spy(createMock);
            client.teams.addUser = sinon.spy(emptyMock);

            exp.addUserAndDomainUser(100, 200, "user1", "user1@example.com");
            exp.addObject(300, "Team", { name: "team1", team_type: "PUBLIC" });
            exp.addObject(400, "TeamMembership", { team: 300, member: 200, limited_access: true });
            exp.prepareForImport();

            expect(exp.teams().mapPerform("toJS")).to.deep.equal([
                { sourceId: 300, name: "team1", teamType: "PUBLIC", sourceMemberIds: [] }
            ]);

            importer._importTeams();
            importer._importUsers();
            importer._addMembersToTeams();

            expect(client.workspaces.addUser).to.have.callCount(2);
            expect(client.teams.create).to.have.callCount(1);
            expect(client.teams.addUser).to.have.callCount(0);
        });
    });

    describe("#_addMembersToProjects", function() {
        it("should add two members to a project with one API call", function() {
            client.workspaces.addUser = sinon.spy(createMock);
            client.teams.create = sinon.spy(createMock);
            client.projects.create = sinon.spy(createMock);
            client.projects.addMembers = sinon.spy(createMock);

            exp.addUserAndDomainUser(100, 200, "user1", "user1@example.com");
            exp.addUserAndDomainUser(101, 201, "user2", "user2@example.com");
            exp.addObject(300, "Team", { name: "team1", team_type: "PUBLIC" });
            exp.addObject(400, "ItemList", { name: "project1", creator_du: 1235, description: "desc", is_project: true, is_archived: false, team: 300, items: [], followers_du: [], assignee: null });
            exp.addObject(500, "ProjectMembership", { project: 400, member: 200 });
            exp.addObject(501, "ProjectMembership", { project: 400, member: 201 });
            exp.prepareForImport();

            expect(exp.projects().mapPerform("toJS")).to.deep.equal([
                { sourceId: 400, name: "project1", creator: 1234, notes: "desc", archived: false, public: false, color: null, isBoard: false, sourceTeamId: 300, sourceItemIds: [], sourceFollowerIds: [], sourceMemberIds: [100, 101], customFieldSettings: [] }
            ]);

            importer._importTeams();
            importer._importProjects();
            importer._importTasks();
            importer._importUsers();
            importer._addMembersToProjects();

            expect(client.workspaces.addUser).to.have.callCount(3);
            expect(client.teams.create).to.have.callCount(1);
            expect(client.projects.create).to.have.callCount(1);
            expect(client.projects.addMembers).to.have.callCount(1);
            expect(client.projects.addMembers).to.have.been.calledWithExactly(app.sourceToAsanaMap().at(400), {
                members: [100, 101].map(function(id) { return app.sourceToAsanaMap().at(id); }),
                silent: true
            });
        });
    });

    describe("#_addFollowersToProjects", function() {
        it("should add two followers to a project with one API call", function() {
            client.workspaces.addUser = sinon.spy(createMock);
            client.teams.create = sinon.spy(createMock);
            client.projects.create = sinon.spy(createMock);
            client.projects.addFollowers = sinon.spy(createMock);

            exp.addUserAndDomainUser(100, 200, "user1", "user1@example.com");
            exp.addUserAndDomainUser(101, 201, "user2", "user2@example.com");
            exp.addUserAndDomainUser(102, 202, "user3", "user3@example.com");
            exp.addObject(300, "Team", { name: "team1", team_type: "PUBLIC" });
            exp.addObject(400, "ItemList", { name: "project1", creator_du: 1235, description: "desc", is_project: true, is_archived: false, team: 300, items: [], followers_du: [200, 201, 202], assignee: null });
            exp.addObject(500, "ProjectMembership", { project: 400, member: 200 });
            exp.addObject(501, "ProjectMembership", { project: 400, member: 201 });
            exp.prepareForImport();

            expect(exp.projects().mapPerform("toJS")).to.deep.equal([
                { sourceId: 400, name: "project1", creator: 1234, notes: "desc", archived: false, public: false, color: null, isBoard: false, sourceTeamId: 300, sourceItemIds: [], sourceFollowerIds: [100, 101], sourceMemberIds: [100, 101], customFieldSettings: [] }
            ]);

            importer._importTeams();
            importer._importProjects();
            importer._importTasks();
            importer._importUsers();
            importer._addFollowersToProjects();

            expect(client.workspaces.addUser).to.have.callCount(4);
            expect(client.teams.create).to.have.callCount(1);
            expect(client.projects.create).to.have.callCount(1);
            expect(client.projects.addFollowers).to.have.callCount(1);
            expect(client.projects.addFollowers).to.have.been.calledWithExactly(app.sourceToAsanaMap().at(400), {
                followers: [100, 101].map(function(id) { return app.sourceToAsanaMap().at(id); }),
                silent: true
            });
        });
    });
});
