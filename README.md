# @bucky24/database
A simple model system for node that allows connecting to multiple types of data source.

If you've found this, there are probably better modules for this with lots of fancy bells and whistles. I built this because I was bored but not bored enough to actually look up and learn any of those other modules.

# Usage

There are two steps to using the module. The first is to setup a connection, and the second is to create models to actually manipulate the data.

## Connection

Currently only file connections are supported. While you can create a Connection directly, it's recommended to call one of the helper methods.

### Connection.fileConnection

Creates a connection that represents a connection to a flat file.

| Param | Type | Description |
|---|---|---|
| data directory | String | A file path indicating where to place the data files |

Example:

```
const connection = Connection.fileConnection(path.join(__dirname, "cache"));
```

### Connection.setDefaultConnection

This method takes in a Connection and sets it as the default connection for models to use going forward. Note that this affects previously create models as well.

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

## Model

Models contain the code to actually setup and manipulate data.

### Constructor

Allows creating a new Model for use in your program. It's recommended that you create these as singletons.

| Param | Type | Description |
|---|---|---|
| tableName | String | Name of the table we're connecting to |
| fields | Object | Keys being the name of the field, and values being a Field object |
| version | Integer | Version of the table structure. Unused |

#### Field

A Field is an object with the following parameters:

| Param | Type | Description |
|---|---|---|
| type | FIELD_TYPE | Type of the field. Required |
| meta | Array | Array of FIELD_META. Not required |

Example:

```
const tableModel = new Model("sample_table", {
    field1: {
        type: FIELD_TYPE.STRING,
        meta: [FIELD_META.REQUIRED, FIELD_META.AUTO],
    },
}, 1);
```

Note that the Model will automatically add an "id" field with type of FIELD_TYPE.INT that is a required auto-increment field. You can override this field if you desire.


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

Example:

```
const objects = await tableModel.get({
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