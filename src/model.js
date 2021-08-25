const path = require('path');
const fs = require('fs');

const Connection = require('./connection');

const FIELD_TYPE = {
    INT: 'type/int',
};

const FIELD_META = {
    AUTO: 'meta/auto',
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
        
        const filePath = path.join(connection.getConnection() . `${this.table}.json`);
        
        return filePath;
    }
    
    writeCacheFile(data) {
        const connection = Connection.getDefaultConnection();
        
        if (connection.getType() !== Connection.CONNECTION_TYPE.FILE) {
            throw new Error('writeCacheFile called with invalid connection type: ' + connection.getType());
        }
        
        const path = this.getCacheFile();
        
        fs.writeSync(path, JSON.stringify(data, null, 4));
    }
    
    readCacheFile() {
        const connection = Connection.getDefaultConnection();
        
        if (connection.getType() !== Connection.CONNECTION_TYPE.FILE) {
            throw new Error('readCacheFile called with invalid connection type: ' + connection.getType());
        }
        
        const path = this.getCacheFile();
        
        const data = fs.readSync(path, 'utc-8');
        return JSON.parse(data);
    }
    
    initTable() {
        const connection = Connection.getDefaultConnection();
        
        if (connection.getType() === Connection.CONNECTION_TYPE.MYSQL) {
            throw new Error("MySQL support not coded yet");
        } else {
            const path = this.getCacheFile();
            if (!fs.existsSync(path)) {
                writeCacheFile({
                    auto: {},
                    data: [],
                });
            }
        }
    }
    
    get(id) {
        const connection = Connection.getDefaultConnection();
        
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
    
    search(query) {
        const connection = Connection.getDefaultConnection();
        
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
}