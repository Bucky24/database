import fs from 'fs';
import path from 'path';
import { Connection } from '../common/connection';
import { NestedWhere, WhereBuilder } from '../../whereBuilder';
import { FIELD_META, FIELD_TYPE, Fields, IndexSettings, NestedObject, ORDER, OrderObj } from '../../types';
import { doesRowMatchClause } from '../common/helpers';
import { difference } from '../../utils';

type FileTableData = {
    data: NestedObject[];
    fields?: Fields;
    auto: { [field: string]: number };
}

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

    async initializeTable(tableName: string, fields: Fields, indexes: IndexSettings[] = []) {
        await this.getConnection();

        const cacheFilePath = this._getCacheFilePath(tableName);
        if (!fs.existsSync(cacheFilePath)) {
            this._writeCacheFile(tableName, {
                fields,
                auto: {},
                data: [],
            });
        }

        // let's see if we added any fields
        const tableData = this._readCacheFile(tableName);
        const oldFields = tableData.fields || {};
        const newFieldNames = difference<string>(Object.keys(fields), Object.keys(oldFields));

        for (const newFieldName of newFieldNames) {
            const newFieldData = fields[newFieldName];
            // we need to handle if there are existing rows
            if (tableData.data.length > 0) {
                // in this case, if our field is required, and there's no default that's an error
                if (newFieldData.meta?.includes(FIELD_META.REQUIRED) && newFieldData.default === undefined) {
                    throw new Error(`Table ${tableName} field ${newFieldName} is required but provides no default. Unable to update existing rows`);
                }

                // if we got here, we just need to update the rows in case of a default
                if (newFieldData.default !== undefined) {
                    for (const row of tableData.data) {
                        row[newFieldName] = newFieldData.default;
                    }
                }
            }
        }

        tableData.fields = fields;
        this._writeCacheFile(tableName, tableData);
    }

    private _readCacheFile(tableName: string): FileTableData {
        const cacheFilePath = this._getCacheFilePath(tableName);
        
        const data = fs.readFileSync(cacheFilePath, 'utf8');
        return JSON.parse(data);
    }

    private _writeCacheFile(tableName: string, data: FileTableData) {
        const cacheFilePath = this._getCacheFilePath(tableName);
        
        fs.writeFileSync(cacheFilePath, JSON.stringify(data, null, 4));
    }

    async search(tableName: string, whereClause: WhereBuilder | NestedObject, order?: OrderObj, limit?: number, offset?: number): Promise<any[]> {
        let matching = [];

        const startRow = offset || 0;

        const data = this._readCacheFile(tableName);
        for (let i=startRow;i<data.data.length;i++) {
            const obj = data.data[i];
            const matches = await doesRowMatchClause(whereClause, obj, async (nested: NestedWhere) => {
                const results = await this.search(nested.externalTable, nested.where);
                return results.map((row) => row[nested.externalField] ?? null);
            });

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
                update[field] !== null &&
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
        let newId = -1;
        
        for (const tableField in tableFields) {
            const fieldData = tableFields[tableField];
            // use field default or fallback to null, the insertData will override
            newObj[tableField] = fieldData.default || null;
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
                insertData[field] !== null &&
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