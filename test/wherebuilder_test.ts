import assert from 'assert';
import { Connection } from '../src/connections/server';
import { Model } from '../src/model';
import { FIELD_TYPE } from '../src/types';
import { WHERE_COMPARE, WhereBuilder } from '../src/whereBuilder';
import { forConnections } from './connection_helper';
import { setLog } from '../src/logger';

interface ConnectionData {
    setup: () => Promise<Connection>,
    teardown: () => Promise<void>,
}

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
    });
});