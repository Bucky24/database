const fs = require('fs');

const CONNECTION_TYPE = {
    MYSQL: 'connection/mysql',
    FILE: 'connection/file',
    POSTGRES: 'connection/postgres',
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
    }

    init() {
        return this._createConnection();
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

            // delete the url from the object to remove nulls
            delete this.data.url;

            // don't attempt to load this until we actually need it
            const mysql = require('mysql2');
            const connection = mysql.createConnection(this.data);
            this.connection = connection;

            this.connection.on('error', (e) => {
                if (e.message.includes('Connection lost') || e.message.includes('The client was disconnected' || e.message.includes('read ECONNRESET'))) {
                    console.log('Database server terminated the connection');
                    this.close();
                } else {
                    console.error(e);
                }
            });
        } else if (this.type === CONNECTION_TYPE.POSTGRES) {
            const { Client } = require('pg');
            let client;

            if (this.data.url) {
                client = new Client({ connectionString: this.data.url });
            } else {
                // delete the url from the object to remove nulls
                delete this.data.url;
                client = new Client(this.data);
            }

            return new Promise((resolve, reject) => {
                client.connect((error) => {
                    if (error) {
                        reject(error);
                    } else {
                        this.connection = client;
                        resolve();
                    }
                });
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
        } else if (this.type === CONNECTION_TYPE.POSTGRES) {
            if (connection) {
                return connection.end();
            }
        }
    }
}

Connection.fileConnection = async (cacheDir) => {
    const connection = new Connection(CONNECTION_TYPE.FILE, { cacheDir });
    await connection.init();
    return connection;
}

Connection.mysqlConnection = async ({ host, username, password, database, url }) => {
    const connection = new Connection(CONNECTION_TYPE.MYSQL, {
        host, user: username, password, database, url,
    });
    await connection.init();
    return connection;
}

Connection.postgresConnection = async ({ host, username, password, database, port, url }) => {
    const connection = new Connection(CONNECTION_TYPE.POSTGRES, {
        host, user: username, password, database, port, url,
    });
    await connection.init();
    return connection;
}

Connection.setDefaultConnection = setDefaultConnection;
Connection.getDefaultConnection = getDefaultConnection;

module.exports = {
    Connection,
    CONNECTION_TYPE,
}