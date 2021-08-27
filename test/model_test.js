const assert = require('assert');
const path = require('path');
const { Model } = require('../src/model');
const { Connection, setDefaultConnection } = require('../src/connection');

const cachePath = path.join(__dirname, 'cache_dir');

const assertThrows = (fn, message) => {
    let error = null;
    try {
        fn();
    } catch (e) {
        error = e;
    }
    
    assert(error !== null);
    assert.equal(error.message, message);
}

describe('model', () => {    
    describe('setup', () => {
        it('should error when no default connection set', () => {
            setDefaultConnection(null);
            assertThrows(() => {
                const model = new Model('table', [], 1);
            }, "No default connection set");
        });
        
        it('should error when default connection is unknown type', () => {
            const connection = new Connection('bad_type', {});
            setDefaultConnection(connection);
            assertThrows(() => {
                const model = new Model('table', [], 1);
            }, "Unexpected connection type bad_type");
        });
    });

    describe('FILE', () => {
        beforeEach(() => {
            const connection = Connection.fileConnection(cachePath);
            setDefaultConnection(connection);
        });
    
        afterEach(() => {
            setDefaultConnection(null);
        });

        it('should create expected cache file', () => {
            //const model = new Model()
        });
    });
});