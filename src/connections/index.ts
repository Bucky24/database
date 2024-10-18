import FileConnection from './fileConnection';
import PostgresConnection, { PostgresConnectionUrl } from "./postgresConnection";
import * as Connection from './connection';
export * from './connection';
import MysqlConnection, { MysqlConnectionObject, MysqlConnectionUrl } from './mysqlConnection';
import { ClientConfig } from 'pg';

let defaultConnection: Connection.Connection | null = null;

export function setDefaultConnection(connection: Connection.Connection) {
    defaultConnection = connection;
}

export function getDefaultConnection() {
    return defaultConnection;
}

export async function fileConnection(cacheDir: string) {
    const connection = new FileConnection(cacheDir);
    await connection.init();
    return connection;
}

export async function mysqlConnection(data: MysqlConnectionObject | MysqlConnectionUrl) {
    const connection = new MysqlConnection(data);
    await connection.init();
    return connection;
}

export async function postgresConnection(data: ClientConfig | PostgresConnectionUrl) {
    const connection = new PostgresConnection(data);
    await connection.init();
    return connection;
}