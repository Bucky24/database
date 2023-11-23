const { Connection, FIELD_TYPE, FIELD_META, ORDER } = require('./connection');

class MysqlConnection extends Connection {
    constructor(data, prefix = null) {
        super(prefix);

        this.connectionData = data;
    }

    async _query(query, bind) {
        if (bind) {
            for (const item of bind) {
                if (item === undefined) {
                    throw new Error(`Got undefined bind for query ${query} with bind of ${bind}`);
                }
            }
        }

        const db = await this.getConnection();

        if (!db) {
            throw new Error("No mysql connection found");
        }

        //console.log(query, bind);

        return new Promise((resolve, reject) => {
            const callback = (error, results, fields) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(results);
            };
            if (bind) {
                db.execute(query, bind, callback);
            } else {
                db.query(query, callback);
            }
        });
    }

    static _getColumnFromType(type) {
        if (type === FIELD_TYPE.INT) {
            return 'INT';
        } else if (type === FIELD_TYPE.STRING) {
            return 'TEXT';
        } else if (type === FIELD_TYPE.JSON) {
            return 'TEXT';
        } else if (type === FIELD_TYPE.BIGINT) {
            return 'BIGINT';
        } else if (type === FIELD_TYPE.BOOLEAN) {
            return 'BOOLEAN';
        }
    }

    static _getValueForType(type, value) {
        if (type === FIELD_TYPE.STRING) {
            return `"${value}"`;
        }

        return value;
    }

    async createConnection() {
        if (this.connectionData.url) {
            // break the url down into component pieces

            const urlPieces = new URL(this.connectionData.url);

            let { protocol, host, username, password, pathname } = urlPieces;
            protocol = protocol.substr(0, protocol.length-1);

            const [ realHost, port ] = host.split(":");

            if (protocol !== "mysql") {
                throw new Error('DB connection url protocol must be mysql, got ' + protocol);
            }

            this.connectionData = {
                host: realHost,
                user: username,
                password,
                database: pathname.substr(1),
            };
        }

        // delete the url from the object to remove nulls
        delete this.connectionData.url;

        // don't attempt to load this until we actually need it
        const mysql = require('mysql2');
        const connection = mysql.createConnection(this.connectionData);

        connection.on('error', (e) => {
            if (e.message.includes('Connection lost') || e.message.includes('The client was disconnected') || e.message.includes('read ECONNRESET')) {
                this.log('Database server terminated the connection');
                this.close();
            } else {
                console.error(e);
            }
        });

        return connection;
    }

    async close() {
        const connection = this.connection;
        this.connection = null;
        if (connection) {
            return connection.close();
        }
    }

    static _getFieldCreationString(fieldName, data, ticks) {
        let fieldRow = ticks + fieldName + ticks + " " + this._getColumnFromType(data.type);

        if (data.meta) {
            if (data.meta.includes(FIELD_META.REQUIRED)) {
                fieldRow += ' NOT NULL'
            }
            if (data.meta.includes(FIELD_META.AUTO)) {
                fieldRow += ' AUTO_INCREMENT';
            }
        }

        return fieldRow;
    }

    async initializeTable(tableName, fields, version) {
        const getVersionsQuery = "SELECT * FROM information_schema.tables WHERE table_schema = '" + this.connectionData.database + "' AND table_name = '" + this.getTable('table_versions') + "' LIMIT 1;"

        const tableResult = await this._query(getVersionsQuery);

        if (tableResult.length === 0) {
            this.log("Versions table not found, creating!");

            const creationQuery = "CREATE TABLE " + this.getTable('table_versions') + "(name VARCHAR(255), version INT)";
            await this._query(creationQuery);
        }

        // get version for this table
        const getVersionQuery = "SELECT version FROM " + this.getTable('table_versions') + " WHERE name = ?";

        const versionResult = await this._query(getVersionQuery, [this.getTable(tableName)]);
        if (versionResult.length === 0) {
            this.log("Table " + tableName + " not found, creating");
            let creationQuery = "CREATE TABLE `" + this.getTable(tableName) + "` ("

            let autoColumn = null;
            const fieldList = Object.keys(fields).map((fieldName) => {
                const data = fields[fieldName];

                if (data.meta && data.meta.includes(FIELD_META.AUTO)) {
                    autoColumn = fieldName;
                }

                return MysqlConnection._getFieldCreationString(fieldName, data, '');
            });

            if (autoColumn) {
                fieldList.push("PRIMARY KEY (" + autoColumn + ")");
            }

            creationQuery += fieldList.join(", ");
            creationQuery += ")";

            await this._query(creationQuery);

            // add the version
            const setVersionQuery = "INSERT INTO " + this.getTable('table_versions') + "(version, name) VALUES(?, ?)";
            await this._query(setVersionQuery, [version, this.getTable(tableName)]);
        } else {
            const dbVersion = versionResult[0].version;
            if (dbVersion !== version) {
                this.log("Version mismatch on table " + tableName + ", expected " + version + " got " + dbVersion);

                const oldFields = await this._query("DESCRIBE `" + this.getTable(tableName) + "`");

                const dbFields = oldFields.map((field) => {
                    return field.Field;
                });
                const localFields = Object.keys(fields);
                const missingInDb = [];
                for (const local of localFields) {
                    if (!dbFields.includes(local)) {
                        missingInDb.push(local);
                    }
                }

                if (missingInDb.length > 0) {
                    const fieldStrings = [];
                    for (const missing of missingInDb) {
                        const data = fields[missing];
                        fieldStrings.push("ADD COLUMN " + MysqlConnection._getFieldCreationString(missing, data, '`'));
                    }

                    const query = "ALTER TABLE `" + this.getTable(tableName) + "` " + fieldStrings.join(", ");
                    await this._query(query);
                }
                await this._query(
                    "UPDATE " + this.getTable('table_versions') + " SET version  = ? WHERE name = ?",
                    [version, this.getTable(tableName)],
                );
                this.log("Version mismatch resolved.");
            }
        }
    }

    async insert(tableName, fieldData, insertData) {
        let query = "INSERT INTO `" + this.getTable(tableName) + "` (";

        const fieldList = [];
        const valueList = [];
        const valueKeys = [];

        Object.keys(insertData).forEach((key) => {
            const value = insertData[key];
            fieldList.push(key);
            valueList.push(value);
            valueKeys.push("?");
        });

        query += fieldList.join(", ") + ") VALUES(" + valueKeys.join(", ") + ")";

        const result = await this._query(query, valueList);
        return result.insertId;
    }

    async search(tableName, whereClause, order, limit) {
        let query = "SELECT * FROM `" + tableName + "`";

        const fieldList = [];
        const values = [];
        Object.keys(whereClause).forEach((key) => {
            const value = whereClause[key];
            if (Array.isArray(value)) {
                const questionList = [];
                for (const item of value) {
                    questionList.push('?');
                    values.push(item);
                }
                fieldList.push(`${key} in (${questionList.join(', ')})`);
            } else if (value === null) {
                fieldList.push(`${key} is null`);
            } else if (value === false) {
                fieldList.push(`(${key} = 0 || ${key} is null)`)
            } else {
                fieldList.push(`${key} = ?`);
                values.push(whereClause[key]);
            }
        });

        if (fieldList.length > 0) {
            query += " WHERE " + fieldList.join(" AND ");
        }

        if (order) {
            const orderList = [];
            for (const field in order) {
                const direction = order[field];
                let directionStr = '';
                if (direction === ORDER.ASC) {
                    directionStr = 'ASC';
                } else if (direction === ORDER.DESC) {
                    directionStr = 'DESC';
                }
                // would love to parameterize this but it crashes if I do
                orderList.push(`${field} ${directionStr}`);
                //values.push(field);
            }
            query += " ORDER BY " + orderList.join(", ");
        } else {
            query += " ORDER BY id asc";
        }

        if (limit) {
            query += " LIMIT ?";
            values.push(limit.toString());
        }

        const results = await this._query(query, values);

        return results;
    }

    async update(tableName, id, update) {
        let query = "UPDATE `" + this.getTable(tableName) + "` SET ";

        const fieldRows = [];
        const values = [];
        Object.keys(update).forEach((key) => {
            fieldRows.push(`${key} = ?`);
            values.push(update[key]);
        });

        query += fieldRows.join(", ");
        query += " WHERE id = ?";
        values.push(id);

        await this._query(query, values);
    }

    async delete(tableName, id) {
        const query = "DELETE FROM `" + this.getTable(tableName) + "` WHERE id = ?";
        await this._query(query, [id]);
    }
}

module.exports = MysqlConnection;