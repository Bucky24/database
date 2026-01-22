import FileConnection from './fileConnection';
import PostgresConnection, { PostgresConnectionObject, PostgresConnectionUrl } from "./postgresConnection";
export * from '../common/connection';
export * from '../common/default';
import MysqlConnection, { MysqlConnectionObject, MysqlConnectionUrl } from './mysqlConnection';
import MemoryConnection from '../common/memoryConnection';

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