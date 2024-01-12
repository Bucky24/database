const fs = require('fs');
const path = require("path");

const { Connection, FIELD_META, ORDER, FIELD_TYPE } = require('./connection');

class FileConnection extends Connection {
    constructor(cacheDir, prefix = null) {
        super(prefix);

        this.cacheDir = cacheDir;
    }

    createConnection() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir);
        }

        return true;
    }

    close() {
        // no action
        this.connection = null;
    }

    _getCacheFilePath(tableName) {
        const cacheFilePath = path.join(this.cacheDir, this.getTable(tableName) + ".json");

        return cacheFilePath;
    }

    async initializeTable(tableName, fields, version) {
        await this.getConnection();

        const cacheFilePath = this._getCacheFilePath(tableName);
        if (!fs.existsSync(cacheFilePath)) {
            this._writeCacheFile(tableName, {
                auto: {},
                data: [],
            });
        }
    }

    _readCacheFile(tableName) {
        const cacheFilePath = this._getCacheFilePath(tableName);
        
        const data = fs.readFileSync(cacheFilePath, 'utf8');
        return JSON.parse(data);
    }

    _writeCacheFile(tableName, data) {
        const cacheFilePath = this._getCacheFilePath(tableName);
        
        fs.writeFileSync(cacheFilePath, JSON.stringify(data, null, 4));
    }

    async search(tableName, whereClause, order, limit) {
        let matching = [];

        const data = this._readCacheFile(tableName);
        for (let i=0;i<data.data.length;i++) {
            const obj = data.data[i];
            let matches = true;
            for (const key in whereClause) {
                const value = whereClause[key];

                if (obj[key] === undefined && value === null) {
                    continue;
                }

                if (Array.isArray(value)) {
                    if (!value.includes(obj[key])) {
                        matches = false;
                        break;
                    }
                } else if (value === false) {
                    if (obj[key]) {
                        matches = false;
                        break;
                    }
                } else {
                    if (obj[key] != value) {
                        matches = false;
                        break;
                    }
                }
            }

            if (matches) {
                matching.push(obj);
            }
        }

        if (order) {
            matching.sort((a, b) => {
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

        if (limit) {
            matching = matching.slice(0, limit);
        }

        return matching;
    }

    async update(tableName, id, update, tableFields) {
        for (const field in update) {
            const fieldData = tableFields[field];
            if (
                fieldData.type === FIELD_TYPE.STRING &&
                fieldData.size &&
                update[field].length > fieldData.size
            ) {
                throw new Error(`Field "${field} received data of size ${insertData[field].length}, but expected data of at most length ${fieldData.size}`);
            }
        }

        const data = this._readCacheFile(tableName);
        for (let i=0;i<data.data.length;i++) {
            const obj = data.data[i];
            if (obj.id == id) {
                Object.keys(update).forEach((key) => {
                    obj[key] = update[key];
                });
                break;
            }
        }
        
        this._writeCacheFile(tableName, data);
    }

    async insert(tableName, tableFields, insertData) {
        const data = this._readCacheFile(tableName);

        let newObj = {};
        let newId = null;
        
        for (const tableField in tableFields) {
            const fieldData = tableFields[tableField];
            // default it all to nulls, the insertData will override
            newObj[tableField] = null;
            if (fieldData.meta.includes(FIELD_META.AUTO)) {
                if (!data.auto[tableField]) {
                    data.auto[tableField] = 1;
                }
                newObj[tableField] = data.auto[tableField];
                newId = data.auto[tableField];
                data.auto[tableField] += 1;
            }
        }

        for (const field in insertData) {
            const fieldData = tableFields[field];
            if (
                fieldData.type === FIELD_TYPE.STRING &&
                fieldData.size &&
                insertData[field].length > fieldData.size
            ) {
                throw new Error(`Field "${field} received data of size ${insertData[field].length}, but expected data of at most length ${fieldData.size}`);
            }
        }
        
        newObj = {
            ...newObj,
            ...insertData,
        };
        
        data.data.push(newObj);
        
        this._writeCacheFile(tableName, data);

        return newId;
    }

    async delete(tableName, id) {
        const data = this._readCacheFile(tableName);
        const results = [];
        for (let i=0;i<data.data.length;i++) {
            const obj = data.data[i];
            if (obj.id == id) {
                data.data.splice(i, 1);
                break;
            }
        }
        
        this._writeCacheFile(tableName, data);
    }

    async count(tableName, whereClause) {
        const rows = await this.search(tableName, whereClause);
        return rows.length;
    }
}

module.exports = FileConnection;