const FileConnection = require('./fileConnection');
const MysqlConnection = require("./mysqlConnection");
const PostgresConnection = require("./postgresConnection");
const Connection = require('./connection');

let defaultConnection = null;

function setDefaultConnection(connection) {
    defaultConnection = connection;
}

function getDefaultConnection() {
    return defaultConnection;
}

async function fileConnection(cacheDir) {
    const connection = new FileConnection(cacheDir);
    await connection.init();
    return connection;
}

async function mysqlConnection({ host, username, password, database, url }) {
    const connection = new MysqlConnection({
        host, user: username, password, database, url,
    });
    await connection.init();
    return connection;
}

async function postgresConnection({ host, username, password, database, port, url }) {
    const connection = new PostgresConnection({
        host, user: username, password, database, port, url,
    });
    await connection.init();
    return connection;
}

module.exports = {
    fileConnection,
    mysqlConnection,
    postgresConnection,
    setDefaultConnection,
    getDefaultConnection,
    ...Connection,
};