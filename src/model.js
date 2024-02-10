const { object, string, number, lazy, mixed, array } = require("yup");

const { getDefaultConnection, FIELD_TYPE, FIELD_META, ORDER } = require('./connections');

const modelSchema = object({
    table: string().required(),
    fields: lazy((obj) => {
        return object({
            ...Object.keys(obj).reduce((obj, key) => {
                return {
                    ...obj,
                    [key]: object({
                        type: mixed().oneOf(Object.values(FIELD_TYPE)).required(),
                        meta: array().of(mixed().oneOf(Object.values(FIELD_META)).required()),
                        size: number().positive().optional(),
                    }),
                };
            }, {}),
        });
    }),
    version: number().required().integer(),
});

class Model {
    static create(settings) {
        try {
            const { table, fields, version } = modelSchema.validateSync(settings);
            const model = new Model(settings);
            model.table = table;
            model.fields = {
                id: {
                    type: FIELD_TYPE.INT,
                    meta: [
                        FIELD_META.AUTO,
                    ],
                },
                ...fields,
            };
            model.fieldList = Object.keys(model.fields).map((key) => {
                const field = model.fields[key];
                return {
                    ...field,
                    id: key,
                };
            });
            model.version = version;

            return model;
        } catch (error) {
            throw new Error(`${error.message} with data ${JSON.stringify(settings)}`);
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
    
    async init() {
        const connection = getDefaultConnection();
        
        if (connection === null) {
            throw new Error('No default connection set');
        }

        return connection.initializeTable(this.table, this.fields, this.version);
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
            if (!data) {
                // remove the field-it's not part of our fieldset anymore
                delete result[key];
                return;
            }
            if (data.type === FIELD_TYPE.JSON) {
                result[key] = JSON.parse(value);
            } else if (data.type === FIELD_TYPE.BOOLEAN) {
                // assume it's 1 or 0
                result[key] = !!value;
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
        const connection = getDefaultConnection();
        
        if (connection === null) {
            throw new Error('No default connection set');
        }

        const result = await this.search({
            id,
        });

        if (result.length === 0) {
            return null;
        }

        return result[0];
    }
    
    async search(queryData = {}, order = null, limit = null, offset = null) {
        const connection = getDefaultConnection();
        
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

        const result = await connection.search(this.table, queryData, order, limit, offset);

        return result.map((item) => {
            return this.processResult(item);
        });
    }

    async count(queryData = {}) {
        const connection = getDefaultConnection();
        
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

        const result = await connection.count(this.table, queryData);

        return result;
    }
    
    async update(id, fields) {
        const connection = getDefaultConnection();
        
        if (connection === null) {
            throw new Error('No default connection set');
        }
        
        const keys = Object.keys(fields);
        for (let i=0;i<keys.length;i++) {
            const key = keys[i];
            const data = this.getFieldData(key);
            if (data === null) {
                throw new Error(`No such field '${key}'`);
            }
            const value = fields[key];
            if (value === null && data.meta.includes(FIELD_META.REQUIRED)) {
                throw new Error(`Field '${key}' cannot be set to null`);
            }

            fields[key] = this.processForSave(value, key);
        }

        const tableFields = Object.keys(this.fields);
        return await connection.update(this.table, id, fields, tableFields.reduce((obj, field) => {
            return {
                ...obj,
                [field]: this.getFieldData(field),
            };
        }));
    }
    
    async insert(insertData) {
        const connection = getDefaultConnection();
        
        if (connection === null) {
            throw new Error('No default connection set');
        }

        const keys = Object.keys(insertData);
        for (let i=0;i<keys.length;i++) {
            const key = keys[i];
            const data = this.getFieldData(key);
            if (data === null) {
                throw new Error(`No such field '${key}'`);
            }
            const value = insertData[key];
            if (value === null && data.meta.includes(FIELD_META.REQUIRED)) {
                throw new Error(`Field '${key}' cannot be set to null`);
            }

            insertData[key] = this.processForSave(value, key);
        }

        const tableFields = Object.keys(this.fields);
        for (let i=0;i<tableFields.length;i++) {
            const key = tableFields[i];
            const fieldData = this.getFieldData(key);
            if (fieldData.meta.includes(FIELD_META.REQUIRED) && (insertData[key] === null || insertData[key] === undefined)) {
                throw new Error(`Required field '${key}' not found`);
            }
        }

        return connection.insert(this.table, tableFields.reduce((obj, field) => {
            return {
                ...obj,
                [field]: this.getFieldData(field),
            };
        }, {}), insertData);
    }

    async delete(id) {
        const connection = getDefaultConnection();
        
        if (connection === null) {
            throw new Error('No default connection set');
        }

        return connection.delete(this.table, id);
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