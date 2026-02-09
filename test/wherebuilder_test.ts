import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import {
    Connection,
    fileConnection,
    getDefaultConnection,
    memoryConnection,
    mysqlConnection,
    postgresConnection,
    setDefaultConnection,
    setLog,
} from '../src/connections/server';
import MysqlConnection from '../src/connections/server/mysqlConnection';
import PostgresConnection from '../src/connections/server/postgresConnection';
import { Model } from '../src/model';
import { FIELD_TYPE } from '../src/types';
import { WHERE_COMPARE, WhereBuilder } from '../src/whereBuilder';
import mysqlAuth from './db_mysql.json';
import postgresAuth from './db_postgres.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cachePath = path.join(__dirname, 'cache_dir');

interface ConnectionData {
    setup: () => Promise<Connection>,
    teardown: () => Promise<void>,
}

describe('WhereBuilder', async () => {  
    setLog(false);

    const connections: { [key: string]: ConnectionData}  = {
        'memory': {
            setup: () => {
                return memoryConnection();
            },
            teardown: async () => {

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
            let model: Model;

            beforeEach(async () => {
                const connection = await connectionActions.setup();
                setDefaultConnection(connection);

                model = Model.create({
                    table: "table", 
                    fields: {
                        foo: {
                            type: FIELD_TYPE.STRING,
                        },
                        bar: {
                            type: FIELD_TYPE.INT,
                        }
                    },
                    version: 1,
                });
                await model.init();
                await model.insert({ foo: 'foo1', bar: 5 });
                await model.insert({ foo: 'foo2', bar: 10 });
                await model.insert({ foo: 'foo3', bar: 15 });
            });

            afterEach(async () => {
                await connectionActions.teardown();
                setDefaultConnection(null);
            });

            it('should handle eq', async () => {
                const rows = await model.search(WhereBuilder.new()
                    .compare("foo", WHERE_COMPARE.EQ, "foo2")
                );
                assert.equal(rows.length, 1);
                assert.equal(rows[0]['foo'], 'foo2');
            });

            it('should handle ne', async () => {
                const rows = await model.search(WhereBuilder.new()
                    .compare("foo", WHERE_COMPARE.NE, "foo2")
                );
                assert.equal(rows.length, 2);
                assert.equal(rows[0]['foo'], 'foo1');
                assert.equal(rows[1]['foo'], 'foo3');
            });

            it('should handle lt', async () => {
                const rows = await model.search(WhereBuilder.new()
                    .compare("bar", WHERE_COMPARE.LT, 15)
                );
                assert.equal(rows.length, 2);
                assert.equal(rows[0]['bar'], 5);
                assert.equal(rows[1]['bar'], 10);
            });

            it('should handle lte', async () => {
                const rows = await model.search(WhereBuilder.new()
                    .compare("bar", WHERE_COMPARE.LTE, 10)
                );
                assert.equal(rows.length, 2);
                assert.equal(rows[0]['bar'], 5);
                assert.equal(rows[1]['bar'], 10);
            });

            it('should handle gt', async () => {
                const rows = await model.search(WhereBuilder.new()
                    .compare("bar", WHERE_COMPARE.GT, 5)
                );
                assert.equal(rows.length, 2);
                assert.equal(rows[0]['bar'], 10);
                assert.equal(rows[1]['bar'], 15);
            });

            it('should handle gte', async () => {
                const rows = await model.search(WhereBuilder.new()
                    .compare("bar", WHERE_COMPARE.GTE, 10)
                );
                assert.equal(rows.length, 2);
                assert.equal(rows[0]['bar'], 10);
                assert.equal(rows[1]['bar'], 15);
            });

            it('should handle an AND clause', async () => {
                const rows = await model.search(WhereBuilder.new()
                    .and((builder: WhereBuilder) => {
                        builder.compare("bar", WHERE_COMPARE.LT, 15)
                        .compare("bar", WHERE_COMPARE.GT, 5);
                    })
                );
                assert.equal(rows.length, 1);
                assert.equal(rows[0]['bar'], 10);
            });

            it('should handle an OR clause', async () => {
                const rows = await model.search(WhereBuilder.new()
                    .or((builder) => {
                        builder.compare("bar", WHERE_COMPARE.EQ, 15)
                        .compare("bar", WHERE_COMPARE.EQ, 5);
                    })
                );
                assert.equal(rows.length, 2);
                assert.equal(rows[0]['bar'], 5);
                assert.equal(rows[1]['bar'], 15);
            });

            it('should handle a complex clause', async () => {
                const rows = await model.search(WhereBuilder.new()
                    .and((builder) => {
                        builder.or((builder) => {
                            builder.compare("foo", WHERE_COMPARE.EQ, "foo1")
                            .compare("foo", WHERE_COMPARE.EQ, "foo2");
                        })
                        .or((builder) => {
                            builder.compare("bar", WHERE_COMPARE.EQ, 10)
                            .compare("bar", WHERE_COMPARE.EQ, 15);
                        });
                    })
                );
                assert.equal(rows.length, 1);
                assert.equal(rows[0]['bar'], 10);
            });

            it('should handle a camelCase key', async () => {
                const model2 = Model.create({
                    table: "table2", 
                    fields: {
                        fooBar: {
                            type: FIELD_TYPE.INT,
                        },
                    },
                    version: 1,
                });
                await model2.init();
                await model2.insert({ fooBar: 5 });
                const rows = await model2.search(WhereBuilder.new().compare('fooBar', WHERE_COMPARE.EQ, 5));
                assert.equal(rows.length, 1);
                assert.equal(rows[0]['fooBar'], 5);
            });
        });
    }
});