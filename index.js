const Connection = require('./src/connections');
const model = require('./src/model.js');

module.exports = {
    Connection,
    ...model,
};