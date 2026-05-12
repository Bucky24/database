import assert from 'assert';
import { Connection } from '../src/connections/server';
import { Model } from '../src/model';
import { FIELD_META, FIELD_TYPE } from '../src/types';
import { WHERE_ARITHMATIC, WHERE_COMPARE, WhereBuilder } from '../src/whereBuilder';
import { forConnections } from './connection_helper';
import { setLog } from '../src/logger';

describe('WhereBuilder', async () => {  
    setLog(false);

    forConnections(async () => {
        let model: Model;

        beforeEach(async () => {
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
            });
            await model.init();
            await model.insert({ foo: 'foo1', bar: 5 });
            await model.insert({ foo: 'foo2', bar: 10 });
            await model.insert({ foo: 'foo3', bar: 15 });
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
            });
            await model2.init();
            await model2.insert({ fooBar: 5 });
            const rows = await model2.search(WhereBuilder.new().compare('fooBar', WHERE_COMPARE.EQ, 5));
            assert.equal(rows.length, 1);
            assert.equal(rows[0]['fooBar'], 5);
        });

        it('should handle a nested table', async () => {
            const model2 = Model.create({
                table: "table2", 
                fields: {
                    id: {
                        type: FIELD_TYPE.INT,
                        meta: [FIELD_META.AUTO]
                    },
                    name: {
                        type: FIELD_TYPE.STRING,
                    },
                },
            });

            await model2.init();

            const model3 = Model.create({
                table: "table3", 
                fields: {
                    tableId: {
                        type: FIELD_TYPE.INT,
                        foreign: {
                            table: model2,
                            field: 'id'
                        },
                    },
                    email: {
                        type: FIELD_TYPE.STRING,
                    },
                },
            });

            await model3.init();

            const m2id1 = await model2.insert({
                name: 'name1',
            });
            const m2id2 = await model2.insert({
                name: 'name2',
            });

            await model3.insert({
                tableId: m2id1,
                email: 'email1',
            });
            await model3.insert({
                tableId: m2id2,
                email: 'email2',
            });

            // use model3 to figure out the ids to search in model2
            const results = await model2.search(WhereBuilder.new().nested({
                externalTable: model3.getTable(),
                localField: 'id',
                externalField: 'tableId',
                where: WhereBuilder.new().compare('email', WHERE_COMPARE.EQ, "email1"),
            }));

            assert.equal(results.length, 1);
            assert.equal(results[0].id, m2id1);
        });

        it('should handle fields in comparison', async () => {
            const model2 = Model.create({
                table: "table2", 
                fields: {
                    field1: {
                        type: FIELD_TYPE.INT,
                    },
                    field2: {
                        type: FIELD_TYPE.INT,
                    },
                },
            });

            await model2.init();

            await model2.insert({
                field1: 5,
                field2: 10,
            });

            let result = await model2.search(WhereBuilder.new().compare(
                'field1',
                WHERE_COMPARE.LT,
                'field.field2',
            ));

            assert.equal(result.length, 1);
        });

        describe('arithmatic', () => {
            it('should handle a numeric check', async () => {
                let results = await model.search(WhereBuilder.new().compare('bar', WHERE_COMPARE.LT, {
                    left: 5,
                    operator: WHERE_ARITHMATIC.PLUS,
                    right: 1,
                }));

                assert.equal(results.length, 1);
                assert.equal(results[0].id, 1);

                results = await model.search(WhereBuilder.new().compare('bar', WHERE_COMPARE.LT, {
                    left: 5,
                    operator: WHERE_ARITHMATIC.PLUS,
                    right: 6,
                }));

                assert.equal(results.length, 2);
                assert.equal(results[0].id, 1);
                assert.equal(results[1].id, 2);

                results = await model.search(WhereBuilder.new().compare('bar', WHERE_COMPARE.GT, {
                    left: 5,
                    operator: WHERE_ARITHMATIC.PLUS,
                    right: 6,
                }));

                assert.equal(results.length, 1);

                results = await model.search(WhereBuilder.new().compare('bar', WHERE_COMPARE.EQ, {
                    left: 5,
                    operator: WHERE_ARITHMATIC.PLUS,
                    right: 5,
                }));
            });

            it('should handle a field inside an arithmatic', async () => {
                const model2 = Model.create({
                    table: "table2", 
                    fields: {
                        field1: {
                            type: FIELD_TYPE.INT,
                        },
                        field2: {
                            type: FIELD_TYPE.INT,
                        },
                    },
                });

                await model2.init();

                await model2.insert({
                    field1: 5,
                    field2: 10,
                });

                const result = await model2.search(WhereBuilder.new().compare(
                    'field1',
                    WHERE_COMPARE.EQ,
                    {
                        left: 'field.field2',
                        right: 5,
                        operator: WHERE_ARITHMATIC.MINUS,
                    },
                ));

                assert.equal(result.length, 1);
            });

            it('should handle two fields inside arithmatic', async () => {
                const model2 = Model.create({
                    table: "table2", 
                    fields: {
                        field1: {
                            type: FIELD_TYPE.INT,
                        },
                        field2: {
                            type: FIELD_TYPE.INT,
                        },
                        field3: {
                            type: FIELD_TYPE.INT,
                        },
                    },
                });

                await model2.init();

                await model2.insert({
                    field1: 5,
                    field2: 10,
                    field3: 15,
                });

                const result = await model2.search(WhereBuilder.new().compare(
                    'field3',
                    WHERE_COMPARE.EQ,
                    {
                        left: 'field.field1',
                        right: 'field.field2',
                        operator: WHERE_ARITHMATIC.PLUS,
                    },
                ));

                assert.equal(result.length, 1);
            });
        });
    });
});