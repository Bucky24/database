import FileConnection from './fileConnection';
import PostgresConnection, { PostgresConnectionObject, PostgresConnectionUrl } from "./postgresConnection";
import * as Connection from './connection';
export * from './connection';
import MysqlConnection, { MysqlConnectionObject, MysqlConnectionUrl } from './mysqlConnection';
import MmeoryConnection from './memoryConnection';
import MemoryConnection from './memoryConnection';

let defaultConnection: Connection.Connection | null = null;

export function setDefaultConnection(connection: Connection.Connection | null) {
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

export async function memoryConnection() {
    const connection = new MemoryConnection();
    await connection.init();
    return connection;
}

export async function mysqlConnection(data: MysqlConnectionObject | MysqlConnectionUrl) {
    const connection = new MysqlConnection(data);
    await connection.init();
    return connection;
}

export async function postgresConnection(data: PostgresConnectionObject | PostgresConnectionUrl) {
    const connection = new PostgresConnection(data);
    await connection.init();
    return connection;
}