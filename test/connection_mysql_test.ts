/**
 * Warning: This test requires an active and working mysql database. It expects a file, db_mysql.json, to exist with the following keys:
 * host, database, username, password, url
 * This test WILL truncate the entire database once it's done
 */

import assert from 'assert';
 
import { mysqlConnection} from '../src/connections/server';
import dbAuth from './db_mysql.json';
import MysqlConnection from '../src/connections/server/mysqlConnection';

 function run(connection: MysqlConnection, query: string) {
    return connection._query(query);
 }

 function sleep(ms: number) {
    return new Promise ((resolve) => {
        setTimeout(resolve, ms);
    });
 }
 
 describe('connection->MySQL', () => {
    it('should connect with a URL', async () => {
        const connection = await mysqlConnection({ url: dbAuth.url });

        // we need to wait for the connection to fully resolve itself before closing it
        // or else we get an error and a test failure
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });

        await connection.close();
    });

    it('should reconnect after timeout', async function() {
        // we are waiting 3 seconds for timeout, make sure test does not timeout
        this.timeout(5000);
        const connection = await mysqlConnection({ url: dbAuth.url });
        await connection.init();

        const query = "set session wait_timeout = 2";
        await run(connection, query);

        await sleep(3000);

        assert.equal(await connection.getConnection(false), null);

        // should recreate the connection
        const dbConnection = connection.getConnection();
        assert.notEqual(dbConnection, null);

        await connection.close();
    });
});