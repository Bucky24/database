# @bucky24/database
A simple model system for node that allows connecting to multiple types of data source.

If you've found this, there are probably better modules for this with lots of fancy bells and whistles. I built this because I was bored but not bored enough to actually look up and learn any of those other modules.

# Usage

There are two steps to using the module. The first is to setup a connection, and the second is to create models to actually manipulate the data. You can do these in the same file or different ones. See the examples for examples.

## Connection

Supports JSON file, MySQL, and Postgres connections. While you can create a Connection directly, it's recommended to call one of the helper methods.

### Connection.fileConnection

Creates a connection to a flat file (_not_ a sqlite file). Returns a Promise that resolves to the connection.

| Param | Type | Description |
|---|---|---|
| data directory | String | A file path indicating where to place the data files |

Example:

```
const connection = await Connection.fileConnection(path.join(__dirname, "cache"));
```

### Connection.mysqlConnection

Creates a connection to a mysql database. Returns a Promise that resolves to the connection.

*NOTE*: In order to use mysql you must have the mysql2 module installed. This project has been tested with version 2 of mysql2.

| Param | Type | Description |
|---|---|---|
| connectionObject | Object | An object containing the following keys: "password", "username", "host", "database", or "url", which is a standard MySQL Url string (if "url" is passed all other keys are ignored) |

Examples:

```
const connection = await Connection.mysqlConnection({
    host: 'localhost',
    username: 'user',
    password: 'secretpassword',
    database: 'app_database',
});

const connection = Connection.mysqlConnection({
    url: "mysql://user:secretpassword@localhost/app_database",
});
```

### Connection.postgresConnection

Creates a connection to a postgres database. Returns a Promise that resolves to the connection.

*Note:* In order to use postgres you must have the pg module installed. This project has been tested on version 8 of pg.

| Param | Type | Description |
|---|---|---|
| connectionObject | Object | An object containing the following keys: "password", "username", "host", "database", "port", or "url", which is a standard PostgreSQL URL string (if "url" is passed all other keys are ignored) |

Examples:

```
const connection = await Connection.postgresConnection({
    host: 'localhost',
    usern 'user',
    password: 'secretpassword',
    database: 'app_database',
    port: 3211
});

const connection = Connection.postgresConnection({
    url: "postgresql://user:secretpassword@localhost:3211/app_database",
});
```

### Connection.setDefaultConnection

This method takes in a Connection and sets it as the default connection for all models to use going forward. Note that this affects previously created models as well.

| Param | Type | Description |
|---|---|---|
| connection | Connection | Connection to set as the new default connection |

Example:

```
Connection.setDefaultConnection(connection);
```

### Connection.getDefaultConnection

This method returns the currently set default connection.

Example:

```
const connection = Connection.getDefaultConnection();
```

### close

This method closes a current connection

```
const connection = Connection.getDefaultConnection();
await connection.close();
```

## Model

Models contain the code to actually setup and manipulate data.

### Model.create

Allows creating a new Model for use in your program. It's recommended that you create these as singletons. The following parameters must be passed in as a settings object.

| Param | Type | Description |
|---|---|---|
| table | String | Name of the table to manipulate |
| fields | Object | Keys being the name of the field, and values being a Field object |
| version | Integer | Version of the table structure. Unused currently, though it is stored in a versions table in the database |

Note that the Model will automatically add an "id" field with type of FIELD_TYPE.INT that is a required auto-increment field. You can override this field if you desire.

Also note that you must call `init` on the new Model and wait for it to finish before you can use the model. This ensures that all tables exist in the chosen data system.

#### Field

A Field is an object with the following parameters:

| Param | Type | Description |
|---|---|---|
| type | FIELD_TYPE | Type of the field. Required |
| meta | Array | Array of FIELD_META. Not required |

Example:

```
const tableModel = Model.create({
    table: "sample_table",
    fields: {
        field1: {
            type: FIELD_TYPE.STRING,
            meta: [FIELD_META.REQUIRED, FIELD_META.AUTO],
            size: <optional number, only used for the STRING type>
        },
    },
    version: 1,
});
```

#### FIELD_TYPE

The values of FIELD_TYPE are:

| Name | Description |
|---|---|
| INT | Integer value |
| STRING | Open length text value |
| BIGINT | Larger integer value |
| JSON | Open length text value that contains JSON data |
| BOOLEAN | Boolean data |

#### FIELD_META

The values of FIELD_META are:

| Name | Description |
|---|---|
| AUTO | Indicates this field is an auto-increment field. There should only be one of these. |
| REQUIRED | Indicates the given field is required (inserts that do not contain this field will fail and updates that set it to null will fail) |
| FILTERED | Indicates the given field shouldn't be exposed to clients and should be filtered out upon request. |

#### ORDER

The values of ORDER are:

| Name | Description |
|---|---|
| ASC | Indicates it should be ordered ascending |
| DESC | Indicates that it should be ordered descending |

### init

The `init` method performs the work to setup the table with given fields in your chosen database. It returns a promise that must resolve before any other methods are safe to call.

### get

The get method takes in an ID and returns the data object associated with that ID (if it exists).

| Param | Type | Description |
|---|---|---|
| id | Integer | ID of the object to retrieve. Required |

Example:

```
const object = await tableModel.get(obj_id);
```

### search

The search method takes in a query to search for and returns all objects that match (or an empty array if there are none).

| Param | Type | Description |
|---|---|---|
| query | Object | An object with keys being the fields to look for and values being the expected value. Required |
| order | Object | An object with keys being the fields to order by and values being one of ORDER. Note these fields are not escaped due to a limitation in `node-mysql`. Optional |
| limit | Integer | Indicates how many results to return. Optional |
| offset | Integer | Indicates how many results should be skipped. Optional. Note MySQL does not allow an offset without a limit. |

Example:

```
const objects = await tableModel.get({
    field1: 5,
});
```

### count

The count method takes in a query to search for and returns the total number of rows that matched.

| Param | Type | Description |
|---|---|---|
| query | Object | An object with keys being the fields to look for and values being the expected value. Required |

Example:

```
const numberOfRows = await tableModel.count({
    field1: 5,
});
```

### insert

The insert method inserts a new object into the data store, returning the newly generated auto-incremented id. At this time it does not return other auto-incremented values.

| Param | Type | Description |
|---|---|---|
| data | Object | An object with keys being the fields and values being the value to insert. Required |

Example:

```
const new_id = await tableModel.insert({
    field1: 5,
});
```

### update

The update method takes in an id and object, making changes to the object in the data store.

| Param | Type | Description |
|---|---|---|
| id | Integer | The ID of the object to update. Required |
| data | Object | An object with keys being the fields and values being the value to update. Setting a field to null will attempt to remove that field from the data store (or set it to null, whichever is more appropriate). Required |

Example:

```
await tableModel.update(obj_id, {
    field1: 5,
});
```

### delete

The delete method takes in an id and removes it if it exists.

| Param | Type | Description |
|---|---|---|
| id | Integer | The ID of the object to remove. Required |

Example:

```
await tableModel.remove(obj_id);
```

### filterForExport

This method takes in a data object and returns a new object with all appropriate fields (fields with the `FILTERED` meta tag) removed. This can be used for prepping data to be returned from an API call or logged. It does not need to be called on an object that came from a Model call, but can be called on any plain JS object.

Example:

```
const userModel = Model.create({
    table: "user",
    fields: {
        password: {
            meta: [FIELD_META.REQUIRED, FIELD_META.FILTERED],
        },
        email: {
            meta: [FIELD_META.REQUIRED],
        },
    },
    version: 1,
});
const userObject = {
    password: 'a_password_hash',
    email: 'test@test.com',
};
const filteredUserObject = userModel.filterForExport(userObject);

// at this point the password has been removed
console.log(filteredUserObject);
```

### Table Changes

If you need to add new fields to a Model, add them to the list then bump the version number. The system will automatically add the new columns the next time `init` is called.

### CRUD Methods

Each table has the capability to generate CRUD methods via Express. The following routes are created:

```
POST /table
PUT /table
GET /table
GET /table/:id
```

Where `table` is the name of the database table for the model.

To create these methods, the `createCrudApis` method can be called, with the following parameters:

| Param | Type | Description |
|---|---|---|
| app | Express App | The Express App or Router to add the new apis to |
| options | CrudOptions | An options array. Optional |

#### CrudOptions

| Key | Type | Description |
|---|---|---|
| middleware | Function | Function[] | A singular or array of functions confirming to Express Middleware |
