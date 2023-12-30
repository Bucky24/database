const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { Model, FIELD_META, FIELD_TYPE, ORDER } = require('../src/model');
const Connection = require('../src/connections');
const mysqlAuth = require('./db_mysql.json');
const postgresAuth = require('./db_postgres.json');

const cachePath = path.join(__dirname, 'cache_dir');

const assertThrows = async (fn, message) => {
    let error = null;
    try {
        await fn();
    } catch (e) {
        error = e;
    }
    
    assert(error !== null);
    assert.strictEqual(error.message, message);
}

describe('model', async () => {  
    const filePath = path.join(cachePath, "table.json");
    Connection.setLog(false);

    const connections = {
        'file': {
            setup: () => {
                return Connection.fileConnection(cachePath);
            },
            teardown: () => {
                if (fs.existsSync(cachePath)) {
                    fs.rmSync(cachePath, { recursive: true });
                }
            },
        },
        'mysql': {
            setup: () => {
                return Connection.mysqlConnection({
                    host: mysqlAuth.host,
                    username: mysqlAuth.username,
                    password: mysqlAuth.password,
                    database: mysqlAuth.database,
                });
            },
            teardown: async() => {
                const connection = Connection.getDefaultConnection();
                if (connection) {
                    try {
                        // try to drop all tables
                        const query = "SELECT concat('DROP TABLE IF EXISTS `', table_name, '`;') as `drop` FROM information_schema.tables WHERE table_schema = '" + mysqlAuth.database + "';"
                    
                        const tableDropStatements = await connection._query(query);

                        for (const dropStatement of tableDropStatements) {
                            await connection._query(dropStatement.drop);
                        }
                    } catch (err) {
                        console.error(err);
                    }
                    await connection.close();
                }
            }
        },
        'postgres': {
            setup: () => {
                return Connection.postgresConnection({
                    host: postgresAuth.host,
                    username: postgresAuth.username,
                    password: postgresAuth.password,
                    database: postgresAuth.database,
                    port: postgresAuth.port,
                });
            },
            teardown: async() => {
                const connection = Connection.getDefaultConnection();
                if (connection) {
                    try {
                        // try to drop all tables
                        const query = "SELECT concat('DROP TABLE IF EXISTS \"', tablename, '\";') as drop FROM pg_catalog.pg_tables WHERE schemaname = 'public';";
                    
                        const tableDropStatements = await connection._query(query);

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
                Connection.setDefaultConnection(connection);
            });

            afterEach(async () => {
                await connectionActions.teardown();
                Connection.setDefaultConnection(null);
            });
        
            describe('setup', () => {
                it('should error when no default connection set', async () => {
                    Connection.setDefaultConnection(null);
                    await assertThrows(async () => {
                        const model = Model.create({
                            table: 'table',
                            fields: {},
                            version: 1,
                        });
                        await model.init();
                    }, "No default connection set");
                });
            });
            
            describe('insert', () => {
                it('should prevent inserting a non existent field', async () => {
                    const model = Model.create({
                        table: "table",
                        fields: {},
                        version: 1,
                    });
                    await model.init();
                    await assertThrows(async () => {
                        await model.insert({
                            foo: 'bar',
                        });
                    }, "No such field 'foo'");
                });

                it('should prevent inserting if required field is missing', async () => {
                    const model = Model.create({
                        table: "table",
                        fields: {
                            foo: {
                                type: FIELD_TYPE.STRING,
                                meta: [FIELD_META.REQUIRED],
                            },
                        },
                        version: 1,
                    });
                    await model.init();
                    await assertThrows(async () => {
                        await model.insert({});
                    }, "Required field 'foo' not found");
                });

                it('should insert data as expected', async () => {
                    const model = Model.create({
                        table: "table", 
                        fields: {
                            foo: {
                                type: FIELD_TYPE.STRING,
                                meta: [FIELD_META.REQUIRED],
                            },
                            bar: {
                                type: FIELD_TYPE.STRING,
                            },
                        },
                        version: 1,
                    });
                    await model.init();
                    const id = await model.insert({
                        foo: 'bar',
                        bar: 'foo',
                    });

                    const content = await model.get(id);
                    assert.deepStrictEqual(content, {
                        id,
                        foo: 'bar',
                        bar: 'foo',
                    });
                });

                it('should insert json as expeced', async () => {
                    const model = Model.create({
                        table: "table",
                        fields: {
                            foo: {
                                type: FIELD_TYPE.JSON,
                            },
                        },
                        version: 1,
                    });
                    await model.init();
                    const id = await model.insert({
                        foo: { foo: 'bar' },
                    });

                    const content = await model.get(id);
                    assert.deepStrictEqual(content, {
                        id,
                        foo: { foo: 'bar' },
                    });
                });

                it('should silently discard any field that is not in the fields data', async () => {
                    const model = Model.create({
                        table: 'test_1',
                        fields: {
                            foo: {
                                type: FIELD_TYPE.INT,
                                meta: [FIELD_META.REQUIRED],
                            },
                            bar: {
                                type: FIELD_TYPE.STRING,
                            },
                        },
                        version: 1,
                    });
                    await model.init();
                    await model.insert({ foo: 1, bar: '1' });
            
                    // second model without bar, should return data without bar
                    const model2 = Model.create({
                        table: 'test_1',
                        fields: {
                            foo: {
                                type: FIELD_TYPE.INT,
                                meta: [FIELD_META.REQUIRED],
                            },
                        },
                        version: 2,
                    });

                    const result = await model2.search({});
            
                    assert.deepStrictEqual(result, [{ id: 1, foo: 1 }]);
                });
            });
            
            describe('get', () => {
                it('should be able to fetch data by id', async () => {
                    const model = Model.create({
                        table: "table",
                        fields: {
                            foo: {
                                type: FIELD_TYPE.STRING,
                                meta: [FIELD_META.REQUIRED],
                            },
                            bar: {
                                type: FIELD_TYPE.STRING,
                            },
                        },
                        version: 1,
                    });
                    await model.init();
                    await model.insert({
                        foo: 'bar',
                    });
                    
                    const data = await model.get(1);
                    assert.deepStrictEqual(data, {
                        id: 1,
                        foo: 'bar',
                        bar: null,
                    });
                });

                it('should retrieve json as expected', async () => {
                    const model = Model.create({
                        table: "table",
                        fields: {
                            foo: {
                                type: FIELD_TYPE.JSON,
                            },
                        },
                        version: 1,
                    });
                    await model.init();
                    const id = await model.insert({
                        foo: { foo: 'bar' },
                    });
                    const data = await model.get(1);
                    assert.deepStrictEqual(data, {
                        id,
                        foo: {foo: 'bar'},
                    });
                });

                it('should handle a string id', async () => {
                    const model = Model.create({
                        table: "table",
                        fields: {
                            foo: {
                                type: FIELD_TYPE.JSON,
                            },
                        },
                        version: 1,
                    });
                    await model.init();
                    const id = await model.insert({
                        foo: { foo: 'bar' },
                    });
                    const data = await model.get('1');
                    assert.deepStrictEqual(data, {
                        id,
                        foo: {foo: 'bar'},
                    });
                });
            });
            
            describe('search', () => {
                it('should return expected data', async () => {
                    const model = Model.create({
                        table: "table",
                        fields: {
                            foo: {
                                type: FIELD_TYPE.STRING,
                                meta: [FIELD_META.REQUIRED],
                            },
                            bar: {
                                type: FIELD_TYPE.STRING,
                            },
                        },
                        version: 1,
                    });
                    await model.init();
                    await model.insert({
                        foo: 'bar',
                        bar: 'baz',
                    });
                    await model.insert({
                        foo: 'bin',
                    });
                    
                    const data = await model.search({
                        foo: 'bar',
                    });
                    assert.deepStrictEqual(data, [{
                        id: 1,
                        foo: 'bar',
                        bar: 'baz',
                    }]);
                });
                
                it('should return data with null search', async () => {
                    const model = Model.create({
                        table: "table",
                        fields: {
                            foo: {
                                type: FIELD_TYPE.STRING,
                                meta: [FIELD_META.REQUIRED],
                            },
                            bar: {
                                type: FIELD_TYPE.STRING,
                            },
                        },
                        version: 1,
                    });
                    await model.init();
                    await model.insert({
                        foo: 'bar',
                        bar: 'baz',
                    });
                    await model.insert({
                        foo: 'bin',
                    });
                    
                    const data = await model.search({
                        bar: null,
                    });

                    assert.deepStrictEqual(data, [{
                        id: 2,
                        foo: 'bin',
                        bar: null,
                    }]);
                });

                it('should return json fields as expected', async () => {
                    it('should retrieve json as expected', async () => {
                        const model = Model.create({
                            table: "table", 
                            fields: {
                                foo: {
                                    type: FIELD_TYPE.JSON,
                                },
                                bar: {
                                    type: FIELD_TYPE.STRING,
                                },
                            },
                            version: 1,
                        });
                        await model.init();
                        await model.insert({
                            foo: { foo: 'bar' },
                            bar: '123',
                        });
                        await model.insert({
                            foo: { foo: 'bar2' },
                            bar: '123',
                        });
                        const data = await model.search({
                            bar: '123',
                        });
                        assert.deepStrictEqual(data, [
                            {
                                id: 1,
                                foo: {foo: 'bar'},
                                bar: '123',
                            },
                            {
                                id: 2,
                                foo: {foo: 'bar2'},
                                bar: '123',
                            },
                        ]);
                    });
                });

                it('should limit results as expected', async () => {
                    const model = Model.create({
                        table: "table",
                        fields: {
                            bar: {
                                type: FIELD_TYPE.INT,
                            },
                        },
                        version: 1,
                    });
                    await model.init();
                    for (let i=0;i<10;i++) {
                        await model.insert({ bar: i });
                    }
                    const data = await model.search({}, null, 3);
                    assert.equal(data.length, 3);
                    assert.deepStrictEqual(data, [
                        {
                            id: 1,
                            bar: 0,
                        },
                        {
                            id: 2,
                            bar: 1,
                        },
                        {
                            id: 3,
                            bar: 2,
                        },
                    ]);
                });

                it('should order the results as expected', async () => {
                    const model = Model.create({
                        table: "table", 
                        fields: {
                            bar: {
                                type: FIELD_TYPE.STRING,
                            },
                        },
                        version: 1,
                    });
                    await model.init();
                    await model.insert({ bar: 'arg_a' });
                    await model.insert({ bar: 'arg_b' });
                    await model.insert({ bar: 'arg_c' });
                    let data = await model.search({}, { bar: ORDER.DESC });
                    assert.deepStrictEqual(data, [
                        {
                            id: 3,
                            bar: 'arg_c',
                        },
                        {
                            id: 2,
                            bar: 'arg_b',
                        },
                        {
                            id: 1,
                            bar: 'arg_a',
                        },
                    ]);

                    data = await model.search({}, { bar: ORDER.ASC });
                    assert.deepStrictEqual(data, [
                        {
                            id: 1,
                            bar: 'arg_a',
                        },
                        {
                            id: 2,
                            bar: 'arg_b',
                        },
                        {
                            id: 3,
                            bar: 'arg_c',
                        },
                    ]);
                });

                it('should search for multiple values in a field', async () => {
                    const model = Model.create({
                        table: "table", 
                        fields: {
                            bar: {
                                type: FIELD_TYPE.STRING,
                            },
                        },
                        version: 1,
                    });
                    await model.init();
                    await model.insert({ bar: 'arg_a' });
                    await model.insert({ bar: 'arg_b' });
                    await model.insert({ bar: 'arg_c' });
                    let data = await model.search({ bar: ['arg_a', 'arg_c'] });
                    assert.deepStrictEqual(data, [
                        {
                            id: 1,
                            bar: 'arg_a',
                        },
                        {
                            id: 3,
                            bar: 'arg_c',
                        },
                    ]);
                });

                it('should equate false with null or zero', async () => {
                    const model = Model.create({
                        table: "table", 
                        fields: {
                            bar: {
                                type: FIELD_TYPE.BOOLEAN,
                            },
                            foo: {
                                type: FIELD_TYPE.STRING,
                            },
                        },
                        version: 1,
                    });
                    await model.init();
                    await model.insert({ foo: 'foo' });
                    await model.insert({ bar: true });
                    await model.insert({ bar: false });

                    let data = await model.search({ bar: false });
                    console.log(data);
                    assert.deepStrictEqual(data, [
                        {
                            id: 1,
                            bar: false,
                            foo: 'foo',
                        },
                        {
                            id: 3,
                            bar: false,
                            foo: null,
                        },
                    ]);
                });
            });
            
            describe('update', () => {
                let model;

                beforeEach(async () => {
                    model = Model.create({
                        table: "table",
                        fields: {
                            foo: {
                                type: FIELD_TYPE.STRING,
                                meta: [FIELD_META.REQUIRED],
                            },
                            bar: {
                                type: FIELD_TYPE.JSON,
                            },
                        },
                        version: 1,
                    });
                    await model.init();
                    
                    await model.insert({
                        foo: 'bar',
                        bar: { foo: 'bar' },
                    });
                });
                    
                it('should fail to update a nonexistent field', async () => {
                    let data = await model.get(1);
                    assert.deepStrictEqual(data, {
                        id: 1,
                        foo: 'bar',
                        bar: { foo: 'bar' },
                    });
                    
                    await assertThrows(async () => {
                        await model.update(1, { bad_field: 'foo' });
                    }, "No such field 'bad_field'");
                });
                
                it('should fail to unset a required field', async () => {
                    let data = await model.get(1);
                    assert.deepStrictEqual(data, {
                        id: 1,
                        foo: 'bar',
                        bar: { foo: 'bar' },
                    });
                    
                    await assertThrows(async () => {
                        await model.update(1, { foo: null });
                    }, "Field 'foo' cannot be set to null");
                });

                it('should update a json field', async () => {
                    let data = await model.get(1);
                    assert.deepStrictEqual(data, {
                        id: 1,
                        foo: 'bar',
                        bar: { foo: 'bar' },
                    });

                    await model.update(1, { bar: { foo: 'bar2' }});

                    data = await model.get(1);
                    assert.deepStrictEqual(data, {
                        id: 1,
                        foo: 'bar',
                        bar: { foo: 'bar2' },
                    });
                });

                it('should update data to new value as expected', async () => {
                    let data = await model.get(1);
                    assert.deepStrictEqual(data, {
                        id: 1,
                        foo: 'bar',
                        bar: { foo: 'bar' },
                    });
                    
                    await model.update(1, { bar: { foo: 'baz' }, foo: 'boo' });
                    data = await model.get(1);
                    assert.deepStrictEqual(data, {
                        id: 1,
                        foo: 'boo',
                        bar: { foo: 'baz' },
                    });
                });
                
                it('should remove value if set to null', async () => {
                    let data = await model.get(1);
                    assert.deepStrictEqual(data, {
                        id: 1,
                        foo: 'bar',
                        bar: { foo: 'bar' },
                    });
                    
                    await model.update(1, { bar: null });
                    data = await model.get(1);
                    assert.deepStrictEqual(data, {
                        id: 1,
                        foo: 'bar',
                        bar: null,
                    });
                });

                it('should update data with a string id', async () => {
                    let data = await model.get(1);
                    assert.deepStrictEqual(data, {
                        id: 1,
                        foo: 'bar',
                        bar: { foo: 'bar' },
                    });
                    
                    await model.update('1', { foo: 'boo' });
                    data = await model.get(1);
                    assert.deepStrictEqual(data, {
                        id: 1,
                        foo: 'boo',
                        bar: { foo: 'bar' },
                    });
                });
            });
            
            describe('delete', () => {
                let model;
                let id1;
                let id2;

                beforeEach(async () => {
                    model = Model.create({
                        table: "table",
                        fields: {
                            foo: {
                                type: FIELD_TYPE.STRING,
                                meta: [FIELD_META.REQUIRED],
                            },
                            bar: {
                                type: FIELD_TYPE.STRING,
                            },
                        },
                        version: 1,
                    });
                    await model.init();
                    
                    id1 = await model.insert({
                        foo: 'bar',
                        bar: 'baz',
                    });
                    id2 = await model.insert({
                        foo: 'foo',
                        bar: 'bar',
                    });
                });
                
                it('should remove row as expected', async () => {
                    await model.delete(id1);
                    let data = await model.get(id1);
                    assert(data === null);
                    data = await model.get(id2);
                    assert.deepStrictEqual(data, {
                        id: id2,
                        foo: 'foo',
                        bar: 'bar',
                    });
                });
                
                it('should do nothing if non existent id given', async () => {
                    await model.delete(5000);
                    let data = await model.get(id1);
                    assert.deepStrictEqual(data, {
                        id: id1,
                        foo: 'bar',
                        bar: 'baz',
                    });
                    data = await model.get(id2);
                    assert.deepStrictEqual(data, {
                        id: id2,
                        foo: 'foo',
                        bar: 'bar',
                    });
                });

                it('should delete with a string id', async () => {
                    await model.delete(`${id1}`);
                    let data = await model.get(id1);
                    assert(data === null);
                    data = await model.get(id2);
                    assert.deepStrictEqual(data, {
                        id: id2,
                        foo: 'foo',
                        bar: 'bar',
                    });
                });
            });

            describe('filterForExport', () => {
                it('should filter fields as expected', async () => {
                    const model = Model.create({
                        table: "table",
                        fields: {
                            foo: {
                                type: FIELD_TYPE.STRING,
                                meta: [FIELD_META.REQUIRED],
                            },
                            bar: {
                                type: FIELD_TYPE.STRING,
                                meta: [FIELD_META.FILTERED],
                            },
                        },
                        version: 1,
                    });
                    
                    const result = model.filterForExport({ foo: 'foo', bar: 'bar' });
                    assert.deepStrictEqual(result, { foo: 'foo' }); 
                });

                it('should not change result if no filtered fields', async () => {
                    const model = Model.create({
                        table: "table",
                        fields: {
                            foo: {
                                type: FIELD_TYPE.STRING,
                                meta: [FIELD_META.REQUIRED],
                            },
                            bar: {
                                type: FIELD_TYPE.STRING,
                            },
                        },
                        version: 1,
                    });
                    
                    const result = model.filterForExport({ foo: 'foo', bar: 'bar' });
                    assert.deepStrictEqual(result, { foo: 'foo', bar: 'bar' }); 
                });
            });

            describe('version conflict', () => {
                it('should handle adding new fields', async () => {
                    const model = Model.create({
                        table: "table",
                        fields: {
                            foo: {
                                type: FIELD_TYPE.STRING,
                                meta: [FIELD_META.REQUIRED],
                            },
                            bar: {
                                type: FIELD_TYPE.JSON,
                            },
                        },
                        version: 1,
                    });
                    const newModel = Model.create({
                        table: 'table',
                        fields: {
                            foo: {
                                type: FIELD_TYPE.STRING,
                                meta: [FIELD_META.REQUIRED],
                            },
                            bar: {
                                type: FIELD_TYPE.JSON,
                            },
                            second_field: {
                                type: FIELD_TYPE.INT,
                                meta: [FIELD_META.REQUIRED],
                            },
                            third_field: {
                                type: FIELD_TYPE.STRING,
                            },
                        },
                        version: 2,
                    });
        
                    await model.init();
                    await newModel.init();

                    await newModel.insert({
                        foo: 'bar',
                        second_field: 5,
                    });

                    const rows = await newModel.search();
                    assert.deepStrictEqual(rows, [
                        {
                            foo: 'bar',
                            bar: null,
                            second_field: 5,
                            third_field: null,
                            id: 1,
                        },
                    ]);
                });
            });
        });
    }

    describe('file specific', async () => {
        beforeEach(async () => {
            const connection = await Connection.fileConnection(cachePath);
            Connection.setDefaultConnection(connection);
        });

        afterEach(() => {
            if (fs.existsSync(cachePath)) {
                fs.rmSync(cachePath, { recursive: true });
            }
            Connection.setDefaultConnection(null);
        });

        describe('cache', () => {
            it('should create expected cache file', async () => {
                const model = Model.create({
                    table: "table",
                    fields: {},
                    version: 1,
                });
                await model.init();
                assert(fs.existsSync(filePath));
            });
        });
    });
});