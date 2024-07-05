const Connection = require('./src/connections');
const model = require('./src/model.js');
const builder = require('./src/whereBuilder.js');

module.exports = {
    Connection,
    ...model,
    ...builder,
};