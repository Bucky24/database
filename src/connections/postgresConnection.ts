import { WhereBuilder, WHERE_COMPARE, WHERE_TYPE } from '../whereBuilder';
import { Connection } from './connection';
import { Field, FIELD_META, FIELD_TYPE, Fields, FieldWithForeign, NestedObject, ORDER, OrderObj } from '../types';

export interface PostgresConnectionUrl {
    url: string;
}

export interface PostgresConnectionObject {
    host: string,
    username: string,
    password: string,
    database: string,
    port: number,
}

export interface PostgresWhere {
    where: string;
    values: any[];
    questionCount: number;
}

export interface PostgresResult {
    rows: any[];
}

export default class PostgresConnection extends Connection {
    private connectionData: PostgresConnectionObject | PostgresConnectionUrl;

    constructor(data: PostgresConnectionObject | PostgresConnectionUrl, prefix = null) {
        super(prefix);

        this.connectionData = data;
    }

    async createConnection() {
        const { default: { Client }} = await import('pg');
        let client;

        if ("url" in this.connectionData) {
            client = new Client({ connectionString: this.connectionData.url });
        } else {
            client = new Client({
                host: this.connectionData.host,
                port: this.connectionData.port,
                user: this.connectionData.username,
                password: this.connectionData.password,
                database: this.connectionData.database,
            });
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

    async _query(query: string, bind?: any[]): Promise<PostgresResult> {
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
            } catch (error: any) {
                if (error.message.startsWith("syntax error")) {
                    reject(new Error("Syntax error for query " + query + ": " + error.message));
                } else {
                    reject(error);
                }
            }
        });
    }

    static _getFieldCreationString(fieldName: string, data: Field, ticks: string) {
        let fieldRow = ticks + fieldName + ticks + " " + PostgresConnection._getColumnFromType(data.type, data);

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

    static _getEquality(key: string | null, value: any, questionCount: number, negated = false) {
        if (Array.isArray(value)) {
            const values = [];
            const questionList = [];
            for (const item of value) {
                values.push(item);
                questionList.push("$" + (questionCount + 1));
                questionCount ++;
            }

            return {
                where: `${key} ${negated ? 'not in' : 'in'} (${questionList.join(', ')})`,
                values,
            };
        } else if (value === null) {
            return {
                where: `${key} ${negated ? 'is not': 'is'} null`,
                values: [],
            };
        } else if (value === false) {
            if (negated) {
                return {
                    where: `(${key} != false and ${key} is not null)`,
                    values: [],
                };
            }
            return {
                where: `(${key} = false or ${key} is null)`,
                values: [],
            };
        } else {
            return {
                where: `${key} ${negated ? '!=' : '='} $${questionCount + 1}`,
                values: [value],
            };
        }
    }

    static _getWhere(whereClause: WhereBuilder | NestedObject, questionCount = 0): PostgresWhere {
        // for some weird reason when we convert to JS, the instanceof is no longer working,
        // so fall back to checking the constructor name
        if (whereClause instanceof WhereBuilder || whereClause.constructor.name === "WhereBuilder") {
            if (whereClause.getType() === WHERE_TYPE.COMPARE) {
                if (whereClause.getComparison() === WHERE_COMPARE.EQ) {
                    const { values, where } = PostgresConnection._getEquality(whereClause.getField(), whereClause.getValue(), questionCount);

                    return {
                        where,
                        values,
                        questionCount: questionCount + values.length,
                    };
                } else if (whereClause.getComparison() === WHERE_COMPARE.NE) {
                    const { values, where } = PostgresConnection._getEquality(whereClause.getField(), whereClause.getValue(), questionCount, true);

                    return {
                        where,
                        values,
                        questionCount: questionCount + values.length,
                    };
                } else if (whereClause.getComparison() === WHERE_COMPARE.LT) {
                    return {
                        where: `"${whereClause.getField()}" < $${questionCount+1}`,
                        values: [whereClause.getValue()],
                        questionCount: questionCount + 1,
                    };
                } else if (whereClause.getComparison() === WHERE_COMPARE.LTE) {
                    return {
                        where: `"${whereClause.getField()}" <= $${questionCount+1}`,
                        values: [whereClause.getValue()],
                        questionCount: questionCount + 1,
                    };
                } else if (whereClause.getComparison() === WHERE_COMPARE.GT) {
                    return {
                        where: `"${whereClause.getField()}" > $${questionCount+1}`,
                        values: [whereClause.getValue()],
                        questionCount: questionCount + 1,
                    };
                } else if (whereClause.getComparison() === WHERE_COMPARE.GTE) {
                    return {
                        where: `"${whereClause.getField()}" >= $${questionCount+1}`,
                        values: [whereClause.getValue()],
                        questionCount: questionCount + 1,
                    };
                } else {
                    throw new Error(`Unknown WhereBuilder Compare type ${whereClause.getComparison()}`);
                }
            } else if (whereClause.getType() === WHERE_TYPE.AND) {
                const fieldList = [];
                let values: any[] = [];
                for (const child of whereClause.getChildren()) {
                    const { values: childValues, where } = PostgresConnection._getWhere(child, questionCount);
                    fieldList.push(`(${where})`);
                    values = [...values,...childValues];
                    questionCount += values.length;
                }

                return {
                    where: fieldList.join(" AND "),
                    values,
                    questionCount,
                };
            } else if (whereClause.getType() === WHERE_TYPE.OR) {
                const fieldList: string[] = [];
                let values: any[] = [];
                for (const child of whereClause.getChildren()) {
                    const { values: childValues, where } = PostgresConnection._getWhere(child, questionCount);
                    fieldList.push(`(${where})`);
                    values = [...values,...childValues];
                    questionCount += values.length;
                }

                return {
                    where: fieldList.join(" OR "),
                    values,
                    questionCount,
                };
            } else {
                throw new Error(`Unknown WhereBuilder type ${whereClause.getType()}`);
            }
        } else {
            const fieldList: string[] = [];
            let values: any[] = [];
            Object.keys(whereClause).forEach((key) => {
                const value = whereClause[key];
                const { values: childValues, where } = PostgresConnection._getEquality(key, value, questionCount);
                
                questionCount += childValues.length;
                fieldList.push(where);
                values = [...values,...childValues];
            });

            return {
                where: fieldList.join(" AND "),
                values,
                questionCount,
            };
        }
    }

    async initializeTable(tableName: string, fields: Fields, version: number) {
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
                    fieldRow += PostgresConnection._getColumnFromType(data.type, data);
                }

                if (data.meta) {
                    if (data.meta.includes(FIELD_META.REQUIRED)) {
                        fieldRow += ' NOT NULL'
                    }
                    if (data.meta.includes(FIELD_META.AUTO)) {
                        fieldRow += ' SERIAL PRIMARY KEY';
                    }
                }

                if (data.foreign) {
                    const foreignTable = this.getTable(data.foreign.table.getTable());
                    fieldRow += ` REFERENCES "${foreignTable}" ("${data.foreign.field}")`;
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
                    const rowsWithForeign: FieldWithForeign[] = [];
                    for (const missing of missingInDb) {
                        const data = fields[missing];
                        fieldStrings.push("ADD COLUMN " + PostgresConnection._getFieldCreationString(missing, data, '\"'));
                        if (data.foreign) {
                            rowsWithForeign.push({
                                ...data,
                                foreign: data.foreign,
                                localField: missing,
                            });
                        }
                    }

                    const query = "ALTER TABLE \"" + this.getTable(tableName) + "\" " + fieldStrings.join(", ");
                    await this._query(query);

                    for (const rowWithForeign of rowsWithForeign) {
                        const foreignTable = this.getTable(rowWithForeign.foreign.table.getTable());
                        const constraintId = `fk_${rowWithForeign.foreign.field}_${foreignTable}`;
                        const foreignQuery = `FOREIGN KEY ("${rowWithForeign.foreign.field}") REFERENCES "${foreignTable}" ("${rowWithForeign.foreign.field}")`;
                        const fullQuery = `ALTER TABLE "${this.getTable(tableName)}" ADD CONSTRAINT ${constraintId} ${foreignQuery}`;
                        await this._query(fullQuery);
                    }
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

    async insert(tableName: string, tableFields: Fields, insertData: NestedObject) {
        let query = "INSERT INTO \"" + this.getTable(tableName) + "\" (";

        const fieldList: string[] = [];
        const valueList: any[] = [];
        const valueKeys: string[] = [];

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

    async search(tableName: string, whereClause: WhereBuilder | NestedObject, order?: OrderObj, limit?: number, offset?: number) {
        let query = "SELECT * FROM \"" + tableName + "\"";

        let { where, values, questionCount } = PostgresConnection._getWhere(whereClause);

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
            query += " LIMIT $" + (questionCount + 1);
            questionCount ++;
            values.push(limit.toString());
        }

        if (offset) {
            query += " OFFSET $" + (questionCount + 1);
            questionCount ++;
            values.push(offset.toString());
        }

        const results = await this._query(query, values);

        return results.rows;
    }

    async count(tableName: string, whereClause: WhereBuilder | NestedObject) {
        let query = "SELECT COUNT(*) as \"count\" FROM \"" + tableName + "\"";

        let { where, values } = PostgresConnection._getWhere(whereClause);

        if (where.length > 0) {
            query += " WHERE " + where;
        }

        const results = await this._query(query, values);

        return results.rows[0].count;
    }

    async update(tableName: string, id: number, update: NestedObject) {
        let query = "UPDATE \"" + this.getTable(tableName) + "\" SET ";

        const fieldRows: string[] = [];
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

    async delete(tableName: string, id: number) {
        const query = "DELETE FROM \"" + this.getTable(tableName) + "\" WHERE id = $1";
        await this._query(query, [id]);
    }
}

module.exports = PostgresConnection;