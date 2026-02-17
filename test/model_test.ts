import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express, { Express } from 'express';
import request from 'supertest';

import { fileConnection, setDefaultConnection } from '../src/connections/server';
import { Model } from '../src/model';
import { FIELD_META, FIELD_TYPE, ORDER } from '../src/types';
import { WHERE_COMPARE, WhereBuilder } from '../src/whereBuilder';
import { forConnections } from './connection_helper';
import { setLog } from '../src/logger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cachePath = path.join(__dirname, 'cache_dir');

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

describe('model', async () => {  
    const filePath = path.join(cachePath, "table.json");
    setLog(false);

    forConnections(async () => {
        describe('setup', () => {
            it('should error when no default connection set', async () => {
                setDefaultConnection(null);
                await assertThrows(async () => {
                    const model = Model.create({
                        table: 'table',
                        fields: {},
                    });
                    await model.init();
                }, "No default connection set");
            });

            it('should create a text field when no string size given', async () => {
                const model = Model.create({
                    table: "table",
                    fields: {
                        foo: {
                            type: FIELD_TYPE.STRING,
                        },
                    },
                });
                await model.init();
                await model.insert({
                    foo: 'sdfklsdjfdlskfjdflkfjsdlfksjfkdasl',
                });
            });

            it('should create a varchar of a certain size when string size given', async () => {
                const model = Model.create({
                    table: "table",
                    fields: {
                        foo: {
                            type: FIELD_TYPE.STRING,
                            size: 10,
                        },
                    },
                });
                await model.init();

                await assertThrows(async () => {
                    await model.insert({
                        foo: 'sdfklsdjfdlskfjdflkfjsdlfksjfkdasl',
                    });
                });

                const id = await model.insert({
                    foo: 'foo',
                });

                await assertThrows(async () => {
                    await model.update(id, {
                        foo: 'sdfklsdjfdlskfjdflkfjsdlfksjfkdasl',
                    });
                });
            });

            it('should create a foreign key when desired', async () => {
                const model = Model.create({
                    table: "table",
                    fields: {
                        foo: {
                            type: FIELD_TYPE.STRING,
                        },
                    },
                });
                const model2 = Model.create({
                    table: "table2",
                    fields: {
                        table1_id: {
                            type: FIELD_TYPE.INT,
                            foreign: {
                                table: model,
                                field: "id",
                            },
                        },
                    },
                });
                await model.init();
                await model2.init();
                const id = await model.insert({
                    foo: 'sdfklsdjfdlskfjdflkfjsdlfksjfkdasl',
                });
                await assertThrows(async () => {
                    await model2.insert({
                        table1_id: 5,
                    });
                });
                const id2 = await model2.insert({
                    table1_id: id,
                });
                await assertThrows(async () => {
                    await model2.update(id2, {
                        table1_id: 5,
                    });
                });
            });

            it('should create a new foreign key when adding new table columns', async () => {
                const model = Model.create({
                    table: "table",
                    fields: {
                        foo: {
                            type: FIELD_TYPE.STRING,
                        },
                    },
                });
                let model2 = Model.create({
                    table: "table2",
                    fields: {
                        foo: { type: FIELD_TYPE.STRING }
                    },
                });
                await model.init();
                await model2.init();

                // now add the foreign key
                model2 = Model.create({
                    table: "table2",
                    fields: {
                        foo: { type: FIELD_TYPE.STRING },
                        table1_id: {
                            type: FIELD_TYPE.INT,
                            foreign: {
                                table: model,
                                field: "id",
                            },
                        },
                    },
                });
                await model2.init();

                // should now be enforced
                await assertThrows(async () => {
                    await model2.insert({
                        table1_id: 5,
                    });
                });
            });
        });
        
        describe('insert', () => {
            it('should prevent inserting a non existent field', async () => {
                const model = Model.create({
                    table: "table",
                    fields: {},
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
                });
                await model.init();
                await model.insert({ foo: 'foo' });
                await model.insert({ bar: true });
                await model.insert({ bar: false });

                let data = await model.search({ bar: false });
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

            it('should respect the offset in results', async () => {
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
                });
                await model.init();
                await model.insert({ foo: 'foo1' });
                await model.insert({ foo: 'foo2' });
                await model.insert({ foo: 'foo3' });

                const rows = await model.search({}, null, 50, 2);
                assert.equal(rows.length, 1);
                assert.equal(rows[0]['foo'], 'foo3');
            });

            it('should work with WhereBuilder', async () => {
                const model = Model.create({
                    table: "table", 
                    fields: {
                        foo: {
                            type: FIELD_TYPE.STRING,
                        },
                    },
                });
                await model.init();
                await model.insert({ foo: 'foo1' });
                await model.insert({ foo: 'foo2' });
                await model.insert({ foo: 'foo3' });

                const rows = await model.search(WhereBuilder.new()
                    .compare("foo", WHERE_COMPARE.EQ, "foo2")
                );
                assert.equal(rows.length, 1);
                assert.equal(rows[0]['foo'], 'foo2');
            });
        });
        
        describe('update', () => {
            let model: Model;

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
            let model: Model;
            let id1: number;
            let id2: number;

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

        describe('count', async () => {
            it('should return count of items matching', async () => {
                const model = Model.create({
                    table: "table",
                    fields: {
                        foo: {
                            type: FIELD_TYPE.STRING,
                            meta: [FIELD_META.REQUIRED],
                        },
                    },
                });
                await model.init();
                await model.insert({
                    foo: 'bar',
                });
                await model.insert({
                    foo: 'bar',
                });
                await model.insert({
                    foo: 'baz',
                });

                const count = await model.count({
                    foo: 'bar',
                });

                assert.equal(count, 2);
            });
        });

        describe('createCrudApis', async () => {
            let server: Express = express();
            let model;
            let middlewareCalled = false;

            beforeEach(async () => {
                server = express();
                server.use(express.json());
                middlewareCalled = false;

                model = Model.create({
                    table: "table",
                    fields: {
                        foo: {
                            type: FIELD_TYPE.STRING,
                        },
                        bar: {
                            type: FIELD_TYPE.INT,
                        },
                    },
                });
                await model.init();
                await model.insert({
                    foo: 'bar',
                    bar: 5,
                });
                await model.insert({
                    foo: 'baz',
                    bar: 10,
                });

                model.createCrudApis(server, {
                    middleware: (req, res, next) => {
                        middlewareCalled = true;
                        next();
                    }
                });
            });

            it('should return all objects when using the GET / api', async () => {
                const response = await request(server).get('/table');

                assert.deepEqual(response.body, [
                    { id: 1, foo: 'bar', bar: 5 },
                    { id: 2, foo: 'baz', bar: 10 },
                ]);
                assert.equal(middlewareCalled, true);
            });

            it('should return a specific object when using the GET /:id api', async () => {
                const response = await request(server).get('/table/1');

                assert.deepEqual(response.body, { id: 1, foo: 'bar', bar: 5 });
                assert.equal(middlewareCalled, true);
            });

            it('should return a 404 when using the GET /:id api on a non existing id', async () => {
                const response = await request(server).get('/table/10');

                assert.equal(response.status, 404);
                assert.deepEqual(response.body, {});
                assert.equal(middlewareCalled, true);
            });

            it('should update an object when using the PUT /:id api', async () => {
                let response = await request(server).put('/table/1')
                    .send({
                        foo: 'baz',
                        bar: 10,
                    });
                assert.equal(middlewareCalled, true);

                assert.deepEqual(response.body, { id: 1, foo: 'baz', bar: 10 });

                response = await request(server).get('/table/1');

                assert.deepEqual(response.body, { id: 1, foo: 'baz', bar: 10 });
            });

            it('should create an object when using the POST api', async () => {
                let response = await request(server).post('/table')
                    .send({
                        foo: 'mytest',
                        bar: 1000,
                    });
                assert.equal(middlewareCalled, true);

                const id = response.body.id;

                assert.deepEqual(response.body, { id, foo: 'mytest', bar: 1000 });

                response = await request(server).get('/table/' + id);

                assert.deepEqual(response.body, { id, foo: 'mytest', bar: 1000 });
            });

            it('should delete an object when using the DELETE /:id api', async () => {
                let response = await request(server).delete('/table/1');
                assert.equal(middlewareCalled, true);

                assert.deepEqual(response.body, { id: 1 });

                response = await request(server).get('/table/1');

                assert.equal(response.status, 404);
                assert.deepEqual(response.body, {});
            });
        });
    });

    describe('file specific', async () => {
        beforeEach(async () => {
            const connection = await fileConnection(cachePath);
            setDefaultConnection(connection);
        });

        afterEach(() => {
            if (fs.existsSync(cachePath)) {
                fs.rmSync(cachePath, { recursive: true });
            }
            setDefaultConnection(null);
        });

        describe('cache', () => {
            it('should create expected cache file', async () => {
                const model = Model.create({
                    table: "table",
                    fields: {},
                });
                await model.init();
                assert(fs.existsSync(filePath));
            });
        });

        it('should handle nulls in strings that are optional but have a length', async () => {
            const model = Model.create({
                table: "table",
                fields: {
                    field1: {
                        type: FIELD_TYPE.STRING,
                        size: 100,
                    },
                },
            });

            await model.init();

            await model.insert({
                field1: null,
            });

            let data = await model.search({});
            assert.deepStrictEqual(data[0], { id: 1, field1: null });

            await model.update(1, { field1: 'foo'});
            await model.update(1, { field1: null});

            data = await model.search({});
            assert.deepStrictEqual(data[0], { id: 1, field1: null });
        });
    });
});