/**
 * Warning: This test requires an active and working mysql database. It expects a file, db_mysql.json, to exist with the following keys:
 * host, database, username, password, url
 * This test WILL truncate the entire database once it's done
 */

import assert from 'assert';
import { Model } from '../src/model';
import { FIELD_TYPE } from '../src/types';
import { mysqlConnection, setDefaultConnection, getDefaultConnection } from '../src/connections/server';
import dbAuth from './db_mysql.json';
import MysqlConnection from '../src/connections/server/mysqlConnection';


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
    return mysqlConnection({
        host: dbAuth.host,
        username: dbAuth.username,
        password: dbAuth.password,
        database: dbAuth.database,
    });
}

const teardown = async () => {
    const connection = getDefaultConnection() as MysqlConnection;
    if (connection) {
        try {
            await connection._query("SET FOREIGN_KEY_CHECKS = 0;");
            // try to drop all tables
            const query = "SELECT concat('DROP TABLE IF EXISTS `', table_name, '`;') as `drop` FROM information_schema.tables WHERE table_schema = '" + dbAuth.database + "';"

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

describe('indexes_mysql', () => {
    let connection: MysqlConnection;

    before(async () => {
        // Connect to MySQL using credentials from db_mysql.json
        connection = await mysqlConnection({ url: dbAuth.url });
    });

    after(async () => {
        // Clean up the connection when all tests are done
        await teardown();
    });

    beforeEach(async () => {
        // Truncate all tables before each test to isolate state
        const rows = await connection._query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = DATABASE();
    `);
        for (const { table_name } of rows as any[]) {
            await connection._query(`DROP TABLE IF EXISTS \`${table_name}\`;`);
        }
                        connection = await setup();
                        setDefaultConnection(connection);
    });
    it('should create a simple index without error', async () => {
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
        //confirm index exists
        const indexResult = await connection._query(`
    SELECT index_name 
    FROM information_schema.statistics 
    WHERE table_schema = DATABASE() 
      AND table_name = 'indexed_table' 
      AND index_name = 'indexed_table_username_idx';
  `);

        assert.equal(indexResult.length, 1);
    });

    it('should create a compound index across multiple fields', async () => {
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

        // Query MySQL metadata to confirm the index exists and spans both fields
        const result = await connection._query(`
    SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() 
      AND table_name = 'compound_index_table'
    GROUP BY index_name;
  `);

        const compoundIndex = result.find(
            (row: any) => row.columns === 'first_name,last_name'
        );
        assert.ok(compoundIndex, 'Compound index on (first_name, last_name) should exist');
        assert.equal(compoundIndex['INDEX_NAME'], 'compound_index_table_first_name_last_name_idx');
        //verify the index spans two columns
        assert.equal(compoundIndex.columns.split(',').length, 2);

        await model.insert({ first_name: 'John', last_name: 'Doe', age: 30 });
        await model.insert({ first_name: 'Jane', last_name: 'Doe', age: 25 });

        const results = await model.search({ last_name: 'Doe' });
        assert.equal(results.length, 2);
    });

    it('should enforce unique index constraint if defined', async () => {
        const model = Model.create({
            table: 'unique_index_table',
            fields: {
                email: { type: FIELD_TYPE.STRING, size: 100},
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
                username: { type: FIELD_TYPE.STRING, size: 100},
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

    it('should not duplicate an existing index when re-initialized with the same version', async () => {
        const model = Model.create({
            table: 'no_duplicate_index_table',
            fields: {
                username: { type: FIELD_TYPE.STRING, size: 100 },
            },
            indexes: [{ fields: ['username']}],
            version: 1,
        });

        await model.init();
        await model.init(); // re-init shouldn't recreate index

        const indexes = await connection._query(`
  SHOW INDEXES FROM no_duplicate_index_table;
`);

        const result = await connection._query(`
        SELECT COUNT(*) AS count 
        FROM information_schema.statistics 
        WHERE table_schema = DATABASE() AND table_name = 'no_duplicate_index_table' 
        AND index_name = 'no_duplicate_index_table_username_idx';
    `);

        assert.equal(result[0].count, 1);
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
    it('should create a name for index if not provided', async () => {
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

        const result = await connection._query(`
    SELECT index_name 
    FROM information_schema.statistics 
    WHERE table_schema = DATABASE() 
      AND table_name = 'auto_name_index_table' 
      AND index_name = 'auto_name_index_table_email_idx';
  `);

        assert.equal(result.length, 1);
        assert.equal(result[0]['INDEX_NAME'], 'auto_name_index_table_email_idx');
    });

    it('should create index with custom name if provided', async () => {
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

        const result = await connection._query(`
    SELECT index_name 
    FROM information_schema.statistics 
    WHERE table_schema = DATABASE() 
      AND table_name = 'custom_name_index_table' 
      AND index_name = 'my_custom_email_index';
  `);

        assert.equal(result.length, 1);
        assert.equal(result[0]['INDEX_NAME'], 'my_custom_email_index');
    });
});
