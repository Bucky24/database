const { Connection, FIELD_META, FIELD_TYPE, ORDER } = require('./connection');

class PostgresConnection extends Connection {
    constructor(data, prefix = null) {
        super(prefix);

        this.connectionData = data;
    }

    async createConnection() {
        const { Client } = require('pg');
        let client;

        if (this.connectionData.url) {
            client = new Client({ connectionString: this.connectionData.url });
        } else {
            // delete the url from the object to remove nulls
            delete this.connectionData.url;
            client = new Client(this.connectionData);
        }

        return new Promise((resolve, reject) => {
            client.connect((error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(client);
                }
            });
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

    async _query(query, bind) {
        // check for undefined bind
        if (bind) {
            for (const item of bind) {
                if (item === undefined) {
                    throw new Error(`Got undefined bind for query ${query} with bind of ${bind}`);
                }
            }
        }

        //console.log(query, bind);

        const db = await this.getConnection();

        return new Promise(async (resolve, reject) => {
            try {
                let result;
                if (bind) {
                    result = await db.query(query, bind);
                } else {
                    result = await db.query(query);
                }
                resolve(result);
            } catch (error) {
                if (error.message.startsWith("syntax error")) {
                    reject(new Error("Syntax error for query " + query + ": " + error.message));
                } else {
                    reject(error);
                }
            }
        });
    }

    static _getFieldCreationString(fieldName, data, ticks) {
        let fieldRow = ticks + fieldName + ticks + " " + PostgresConnection._getColumnFromType(data.type);

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
        // first see if our versions table exists
        const getVersionsQuery = "SELECT * FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = '" + this.getTable('table_versions') + "' LIMIT 1;"

        const tableResult = await this._query(getVersionsQuery);
        let rows = tableResult.rows;

        if (rows.length === 0) {
            console.log("Versions table not found, creating!");

            const creationQuery = "CREATE TABLE " + this.getTable('table_versions') + " (name VARCHAR(255), version INT)";
            await this._query(creationQuery);
        }

        // get version for this table
        const getVersionQuery = "SELECT version FROM " + this.getTable('table_versions') + " WHERE name = $1";

        const versionResult = await this._query(getVersionQuery, [this.getTable(tableName)]);
        rows = versionResult.rows;

        if (rows.length === 0) {
            this.log("Table " + tableName + " not found, creating");
            let creationQuery = "CREATE TABLE \"" + this.getTable(tableName) + "\" ("

            const fieldList = Object.keys(fields).map((fieldName) => {
                const data = fields[fieldName];

                const auto = data.meta && data.meta.includes(FIELD_META.AUTO)

                let fieldRow = "" + fieldName + " ";
                if (!auto) {
                    fieldRow += PostgresConnection._getColumnFromType(data.type);
                }

                if (data.meta) {
                    if (data.meta.includes(FIELD_META.REQUIRED)) {
                        fieldRow += ' NOT NULL'
                    }
                    if (data.meta.includes(FIELD_META.AUTO)) {
                        fieldRow += ' SERIAL PRIMARY KEY';
                    }
                }

                return fieldRow;
            });

            creationQuery += fieldList.join(", ");
            creationQuery += ")";

            await this._query(creationQuery);

            // add the version
            const setVersionQuery = "INSERT INTO " + this.getTable('table_versions') + "(version, name) VALUES($1, $2)";
            await this._query(setVersionQuery, [version, this.getTable(tableName)]);
        } else {
            const dbVersion = rows[0].version;
            if (dbVersion !== version) {
                console.log("Version mismatch on table " + tableName + ", expected " + version + " got " + dbVersion);

                const oldFields = await this._query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '" + this.getTable(tableName) + "' order by ordinal_position asc");
                const dbFields = oldFields.rows.map((field) => {
                    return field.column_name;
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
                        fieldStrings.push("ADD COLUMN " + PostgresConnection._getFieldCreationString(missing, data, '\"'));
                    }

                    const query = "ALTER TABLE \"" + this.getTable(tableName) + "\" " + fieldStrings.join(", ");
                    await this._query(query);
                }
                await this._query(
                    "UPDATE " + this.getTable('table_versions') + " SET version  = $1 WHERE name = $2",
                    [version, this.getTable(tableName)],
                );
                console.log("Version mismatch resolved.");
            }
        }
    }

    async close() {
        const connection = this.connection;
        this.connection = null;
        if (connection) {
            return connection.end();
        }
    }

    async insert(tableName, tableFields, insertData) {
        let query = "INSERT INTO \"" + this.getTable(tableName) + "\" (";

        const fieldList = [];
        const valueList = [];
        const valueKeys = [];

        Object.keys(insertData).forEach((key, index) => {
            const value = insertData[key];
            fieldList.push(key);
            valueList.push(value);
            valueKeys.push("$" + (index + 1));
        });

        query += fieldList.join(", ") + ") VALUES(" + valueKeys.join(", ") + ") RETURNING id";

        const result = await this._query(query, valueList);
        return result.rows[0].id;
    }

    async search(tableName, whereClause, order, limit) {
        let query = "SELECT * FROM \"" + tableName + "\"";

        const fieldList = [];
        const values = [];
        let questionCount = 0;
        Object.keys(whereClause).forEach((key) => {
            const value = whereClause[key];
            if (Array.isArray(value)) {
                const questionList = [];
                for (const item of value) {
                    questionList.push("$" + (questionCount + 1));
                    questionCount ++;
                    values.push(item);
                }
                fieldList.push(`${key} in (${questionList.join(', ')})`);
            } else if (value === null) {
                fieldList.push(`${key} is null`);
            } else if (value === false) {
                fieldList.push(`(${key} = false or ${key} is null)`);
            } else {
                fieldList.push(`${key} = $${questionCount + 1}`);
                questionCount ++;
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
            query += " LIMIT $" + (questionCount + 1);
            questionCount ++;
            values.push(limit.toString());
        }

        const results = await this._query(query, values);

        return results.rows;
    }

    async update(tableName, id, update) {
        let query = "UPDATE \"" + this.getTable(tableName) + "\" SET ";

        const fieldRows = [];
        const values = [];
        let counter = 1;
        Object.keys(update).forEach((key) => {
            fieldRows.push(`${key} = $${counter}`);
            counter ++;
            values.push(update[key]);
        });

        query += fieldRows.join(", ");
        query += " WHERE id = $" + counter;
        values.push(id);

        await this._query(query, values);
    }

    async delete(tableName, id) {
        const query = "DELETE FROM \"" + this.getTable(tableName) + "\" WHERE id = $1";
        await this._query(query, [id]);
    }
}

module.exports = PostgresConnection;