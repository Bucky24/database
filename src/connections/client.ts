export * from './connection';
export * from './default';
import MemoryConnection from './memoryConnection';

export async function memoryConnection() {
    const connection = new MemoryConnection();
    await connection.init();
    return connection;
}