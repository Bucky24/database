const fs = require('fs');
const mysql = require('mysql');

const CONNECTION_TYPE = {
    MYSQL: 'connection/mysql',
    FILE: 'connection/file',
};

let defaultConnection = null;

function setDefaultConnection(connection) {
    defaultConnection = connection;
}

function getDefaultConnection() {
    return defaultConnection;
}

class Connection {
    constructor(type, data) {
        this.type = type;
        this.data = data;
        
        if (type === CONNECTION_TYPE.FILE) {
            if (!fs.existsSync(this.data.cacheDir)) {
                fs.mkdirSync(this.data.cacheDir, "{}");
            }
            this.connection = this.data.cacheDir;
        } else if (type === CONNECTION_TYPE.MYSQL) {
            const connection = mysql.createConnection(this.data);
            this.connection = connection;
        }
    }
    
    getData() {
        return this.data;
    }
    
    getType() {
        return this.type;
    }
    
    getConnection() {
        return this.connection;
    }
}

Connection.fileConnection = (cacheDir) => {
    return new Connection(CONNECTION_TYPE.FILE, { cacheDir });
}

Connection.mysqlConnection = ({ host, username, password, database }) => {
    return new Connection(CONNECTION_TYPE.MYSQL, {
        host, username, password, database,
    });
}

module.exports = {
    Connection,
    setDefaultConnection,
    getDefaultConnection,
    CONNECTION_TYPE,
}