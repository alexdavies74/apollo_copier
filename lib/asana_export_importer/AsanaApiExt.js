var aei = require("./");

aei.asana.resources.Projects.prototype.addMembers = function(projectId, data) {
    return this.dispatcher.post('/projects/' + projectId + '/addMembers', data);
};

aei.asana.resources.Projects.prototype.addFollowers = function(projectId, data) {
    return this.dispatcher.post('/projects/' + projectId + '/addFollowers', data);
};

aei.asana.resources.Tasks.prototype.findByWorkspace = function(workspaceId, params) {
    return this.dispatcher.get('/workspaces/' + workspaceId + '/tasks', params);
};

aei.asana.resources.Tasks.prototype.setParent = function(taskId, data) {
    return this.dispatcher.post('/tasks/' + taskId + '/setParent', data);
};

aei.asana.resources.Teams.prototype.create = function(data) {
    return this.dispatcher.post('/teams', data);
};

aei.asana.resources.Teams.prototype.addUser = function(teamId, data) {
    return this.dispatcher.post('/teams/' + teamId + '/addUser', data);
};

aei.asana.resources.Teams.prototype.removeUser = function(teamId, data) {
    return this.dispatcher.post('/teams/' + teamId + '/removeUser', data);
};

aei.asana.resources.Workspaces.prototype.users = function(workspaceId, params) {
    return this.dispatcher.get('/workspaces/' + workspaceId + '/users', params);
};

aei.asana.resources.Workspaces.prototype.tags = function(workspaceId, params) {
    return this.dispatcher.get('/workspaces/' + workspaceId + '/tags', params);
};

aei.asana.resources.Workspaces.prototype.addUser = function(workspaceId, data) {
    return this.dispatcher.post('/workspaces/' + workspaceId + '/addUser', data);
};
