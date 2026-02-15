import assert from "assert";
import { FIELD_TYPE, Model } from "../client";
import { MigrationHandler } from "../src/migration";
import { forConnections } from "./connection_helper";

describe('Migrations', async () => {
    forConnections(async () => {
        describe('MigrationHandler', async () => {
            afterEach(() => {
                MigrationHandler.resetMigrations();
            })

            it('should run a migration as expected but only once', async () => {
                const model = Model.create({
                    table: 'foo',
                    fields: {
                        bar: {
                            type: FIELD_TYPE.INT,
                        },
                    },
                });
                await model.init();

                await model.insert({
                    bar: 1,
                });
                await model.insert({
                    bar: 1,
                });

                MigrationHandler.registerMigration('migration1', async () => {
                    const rows = await model.search();
                    for (const row of rows) {
                        await model.update(row.id, {
                            bar: row.bar + 1,
                        });
                    }
                });

                await MigrationHandler.runMigrations();

                let rows = await model.search();
                for (const row of rows) {
                    assert.equal(row.bar, 2);
                }

                await MigrationHandler.runMigrations();

                // should be no change
                rows = await model.search();
                for (const row of rows) {
                    assert.equal(row.bar, 2);
                }
            });
        });
    });
});