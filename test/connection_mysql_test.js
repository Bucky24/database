/**
 * Warning: This test requires an active and working mysql database. It expects a file, db.json, to exist with the following keys:
 * host, database, username, password
 * This file WILL truncate the entire database once it's done
 */

 const assert = require('assert');
 
 const { Connection } = require('../src/connection');
 const dbAuth = require('./db.json');
 
 describe('connection', () => {
    describe('MYSQL', () => {
        it('should connect with a URL', async () => {
            let connection
            assert.doesNotThrow(() => {
                connection = Connection.mysqlConnection({ url: dbAuth.url });
            });

            // we need to wait for the connection to fully resolve itself before closing it
            // or else we get an error and a test failure
            await new Promise((resolve) => {
                setTimeout(resolve, 50);
            });

            await connection.close();
        });
    });
});