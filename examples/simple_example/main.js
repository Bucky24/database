const path = require('path');
const { Model, FIELD_META, FIELD_TYPE, Connection } = require('../../build/index.js');

(async () => {
    const cacheDir = path.join(__dirname, 'cache');
    const connection = await Connection.fileConnection(cacheDir);
    Connection.setDefaultConnection(connection);

    const model = Model.create({
        table: "example_table",
        fields: {
            "field1": {
                type: FIELD_TYPE.STRING,
            },
            "field2": {
                type: FIELD_TYPE.STRING,
                meta: [FIELD_META.REQUIRED],
            },
        },
        version: 1,
    });

    await model.init();
    const id = await model.insert({
        field1: 'text',
        field2: 'other text',
    });
    
    const item1 = await model.get(id);
    const item2 = await model.search({ field1: 'text' });

    console.log(item1);
    console.log(item2);
    
    await model.update(id, { field2: 'additional text', field1: null });
    await model.delete(id);
})();