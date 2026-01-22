import { Connection } from "../..";

let defaultConnection: Connection.Connection | null = null;

export function setDefaultConnection(connection: Connection.Connection | null) {
    defaultConnection = connection;
}

export function getDefaultConnection() {
    return defaultConnection;
}