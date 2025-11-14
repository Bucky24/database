/**
 * Warning: This test requires an active and working postgresql database. It expects a file, db_postgres.json, to exist with the following keys:
 * host, database, username, password, port, url
 * This test WILL truncate the entire database once it's done
 */

import assert from 'assert';
import { Model } from '../src/model';
import { FIELD_TYPE } from '../src/types';
import { postgresConnection, setDefaultConnection, getDefaultConnection } from '../src/connections';
import dbAuth from './db_postgres.json';
import PostgresConnection from '../src/connections/postgresConnection';

const assertThrows = async (fn: Function, message?: string) => {
    let error: Error | null = null;
    try {
        await fn();
    } catch (e: any) {
        error = e;
    }

    assert(error !== null);
    if (message && error) {
        assert.strictEqual(error.message, message);
    }
}

const setup = () => {
    return postgresConnection({
        host: dbAuth.host,
        username: dbAuth.username,
        password: dbAuth.password,
        database: dbAuth.database,
        port: dbAuth.port,
    });
}

const teardown = async () => {
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

describe('index->Postgres', () => {
    let connection: PostgresConnection;

    beforeEach(async () => {
        connection = await setup();
        setDefaultConnection(connection);
    });

    afterEach(async () => {
        await teardown();
    });

    it('shoud create a simple index without errors', async () => {
        const model = Model.create({
            table: 'indexed_table',
            fields: {
                username: { type: FIELD_TYPE.STRING, size: 100 },
                email: { type: FIELD_TYPE.STRING, size: 100 },
            },
            indexes: [
                { fields: ['username'] },
            ],
            version: 1,
        });
        await model.init();
        const id = await model.insert({ username: 'mike', email: 'mike@test.com' });
        const data = await model.search({ username: 'mike' });

        assert.deepStrictEqual(data, [
            { id, username: 'mike', email: 'mike@test.com' },
        ]);
    });
    it('should create a compound index across multiple fields (PostgreSQL)', async () => {
        const model = Model.create({
            table: 'compound_index_table',
            fields: {
                first_name: { type: FIELD_TYPE.STRING, size: 100 },
                last_name: { type: FIELD_TYPE.STRING, size: 100 },
                age: { type: FIELD_TYPE.INT },
            },
            indexes: [
                { fields: ['first_name', 'last_name'] },
            ],
            version: 1,
        });

        await model.init();

        // Query PostgreSQL system catalog to confirm the index exists and spans both fields
        const result = await connection._query(`
        SELECT
            i.relname AS index_name,
            string_agg(a.attname, ',' ORDER BY x.seqnum) AS columns
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, seqnum) ON true
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
        WHERE n.nspname = 'public'
          AND t.relname = 'compound_index_table'
        GROUP BY i.relname;
    `);

        const compoundIndex = result.rows.find(
            (row: any) => row.columns === 'first_name,last_name'
        );

        assert.ok(
            compoundIndex,
            'Compound index on (first_name, last_name) should exist'
        );

        // Insert test data
        await model.insert({ first_name: 'John', last_name: 'Doe', age: 30 });
        await model.insert({ first_name: 'Jane', last_name: 'Doe', age: 25 });

        const results = await model.search({ last_name: 'Doe' });
        assert.equal(results.length, 2);
    });
    it('should enforce unique index constraint if defined', async () => {
        const model = Model.create({
            table: 'unique_index_table',
            fields: {
                email: { type: FIELD_TYPE.STRING, size: 100 },
            },
            indexes: [
                { fields: ['email'], unique: true },
            ],
            version: 1,
        });

        await model.init();

        await model.insert({ email: 'unique@test.com' });

        // inserting duplicate should throw
        await assertThrows(async () => {
            await model.insert({ email: 'unique@test.com' });
        });
    });

    it('should allow multiple different indexed values', async () => {
        const model = Model.create({
            table: 'multi_index_table',
            fields: {
                username: { type: FIELD_TYPE.STRING, size: 100 },
            },
            indexes: [
                { fields: ['username'], unique: true },
            ],
            version: 1,
        });

        await model.init();

        await model.insert({ username: 'mike' });
        await model.insert({ username: 'john' });

        const data = await model.search({});
        assert.equal(data.length, 2);
    });

    it('should enforce unique constraint across multiple fields in a compound index', async () => {
        const model = Model.create({
            table: 'compound_unique_index_table',
            fields: {
                first_name: { type: FIELD_TYPE.STRING, size: 100 },
                last_name: { type: FIELD_TYPE.STRING, size: 100 },
            },
            indexes: [
                { fields: ['first_name', 'last_name'], unique: true },
            ],
            version: 1,
        });

        await model.init();

        await model.insert({ first_name: 'John', last_name: 'Doe' });
        await model.insert({ first_name: 'Jane', last_name: 'Doe' });

        // inserting duplicate compound key should throw
        await assertThrows(async () => {
            await model.insert({ first_name: 'John', last_name: 'Doe' });
        });
    });

    it('should still work after adding new index in later version', async () => {
        const modelV1 = Model.create({
            table: 'versioned_index_table',
            fields: {
                name: { type: FIELD_TYPE.STRING, size: 100 },
            },
            version: 1,
        });

        await modelV1.init();
        await modelV1.insert({ name: 'before_index' });

        const modelV2 = Model.create({
            table: 'versioned_index_table',
            fields: {
                name: { type: FIELD_TYPE.STRING },
            },
            indexes: [
                { fields: ['name'] },
            ],
            version: 2,
        });

        await modelV2.init();
        await modelV2.insert({ name: 'after_index' });


        const results = await modelV2.search({});

        assert.deepStrictEqual(results.map(r => r.name).sort(), ['after_index', 'before_index']);
    });

    it('should not duplicate an existing index when re-initialized with the same version (Postgres)', async () => {
        const model = Model.create({
            table: 'no_duplicate_index_table',
            fields: {
                username: { type: FIELD_TYPE.STRING, size: 100 },
            },
            indexes: [{ fields: ['username'] }],
            version: 1,
        });

        await model.init();
        await model.init(); // re-init shouldn't recreate index

        // Query Postgres system catalogs to check indexes on this table
        const result = await connection._query(`
        SELECT i.relname AS index_name,
               string_agg(a.attname, ',' ORDER BY x.seqnum) AS columns
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, seqnum) ON true
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
        WHERE n.nspname = 'public'
          AND t.relname = 'no_duplicate_index_table'
        GROUP BY i.relname;
    `);

        // Count how many indexes exist with the expected name
        const matchingIndexes = result.rows.filter(
            (row: any) => row.index_name === 'no_duplicate_index_table_username_idx'
        );

        assert.equal(
            matchingIndexes.length,
            1,
            'Index should not be duplicated after re-initialization'
        );
    });

    it('should throw error when creating index on non-existent field', async () => {
        const model = Model.create({
            table: 'invalid_index_table',
            fields: {
                name: { type: FIELD_TYPE.STRING, size: 100 },
            },
            indexes: [
                { fields: ['non_existent_field'], name: 'invalid_index_table_non_existent_field_idx ' },
            ],
            version: 1,
        });

        await assertThrows(async () => {
            await model.init();
        }, `Cannot create index 'invalid_index_table_non_existent_field_idx ': field 'non_existent_field' does not exist in model 'invalid_index_table'`);
    });

    it('should create a name for index if not provided (Postgres)', async () => {
        const model = Model.create({
            table: 'auto_name_index_table',
            fields: {
                email: { type: FIELD_TYPE.STRING, size: 100 },
            },
            indexes: [
                { fields: ['email'] },
            ],
            version: 1,
        });

        await model.init();

        // Query Postgres system catalogs to check if the auto-named index exists
        const result = await connection._query(`
        SELECT i.relname AS index_name,
               string_agg(a.attname, ',' ORDER BY x.seqnum) AS columns
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, seqnum) ON true
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
        WHERE n.nspname = 'public'
          AND t.relname = 'auto_name_index_table'
        GROUP BY i.relname;
    `);

        const autoIndex = result.rows.find(
            (row: any) => row.index_name === 'auto_name_index_table_email_idx'
        );

        assert.ok(autoIndex, 'Auto-named index should exist');
        assert.equal(autoIndex.index_name, 'auto_name_index_table_email_idx');
    });

    it('should create index with custom name if provided (Postgres)', async () => {
        const model = Model.create({
            table: 'custom_name_index_table',
            fields: {
                email: { type: FIELD_TYPE.STRING, size: 100 },
            },
            indexes: [
                { fields: ['email'], name: 'my_custom_email_index' },
            ],
            version: 1,
        });

        await model.init();

        // Query Postgres system catalogs to check for the custom-named index
        const result = await connection._query(`
        SELECT i.relname AS index_name,
               string_agg(a.attname, ',' ORDER BY x.seqnum) AS columns
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, seqnum) ON true
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
        WHERE n.nspname = 'public'
          AND t.relname = 'custom_name_index_table'
        GROUP BY i.relname;
    `);

        const customIndex = result.rows.find(
            (row: any) => row.index_name === 'custom_name_index_table_my_custom_email_index_idx'
        );
        assert.ok(customIndex, 'Custom-named index should exist');
        assert.equal(customIndex.index_name, 'custom_name_index_table_my_custom_email_index_idx');
    });

});