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
        this.data = data;
        
        this._createConnection();
    }

    _createConnection() {
        if (this.type === CONNECTION_TYPE.FILE) {
            if (!fs.existsSync(this.data.cacheDir)) {
                fs.mkdirSync(this.data.cacheDir);
            }
            this.connection = this.data.cacheDir;
        } else if (this.type === CONNECTION_TYPE.MYSQL) {
            if (this.data.url) {
                // break the url down into component pieces

                const urlPieces = new URL(this.data.url);
                delete this.data.url;

                let { protocol, host, username, password, pathname } = urlPieces;
                protocol = protocol.substr(0, protocol.length-1);

                const [ realHost, port ] = host.split(":");

                if (protocol !== "mysql") {
                    throw new Error('DB connection url protocol must be mysql, got ' + protocol);
                }

                this.data = {
                    host: realHost,
                    user: username,
                    password,
                    database: pathname.substr(1),
                };
            }

            // don't attempt to load this until we actually need it
            const mysql = require('mysql2');
            const connection = mysql.createConnection(this.data);
            this.connection = connection;

            this.connection.on('error', (e) => {
                if (e.message.includes('Connection lost') || e.message.includes('The client was disconnected')) {
                    console.log('Database server terminated the connection');
                    this.close();
                } else {
                    console.log(e);
                }
            });
        }
    }
    
    getData() {
        return this.data;
    }
    
    getType() {
        return this.type;
    }
    
    getConnection() {
        if (!this.connection) {
            console.log('connecting again');
            this._createConnection();
        }
        return this.connection;
    }

    getTable(table) {
        if (!this.prefix) {
            return table;
        }
        return `${this.prefix}_${table}`;
    }

    close() {
        const connection = this.connection;
        this.connection = null;
        if (this.type === CONNECTION_TYPE.MYSQL) {
            if (connection) {
                return connection.close();
            }
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