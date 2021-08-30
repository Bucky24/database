const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { Model, FIELD_META } = require('../src/model');
const { Connection, setDefaultConnection } = require('../src/connection');

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
            setDefaultConnection(null);
            await assertThrows(() => {
                const model = new Model('table', [], 1);
            }, "No default connection set");
        });
        
        it('should error when default connection is unknown type', async () => {
            const connection = new Connection('bad_type', {});
            setDefaultConnection(connection);
            await assertThrows(() => {
                const model = new Model('table', [], 1);
            }, "Unexpected connection type bad_type");
        });
    });

    describe.only('FILE', () => {
        const filePath = path.join(cachePath, "table.json");

        beforeEach(() => {
            const connection = Connection.fileConnection(cachePath);
            setDefaultConnection(connection);
        });
    
        afterEach(() => {
            setDefaultConnection(null);
            fs.rmdirSync(cachePath, { recursive: true });
        });

        it('should create expected cache file', () => {
            const model = new Model("table", {});
            assert(fs.existsSync(filePath));
        });

        it('should prevent inserting a non existant field', async () => {
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

        it('should insert data as expected', async () => {
            const model = new Model("table", {
                foo: {
                    meta: [FIELD_META.REQUIRED],
                },
                bar: {},
            });
            await model.insert({
                foo: 'bar',
                bar: 'foo',
            });
            const content = fs.readFileSync(filePath, 'utf8');
            const json = JSON.parse(content);
            assert.deepStrictEqual(json, {
                auto: { id: 2 },
                data: [{
                    id: 1,
                    foo: 'bar',
                    bar: 'foo',
                }],
            });
        });
    });
});