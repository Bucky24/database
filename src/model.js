const path = require('path');
const fs = require('fs');

const { Connection, CONNECTION_TYPE } = require('./connection');

const FIELD_TYPE = {
    INT: 'type/int',
    STRING: 'type/string',
    BIGINT: 'type/int',
};

const FIELD_META = {
    AUTO: 'meta/auto',
    REQUIRED: 'meta/required',
    FILTERED: 'meta/filtered',
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
    }

    static _getColumnFromType(type) {
        if (type === FIELD_TYPE.INT) {
            return 'INT';
        } else if (type === FIELD_TYPE.STRING) {
            return 'TEXT';
        } else if (type === FIELD_TYPE.BIGINT) {
            return 'BIGINT';
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
    
    async initTable() {
        const connection = Connection.getDefaultConnection();
        
        if (connection === null) {
            throw new Error('No default connection set');
        }
        
        if (connection.getType() === CONNECTION_TYPE.MYSQL) {
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

                    let fieldRow = "`" + fieldName + "` " + Model._getColumnFromType(data.type);

                    if (data.meta) {
                        if (data.meta.includes(FIELD_META.REQUIRED)) {
                            fieldRow += ' NOT NULL'
                        }
                        if (data.meta.includes(FIELD_META.AUTO)) {
                            fieldRow += ' AUTO_INCREMENT';
                            autoColumn = fieldName;
                        }
                    }

                    return fieldRow;
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
                    console.log("Version mismatch on table " + this.table + ", expected " + this.version + " got " + version + " TOOD: Do something about this.");
                }
            }
        } else if (connection.getType() === CONNECTION_TYPE.FILE) {
            const path = this.getCacheFile();
            if (!fs.existsSync(path)) {
                this.writeCacheFile({
                    auto: {},
                    data: [],
                });
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

            return result[0];
        } else if (connection.getType() === CONNECTION_TYPE.FILE) {
            const data = this.readCacheFile();
            for (let i=0;i<data.data.length;i++) {
                const obj = data.data[i];
                if (obj.id === id) {
                    return obj;
                }
            }
            
            return null;
        } else {
            throw new Error(`Unexpected connection type ${connection.getType()}`);
        }
    }
    
    async search(queryData) {
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
            let query = "SELECT * FROM " + connection.getTable(this.table) + " WHERE ";

            const fieldList = [];
            const values = [];
            Object.keys(queryData).forEach((key) => {
                fieldList.push(`${key} = ?`);
                values.push(queryData[key]);
            });

            query += fieldList.join(" AND ") + " ORDER BY id asc";

            const results = await Model.query(query, values);

            return results;
        } else if (connection.getType() === CONNECTION_TYPE.FILE) {
            const data = this.readCacheFile();
            const results = [];
            for (let i=0;i<data.data.length;i++) {
                const obj = data.data[i];
                let failed = false;
                Object.keys(queryData).forEach((key) => {
                    const value = queryData[key];
                    
                    if (obj[key] === undefined && value === null) {
                        // null is valid for unset, so return at this point
                        return;
                    }
                    
                    if (obj[key] !== value) {
                        failed = true;
                    }
                });
                
                if (!failed) {
                    results.push(obj);
                }
            }
            
            return results;
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
                values.push(fields[key]);
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
                if (obj.id === id) {
                    Object.keys(fields).forEach((key) => {
                        const fieldData = this.fields[key];
                        if (fields[key] === null) {
                            delete obj[key];
                        } else {
                            obj[key] = fields[key];
                        }
                    });
                    break;
                }
            }
            
            this.writeCacheFile(data);
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
            if (fieldData.meta.includes(FIELD_META.REQUIRED) && !insertData[key]) {
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
                valueList.push(value);
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
            
            newObj = {
                ...newObj,
                ...insertData,
            };
            
            data.data.push(newObj);
            
            this.writeCacheFile(data);

            return newId;
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
                if (obj.id === id) {
                    data.data.splice(i, 1);
                    break;
                }
            }
            
            this.writeCacheFile(data);
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
};