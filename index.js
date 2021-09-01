const connection = require('./src/connection.js');
const model = require('./src/model.js');

module.exports = {
    ...connection,
    ...model,
};