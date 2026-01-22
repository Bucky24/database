// cannot export * or else vite get super confused and tries to pull mysql
// because VITE IS STUPID
export { Connection, setLog } from '../common/connection';
export { setDefaultConnection } from '../common/default';
import { default as MemoryConnection }  from '../common/memoryConnection';

export async function memoryConnection() {
    const connection = new MemoryConnection();
    await connection.init();
    return connection;
}