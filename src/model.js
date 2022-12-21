const path = require('path');
const fs = require('fs');

const { Connection, CONNECTION_TYPE } = require('./connection');

const FIELD_TYPE = {
    INT: 'type/int',
    STRING: 'type/string',
    BIGINT: 'type/int',
    JSON: 'type/json',
    BOOLEAN: 'type/boolean',
};

const FIELD_META = {
    AUTO: 'meta/auto',
    REQUIRED: 'meta/required',
    FILTERED: 'meta/filtered',
};

const ORDER = {
    ASC: 'order/asc',
    DESC: 'order/desc',
};

class Model {
    constructor(table, fields, version) {
        this.table = table;
        this.fields = {
            id: {
                type: FIELD_TYPE.INT,
                meta: [
                    FIELD_META.AUTO,
                ],
            },
            ...fields,
        };
        this.fieldList = Object.keys(this.fields).map((key) => {
            const field = this.fields[key];
            return {
                ...field,
                id: key,
            };
        });
        this.version = version;
    }
    
    getCacheFile() {
        const connection = Connection.getDefaultConnection();
        
        if (connection.getType() !== CONNECTION_TYPE.FILE) {
            throw new Error('getCacheFile called with invalid connection type: ' + connection.getType());
        }
        
        const filePath = path.join(connection.getConnection(), `${this.table}.json`);
        
        return filePath;
    }
    
    writeCacheFile(data) {
        const connection = Connection.getDefaultConnection();
        
        if (connection.getType() !== CONNECTION_TYPE.FILE) {
            throw new Error('writeCacheFile called with invalid connection type: ' + connection.getType());
        }
        
        const path = this.getCacheFile();
        
        fs.writeFileSync(path, JSON.stringify(data, null, 4));
    }
    
    readCacheFile() {
        const connection = Connection.getDefaultConnection();
        
        if (connection.getType() !== CONNECTION_TYPE.FILE) {
            throw new Error('readCacheFile called with invalid connection type: ' + connection.getType());
        }
        
        const path = this.getCacheFile();
        
        const data = fs.readFileSync(path, 'utf8');
        return JSON.parse(data);
    }

    static async query(query, bind) {
        const connection = Connection.getDefaultConnection();
        
        if (connection === null) {
            throw new Error('No default connection set');
        }

        if (connection.getType() === CONNECTION_TYPE.MYSQL) {
            return new Promise((resolve, reject) => {
                const callback = (error, results, fields) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(results);
                };
                if (bind) {
                    connection.getConnection().execute(query, bind, callback);
                } else {
                    connection.getConnection().query(query, callback);
                }
            });
        } else if (connection.getType() === CONNECTION_TYPE.POSTGRES) {
            return new Promise(async (resolve, reject) => {
                try {
                    let result;
                    if (bind) {
                        result = await connection.getConnection().query(query, bind);
                    } else {
                        result = await connection.getConnection().query(query);
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
        } else {
            throw new Error('query called with invalid connection type: ' + connection.getType());
        }
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

    _getFieldsWithMeta(meta) {
        return this.fieldList.filter((field) => {
            if (!field.meta) {
                // if it has no meta, no way it can match any meta
                return false;
            }
            return field.meta.includes(meta);
        });
    }

    static _getFieldCreationString(fieldName, data, ticks) {
        let fieldRow = ticks + fieldName + ticks + " " + Model._getColumnFromType(data.type);

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
    
    async initTable() {
        const connection = Connection.getDefaultConnection();
        
        if (connection === null) {
            throw new Error('No default connection set');
        }
        
        if (connection.getType() === CONNECTION_TYPE.FILE) {
            const path = this.getCacheFile();
            if (!fs.existsSync(path)) {
                this.writeCacheFile({
                    auto: {},
                    data: [],
                });
            }
        } else if (connection.getType() === CONNECTION_TYPE.MYSQL) {
            // first see if our versions table exists
            const getVersionsQuery = "SELECT * FROM information_schema.tables WHERE table_schema = '" + connection.getData()['database'] + "' AND table_name = '" + connection.getTable('table_versions') + "' LIMIT 1;"

            const tableResult = await Model.query(getVersionsQuery);

            if (tableResult.length === 0) {
                console.log("Versions table not found, creating!");

                const creationQuery = "CREATE TABLE " + connection.getTable('table_versions') + "(name VARCHAR(255), version INT)";
                await Model.query(creationQuery);
            }

            // get version for this table
            const getVersionQuery = "SELECT version FROM " + connection.getTable('table_versions') + " WHERE name = ?";

            const versionResult = await Model.query(getVersionQuery, [connection.getTable(this.table)]);
            if (versionResult.length === 0) {
                console.log("Table " + this.table + " not found, creating");
                let creationQuery = "CREATE TABLE " + connection.getTable(this.table) + "("

                let autoColumn = null;
                const fieldList = Object.keys(this.fields).map((fieldName) => {
                    const data = this.fields[fieldName];

                    if (data.meta && data.meta.includes(FIELD_META.AUTO)) {
                        autoColumn = fieldName;
                    }

                    return Model._getFieldCreationString(fieldName, data, '');
                });

                if (autoColumn) {
                    fieldList.push("PRIMARY KEY (" + autoColumn + ")");
                }

                creationQuery += fieldList.join(", ");
                creationQuery += ")";

                await Model.query(creationQuery);

                // add the version
                const setVersionQuery = "INSERT INTO " + connection.getTable('table_versions') + "(version, name) VALUES(?, ?)";
                await Model.query(setVersionQuery, [this.version, connection.getTable(this.table)]);
            } else {
                const version = versionResult[0].version;
                if (version !== this.version) {
                    console.log("Version mismatch on table " + this.table + ", expected " + this.version + " got " + version);

                    const fields = await Model.query("DESCRIBE " + connection.getTable(this.table));
                    const dbFields = fields.map((field) => {
                        return field.Field;
                    });
                    const localFields = Object.keys(this.fields);

                    const missingInDb = [];
                    for (const local of localFields) {
                        if (!dbFields.includes(local)) {
                            missingInDb.push(local);
                        }
                    }

                    if (missingInDb.length > 0) {
                        const fieldStrings = [];
                        for (const missing of missingInDb) {
                            const data = this.fields[missing];
                            fieldStrings.push("ADD COLUMN " + Model._getFieldCreationString(missing, data, '`'));
                        }

                        const query = "ALTER TABLE " + connection.getTable(this.table) + " " + fieldStrings.join(", ");
                        await Model.query(query);
                    }
                    await Model.query(
                        "UPDATE " + connection.getTable('table_versions') + " SET version  = ? WHERE name = ?",
                        [this.version, connection.getTable(this.table)],
                    );
                    console.log("Version mismatch resolved.");
                }
            }
        } else if (connection.getType() === CONNECTION_TYPE.POSTGRES) {
            // first see if our versions table exists
            const getVersionsQuery = "SELECT * FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = '" + connection.getTable('table_versions') + "' LIMIT 1;"

            const tableResult = await Model.query(getVersionsQuery);
            let rows = tableResult.rows;

            if (rows.length === 0) {
                console.log("Versions table not found, creating!");

                const creationQuery = "CREATE TABLE " + connection.getTable('table_versions') + "(name VARCHAR(255), version INT)";
                await Model.query(creationQuery);
            }

            // get version for this table
            const getVersionQuery = "SELECT version FROM " + connection.getTable('table_versions') + " WHERE name = $1";

            const versionResult = await Model.query(getVersionQuery, [connection.getTable(this.table)]);
            rows = versionResult.rows;

            if (rows.length === 0) {
                console.log("Table " + this.table + " not found, creating");
                let creationQuery = "CREATE TABLE " + connection.getTable(this.table) + "("

                const fieldList = Object.keys(this.fields).map((fieldName) => {
                    const data = this.fields[fieldName];

                    const auto = data.meta && data.meta.includes(FIELD_META.AUTO)

                    let fieldRow = "" + fieldName + " ";
                    if (!auto) {
                        fieldRow += Model._getColumnFromType(data.type);
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

                await Model.query(creationQuery);

                // add the version
                const setVersionQuery = "INSERT INTO " + connection.getTable('table_versions') + "(version, name) VALUES($1, $2)";
                await Model.query(setVersionQuery, [this.version, connection.getTable(this.table)]);
            } else {
                const version = rows[0].version;
                if (version !== this.version) {
                    console.log("Version mismatch on table " + this.table + ", expected " + this.version + " got " + version);

                    const fields = await Model.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '" + connection.getTable(this.table) + "' order by ordinal_position asc");
                    const dbFields = fields.rows.map((field) => {
                        return field.column_name;
                    });
                    const localFields = Object.keys(this.fields);

                    const missingInDb = [];
                    for (const local of localFields) {
                        if (!dbFields.includes(local)) {
                            missingInDb.push(local);
                        }
                    }

                    if (missingInDb.length > 0) {
                        const fieldStrings = [];
                        for (const missing of missingInDb) {
                            const data = this.fields[missing];
                            fieldStrings.push("ADD COLUMN " + Model._getFieldCreationString(missing, data, ''));
                        }

                        const query = "ALTER TABLE " + connection.getTable(this.table) + " " + fieldStrings.join(", ");
                        await Model.query(query);
                    }
                    await Model.query(
                        "UPDATE " + connection.getTable('table_versions') + " SET version  = $1 WHERE name = $2",
                        [this.version, connection.getTable(this.table)],
                    );
                    console.log("Version mismatch resolved.");
                }
            }
        } else {
            throw new Error(`Unexpected connection type ${connection.getType()}`);
        }
    }
    
    getFieldData(field) {
        if (!this.fields[field]) {
            return null;
        }
        
        return {
            ...this.fields[field],
            meta: this.fields[field].meta || [],
        }
    }

    processResult(result) {
        Object.keys(result).forEach((key) => {
            const value = result[key];
            const data = this.getFieldData(key);
            if (data.type === FIELD_TYPE.JSON) {
                result[key] = JSON.parse(value);
            }
        });

        return result;
    }

    processForSave(value, field) {
        const data = this.getFieldData(field);
        if (data.type === FIELD_TYPE.JSON) {
            return JSON.stringify(value);
        }

        return value;
    }
    
    async get(id) {
        const connection = Connection.getDefaultConnection();
        
        if (connection === null) {
            throw new Error('No default connection set');
        }
        
        if (connection.getType() === CONNECTION_TYPE.MYSQL) {
            const query = "SELECT * FROM " + connection.getTable(this.table) + " WHERE id = ?";
            const result = await Model.query(query, [id]);
            if (result.length === 0) {
                return null;
            }

            return this.processResult(result[0]);
        } else if (connection.getType() === CONNECTION_TYPE.FILE) {
            const data = this.readCacheFile();
            for (let i=0;i<data.data.length;i++) {
                const obj = data.data[i];
                if (obj.id == id) {
                    return this.processResult(obj);
                }
            }
            
            return null;
        } else if (connection.getType() === CONNECTION_TYPE.POSTGRES) {
            const query = "SELECT * FROM " + connection.getTable(this.table) + " WHERE id = $1";
            const result = await Model.query(query, [id]);
            if (result.rows.length === 0) {
                return null;
            }

            return this.processResult(result.rows[0]);
        } else {
            throw new Error(`Unexpected connection type ${connection.getType()}`);
        }
    }
    
    async search(queryData, order = null, limit = null) {
        const connection = Connection.getDefaultConnection();
        
        if (connection === null) {
            throw new Error('No default connection set');
        }
        
        const keys = Object.keys(queryData);
        for (let i=0;i<keys.length;i++) {
            const key = keys[0];
            const data = this.getFieldData(key);
            if (data === null) {
                throw new Error(`No such field '${key}'`);
            }
        }
        
        if (connection.getType() === CONNECTION_TYPE.MYSQL) {
            let query = "SELECT * FROM " + connection.getTable(this.table);

            const fieldList = [];
            const values = [];
            Object.keys(queryData).forEach((key) => {
                const value = queryData[key];
                if (Array.isArray(value)) {
                    const questionList = [];
                    for (const item of value) {
                        questionList.push('?');
                        values.push(item);
                    }
                    fieldList.push(`${key} in (${questionList.join(', ')})`);
                } else {
                    fieldList.push(`${key} = ?`);
                    values.push(queryData[key]);
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

            const results = await Model.query(query, values);

            return results.map((result) => {
                return this.processResult(result);
            });
        } else if (connection.getType() === CONNECTION_TYPE.FILE) {
            const data = this.readCacheFile();
            const results = [];
            const useData = data.data;

            if (order) {
                useData.sort((a, b) => {
                    for (const field in order) {
                        const direction = order[field];

                        if (
                            (direction === ORDER.ASC && a[field] < b[field]) ||
                            (direction === ORDER.DESC && a[field] > b[field])
                        ) {
                            return -1;
                        }

                        if (
                            (direction === ORDER.ASC && a[field] > b[field]) ||
                            (direction === ORDER.DESC && a[field] < b[field])
                        ) {
                            return 1;
                        }
                    }

                    return 0;
                });
            }
            for (let i=0;i<useData.length;i++) {
                const obj = useData[i];
                let failed = false;
                Object.keys(queryData).forEach((key) => {
                    const value = queryData[key];
                    
                    if (obj[key] === undefined && value === null) {
                        return;
                    }

                    if (Array.isArray(value)) {
                        if (!value.includes(obj[key])) {
                            failed = true;
                        }
                    } else {
                        if (obj[key] !== value) {
                            failed = true;
                        }
                    }
                });
                
                if (!failed) {
                    results.push(this.processResult(obj));
                }

                if (limit && results.length >= limit) {
                    break;
                }
            }
            
            return results;
        } else if (connection.getType() === CONNECTION_TYPE.POSTGRES) {
            let query = "SELECT * FROM " + connection.getTable(this.table);

            const fieldList = [];
            const values = [];
            let curNum = 1;

            const getNumParam = () => {
                const param = '$' + curNum;
                curNum++;
                return param;
            }

            Object.keys(queryData).forEach((key) => {
                const value = queryData[key];
                if (Array.isArray(value)) {
                    const questionList = [];
                    for (const item of value) {
                        questionList.push(getNumParam());
                        values.push(item);
                    }
                    fieldList.push(`${key} in (${questionList.join(', ')})`);
                } else {
                    fieldList.push(`${key} = ${getNumParam()}`);
                    values.push(queryData[key]);
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
                query += " LIMIT " + getNumParam();
                values.push(limit.toString());
            }

            const results = await Model.query(query, values);

            return results.rows.map((result) => {
                return this.processResult(result);
            });
        } else {
            throw new Error(`Unexpected connection type ${connection.getType()}`);
        }
    }
    
    async update(id, fields) {
        const connection = Connection.getDefaultConnection();
        
        if (connection === null) {
            throw new Error('No default connection set');
        }
        
        const keys = Object.keys(fields);
        for (let i=0;i<keys.length;i++) {
            const key = keys[0];
            const data = this.getFieldData(key);
            if (data === null) {
                throw new Error(`No such field '${key}'`);
            }
            const value = fields[key];
            if (value === null && data.meta.includes(FIELD_META.REQUIRED)) {
                throw new Error(`Field '${key}' cannot be set to null`);
            }
        }
        
        if (connection.getType() === CONNECTION_TYPE.MYSQL) {
            let query = "UPDATE " + connection.getTable(this.table) + " SET ";

            const fieldRows = [];
            const values = [];
            Object.keys(fields).forEach((key) => {
                fieldRows.push(`${key} = ?`);
                values.push(this.processForSave(fields[key], key));
            });

            query += fieldRows.join(", ");
            query += " WHERE id = ?";
            values.push(id);

            await Model.query(query, values);
        } else if (connection.getType() === CONNECTION_TYPE.FILE) {
            const data = this.readCacheFile();
            const results = [];
            for (let i=0;i<data.data.length;i++) {
                const obj = data.data[i];
                if (obj.id == id) {
                    Object.keys(fields).forEach((key) => {
                        const fieldData = this.fields[key];
                        if (fields[key] === null) {
                            delete obj[key];
                        } else {
                            obj[key] = this.processForSave(fields[key], key);
                        }
                    });
                    break;
                }
            }
            
            this.writeCacheFile(data);
        } else if (connection.getType() === CONNECTION_TYPE.POSTGRES) {
            let query = "UPDATE " + connection.getTable(this.table) + " SET ";

            const fieldRows = [];
            const values = [];
            let counter = 1;
            Object.keys(fields).forEach((key) => {
                fieldRows.push(`${key} = $${counter}`);
                counter ++;
                values.push(this.processForSave(fields[key], key));
            });

            query += fieldRows.join(", ");
            query += " WHERE id = $" + counter;
            values.push(id);

            await Model.query(query, values);
        } else {
            throw new Error(`Unexpected connection type ${connection.getType()}`);
        }
    }
    
    async insert(insertData) {
        const connection = Connection.getDefaultConnection();
        
        if (connection === null) {
            throw new Error('No default connection set');
        }

        const keys = Object.keys(insertData);
        for (let i=0;i<keys.length;i++) {
            const key = keys[0];
            const fieldData = this.getFieldData(key);
            if (fieldData === null) {
                throw new Error(`No such field '${key}'`);
            }
        }
        
        const fieldTypeMap = {};

        const tableFields = Object.keys(this.fields);
        for (let i=0;i<tableFields.length;i++) {
            const key = tableFields[i];
            const fieldData = this.getFieldData(key);
            fieldTypeMap[key] = fieldData.type;
            if (fieldData.meta.includes(FIELD_META.REQUIRED) && (insertData[key] === null || insertData[key] === undefined)) {
                throw new Error(`Required field '${key}' not found`);
            }
        }
        
        if (connection.getType() === CONNECTION_TYPE.MYSQL) {
            let query = "INSERT INTO " + connection.getTable(this.table) + "(";

            const fieldList = [];
            const valueList = [];
            const valueKeys = [];

            Object.keys(insertData).forEach((key) => {
                const value = insertData[key];
                fieldList.push(key);
                valueList.push(this.processForSave(value, key));
                valueKeys.push("?");
            });

            query += fieldList.join(", ") + ") VALUES(" + valueKeys.join(", ") + ")";

            const result = await Model.query(query, valueList);
            return result.insertId;
        } else if (connection.getType() === CONNECTION_TYPE.FILE) {
            const data = this.readCacheFile();
            
            let newObj = {};
            let newId = null;
            
            for (let i=0;i<tableFields.length;i++) {
                const tableField = tableFields[i];
                const fieldData = this.getFieldData(tableField);
                if (fieldData.meta.includes(FIELD_META.AUTO)) {
                    if (!data.auto[tableField]) {
                        data.auto[tableField] = 1;
                    }
                    newObj[tableField] = data.auto[tableField];
                    newId = data.auto[tableField];
                    data.auto[tableField] += 1;
                }
            }

            Object.keys(insertData).forEach((key) => {
                insertData[key] = this.processForSave(insertData[key], key);
            });
            
            newObj = {
                ...newObj,
                ...insertData,
            };
            
            data.data.push(newObj);
            
            this.writeCacheFile(data);

            return newId;
        } else if (connection.getType() === CONNECTION_TYPE.POSTGRES) {
            let query = "INSERT INTO " + connection.getTable(this.table) + "(";

            const fieldList = [];
            const valueList = [];
            const valueKeys = [];

            Object.keys(insertData).forEach((key, index) => {
                const value = insertData[key];
                fieldList.push(key);
                valueList.push(this.processForSave(value, key));
                valueKeys.push("$" + (index + 1));
            });

            query += fieldList.join(", ") + ") VALUES(" + valueKeys.join(", ") + ") RETURNING id";

            const result = await Model.query(query, valueList);
            return result.rows[0].id;
        } else {
            throw new Error(`Unexpected connection type ${connection.getType()}`);
        }
    }

    async delete(id) {
        const connection = Connection.getDefaultConnection();
        
        if (connection === null) {
            throw new Error('No default connection set');
        }
        
        if (connection.getType() === CONNECTION_TYPE.MYSQL) {
            const query = "DELETE FROM " + connection.getTable(this.table) + " WHERE id = ?";
            await Model.query(query, [id]);
        } else if (connection.getType() === CONNECTION_TYPE.FILE) {
            const data = this.readCacheFile();
            const results = [];
            for (let i=0;i<data.data.length;i++) {
                const obj = data.data[i];
                if (obj.id == id) {
                    data.data.splice(i, 1);
                    break;
                }
            }
            
            this.writeCacheFile(data);
        } else if (connection.getType() === CONNECTION_TYPE.POSTGRES) {
            const query = "DELETE FROM " + connection.getTable(this.table) + " WHERE id = $1";
            await Model.query(query, [id]);
        } else {
            throw new Error(`Unexpected connection type ${connection.getType()}`);
        }
    }

    filterForExport(data) {
        if (Array.isArray(data)) {
            return data.map((item) => {
                return this.filterForExport(item);
            });
        }

        const result = {...data};
        const filterFields = this._getFieldsWithMeta(FIELD_META.FILTERED);
        const filterFieldsIds = filterFields.map((field) => {
            return field.id;
        });
        for (const key in result) {
            if (filterFieldsIds.includes(key)) {
                delete result[key];
            }
        }

        return result;
    }
}

module.exports = {
    Model,
    FIELD_TYPE,
    FIELD_META,
    ORDER,
};