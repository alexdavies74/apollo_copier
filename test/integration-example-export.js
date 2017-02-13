
describe("Importer", function() {
    var app, importer, exp, client;
    var asanaIdCounter;

    function createMock() { return Promise.resolve({ id: asanaIdCounter++ }); }
    function emptyMock() { return Promise.resolve({}); }

    beforeEach(function() {
        sandbox = sinon.sandbox.create();

        asanaIdCounter = 1;

        app = createApp();
        exp = ae.AsanaExport.clone();
        exp.setPath("example/export.json");
        if (exp.db().exists()) {
            // Need a fresh db each time
            exp.db().destroy();
        }
        importer = app.importer();
        importer.setOrganizationId(1);
        importer.setExport(exp);

        client = { workspaces: {}, users: {}, teams: {}, projects: {}, tags: {}, tasks: {}, stories: {} };
        app.setClient(client);
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe("#run()", function() {
        it("should run with the expected number of API calls", function() {
            client.projects.create = sinon.spy(createMock);
            client.stories.createOnTask = sinon.spy(createMock);
            client.tags.createInWorkspace = sinon.spy(createMock);
            client.tasks.addProject = sinon.spy(emptyMock);
            client.tasks.addTag = sinon.spy(emptyMock);
            client.tasks.create = sinon.spy(createMock);
            client.tasks.update = sinon.spy(emptyMock);
            client.tasks.setParent = sinon.spy(emptyMock);
            client.teams.create = sinon.spy(createMock);
            client.workspaces.addUser = sinon.spy(emptyMock);
            client.workspaces.tags = sinon.stub().returns(Promise.resolve([]));

            // Disable the file system because we don't have a
            sandbox.stub(require("fs"), "appendFile", function (path, text, callback) { callback(null); });

            importer.run();

            expect(exp.users().length).to.equal(3);
            expect(exp.teams().length).to.equal(3);
            expect(exp.projects().length).to.equal(5);
            expect(exp.taskDataSource()(0,1000).length).to.equal(25);
            expect(exp.attachmentDataSource()(0,1000).length).to.equal(1);

            expect(client.projects.create).to.have.callCount(5);
            expect(client.stories.createOnTask).to.have.callCount(80);
            expect(client.tags.createInWorkspace).to.have.callCount(3);
            expect(client.tasks.addProject).to.have.callCount(20);
            expect(client.tasks.addTag).to.have.callCount(5);
            expect(client.tasks.create).to.have.callCount(25);
            expect(client.tasks.update).to.have.callCount(6);
            expect(client.tasks.setParent).to.have.callCount(6);
            expect(client.teams.create).to.have.callCount(3);
            expect(client.workspaces.addUser).to.have.callCount(3);
            expect(client.workspaces.tags).to.have.callCount(1);
        });
    });
});
