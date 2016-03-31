Asana Export Importer
=====================

Setup
-----

1. Ensure Node.js v0.10 is installed.
2. In the project directory run:

	npm install

Testing
-------

	npm test

Usage
-----

The minimum required command line requirements are an API key, organization ID, and export data file:

	asana_export_importer \
		--organization=20556533848969 \
		--pat=mypersonalaccesstoken \
		example/export.json

You can also specify an importer, organization ID to import into, Asana API key and endpoint, and location to write the attachments list (defaults shown below):

	asana_export_importer \
		--importer=asana_export \
		--organization=20556533848969 \
		--pat=mypersonalaccesstoken \
		--api-endpoint=https://app.asana.com/api/1.0 \
		--attachments=db/attachments.json \
		example/export.json

You can specify --pat multiple times for different users.

Demo [Currently not working- replace api key with PAT to make it work]
----

Run the following to import an example Asana export into a sample organization (Asana user=asanabot@importsandbox.alexd-test-subdomain.asana.com password=a5anab0t)

	example/example.sh

Docker
------

A Dockerfile is provided that includes the Node.js dependency.

The following does the same thing as the demo script above:

	docker build -t asana_export_importer .
	docker run -t asana_export_importer

You can also use a volume to mount your own export file in the container:

	docker run -t -v /path/to/export.json:/data/export.json asana_export_importer \
		bin/asana_export_importer --pat=$ASANA_PAT --organization=$ASANA_ORGANIZATION /data/export.json
