
describe("AsanaExport", function() {
    var exp;
    beforeEach(function() {
        exp = AsanaExportInMemory.clone();
    });

    describe("#users()", function() {
        it("should return no users", function() {
            exp.prepareForImport();

            exp.users().should.deep.equal([]);
        });

        it("should return one user with a list of assigned items", function() {
            exp.addObject(1, "User", { name: "mike" });
            exp.addObject(3, "DomainUser", { user: 1, task_list: 4, email: "mike@example.com" });
            exp.addObject(4, "ItemList", { followers_du: [], name: "My Tasks", is_project: true, assignee: 3, is_archived: false, items: [10,11,12] });
            exp.prepareForImport();

            exp.users().mapPerform("performGets", ["email", "name", "sourceId", "sourceItemIds"]).should.deep.equal([
                { sourceId: 1, name: "mike", email: "mike@example.com", sourceItemIds: [10,11,12] }
            ]);
        });

        it("should not return deactivated users", function() {
            exp.addObject(1, "User", { name: "mike", deactivated: true });
            exp.addObject(3, "DomainUser", { user: 1, task_list: 4, email: "mike@example.com" });
            exp.addObject(4, "ItemList", { followers_du: [], name: "My Tasks", is_project: true, assignee: 3, is_archived: false, items: [10,11,12] });
            exp.prepareForImport();

            exp.users().mapPerform("performGets", ["email", "name", "sourceId", "sourceItemIds"]).should.deep.equal([]);
        });
    });

    describe("#teams()", function() {
        it("should return no teams", function() {
            exp.prepareForImport();

            exp.teams().should.deep.equal([]);
        });

        it("should return one team", function() {
            exp.addObject(1, "Team", { name: "team1", team_type: "REQUEST_TO_JOIN" });
            exp.prepareForImport();

            exp.teams().mapPerform("performGets", ["sourceId", "name", "teamType", "sourceMemberIds"]).should.deep.equal([
                { sourceId: 1, name: "team1", teamType: "REQUEST_TO_JOIN", sourceMemberIds: [] }
            ]);
        });

        it("should return the correct members of a team", function() {
            exp.addObject(1, "User", { name: "mike" });
            exp.addObject(3, "DomainUser", { user: 1, email: "mike@example.com" });
            exp.addObject(4, "Team", { name: "team1", team_type: "REQUEST_TO_JOIN" });
            exp.addObject(5, "TeamMembership", { team: 4, member: 3 });
            exp.prepareForImport();

            exp.teams().mapPerform("performGets", ["sourceId", "name", "teamType", "sourceMemberIds"]).should.deep.equal([
                { sourceId: 4, name: "team1", teamType: "REQUEST_TO_JOIN", sourceMemberIds: [1] }
            ]);
        });

        it("should not include 'limited_access=true' users in a team", function() {
            exp.addObject(1, "User", { name: "mike" });
            exp.addObject(3, "DomainUser", { user: 1, email: "mike@example.com" });
            exp.addObject(4, "Team", { name: "team1", team_type: "REQUEST_TO_JOIN" });
            exp.addObject(5, "TeamMembership", { team: 4, member: 3, limited_access: true });
            exp.prepareForImport();

            exp.teams().mapPerform("performGets", ["sourceId", "name", "teamType", "sourceMemberIds"]).should.deep.equal([
                { sourceId: 4, name: "team1", teamType: "REQUEST_TO_JOIN", sourceMemberIds: [] }
            ]);
        });
    });

    describe("#projects()", function() {
        it("should return no projects", function() {
            exp.prepareForImport();

            exp.projects().should.deep.equal([]);
        });

        it("should return one project, no tags or user task lists", function() {
            exp.addObject(1, "User", { name: "mike" });
            exp.addObject(3, "DomainUser", { user: 1, email: "mike@example.com" });
            exp.addObject(4, "Team", { name: "team1", team_type: "REQUEST_TO_JOIN" });
            exp.addObject(5, "ItemList", { followers_du: [], name: "project1", description: "description", is_project: true, is_archived: false, items: [10,11,12], team: 4, stories: [] });
            exp.addObject(6, "ItemList", { followers_du: [], name: "tag1", is_project: false, is_archived: false, items: [10,11,12], team: 4, stories: [] });
            exp.addObject(7, "ItemList", { followers_du: [], name: "My Tasks", is_project: true, assignee: 3, is_archived: false, items: [10,11,12] });
            exp.addObject(8, "ProjectMembership", { project: 5, member: 3 });
            exp.prepareForImport();

            exp.projects().mapPerform("performGets", ["sourceId", "archived", "name", "color", "notes", "sourceTeamId", "sourceMemberIds", "sourceItemIds"]).should.deep.equal([
                { sourceId: 5, archived: false, name: "project1", color: null, notes: "description", sourceTeamId: 4, sourceMemberIds: [1], sourceItemIds: [10,11,12] }
            ]);
        });

        it("should return a project with only followers who are also project members", function() {
            exp.addObject(1, "User", { name: "mike" });
            exp.addObject(3, "DomainUser", { user: 1, email: "mike@example.com" });
            exp.addObject(4, "User", { name: "jim" });
            exp.addObject(6, "DomainUser", { user: 4, email: "jim@example.com" });
            exp.addObject(4, "Team", { name: "team1", team_type: "REQUEST_TO_JOIN" });
            exp.addObject(5, "ItemList", { followers_du: [3, 6], name: "project1", description: "description", is_project: true, is_archived: false, items: [10,11,12], team: 4, stories: [] });
            exp.addObject(6, "ProjectMembership", { project: 5, member: 3 });
            exp.prepareForImport();

            exp.projects().mapPerform("performGets", ["sourceId", "archived", "name", "color", "notes", "sourceTeamId", "sourceMemberIds", "sourceFollowerIds", "sourceItemIds"]).should.deep.equal([
                { sourceId: 5, archived: false, name: "project1", color: null, notes: "description", sourceTeamId: 4, sourceMemberIds: [1], sourceFollowerIds: [1], sourceItemIds: [10,11,12] }
            ]);
        });

        it("should return a list project if there are no columns", function() {
            exp.addObject(1, "ItemList", { followers_du: [], is_project: true, team: 4 });
            exp.prepareForImport();

            exp.projects().mapPerform("performGets", ["isBoard"]).should.deep.equal([
                { isBoard: false }
            ]);
        });

        it("should return a board project if there are columns", function() {
            exp.addObject(1, "ItemList", { followers_du: [], is_project: true, team: 4 });
            exp.addObject(2, "Column", { name: "First column", pot: 1, rank: "V" });
            exp.prepareForImport();

            exp.projects().mapPerform("performGets", ["isBoard"]).should.deep.equal([
                { isBoard: true }
            ]);
        });
    });

    describe("#columns()", function() {
        it("should return no columns", function() {
            exp.prepareForImport();

            exp.columns().should.deep.equal([]);
        });

        it("should return a column containing some tasks", function() {
            exp.addObject(20, "Team", { name: "team1", team_type: "REQUEST_TO_JOIN" });
            exp.addObject(21, "ItemList", { followers_du: [], name: "project1", description: "description", is_project: true, is_archived: false, items: [10,11,12], team: 20, stories: [] });
            exp.addObject(1, "Column", { name: "First column", pot: 21, rank: "V" });
            exp.addObject(2, "ColumnTask", { column: 1, pot: 21, task: 10, rank: "a" });
            exp.addObject(3, "ColumnTask", { column: 1, pot: 21, task: 12, rank: "c" });
            exp.addObject(4, "ColumnTask", { column: 1, pot: 21, task: 11, rank: "b" });
            exp.addObject(10, "Task", { });
            exp.addObject(11, "Task", { });
            exp.addObject(12, "Task", { });
            exp.prepareForImport();

            exp.columns().mapPerform("performGets", ["sourceId", "name", "sourceProjectId", "sourceItemIds"]).should.deep.equal([
                { sourceId: 1, name: "First column", sourceProjectId: 21, sourceItemIds: [10,11,12] }
            ]);
        });

        it("should give name to a column with empty name", function() {
            exp.addObject(20, "Team", { name: "team1", team_type: "REQUEST_TO_JOIN" });
            exp.addObject(21, "ItemList", { followers_du: [], name: "project1", description: "description", is_project: true, is_archived: false, items: [10,11,12], team: 20, stories: [] });
            exp.addObject(1, "Column", { name: "", pot: 21, rank: "V" });
            exp.prepareForImport();

            exp.columns().mapPerform("performGets", ["sourceId", "name", "sourceProjectId", "sourceItemIds"]).should.deep.equal([
                { sourceId: 1, name: "Unnamed column", sourceProjectId: 21, sourceItemIds: [] }
            ]);
        });
    });

    describe("#columnsBySourceProjectId()", function() {
        it("should return no columns", function() {
            exp.prepareForImport();

            exp.columnsBySourceProjectId().should.deep.equal({});
        });

        it("should group columns by project and be in correct order by rank", function() {
            exp.addObject(20, "Team", { name: "team1", team_type: "REQUEST_TO_JOIN" });
            exp.addObject(21, "ItemList", { followers_du: [], name: "project1", description: "description", is_project: true, is_archived: false, items: [10,11,12], team: 20, stories: [] });
            exp.addObject(23, "ItemList", { followers_du: [], name: "project1", description: "description", is_project: true, is_archived: false, items: [10,11,12], team: 20, stories: [] });
            exp.addObject(1, "Column", { name: "First column", pot: 21, rank: "a" });
            exp.addObject(2, "Column", { name: "Third column", pot: 21, rank: "c" });
            exp.addObject(3, "Column", { name: "Second column", pot: 21, rank: "b" });
            exp.addObject(4, "Column", { name: "Other project column", pot: 23, rank: "b" });
            exp.prepareForImport();

            var columnsBySourceProjectId = exp.columnsBySourceProjectId();

            Object.keys(columnsBySourceProjectId).length.should.equal(2);

            columnsBySourceProjectId[21].mapPerform("performGets", ["sourceId", "name"]).should.deep.equal([
                { sourceId: 1, name: "First column" },
                { sourceId: 3, name: "Second column" },
                { sourceId: 2, name: "Third column" }
            ]);

            columnsBySourceProjectId[23].mapPerform("performGets", ["sourceId", "name"]).should.deep.equal([
                { sourceId: 4, name: "Other project column" }
            ]);
        });
    });

    describe("#tags()", function() {
        it("should return no tags", function() {
            exp.prepareForImport();

            exp.tags().should.deep.equal([]);
        });

        it("should return one tag, no projects or user task lists", function() {
            exp.addObject(1, "User", { name: "mike" });
            exp.addObject(3, "DomainUser", { user: 1, email: "mike@example.com" });
            exp.addObject(4, "Team", { name: "team1", team_type: "REQUEST_TO_JOIN" });
            exp.addObject(5, "ItemList", { followers_du: [], name: "project1", description: "description", is_project: true, is_archived: false, items: [10,11,12], team: 4, stories: [] });
            exp.addObject(6, "ItemList", { followers_du: [], name: "tag1", is_project: false, is_archived: false, items: [10,11,12], team: 4, stories: [] });
            exp.addObject(7, "ItemList", { followers_du: [], name: "My Tasks", is_project: true, assignee: 3, is_archived: false, items: [10,11,12] });
            exp.prepareForImport();

            exp.tags().mapPerform("performGets", ["sourceId", "name", "sourceTeamId", "sourceItemIds"]).should.deep.equal([
                { sourceId: 6, name: "tag1", sourceTeamId: 4, sourceItemIds: [10,11,12] }
            ]);
        });
    });

    describe("#taskDataSource()", function() {
        it("should return no tasks", function() {
            exp.prepareForImport();

            exp.taskDataSource()(0, 50).should.deep.equal([]);
        });

        it("should return one task and subtask with assignee and follower", function() {
            exp.addObject(1, "User", { name: "mike" });
            exp.addObject(3, "DomainUser", { user: 1, email: "mike@example.com" });
            exp.addObject(4, "Team", { name: "team1", team_type: "REQUEST_TO_JOIN" });
            exp.addObject(5, "ItemList", { followers_du: [], name: "project1", description: "description", is_project: true, is_archived: false, items: [7], team: 4, stories: [] });
            exp.addObject(6, "ItemList", { followers_du: [], name: "tag1", is_project: false, is_archived: false, items: [7], team: 4, stories: [] });
            exp.addObject(7, "Task", { name: "task1", schedule_status: "UPCOMING", start_date: "2023-11-15 00:00:00", due_date: "2023-11-30 00:00:00", rich_description: "description", assignee: 3, attachments: [], items: [8], stories: [], followers_du: [3] });
            exp.addObject(8, "Task", { name: "subtask1", schedule_status: "UPCOMING", due_date:"2023-11-30 00:00:00", rich_description: "description", assignee: 3, attachments: [], items: [], stories: [], followers_du: [3] });
            exp.prepareForImport();

            exp.taskDataSource()(0, 50).mapPerform("performGets", ["sourceId", "name", "notes", "completed", "assigneeStatus", "startOn", "dueOn", "sourceItemIds", "sourceAssigneeId", "sourceFollowerIds"]).should.deep.equal([
                { sourceId: 7, name: "task1",    notes: "description", completed: false, startOn: "2023-11-15 00:00:00", dueOn: "2023-11-30 00:00:00", assigneeStatus: "upcoming", sourceItemIds: [8], sourceAssigneeId: 1, sourceFollowerIds: [1] },
                { sourceId: 8, name: "subtask1", notes: "description", completed: false, startOn: null, dueOn: "2023-11-30 00:00:00", assigneeStatus: "upcoming", sourceItemIds: [],  sourceAssigneeId: 1, sourceFollowerIds: [1] }
            ]);
        });

        it("should not return trashed Tasks", function() {
            exp.addObject(1, "Task", { __trashed_at: "2023-11-30 00:00:00", name: "task1", schedule_status: "UPCOMING", start_date: "2023-11-15 00:00:00", due_date:"2023-11-30 00:00:00", description: "description", attachments: [], items: [], stories: [], followers_du: [] });
            exp.prepareForImport();

            exp.taskDataSource()(0, 50).mapPerform("performGets", ["sourceId", "name", "notes", "completed", "assigneeStatus", "startOn", "dueOn", "sourceItemIds", "sourceAssigneeId", "sourceFollowerIds"]).should.deep.equal([]);
        });

        it("should fall back to description if rich_description unavailable", function() {
            exp.addObject(1, "Task", { name: "task1", schedule_status: "UPCOMING", due_date:"2023-11-30 00:00:00", description: "descrip>>tio>n", attachments: [], items: [], stories: [], followers_du: [] });
            exp.prepareForImport();

            exp.taskDataSource()(0, 50).mapPerform("performGets", ["sourceId", "name", "notes", "completed", "assigneeStatus", "dueOn", "sourceItemIds", "sourceAssigneeId", "sourceFollowerIds"]).should.deep.equal([
                { sourceId: 1, name: "task1", notes: "descrip&gt;&gt;tio&gt;n", completed: false, dueOn: "2023-11-30 00:00:00", assigneeStatus: "upcoming", sourceItemIds: [], sourceAssigneeId: null, sourceFollowerIds: [] }
            ]);
        });

        it("should paginate cursor correctly", function() {
            exp.addObject(1, "Task", { name: "task1", schedule_status: "UPCOMING", description: "", attachments: [], items: [], stories: [], followers_du: [] });
            exp.addObject(2, "Task", { name: "task2", schedule_status: "UPCOMING", description: "", attachments: [], items: [], stories: [], followers_du: [] });
            exp.prepareForImport();

            exp.taskDataSource()(0, 1).length.should.equal(1);
            exp.taskDataSource()(1, 1).length.should.equal(1);
            exp.taskDataSource()(2, 1).length.should.equal(0);
        });

        it("should return task with only comments", function() {
            exp.addObject(1, "User", { name: "mike" });
            exp.addObject(3, "DomainUser", { user: 1, email: "mike@example.com"  });
            exp.addObject(4, "Task", { name: "task1", schedule_status: "UPCOMING", due_date:"2023-11-30 00:00:00", description: "description", attachments: [2], items: [], stories: [5, 7, 6], followers_du: [], __creation_time: "2014-11-16 22:44:11" });
            exp.addObject(5, "Comment", { creator_du: 3, __creation_time: "2014-11-17 22:44:22", text: "MY COMMENT" });
            exp.addObject(6, "TaskNameChangedStory", { creator_du: 3, __creation_time: "2014-11-17 22:44:22", text: "changed the name to \"task1\"" });
            exp.addObject(7, "TaskDescriptionChangedStory", { creator_du: 3, __creation_time: "2014-11-17 22:44:22", text: "removed the description" });
            exp.prepareForImport();

            exp.taskDataSource()(0, 50)[0].stories().should.deep.equal([
                { text: "MY COMMENT", creator: 1 }
            ]);
        });

        it("should not include AddAttachmentStory or creation story", function() {
            exp.addObject(1, "Task", { name: "task1", schedule_status: "UPCOMING", due_date:"2023-11-30 00:00:00", description: "description", attachments: [], items: [], stories: [2], followers_du: [], __creation_time: "2014-11-16 22:44:11" });
            exp.addObject(2, "AddAttachmentStory", { creator_du: null, __creation_time: "2014-11-17 22:44:22", text: "removed the description" });
            exp.prepareForImport();

            exp.taskDataSource()(0, 50)[0].stories().should.deep.equal([
            ]);
        });

        it("should return tasks with a dependency", function() {
            exp.addObject(1, "Task", { name: "precedent", schedule_status: "UPCOMING", description: "", attachments: [], items: [], stories: [], followers_du: [] });
            exp.addObject(2, "Task", { name: "dependent", schedule_status: "UPCOMING", description: "", attachments: [], items: [], stories: [], followers_du: [] });
            exp.addObject(3, "TaskDependency", { precedent:1, dependent:2 });
            exp.prepareForImport();

            exp.taskDataSource()(0, 50).mapPerform("performGets", ["sourceId", "sourceBlockingTaskIds"]).should.deep.equal([
                { sourceId: 1, sourceBlockingTaskIds: [] },
                { sourceId: 2, sourceBlockingTaskIds: [1] }
            ]);
        });
    });

    describe("#attachmentDataSource()", function() {
        it("should return no attachments", function() {
            exp.prepareForImport();

            exp.attachmentDataSource()(0, 50).should.deep.equal([]);
        });

        it("should return one attachment", function() {
            exp.addObject(1, "Task", { name: "task1", schedule_status: "UPCOMING", due_date:"2023-11-30 00:00:00", description: "description", attachments: [2], items: [], stories: [], followers_du: [] });
            exp.addObject(2, "Asset", { name: "asset1.png", download_url: "http://example.com/asset1.png" });
            exp.prepareForImport();

            exp.attachmentDataSource()(0, 50).mapPerform("performGets", ["sourceId", "sourceParentId"]).should.deep.equal([
                { sourceId: 2, sourceParentId: 1 }
            ]);
        });
    });
});
