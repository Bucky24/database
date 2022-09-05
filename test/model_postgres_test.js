/**
 * Warning: This test requires an active and working mysql database. It expects a file, db_mysql.json, to exist with the following keys:
 * host, database, username, password
 * This test WILL truncate the entire database once it's done
 */

 const assert = require('assert');
 
 const { Model, FIELD_META, FIELD_TYPE, ORDER } = require('../src/model');
 const { Connection } = require('../src/connection');
 const dbAuth = require('./db_postgres.json');
 
 describe('model->Postgres', () => {
    let connection;
    let model;
    const version = 1;

    before(async () => {
        connection = await Connection.postgresConnection({
            host: dbAuth.host,
            username: dbAuth.username,
            password: dbAuth.password,
            database: dbAuth.database,
            port: dbAuth.port,
        });
        Connection.setDefaultConnection(connection);

        model = new Model(
            'test_1',
            {
                foo: {
                    type: FIELD_TYPE.INT,
                    meta: [FIELD_META.REQUIRED],
                },
                bar: {
                    type: FIELD_TYPE.STRING,
                },
                json: {
                    type: FIELD_TYPE.JSON,
                }
            },
            version,
        );
    });

    after(async () => {
        // try to drop all tables
        const query = "SELECT concat('DROP TABLE IF EXISTS \"', tablename, '\";') as drop FROM pg_catalog.pg_tables WHERE schemaname = 'public';";
    
        const tableDropStatements = await Model.query(query);

        for (const dropStatement of tableDropStatements) {
            await Model.query(dropStatement.drop);
        }

        connection.close();
    });

    afterEach(async () => {
        const query = "DELETE FROM test_1";

        await Model.query(query);
        await Model.query('ALTER SEQUENCE test_1_id_seq RESTART WITH 1');
    });

    it('should create the new table as expected', async () => {
        await model.initTable();

        const getTablesQuery = "SELECT * FROM pg_catalog.pg_tables WHERE schemaname = 'public'";
        const tables = await Model.query(getTablesQuery);
        const tableMap = tables.reduce((obj, tableData) => {
            const name = tableData.tablename;
            return {
                ...obj,
                [name]: tableData,
            };
        }, {});

        const tableNames = Object.keys(tableMap);

        assert.equal(tableNames.includes('test_1'), true, 'expected table list to contain "test_1"');
    });

    /*it('should insert the correct version into the table', async () => {
        await model.initTable();

        const getVersionsQuery = "SELECT * FROM table_versions";
        const versions = await Model.query(getVersionsQuery);
        const tableMap = versions.reduce((obj, tableData) => {
            const name = tableData.name;
            return {
                ...obj,
                [name]: tableData.version,
            };
        }, {});

        assert.equal(tableMap['test_1'], version);
    });

    it('should insert and return new insert id', async () => {
        let id = await model.insert({
            foo: 5,
            bar: 'baz',
        });

        assert.equal(id, 1, 'expected first insert id to be 1');
        id = await model.insert({
            foo: 6,
            bar: 'bal',
        });

        assert.equal(id, 2, 'expected second insert id to be 2');
    });

    it('should be able to fetch new inserted rows by id', async () => {
        const id = await model.insert({
            foo: 7,
            bar: 'abc',
            json: { foo: 'bar' },
        });

        const row = await model.get(id);

        assert.deepEqual(row, {
            id,
            foo: 7,
            bar: 'abc',
            json: { foo: 'bar' },
        });
    });

    it('should update rows as expected', async () => {
        const id = await model.insert({
            foo: 7,
            bar: 'abc',
        });

        await model.update(id, {
            foo: 12,
            bar: 'bcd',
            json: { foo: 'bar' },
        });

        const row = await model.get(id);

        assert.deepEqual(row, {
            id,
            foo: 12,
            bar: 'bcd',
            json: { foo: 'bar' },
        });
    });

    it('should be able to search for all items', async () => {
        const id = await model.insert({
            foo: 4,
            bar: 'blah',
        });
        const id2 = await model.insert({
            foo: 7,
            bar: 'blah',
            json: { foo: 'bar' },
        });
        const id3 = await model.insert({
            foo: 7,
            bar: 'blah',
        });

        const rows = await model.search({
            bar: 'blah',
        });

        assert.equal(rows.length, 3, "Expected 3 rows");
        assert.equal(rows[0].id, id, "row 1 should be first id");
        assert.equal(rows[1].id, id2, "row 2 should be second id");
        assert.deepEqual(rows[1].json, { foo: 'bar' }, "row 2 should have correct json data");
        assert.equal(rows[2].id, id3, "row 3 should be third id");
    });

    it('should delete rows as expected', async () => {
        const id = await model.insert({
            foo: -5,
            bar: 'delete test',
        });

        await model.delete(id);

        const result = await model.get(id);
        assert.deepEqual(result, null, "Row should be null");
    });

    it('should handle a boolean field as expected', async () => {
        const model = new Model(
            'test_2',
            {
                foo: {
                    type: FIELD_TYPE.BOOLEAN,
                    meta: [FIELD_META.REQUIRED],
                },
            },
            version,
        );
        await model.initTable();

        const id = await model.insert({
            foo: true,
        }); 
        const id2 = await model.insert({
            foo: false,
        });

        const result = await model.get(id);
        assert.equal(result.foo, true);
        const result2 = await model.get(id2);
        assert.equal(result2.foo, false);
    });

    it('should handle limit as expected', async () => {
        await model.insert({ foo: true, bar: '1' });
        await model.insert({ foo: true, bar: '2' });
        await model.insert({ foo: true, bar: '3' });
        await model.insert({ foo: true, bar: '4' });
        await model.insert({ foo: true, bar: '5' });

        const results = await model.search({}, null, 3);

        assert.equal(results.length, 3);
        assert.deepStrictEqual(results, [
            {
                id: 1,
                foo: 1,
                bar: '1',
                json: null,
            },
            {
                id: 2,
                foo: 1,
                bar: '2',
                json: null,
            },
            {
                id: 3,
                foo: 1,
                bar: '3',
                json: null,
            },
        ]);
    });

    it('should order as expected', async () => {
        await model.insert({ foo: true, bar: '1' });
        await model.insert({ foo: true, bar: '2' });
        await model.insert({ foo: true, bar: '3' });

        let results = await model.search({}, { bar: ORDER.DESC });
        assert.deepStrictEqual(results, [
            {
                id: 3,
                foo: 1,
                bar: '3',
                json: null,
            },
            {
                id: 2,
                foo: 1,
                bar: '2',
                json: null,
            },
            {
                id: 1,
                foo: 1,
                bar: '1',
                json: null,
            },
        ]);

        results = await model.search({}, { bar: ORDER.ASC });
        assert.deepStrictEqual(results, [
            {
                id: 1,
                foo: 1,
                bar: '1',
                json: null,
            },
            {
                id: 2,
                foo: 1,
                bar: '2',
                json: null,
            },
            {
                id: 3,
                foo: 1,
                bar: '3',
                json: null,
            },
        ]);
    });

    describe('search', () => {
        it('should search for multiple values in a field', async () => {
            await model.insert({ foo: true, bar: '1' });
            await model.insert({ foo: true, bar: '2' });
            await model.insert({ foo: true, bar: '3' });

            let results = await model.search({ bar: ['1', '3']});
            assert.deepStrictEqual(results, [
                {
                    id: 1,
                    foo: 1,
                    bar: '1',
                    json: null,
                },
                {
                    id: 3,
                    foo: 1,
                    bar: '3',
                    json: null,
                },
            ]);
        });
    });*/
});