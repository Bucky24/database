import { Field, FIELD_META, FIELD_TYPE, Fields, FieldWithForeign, NestedObject, ORDER, OrderObj } from "../types";
import { WhereBuilder, WHERE_COMPARE, WHERE_TYPE } from "../whereBuilder";
import { Connection } from './connection';

export interface MysqlConnectionObject {
    host: string;
    username: string;
    password: string;
    database: string;
}

export interface MysqlConnectionUrl {
    url: string;
}

interface MysqlError {
    code: string;
    message: string;
}

interface MysqlWhereData {
    where: string;
    values: any[];
}

export default class MysqlConnection extends Connection {
    private initialConnectionData: MysqlConnectionObject | MysqlConnectionUrl;
    private connectionData: MysqlConnectionObject | null;

    constructor(data: MysqlConnectionObject | MysqlConnectionUrl, prefix = null) {
        super(prefix);

        this.initialConnectionData = data;
        this.connectionData = null;
    }

    async _query(query: string, bind?: any[]): Promise<any> {
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
            const callback = (error: string | null, results: any) => {
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

    static _getColumnFromType(type: FIELD_TYPE, fieldData: Field) {
        if (type === FIELD_TYPE.INT) {
            return 'INT';
        } else if (type === FIELD_TYPE.STRING) {
            if (fieldData.size) {
                return `VARCHAR(${fieldData.size})`;
            }
            return 'TEXT';
        } else if (type === FIELD_TYPE.JSON) {
            return 'TEXT';
        } else if (type === FIELD_TYPE.BIGINT) {
            return 'BIGINT';
        } else if (type === FIELD_TYPE.BOOLEAN) {
            return 'BOOLEAN';
        }
    }

    static _getValueForType(type: FIELD_TYPE, value: any) {
        if (type === FIELD_TYPE.STRING) {
            return `"${value}"`;
        }

        return value;
    }

    async createConnection() {
        if ('url' in this.initialConnectionData) {
            // break the url down into component pieces

            const urlPieces = new URL(this.initialConnectionData.url);

            let { protocol, host, username, password, pathname } = urlPieces;
            protocol = protocol.substring(0, protocol.length-1);

            const [ realHost, port ] = host.split(":");

            if (protocol !== "mysql") {
                throw new Error('DB connection url protocol must be mysql, got ' + protocol);
            }

            this.connectionData = {
                host: realHost,
                username,
                password,
                database: pathname.substr(1),
            };
        } else {
            this.connectionData = this.initialConnectionData;
        }

        // don't attempt to load this until we actually need it
        const mysql = await import('mysql2');
        const connection = mysql.createConnection({
            host: this.connectionData?.host,
            user: this.connectionData?.username,
            password: this.connectionData?.password,
            database: this.connectionData?.database,
        });

        connection.on('error', (e: MysqlError) => {
            if (e.message.includes('Connection lost') || e.message.includes('The client was disconnected') || e.message.includes('read ECONNRESET')) {
                this.log('Database server terminated the connection');
                this.close();
            } else if (e.code === "ER_BAD_DB_ERROR") {
                this.log(`Database ${this.connectionData?.database} does not exist, please create it manually with \n\nCREATE DATABASE ${this.connectionData?.database};\n\n`);
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

    static _getFieldCreationString(fieldName: string, data: Field, ticks: string) {
        let fieldRow = ticks + fieldName + ticks + " " + this._getColumnFromType(data.type, data);

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

    _getForeignConstraintString(rowWithForeign: FieldWithForeign): string {
        const foreignData = rowWithForeign.foreign;
        const foreignTable = this.getTable(foreignData.table.getTable());
        const sql = `FOREIGN KEY (\`${rowWithForeign.localField}\`) REFERENCES \`${foreignTable}\`(\`${foreignData.field}\`)`;

        return sql;
    }

    static _getEquality(key: string | null, value: any, negated = false) {
        if (Array.isArray(value)) {
            const values = [];
            const questionList = [];
            for (const item of value) {
                questionList.push('?');
                values.push(item);
            }
            return {
                where: `${key} ${negated ? 'not in' : 'in'} (${questionList.join(', ')})`,
                values,
            };
        } else if (value === null) {
            return {
                where: `${key} ${negated ? 'is not' : 'is'} null`,
                values: [],
            };
        } else if (value === false) {
            if (negated) {
                return {
                    where: `(${key} != 0 && ${key} is not null)`,
                    values: [],
                };
            }
            return {
                where: `(${key} = 0 || ${key} is null)`,
                values: [],
            };
        } else {
            return {
                where: `${key} ${negated ? '!=' : '='} ?`,
                values: [value],
            };
        }
    }

    static _generateWhere(whereClause: WhereBuilder | NestedObject): MysqlWhereData {
        if (whereClause instanceof WhereBuilder) {
            if (whereClause.getType() === WHERE_TYPE.COMPARE) {
                if (whereClause.getComparison() === WHERE_COMPARE.EQ) {
                    return MysqlConnection._getEquality(whereClause.getField(), whereClause.getValue());
                } else if (whereClause.getComparison() === WHERE_COMPARE.NE) {
                    return MysqlConnection._getEquality(whereClause.getField(), whereClause.getValue(), true);
                } else if (whereClause.getComparison() === WHERE_COMPARE.LT) {
                    return {
                        where: `${whereClause.getField()} < ?`,
                        values: [whereClause.getValue()],
                    };
                } else if (whereClause.getComparison() === WHERE_COMPARE.LTE) {
                    return {
                        where: `${whereClause.getField()} <= ?`,
                        values: [whereClause.getValue()],
                    };
                } else if (whereClause.getComparison() === WHERE_COMPARE.GT) {
                    return {
                        where: `${whereClause.getField()} > ?`,
                        values: [whereClause.getValue()],
                    };
                } else if (whereClause.getComparison() === WHERE_COMPARE.GTE) {
                    return {
                        where: `${whereClause.getField()} >= ?`,
                        values: [whereClause.getValue()],
                    };
                } else {
                    throw new Error(`Unknown WhereBuilder Compare type ${whereClause.getComparison()}`);
                }
            } else if (whereClause.getType() === WHERE_TYPE.AND) {
                const fieldList = [];
                let values: any[] = [];
                for (const child of whereClause.getChildren()) {
                    const { values: childValues, where } = MysqlConnection._generateWhere(child);
                    fieldList.push(`(${where})`);
                    values = [...values,...childValues];
                }

                return {
                    where: fieldList.join(" AND "),
                    values,
                };
            } else if (whereClause.getType() === WHERE_TYPE.OR) {
                const fieldList = [];
                let values: any[] = [];
                for (const child of whereClause.getChildren()) {
                    const { values: childValues, where } = MysqlConnection._generateWhere(child);
                    fieldList.push(`(${where})`);
                    values = [...values,...childValues];
                }

                return {
                    where: fieldList.join(" OR "),
                    values,
                };
            } else {
                throw new Error(`Unknown WhereBuilder type ${whereClause.getType()}`);
            }
        } else {
            const fieldList: string[] = [];
            let values: any[] = [];
            Object.keys(whereClause).forEach((key) => {
                const value = whereClause[key];
                const { values: childValues, where } = MysqlConnection._getEquality(key, value);
                fieldList.push(where);
                values = [...values,...childValues];
            });

            return {
                where: fieldList.join(" AND "),
                values, 
            };
        }
    }

    async initializeTable(tableName: string, fields: Fields, version: number) {
        if (!this.connectionData) {
            throw new Error('No connection');
        }
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
            const rowsWithForeign: FieldWithForeign[] = [];
            const fieldList = Object.keys(fields).map((fieldName) => {
                const data = fields[fieldName];

                if (data.meta && data.meta.includes(FIELD_META.AUTO)) {
                    autoColumn = fieldName;
                }

                if (data.foreign) {
                    rowsWithForeign.push({
                        ...data,
                        foreign: data.foreign,
                        localField: fieldName,
                    });
                }

                return MysqlConnection._getFieldCreationString(fieldName, data, '');
            });

            if (autoColumn) {
                fieldList.push("PRIMARY KEY (" + autoColumn + ")");
            }

            for (const rowWithForeign of rowsWithForeign) {
                fieldList.push(this._getForeignConstraintString(rowWithForeign));
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

                const dbFields = oldFields.map((field: any) => {
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
                    const rowsWithForeign: FieldWithForeign[] = [];
                    for (const missing of missingInDb) {
                        const data = fields[missing];
                        fieldStrings.push("ADD COLUMN " + MysqlConnection._getFieldCreationString(missing, data, '`'));
                        if (data.foreign) {
                            rowsWithForeign.push({
                                ...data,
                                foreign: data.foreign,
                                localField: missing,
                            });
                        }
                    }

                    const query = "ALTER TABLE `" + this.getTable(tableName) + "` " + fieldStrings.join(", ");
                    await this._query(query);

                    for (const rowWithForeign of rowsWithForeign) {
                        const foreignQuery = this._getForeignConstraintString(rowWithForeign);
                        const fullQuery = `ALTER TABLE \`${this.getTable(tableName)}\` ADD CONSTRAINT ${foreignQuery}`;
                        await this._query(fullQuery);
                    }
                }
                await this._query(
                    "UPDATE " + this.getTable('table_versions') + " SET version  = ? WHERE name = ?",
                    [version, this.getTable(tableName)],
                );
                this.log("Version mismatch resolved.");
            }
        }
    }

    async insert(tableName: string, fieldData: Fields, insertData: NestedObject) {
        let query = "INSERT INTO `" + this.getTable(tableName) + "` (";

        const fieldList: string[] = [];
        const valueList: any[] = [];
        const valueKeys: string[] = [];

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

    async search(tableName: string, whereClause: WhereBuilder | NestedObject, order?: OrderObj, limit?: number, offset?: number): Promise<any[]> {
        let query = "SELECT * FROM `" + tableName + "`";

        const { where, values } = MysqlConnection._generateWhere(whereClause);

        if (where.length > 0) {
            query += " WHERE " + where;
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
    
            if (offset) {
                query += " OFFSET ?";
                values.push(offset.toString());
            }
        } else if (offset) {
            throw new Error("Mysql does not support offset without limit");
        }

        const results = await this._query(query, values);

        return results;
    }

    async count(tableName: string, whereClause: WhereBuilder | NestedObject) {
        let query = "SELECT COUNT(*) as `count` FROM `" + tableName + "`";

        const { where, values } = MysqlConnection._generateWhere(whereClause);

        if (where.length > 0) {
            query += " WHERE " + where;
        }

        const results = await this._query(query, values);

        return results[0].count;
    }

    async update(tableName: string, id: number, update: NestedObject): Promise<any> {
        let query = "UPDATE `" + this.getTable(tableName) + "` SET ";

        const fieldRows: string[] = [];
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

    async delete(tableName: string, id: number) {
        const query = "DELETE FROM `" + this.getTable(tableName) + "` WHERE id = ?";
        await this._query(query, [id]);
    }
}