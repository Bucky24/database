/**
 * Warning: This test requires an active and working postgresql database. It expects a file, db_postgres.json, to exist with the following keys:
 * host, database, username, password, port, url
 * This test WILL truncate the entire database once it's done
 */

 const Connection = require('../src/connections');
 const dbAuth = require('./db_postgres.json');

 describe('connection->PostGres', () => {
    it('should connect with a URL', async () => {
        const connection = await Connection.postgresConnection({ url: dbAuth.url });
        await connection.close();
    });
});