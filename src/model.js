const path = require('path');
const fs = require('fs');

const Connection = require('./connection');

const FIELD_TYPE = {
    INT: 'type/int',
    STRING: 'type/string',
};

const FIELD_META = {
    AUTO: 'meta/auto',
    REQUIRED: 'meta/required',
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
        this.version = version;
        this.initTable();
    }
    
    getCacheFile() {
        const connection = Connection.getDefaultConnection();
        
        if (connection.getType() !== Connection.CONNECTION_TYPE.FILE) {
            throw new Error('getCacheFile called with invalid connection type: ' + connection.getType());
        }
        
        const filePath = path.join(connection.getConnection(), `${this.table}.json`);
        
        return filePath;
    }
    
    writeCacheFile(data) {
        const connection = Connection.getDefaultConnection();
        
        if (connection.getType() !== Connection.CONNECTION_TYPE.FILE) {
            throw new Error('writeCacheFile called with invalid connection type: ' + connection.getType());
        }
        
        const path = this.getCacheFile();
        
        fs.writeFileSync(path, JSON.stringify(data, null, 4));
    }
    
    readCacheFile() {
        const connection = Connection.getDefaultConnection();
        
        if (connection.getType() !== Connection.CONNECTION_TYPE.FILE) {
            throw new Error('readCacheFile called with invalid connection type: ' + connection.getType());
        }
        
        const path = this.getCacheFile();
        
        const data = fs.readFileSync(path, 'utf8');
        return JSON.parse(data);
    }
    
    initTable() {
        const connection = Connection.getDefaultConnection();
        
        if (connection === null) {
            throw new Error('No default connection set');
        }
        
        if (connection.getType() === Connection.CONNECTION_TYPE.MYSQL) {
            throw new Error("MySQL support not coded yet");
        } else if (connection.getType() === Connection.CONNECTION_TYPE.FILE) {
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
        
        if (connection.getType() === Connection.CONNECTION_TYPE.MYSQL) {
            throw new Error("MySQL support not coded yet");
        } else if (connection.getType() === Connection.CONNECTION_TYPE.FILE) {
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
    
    async search(query) {
        const connection = Connection.getDefaultConnection();
        
        if (connection === null) {
            throw new Error('No default connection set');
        }
        
        const keys = Object.keys(query);
        for (let i=0;i<keys.length;i++) {
            const key = keys[0];
            const data = this.getFieldData(key);
            if (data === null) {
                throw new Error(`No such field '${key}'`);
            }
        }
        
        if (connection.getType() === Connection.CONNECTION_TYPE.MYSQL) {
            throw new Error("MySQL support not coded yet");
        } else if (connection.getType() === Connection.CONNECTION_TYPE.FILE) {
            const data = this.readCacheFile();
            const results = [];
            for (let i=0;i<data.data.length;i++) {
                const obj = data.data[i];
                let failed = false;
                Object.keys(query).forEach((key) => {
                    const value = query[key];
                    
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
        
        if (connection.getType() === Connection.CONNECTION_TYPE.MYSQL) {
            throw new Error("MySQL support not coded yet");
        } else if (connection.getType() === Connection.CONNECTION_TYPE.FILE) {
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
        
        const tableFields = Object.keys(this.fields);
        for (let i=0;i<tableFields.length;i++) {
            const key = tableFields[i];
            const fieldData = this.getFieldData(key);
            if (fieldData.meta.includes(FIELD_META.REQUIRED) && !insertData[key]) {
                throw new Error(`Required field '${key}' not found`);
            }
        }
        
        if (connection.getType() === Connection.CONNECTION_TYPE.MYSQL) {
            throw new Error("MySQL support not coded yet");
        } else if (connection.getType() === Connection.CONNECTION_TYPE.FILE) {
            const data = this.readCacheFile();
            
            let newObj = {};
            
            for (let i=0;i<tableFields.length;i++) {
                const tableField = tableFields[i];
                const fieldData = this.getFieldData(tableField);
                if (fieldData.meta.includes(FIELD_META.AUTO)) {
                    if (!data.auto[tableField]) {
                        data.auto[tableField] = 1;
                    }
                    newObj[tableField] = data.auto[tableField];
                    data.auto[tableField] += 1;
                }
            }
            
            newObj = {
                ...newObj,
                ...insertData,
            };
            
            data.data.push(newObj);
            
            this.writeCacheFile(data);
        } else {
            throw new Error(`Unexpected connection type ${connection.getType()}`);
        }
    }
}

module.exports = {
    Model,
    FIELD_TYPE,
    FIELD_META,
};