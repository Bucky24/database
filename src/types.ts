
export enum CONNECTION_TYPE {
    MYSQL='connection/mysql',
    FILE='connection/file',
    POSTGRES='connection/postgres',
};

export enum FIELD_TYPE {
    INT='type/int',
    STRING='type/string',
    BIGINT='type/big_int',
    JSON='type/json',
    BOOLEAN='type/boolean',
};

export enum FIELD_META {
    AUTO='meta/auto',
    REQUIRED='meta/required',
    FILTERED='meta/filtered',
};

export enum ORDER {
    ASC='order/asc',
    DESC='order/desc',
};

interface ModelSearchFunc {
    (search: NestedObject): Promise<any>
}

interface ModelGetTableFunc {
    (): string;
}
// model imports this file so we cannot have Model be imported here
// so just stub the methods
export interface ModelStub {
    search: ModelSearchFunc;
    getTable: ModelGetTableFunc;
}

export interface Field {
    type: FIELD_TYPE;
    meta?: FIELD_META[];
    size?: number;
    foreign?: {
        table: ModelStub;
        field: string;
    };
}

export interface FieldWithForeign extends Field {
    localField: string;
    foreign: {
        table: ModelStub;
        field: string;
    };
}

export interface Fields {
    [key: string]: Field;
}

export interface NestedObject {
    [key: string]: any | any[];
}

export interface OrderObj {
    [key: string]: ORDER;
}

export interface IndexSettings {
    name?: string;
    fields: string[];
    unique?: boolean;
}