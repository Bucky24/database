const fs = require('fs');

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
    constructor(type, data, prefix = null) {
        this.type = type;
        this.data = data;
        this.prefix = prefix;
        
        if (type === CONNECTION_TYPE.FILE) {
            if (!fs.existsSync(this.data.cacheDir)) {
                fs.mkdirSync(this.data.cacheDir);
            }
            this.connection = this.data.cacheDir;
        } else if (type === CONNECTION_TYPE.MYSQL) {
            if (data.url) {
                // break the url down into component pieces
                // mysql://b9d2a90d008be7:6a7d0fbc@us-cdbr-east-04.cleardb.com/heroku_053bffee2fa2f72?reconnect=true

                const urlPieces = new URL(data.url);
                //console.log(urlPieces);
                delete data.url;

                let { protocol, host, username, password, pathname } = urlPieces;
                protocol = protocol.substr(0, protocol.length-1);

                if (protocol !== "mysql") {
                    throw new Error('DB connection url protocol must be mysql, got ' + protocol);
                }

                this.data = {
                    host,
                    user: username,
                    password,
                    database: pathname.substr(1),
                };
            }

            // don't attempt to load this until we actually need it
            const mysql = require('mysql2');
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

    getTable(table) {
        if (!this.prefix) {
            return table;
        }
        return `${this.prefix}_${table}`;
    }

    close() {
        if (this.type === CONNECTION_TYPE.MYSQL) {
            return this.getConnection().close();
        }
    }
}

Connection.fileConnection = (cacheDir) => {
    return new Connection(CONNECTION_TYPE.FILE, { cacheDir });
}

Connection.mysqlConnection = ({ host, username, password, database, url }) => {
    return new Connection(CONNECTION_TYPE.MYSQL, {
        host, user: username, password, database, url,
    });
}

Connection.setDefaultConnection = setDefaultConnection;
Connection.getDefaultConnection = getDefaultConnection;

module.exports = {
    Connection,
    CONNECTION_TYPE,
}