import { fileURLToPath } from "url";
import path from "path";
import fs from 'fs';

import { Connection, fileConnection, getDefaultConnection, memoryConnection, mysqlConnection, postgresConnection, setDefaultConnection } from "../src/connections/server";
import mysqlAuth from './db_mysql.json';
import postgresAuth from './db_postgres.json';
import MysqlConnection from "../src/connections/server/mysqlConnection";
import PostgresConnection from "../src/connections/server/postgresConnection";
import MemoryConnection from "../src/connections/common/memoryConnection";

interface ConnectionData {
    setup: () => Promise<Connection>,
    teardown: () => Promise<void>,
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cachePath = path.join(__dirname, 'cache_dir');

export function forConnections(cb: () => Promise<void>): void {
    const connections: { [key: string]: ConnectionData}  = {
        'memory': {
            setup: () => {
                return memoryConnection();
            },
            teardown: async () => {
                const connection = getDefaultConnection() as MemoryConnection;
                if (connection) {
                    connection.reset();
                }
            },
        },
        'file': {
            setup: () => {
                return fileConnection(cachePath);
            },
            teardown: async () => {
                if (fs.existsSync(cachePath)) {
                    fs.rmSync(cachePath, { recursive: true });
                }
            },
        },
        'mysql': {
            setup: () => {
                return mysqlConnection({
                    host: mysqlAuth.host,
                    username: mysqlAuth.username,
                    password: mysqlAuth.password,
                    database: mysqlAuth.database,
                });
            },
            teardown: async() => {
                const connection = getDefaultConnection() as MysqlConnection;
                if (connection) {
                    try {
                        await connection._query("SET FOREIGN_KEY_CHECKS = 0;");
                        // try to drop all tables
                        const query = "SELECT concat('DROP TABLE IF EXISTS `', table_name, '`;') as `drop` FROM information_schema.tables WHERE table_schema = '" + mysqlAuth.database + "';"
                    
                        const tableDropStatements = await connection._query(query);

                        for (const dropStatement of tableDropStatements) {
                            await connection._query(dropStatement.drop);
                        }
                        await connection._query("SET FOREIGN_KEY_CHECKS = 1;");
                    } catch (err) {
                        console.error(err);
                    }
                    await connection.close();
                }
            }
        },
        'postgres': {
            setup: () => {
                return postgresConnection({
                    host: postgresAuth.host,
                    username: postgresAuth.username,
                    password: postgresAuth.password,
                    database: postgresAuth.database,
                    port: parseInt(postgresAuth.port),
                });
            },
            teardown: async() => {
                const connection = getDefaultConnection() as PostgresConnection;
                if (connection) {
                    try {
                        // try to drop all tables
                        const query = "SELECT tablename, concat('DROP TABLE IF EXISTS \"', tablename, '\";') as drop FROM pg_catalog.pg_tables WHERE schemaname = 'public';";
                    
                        const tableDropStatements = await connection._query(query);

                        for (const dropStatement of tableDropStatements.rows) {
                            // get all constraints for this table
                            const results = await connection._query(`SELECT con.conname
                            FROM pg_catalog.pg_constraint con
                                 INNER JOIN pg_catalog.pg_class rel
                                            ON rel.oid = con.conrelid
                                 INNER JOIN pg_catalog.pg_namespace nsp
                                            ON nsp.oid = connamespace
                            WHERE nsp.nspname = 'public'
                                  AND rel.relname = '${dropStatement.tablename}';`);
                            for (const result of results.rows) {
                                // can't drop primary keys very easily
                                if (result.conname.includes("pkey")) {
                                    continue;
                                }
                                await connection._query(`ALTER TABLE "${dropStatement.tablename}" DROP CONSTRAINT "${result.conname}"`);
                            }
                        }

                        for (const dropStatement of tableDropStatements.rows) {
                            await connection._query(dropStatement.drop);
                        }
                    } catch (err) {
                        console.error(err);
                    }
                    await connection.close();
                }
            }
        },
    };

    for (const connectionType in connections) {
        const connectionActions = connections[connectionType];
        describe(connectionType, async () => {
            beforeEach(async () => {
                const connection = await connectionActions.setup();
                setDefaultConnection(connection);
            });

            afterEach(async () => {
                await connectionActions.teardown();
                setDefaultConnection(null);
            });

            cb();
        });
    }
}