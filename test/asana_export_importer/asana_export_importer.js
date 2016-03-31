
var asana_export_importer = require("../../bin/asana_export_importer");

describe("asana_export_importer", function() {
    beforeEach(function() {
        createApp();
    });

    describe("#parseOptions", function() {
        it("should parse with the minimal set of options, with defaults", function() {
            process.argv = ["node", "asana_export_importer",
                "--pat=key",
                "--organization=0",
                "path"
            ];

            var options = asana_export_importer.parseOptions();

            expect(options.path).to.equal("path");
            expect(options.module).to.equal("asana_export");
            expect(options.organization).to.equal(0);
            expect(options.pats[0]).to.equal("key");
            expect(options.apiEndpoint).to.equal(aei.asana.Dispatcher.ROOT_URL);
            expect(options.attachmentsPath).to.equal("attachments.json");
            expect(options.databasesPath).to.equal("construct_from_path_and_org");
            expect(options.concurrency).to.equal(1000);
            expect(options.batchSize).to.equal(100);
            expect(options.dryRun).to.equal(false);
        });

        it("should parse all options correctly", function() {
            process.argv = ["node", "asana_export_importer",
                "--pat=key",
                "--organization=1111",
                "--importer=something",
                "--api-endpoint=http://example.com/",
                "--attachments=attachments1.json",
                "--databases=db1",
                "--concurrency=5555",
                "--batch-size=6666",
                "--dry-run",
                "path"
            ];

            var options = asana_export_importer.parseOptions();

            expect(options.path).to.equal("path");
            expect(options.module).to.equal("something");
            expect(options.organization).to.equal(1111);
            expect(options.pats[0]).to.equal("key");
            expect(options.apiEndpoint).to.equal("http://example.com/");
            expect(options.attachmentsPath).to.equal("attachments1.json");
            expect(options.databasesPath).to.equal("db1");
            expect(options.concurrency).to.equal(5555);
            expect(options.batchSize).to.equal(6666);
            expect(options.dryRun).to.equal(true);
        });
    });

    describe("#initApp", function() {
        it("should initialize app with correct options", function() {
            process.argv = ["node", "asana_export_importer",
                "--pat=key",
                "--organization=1111",
                "--api-endpoint=http://example.com/",
                "--attachments=attachments1.json",
                "--databases=db1",
                "--concurrency=5555",
                "--batch-size=6666",
                "path"
            ];
            aei.Future.task(function() {
              var app = asana_export_importer.initApp(asana_export_importer.parseOptions());

              expect(app.importer().export().path()).to.equal("path");
              expect(app.importer().organizationId()).to.equal(1111);
              expect(app.apiClient().dispatcher.authValue).to.equal("key");
              expect(aei.asana.Dispatcher.ROOT_URL).to.equal("http://example.com/");
              expect(app.attachmentsPath()).to.equal("db1/attachments1.json");
              expect(app.sourceToAsanaMap().dbPath()).to.equal("db1/mapping.sqlite");

              expect(app.importer().concurrency()).to.equal(5555);
              expect(app.importer().export().batchSize()).to.equal(6666);
            });
        });
    });
});
