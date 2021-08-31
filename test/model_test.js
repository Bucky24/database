const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { Model, FIELD_META } = require('../src/model');
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

describe('model', () => {    
    describe('setup', () => {
        it('should error when no default connection set', async () => {
            Connection.setDefaultConnection(null);
            await assertThrows(() => {
                const model = new Model('table', [], 1);
            }, "No default connection set");
        });
        
        it('should error when default connection is unknown type', async () => {
            const connection = new Connection('bad_type', {});
            Connection.setDefaultConnection(connection);
            await assertThrows(() => {
                const model = new Model('table', [], 1);
            }, "Unexpected connection type bad_type");
        });
    });

    describe('FILE', () => {
        const filePath = path.join(cachePath, "table.json");

        beforeEach(() => {
            const connection = Connection.fileConnection(cachePath);
            Connection.setDefaultConnection(connection);
        });
    
        afterEach(() => {
            Connection.setDefaultConnection(null);
            fs.rmdirSync(cachePath, { recursive: true });
        });

        it('should create expected cache file', () => {
            const model = new Model("table", {});
            assert(fs.existsSync(filePath));
        });
    });
    
    describe('insert', () => {
        describe('general', () => {
            const filePath = path.join(cachePath, "table.json");

            beforeEach(() => {
                const connection = Connection.fileConnection(cachePath);
                Connection.setDefaultConnection(connection);
            });
            
            afterEach(() => {
                Connection.setDefaultConnection(null);
                fs.rmdirSync(cachePath, { recursive: true });
            });

            it('should prevent inserting a non existent field', async () => {
                const model = new Model("table", {});
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
                await assertThrows(async () => {
                    await model.insert({});
                }, "Required field 'foo' not found");
            });
        });

        describe('FILE', () => {
            const filePath = path.join(cachePath, "table.json");

            beforeEach(() => {
                const connection = Connection.fileConnection(cachePath);
                Connection.setDefaultConnection(connection);
            });
            
            afterEach(() => {
                Connection.setDefaultConnection(null);
                fs.rmdirSync(cachePath, { recursive: true });
            });

            it('should insert data as expected', async () => {
                const model = new Model("table", {
                    foo: {
                        meta: [FIELD_META.REQUIRED],
                    },
                    bar: {},
                });
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
        });
    });
    
    describe('get', () => {
        describe('FILE', () => {
            const filePath = path.join(cachePath, "table.json");

            beforeEach(() => {
                const connection = Connection.fileConnection(cachePath);
                Connection.setDefaultConnection(connection);
            });
            
            afterEach(() => {
                Connection.setDefaultConnection(null);
                fs.rmdirSync(cachePath, { recursive: true });
            });
            
            it('should be able to fetch data by id', async () => {
                const model = new Model("table", {
                    foo: {
                        meta: [FIELD_META.REQUIRED],
                    },
                    bar: {},
                });
                await model.insert({
                    foo: 'bar',
                });
                
                const data = await model.get(1);
                assert.deepStrictEqual(data, {
                    id: 1,
                    foo: 'bar',
                });
            });
        });
    });
    
    describe('search', () => {
        describe('FILE', () => {
            const filePath = path.join(cachePath, "table.json");

            beforeEach(() => {
                const connection = Connection.fileConnection(cachePath);
                Connection.setDefaultConnection(connection);
            });
            
            afterEach(() => {
                Connection.setDefaultConnection(null);
                fs.rmdirSync(cachePath, { recursive: true });
            });
           
            it('should return expected data', async () => {
                const model = new Model("table", {
                    foo: {
                        meta: [FIELD_META.REQUIRED],
                    },
                    bar: {},
                });
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
        });
    });
    
    describe('update', () => {
        describe('general', () => {
            const filePath = path.join(cachePath, "table.json");
            let model;

            beforeEach(async () => {
                const connection = Connection.fileConnection(cachePath);
                Connection.setDefaultConnection(connection);
                model = new Model("table", {
                    foo: {
                        meta: [FIELD_META.REQUIRED],
                    },
                    bar: {},
                });
                
                await model.insert({
                    foo: 'bar',
                    bar: 'baz',
                });
            });
            
            afterEach(() => {
                Connection.setDefaultConnection(null);
                fs.rmdirSync(cachePath, { recursive: true });
            });
            
            it('should fail to update a nonexistent field', async () => {
                let data = await model.get(1);
                assert.deepStrictEqual(data, {
                    id: 1,
                    foo: 'bar',
                    bar: 'baz',
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
                    bar: 'baz',
                });
                
                await assertThrows(async () => {
                    await model.update(1, { foo: null });
                }, "Field 'foo' cannot be set to null");
            });
        });

        describe('FILE', () => {
            const filePath = path.join(cachePath, "table.json");
            let model;

            beforeEach(async () => {
                const connection = Connection.fileConnection(cachePath);
                Connection.setDefaultConnection(connection);
                model = new Model("table", {
                    foo: {
                        meta: [FIELD_META.REQUIRED],
                    },
                    bar: {},
                });
                
                await model.insert({
                    foo: 'bar',
                    bar: 'baz',
                });
            });
            
            afterEach(() => {
                Connection.setDefaultConnection(null);
                fs.rmdirSync(cachePath, { recursive: true });
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
                const connection = Connection.fileConnection(cachePath);
                Connection.setDefaultConnection(connection);
                model = new Model("table", {
                    foo: {
                        meta: [FIELD_META.REQUIRED],
                    },
                    bar: {},
                });
                
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
                fs.rmdirSync(cachePath, { recursive: true });
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
});