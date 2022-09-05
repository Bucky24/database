const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { Model, FIELD_META, FIELD_TYPE, ORDER } = require('../src/model');
const { Connection } = require('../src/connection');

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

describe('model->file', () => {    
    describe('setup', () => {
        it('should error when no default connection set', async () => {
            Connection.setDefaultConnection(null);
            await assertThrows(async () => {
                const model = new Model('table', [], 1);
                await model.initTable();
            }, "No default connection set");
        });
        
        it('should error when default connection is unknown type', async () => {
            const connection = new Connection('bad_type', {});
            Connection.setDefaultConnection(connection);
            await assertThrows(async () => {
                const model = new Model('table', [], 1);
                await model.initTable();
            }, "Unexpected connection type bad_type");
        });
    });

    describe('cache', () => {
        const filePath = path.join(cachePath, "table.json");

        beforeEach(async () => {
            const connection = await Connection.fileConnection(cachePath);
            Connection.setDefaultConnection(connection);
        });
    
        afterEach(() => {
            Connection.setDefaultConnection(null);
            fs.rmSync(cachePath, { recursive: true });
        });

        it('should create expected cache file', async () => {
            const model = new Model("table", {});
            await model.initTable();
            assert(fs.existsSync(filePath));
        });
    });
    
    describe('insert', () => {
        describe('general', () => {
            const filePath = path.join(cachePath, "table.json");

            beforeEach(async () => {
                const connection = await Connection.fileConnection(cachePath);
                Connection.setDefaultConnection(connection);
            });
            
            afterEach(() => {
                Connection.setDefaultConnection(null);
                fs.rmSync(cachePath, { recursive: true });
            });

            it('should prevent inserting a non existent field', async () => {
                const model = new Model("table", {});
                await model.initTable();
                await assertThrows(async () => {
                    await model.insert({
                        foo: 'bar',
                    });
                }, "No such field 'foo'");
            });

            it('should prevent inserting if required field is missing', async () => {
                const model = new Model("table", {
                    foo: {
                        meta: [FIELD_META.REQUIRED],
                    },
                });
                await model.initTable();
                await assertThrows(async () => {
                    await model.insert({});
                }, "Required field 'foo' not found");
            });
        });

        describe('FILE', () => {
            const filePath = path.join(cachePath, "table.json");

            beforeEach(async () => {
                const connection = await Connection.fileConnection(cachePath);
                Connection.setDefaultConnection(connection);
            });
            
            afterEach(() => {
                Connection.setDefaultConnection(null);
                fs.rmSync(cachePath, { recursive: true });
            });

            it('should insert data as expected', async () => {
                const model = new Model("table", {
                    foo: {
                        meta: [FIELD_META.REQUIRED],
                    },
                    bar: {},
                });
                await model.initTable();
                const id = await model.insert({
                    foo: 'bar',
                    bar: 'foo',
                });
                const content = fs.readFileSync(filePath, 'utf8');
                const json = JSON.parse(content);
                assert.deepStrictEqual(json, {
                    auto: { id: id + 1 },
                    data: [{
                        id,
                        foo: 'bar',
                        bar: 'foo',
                    }],
                });
            });

            it('should insert json as expeced', async () => {
                const model = new Model("table", {
                    foo: {
                        type: FIELD_TYPE.JSON,
                    },
                });
                await model.initTable();
                const id = await model.insert({
                    foo: { foo: 'bar' },
                });
                const content = fs.readFileSync(filePath, 'utf8');
                const json = JSON.parse(content);
                assert.deepStrictEqual(json, {
                    auto: { id: id + 1 },
                    data: [{
                        id,
                        foo: '{"foo":"bar"}',
                    }],
                });
            });
        });
    });
    
    describe('get', () => {
        describe('FILE', () => {
            const filePath = path.join(cachePath, "table.json");

            beforeEach(async () => {
                const connection = await Connection.fileConnection(cachePath);
                Connection.setDefaultConnection(connection);
            });
            
            afterEach(() => {
                Connection.setDefaultConnection(null);
                fs.rmSync(cachePath, { recursive: true });
            });
            
            it('should be able to fetch data by id', async () => {
                const model = new Model("table", {
                    foo: {
                        meta: [FIELD_META.REQUIRED],
                    },
                    bar: {},
                });
                await model.initTable();
                await model.insert({
                    foo: 'bar',
                });
                
                const data = await model.get(1);
                assert.deepStrictEqual(data, {
                    id: 1,
                    foo: 'bar',
                });
            });

            it('should retrieve json as expected', async () => {
                const model = new Model("table", {
                    foo: {
                        type: FIELD_TYPE.JSON,
                    },
                });
                await model.initTable();
                const id = await model.insert({
                    foo: { foo: 'bar' },
                });
                const data = await model.get(1);
                assert.deepStrictEqual(data, {
                    id,
                    foo: {foo: 'bar'},
                });
            });
        });
    });
    
    describe('search', () => {
        describe('FILE', () => {
            beforeEach(async () => {
                const connection = await Connection.fileConnection(cachePath);
                Connection.setDefaultConnection(connection);
            });
            
            afterEach(() => {
                Connection.setDefaultConnection(null);
                fs.rmSync(cachePath, { recursive: true });
            });
           
            it('should return expected data', async () => {
                const model = new Model("table", {
                    foo: {
                        meta: [FIELD_META.REQUIRED],
                    },
                    bar: {},
                });
                await model.initTable();
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
                const model = new Model("table", {
                    foo: {
                        meta: [FIELD_META.REQUIRED],
                    },
                    bar: {},
                });
                await model.initTable();
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
                }]);
            });

            it('should return json fields as expected', async () => {
                it('should retrieve json as expected', async () => {
                    const model = new Model("table", {
                        foo: {
                            type: FIELD_TYPE.JSON,
                        },
                        bar: {
                            type: FIELD_TYPE.STRING,
                        },
                    });
                    await model.initTable();
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
                const model = new Model("table", {
                    bar: {
                        type: FIELD_TYPE.INT,
                    },
                });
                await model.initTable();
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
                const model = new Model("table", {
                    bar: {
                        type: FIELD_TYPE.STRING,
                    },
                });
                await model.initTable();
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
                const model = new Model("table", {
                    bar: {
                        type: FIELD_TYPE.STRING,
                    },
                });
                await model.initTable();
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
        });
    });
    
    describe('update', () => {
        describe('general', () => {
            let model;

            beforeEach(async () => {
                const connection = await Connection.fileConnection(cachePath);
                Connection.setDefaultConnection(connection);
                model = new Model("table", {
                    foo: {
                        meta: [FIELD_META.REQUIRED],
                    },
                    bar: {
                        type: FIELD_META.JSON,
                    },
                });
                await model.initTable();
                
                await model.insert({
                    foo: 'bar',
                    bar: { foo: 'bar' },
                });
            });
            
            afterEach(() => {
                Connection.setDefaultConnection(null);
                fs.rmSync(cachePath, { recursive: true });
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
        });

        describe('FILE', () => {
            const filePath = path.join(cachePath, "table.json");
            let model;

            beforeEach(async () => {
                const connection = await Connection.fileConnection(cachePath);
                Connection.setDefaultConnection(connection);
                model = new Model("table", {
                    foo: {
                        meta: [FIELD_META.REQUIRED],
                    },
                    bar: {},
                });
                await model.initTable();
                
                await model.insert({
                    foo: 'bar',
                    bar: 'baz',
                });
            });
            
            afterEach(() => {
                Connection.setDefaultConnection(null);
                fs.rmSync(cachePath, { recursive: true });
            });
            
            it('should update data to new value as expected', async () => {
                let data = await model.get(1);
                assert.deepStrictEqual(data, {
                    id: 1,
                    foo: 'bar',
                    bar: 'baz',
                });
                
                await model.update(1, { bar: 'foo', foo: 'boo' });
                data = await model.get(1);
                assert.deepStrictEqual(data, {
                    id: 1,
                    foo: 'boo',
                    bar: 'foo',
                });
            });
            
            it('should remove value if set to null', async () => {
                let data = await model.get(1);
                assert.deepStrictEqual(data, {
                    id: 1,
                    foo: 'bar',
                    bar: 'baz',
                });
                
                await model.update(1, { bar: null });
                data = await model.get(1);
                assert.deepStrictEqual(data, {
                    id: 1,
                    foo: 'bar',
                });
            });
        });
    });
    
    describe('delete', () => {
        describe('FILE', () => {
            const filePath = path.join(cachePath, "table.json");
            let model;
            let id1;
            let id2;

            beforeEach(async () => {
                const connection = await Connection.fileConnection(cachePath);
                Connection.setDefaultConnection(connection);
                model = new Model("table", {
                    foo: {
                        meta: [FIELD_META.REQUIRED],
                    },
                    bar: {},
                });
                await model.initTable();
                
                id1 = await model.insert({
                    foo: 'bar',
                    bar: 'baz',
                });
                id2 = await model.insert({
                    foo: 'foo',
                    bar: 'bar',
                });
            });
            
            afterEach(() => {
                Connection.setDefaultConnection(null);
                fs.rmSync(cachePath, { recursive: true });
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
        });
    });

    describe('filterForExport', () => {
        it('should filter fields as expected', () => {
            const model = new Model("table", {
                foo: {
                    meta: [FIELD_META.REQUIRED],
                },
                bar: {
                    meta: [FIELD_META.FILTERED],
                },
            });
            
            const result = model.filterForExport({ foo: 'foo', bar: 'bar' });
            assert.deepStrictEqual(result, { foo: 'foo' }); 
        });

        it('should not change result if no filtered fields', () => {
            const model = new Model("table", {
                foo: {
                    meta: [FIELD_META.REQUIRED],
                },
                bar: {},
            });
            
            const result = model.filterForExport({ foo: 'foo', bar: 'bar' });
            assert.deepStrictEqual(result, { foo: 'foo', bar: 'bar' }); 
        });
    });
});