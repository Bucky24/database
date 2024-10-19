import fs from 'fs';
import path from 'path';
import { Connection } from './connection';
import { WhereBuilder, WHERE_TYPE, WHERE_COMPARE } from '../whereBuilder';
import { FIELD_META, FIELD_TYPE, Fields, NestedObject, ORDER, OrderObj } from '../types';

export default class FileConnection extends Connection {
    private cacheDir: string;

    constructor(cacheDir: string, prefix = null) {
        super(prefix);

        this.cacheDir = cacheDir;
    }

    createConnection() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir);
        }

        return true;
    }

    async close() {
        // no action
        this.connection = null;
    }

    _getCacheFilePath(tableName: string) {
        const cacheFilePath = path.join(this.cacheDir, this.getTable(tableName) + ".json");

        return cacheFilePath;
    }

    async initializeTable(tableName: string, fields: Fields, version: number) {
        await this.getConnection();

        const cacheFilePath = this._getCacheFilePath(tableName);
        if (!fs.existsSync(cacheFilePath)) {
            this._writeCacheFile(tableName, {
                auto: {},
                data: [],
            });
        }
    }

    _readCacheFile(tableName: string) {
        const cacheFilePath = this._getCacheFilePath(tableName);
        
        const data = fs.readFileSync(cacheFilePath, 'utf8');
        return JSON.parse(data);
    }

    _writeCacheFile(tableName: string, data: NestedObject) {
        const cacheFilePath = this._getCacheFilePath(tableName);
        
        fs.writeFileSync(cacheFilePath, JSON.stringify(data, null, 4));
    }

    _compareValues(value1: any, value2: any, negated = false) {
        const result = (res: boolean) => {
            if (negated) {
                return !res;
            }

            return res;
        }
        if (value2 === undefined && value1 === null) {
            return result(true);
        }

        if (Array.isArray(value1)) {
            if (!value1.includes(value2)) {
                return result(false);
            }
        } else if (value1 === false) {
            if (value2) {
                return result(false);
            }
        } else {
            if (value2 != value1) {
                return result(false);
            }
        }

        return result(true);
    }

    _doesRowMatchClause(whereClause: WhereBuilder | NestedObject, obj: any) {
        if (whereClause instanceof WhereBuilder) {
            if (whereClause.getType() === WHERE_TYPE.COMPARE) {
                const key = whereClause.getField();
                if (key === null) {
                    // we can't really compare against a null field
                    return false;
                }
                const value = whereClause.getValue();
                if (whereClause.getComparison() === WHERE_COMPARE.EQ) {
                    return this._compareValues(value, obj[key]);
                } else if (whereClause.getComparison() === WHERE_COMPARE.NE) {
                    return this._compareValues(value, obj[key], true);
                } else if (whereClause.getComparison() === WHERE_COMPARE.LT) {
                    return obj[key] < value;
                } else if (whereClause.getComparison() === WHERE_COMPARE.LTE) {
                    return obj[key] <= value;
                } else if (whereClause.getComparison() === WHERE_COMPARE.GT) {
                    return obj[key] > value;
                } else if (whereClause.getComparison() === WHERE_COMPARE.GTE) {
                    return obj[key] >= value;
                } else {
                    throw new Error(`Unknown WhereBuilder Compare type ${whereClause.getComparison()}`);
                }
            } else if (whereClause.getType() === WHERE_TYPE.OR) {
                for (const child of whereClause.getChildren()) {
                    const localResult = this._doesRowMatchClause(child, obj);
                    if (localResult) {
                        // for OR, any success is fine
                        return true;
                    }
                }
            } else if (whereClause.getType() === WHERE_TYPE.AND) {
                for (const child of whereClause.getChildren()) {
                    const localResult = this._doesRowMatchClause(child, obj);
                    if (!localResult) {
                        // for AND, any failure fails all
                        return false;
                    }
                }

                return true;
            } else {
                throw new Error(`Unknown WhereBuilder type ${whereClause.getType()}`);
            }
        } else {
            let matches = true;
            for (const key in whereClause) {
                const value = whereClause[key];

                const localMatch = this._compareValues(value, obj[key]);
                if (!localMatch) {
                    matches = false;
                }
            }

            return matches;
        }
    }

    async search(tableName: string, whereClause: WhereBuilder | NestedObject, order?: OrderObj, limit?: number, offset?: number): Promise<any[]> {
        let matching = [];

        const startRow = offset || 0;

        const data = this._readCacheFile(tableName);
        for (let i=startRow;i<data.data.length;i++) {
            const obj = data.data[i];
            const matches = this._doesRowMatchClause(whereClause, obj);

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

    async update(tableName: string, id: number, update: NestedObject, tableFields: Fields): Promise<number> {
        for (const field in update) {
            const fieldData = tableFields[field];
            if (
                fieldData.type === FIELD_TYPE.STRING &&
                fieldData.size &&
                update[field].length > fieldData.size
            ) {
                throw new Error(`Field "${field} received data of size ${update[field].length}, but expected data of at most length ${fieldData.size}`);
            }

            const foreign = fieldData.foreign;
            if (foreign) {
                const allData = await foreign.table.search({});
                const allDataForColumn = allData.map((row: any) => {
                    return row[foreign.field];
                });

                if (!allDataForColumn.includes(update[field])) {
                    throw new Error(`Failing foreign key constraint on field '${field}: Value '${update[field]}' does not exist in foreign table`);
                }
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

        return id;
    }

    async insert(tableName: string, tableFields: Fields, insertData: NestedObject) {
        const data = this._readCacheFile(tableName);

        let newObj: NestedObject = {};
        let newId = null;
        
        for (const tableField in tableFields) {
            const fieldData = tableFields[tableField];
            // default it all to nulls, the insertData will override
            newObj[tableField] = null;
            if (fieldData.meta?.includes(FIELD_META.AUTO)) {
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

            const foreign = fieldData.foreign;
            if (foreign) {
                const allData = await foreign.table.search({});
                const allDataForColumn = allData.map((row: any) => {
                    return row[foreign.field];
                });

                if (!allDataForColumn.includes(insertData[field])) {
                    throw new Error(`Failing foreign key constraint on field '${field}: Value '${insertData[field]}' does not exist in foreign table`);
                }
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

    async delete(tableName: string, id: number) {
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

    async count(tableName: string, whereClause: WhereBuilder | NestedObject): Promise<number> {
        const rows = await this.search(tableName, whereClause);
        return rows.length;
    }
}

module.exports = FileConnection;