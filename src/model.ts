import { object, string, number, lazy, mixed, array } from "yup";

import { getDefaultConnection } from './connections';
import { WhereBuilder } from "./whereBuilder";
import { Field, FIELD_META, FIELD_TYPE, Fields } from "./types";
import type { Express, Request, RequestParamHandler, Response } from 'express';

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
                        foreign: object({
                            table: object().required(),
                            field: string().required(),
                        }).default(undefined),
                    }),
                };
            }, {}),
        });
    }),
    version: number().required().integer(),
});

interface ModelSettings {
    table: string;
    fields: Fields;
    version: number;
}

interface FieldWithId extends Field {
    id: string;
};

type Middleware = RequestParamHandler;

interface RouteOptions {
    middleware?: Middleware | Middleware[];
}

class Model {
    private table: string;
    private fields: Fields;
    private fieldList: FieldWithId[];
    private version: number;

    constructor(settings: ModelSettings) {
        this.table = settings.table;
        this.fields = settings.fields;
        this.fieldList = [];
        Object.keys(settings.fields).forEach((key: string) => {
            const field = settings.fields[key];
            this.fieldList.push({
                ...field,
                id: key,
            });
        });
        this.version = settings.version;
    }

    static create(settings: ModelSettings) {
        try {
            const { table, fields, version } = modelSchema.validateSync(settings);
            const model = new Model({ table, fields, version });

            return model;
        } catch (error: any) {
            throw new Error(`${error.message} with data ${JSON.stringify(settings)}`);
        }
    }

    createCrudApis(app: Express, options: RouteOptions = {}) {
        let middleware = options.middleware || [];
        if (!Array.isArray(middleware)) {
            middleware = [middleware];
        }
        const processBody = (req: Request, res: Response) => {
            if (!req.body) {
                res.status(400).json({
                    error: 'No json body detected',
                });
                return false;
            }
            const missingFields = [];
            for (const field of this.fieldList) {
                const fieldData = this.getFieldData(field.id);
                if (req.body[field.id] === undefined && fieldData?.meta.includes(FIELD_META.REQUIRED)) {
                    missingFields.push(field);
                }
            }

            const extraFields = [];
            for (const field in req.body) {
                if (!this.getFieldData(field)) {
                    extraFields.push(field);
                }
            }

            if (missingFields.length > 0 || extraFields.length > 0) {
                res.status(400).json({
                    missingFields,
                    extraFields,
                });
                return false;
            }

            return true;
        }
        app.get('/' + this.table, ...middleware, async (req, res) => {
            try {
                const objects = await this.search({});
                const filteredObjects = this.filterForExport(objects);

                res.status(200).json(filteredObjects);
            } catch (e) {
                console.error(e);
                res.status(500).end();
            }
        });

        app.get('/' + this.table + "/:id", ...middleware, async (req, res) => {
            try {
                const object = await this.get(req.params.id);
                if (!object) {
                    res.status(404).end();
                    return;
                }
                const filteredObject = this.filterForExport(object);

                res.status(200).json(filteredObject);
            } catch (e) {
                console.error(e);
                res.status(500).end();
            }
        });

        app.delete('/' + this.table + "/:id", ...middleware, async (req, res) => {
            try {
                const object = await this.get(req.params.id);
                if (!object) {
                    res.status(404).end();
                    return;
                }

                await this.delete(req.params.id);
                res.status(200).json({
                    id: req.params.id,
                });
            } catch (e) {
                console.error(e);
                res.status(500).end();
            }
        });

        app.post('/' + this.table, ...middleware, async (req, res) => {
            if (!processBody(req, res)) {
                return;
            }

            try {
                const id = await this.insert(req.body);
                const newData = await this.get(id);

                res.status(200).json(newData);
            } catch (e) {
                console.error(e);
                res.status(500).end();
            }
        });

        app.put('/' + this.table + '/:id', ...middleware, async (req, res) => {
            const { id } = req.params;
            if (!processBody(req, res)) {
                return;
            }

            try {
                await this.update(id, req.body);
                const newData = await this.get(id);

                res.status(200).json(newData);
            } catch (e) {
                console.error(e);
                res.status(500).end();
            }
        });
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

    getTable() {
        return this.table;
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

        let keys = [];
        if (queryData instanceof WhereBuilder) {
            keys = queryData.getAllFields();
        } else {
            keys = Object.keys(queryData);
        }

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