import { Connection } from './connection';

let defaultConnection: Connection | null = null;

export function setDefaultConnection(connection: Connection | null) {
    defaultConnection = connection;
}

export function getDefaultConnection() {
    return defaultConnection;
}