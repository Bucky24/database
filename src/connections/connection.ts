import { Fields, NestedObject, OrderObj } from "../types";
import { WhereBuilder } from "../whereBuilder";

let allowLog = true;

export function setLog(log: boolean) {
    allowLog = log;
}

export class Connection {
    protected connection: any;
    protected prefix: string | null;

    constructor(prefix: string | null = null) {
        this.connection = null;
        this.prefix = prefix;
    }

    init() {
        return this.createConnection();
    }

    createConnection() {
        throw new Error("Connection must override createConnection");
    }
    
    async getConnection() {
        if (!this.connection) {
            this.log('connecting again');
            this.connection = await this.createConnection();
        }
        return this.connection;
    }

    log(message: string) {
        if (!allowLog) {
            return;
        }
        console.log(message);
    }

    getTable(table: string) {
        if (!this.prefix) {
            return table;
        }
        return `${this.prefix}_${table}`;
    }

    close() {
        throw new Error("Connection must override close");
    }

    async initializeTable(tableName: string, fields: Fields, version: number) {
        throw new Error("Connection must override initalizeTable");
    }

    async search(tableName: string, whereClause: WhereBuilder | NestedObject, order?: OrderObj | null, limit?: number | null, offset?: number | null): Promise<any[]> {
        throw new Error("Connection must override search");
    }

    async update(tableName: string, id: number | string, update: NestedObject, tableFields: Fields): Promise<any> {
        throw new Error("Connection must override update");
    }

    async insert(tableName: string, tableFields: Fields, insertData: NestedObject): Promise<number> {
        throw new Error("Connection must override insert");
    }

    async delete(tableName: string, id: number | string) {
        throw new Error("Connection must override delete");
    }

    async count(tableName: string, whereClause: WhereBuilder | NestedObject): Promise<number> {
        throw new Error('Connection must override count');
    }
}