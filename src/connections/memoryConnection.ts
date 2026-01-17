import { FIELD_META, FIELD_TYPE, Fields, IndexSettings, NestedObject, ORDER, OrderObj } from '../types';
import { WhereBuilder } from '../whereBuilder';
import { Connection } from './connection';
import { doesRowMatchClause } from './helpers';

type MemoryData = {
    [tableName: string]: {
        fields: Fields,
        rows: any[],
        auto: {
            [field: string]: number,
        },
    },
};

export default class MemoryConnection extends Connection {
    private static memoryData: MemoryData = {};
    createConnection() {}

    async initializeTable(tableName: string, fields: Fields, version: number, indexes: IndexSettings[] = []) {
        MemoryConnection.memoryData[tableName] = {
            fields,
            rows: [],
            auto: {},
        };
    }

    async insert(tableName: string, tableFields: Fields, insertData: NestedObject): Promise<number> {
        if (!MemoryConnection.memoryData[tableName]) {
            throw new Error(`Model ${tableName} has not been intialized`);
        }

        const data = MemoryConnection.memoryData[tableName];

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

        if (newId === null) {
            throw new Error('could not generate id');
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
        
        data.rows.push(newObj);

        return newId;
    }

    async search(tableName: string, whereClause: WhereBuilder | NestedObject, order?: OrderObj, limit?: number, offset?: number): Promise<any[]> {
        let matching = [];

        const startRow = offset || 0;

        if (!MemoryConnection.memoryData[tableName]) {
            throw new Error(`Model ${tableName} has not been intialized`);
        }

        const data = MemoryConnection.memoryData[tableName];
        for (let i=startRow;i<data.rows.length;i++) {
            const obj = data.rows[i];
            const matches = doesRowMatchClause(whereClause, obj);

            if (matches) {
                matching.push({...obj});
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

    async delete(tableName: string, id: number) {
        if (!MemoryConnection.memoryData[tableName]) {
            throw new Error(`Model ${tableName} has not been intialized`);
        }

        const data = MemoryConnection.memoryData[tableName];
        for (let i=0;i<data.rows.length;i++) {
            const obj = data.rows[i];
            if (obj.id == id) {
                data.rows.splice(i, 1);
                break;
            }
        }
    }

    async count(tableName: string, whereClause: WhereBuilder | NestedObject): Promise<number> {
        const rows = await this.search(tableName, whereClause);
        return rows.length;
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

        if (!MemoryConnection.memoryData[tableName]) {
            throw new Error(`Model ${tableName} has not been intialized`);
        }

        const data = MemoryConnection.memoryData[tableName];
        for (let i=0;i<data.rows.length;i++) {
            const obj = data.rows[i];
            if (obj.id == id) {
                Object.keys(update).forEach((key) => {
                    obj[key] = update[key];
                });
                break;
            }
        }

        return id;
    }
}