var dateformat = require('dateformat');

Date.prototype.toAsanaString = function() {
    return dateformat(this, "ddd mmm dd yyyy", /* UTC= */ true);
};
