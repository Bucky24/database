import * as Connection from './connection';
export * from './connection';
import MemoryConnection from './memoryConnection';

let defaultConnection: Connection.Connection | null = null;

export function setDefaultConnection(connection: Connection.Connection | null) {
    defaultConnection = connection;
}

export function getDefaultConnection() {
    return defaultConnection;
}

export async function memoryConnection() {
    const connection = new MemoryConnection();
    await connection.init();
    return connection;
}