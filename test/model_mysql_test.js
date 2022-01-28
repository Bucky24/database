/**
 * Warning: This test requires an active and working mysql database. It expects a file, db.json, to exist with the following keys:
 * host, database, username, password
 * This file WILL truncate the entire database once it's done
 */

 const assert = require('assert');
 
 const { Model, FIELD_META, FIELD_TYPE } = require('../src/model');
 const { Connection } = require('../src/connection');
 const dbAuth = require('./db.json');
 
 describe('model', () => {
    describe('MYSQL', () => {
        let connection;
        let model;
        const version = 1;

        before(() => {
            connection = Connection.mysqlConnection({
                host: dbAuth.host,
                username: dbAuth.username,
                password: dbAuth.password,
                database: dbAuth.database,
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
                    }
                },
                version,
            );
        });

        after(async () => {
            // try to drop all tables
            const query = "SELECT concat('DROP TABLE IF EXISTS `', table_name, '`;') as `drop` FROM information_schema.tables WHERE table_schema = '" + connection.getData()['database'] + "';"
        
            const tableDropStatements = await Model.query(query);

            for (const dropStatement of tableDropStatements) {
                await Model.query(dropStatement.drop);
            }

            connection.close();
        });

        it('should create the new table as expected', async () => {
            await model.initTable();

            const getTablesQuery = "SELECT * FROM information_schema.tables WHERE table_schema = '" + connection.getData()['database'] + "'";
            const tables = await Model.query(getTablesQuery);
            const tableMap = tables.reduce((obj, tableData) => {
                const name = tableData.TABLE_NAME;
                return {
                    ...obj,
                    [name]: tableData,
                };
            }, {});

            const tableNames = Object.keys(tableMap);

            assert.equal(tableNames.includes('test_1'), true, 'expected table list to contain "test_1"');
        });

        it('should insert the correct version into the table', async () => {
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
            });

            const row = await model.get(id);

            assert.deepEqual(row, {
                id,
                foo: 7,
                bar: 'abc',
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
            });

            const row = await model.get(id);

            assert.deepEqual(row, {
                id,
                foo: 12,
                bar: 'bcd',
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
    });
});