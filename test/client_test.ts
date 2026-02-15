import assert from 'assert';
import path from 'path';

import { Connection } from '../client';
import { Model } from '../src/model';
import { FIELD_TYPE } from '../src/types';

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

interface ConnectionData {
    setup: () => Promise<Connection.Connection>,
    teardown: () => Promise<void>,
}

describe('Client tests', async () => {  
    Connection.setLog(false);

    const connections: { [key: string]: ConnectionData } = {
        'memory': {
            setup: () => {
                return Connection.memoryConnection();
            },
            teardown: async () => {

            },
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
            });
        });
    }
});