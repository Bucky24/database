const path = require('path');
const { Model, FIELD_META, FIELD_TYPE, Connection, setDefaultConnection } = require('../../index.js');

const cacheDir = path.join(__dirname, 'cache');
const connection = Connection.fileConnection(cacheDir);

const model = new Model("example_table", {
    "field1": {
        type: FIELD_TYPE.STRING,
    },
    "field2": {
        type: FIELD_TYPE.STRING,
        meta: [FIELD_META.REQUIRED],
    },
});

(async () => {
    const id = await model.insert({
        field1: 'text',
        field2: 'other text',
    });
    
    const item1 = await model.get(id);
    const item2 = await model.search({ field1: 'text' });
    
    await model.update(id, { field2: 'additional text', field1: null });
    await model.delete(id);
})();