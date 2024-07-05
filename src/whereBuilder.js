const WHERE_TYPE = {
    AND: 'where/and',
    OR: 'where/or',
    COMPARE: 'where/compare',
};

const WHERE_COMPARE = {
    EQ: 'where/eq',
    NE: 'where/ne',
    LT: 'where/lt',
    LTE: 'where/lte',
    GT: 'where/gt',
    GTE: 'where/gte',
};

class WhereBuilder {
    constructor(type = WHERE_TYPE.AND) {
        this.type = type;
        this.children = [];
        this.comparison = null;
        this.field = null;
        this.value = null;
        this.negated = false;
    }

    static new() {
        return new WhereBuilder();
    }

    and(cb) {
        const child = new WhereBuilder(WHERE_TYPE.AND);
        cb(child);
        this.children.push(child);
        return this;
    }

    or(cb) {
        const child = new WhereBuilder(WHERE_TYPE.OR);
        cb(child);
        this.children.push(child);
        return this;
    }

    compare(field, compare, value) {
        const child = new WhereBuilder(WHERE_TYPE.COMPARE);
        child.comparison = compare;
        child.field = field;
        child.value = value;
        child.negated = false;

        this.children.push(child);

        return this;
    }

    // utils

    getAllFields() {
        let fields = [];

        if (this.type === WHERE_TYPE.COMPARE) {
            fields.push(this.field);
        } else if (this.type === WHERE_TYPE.OR || this.type === WHERE_TYPE.AND) {
            for (const child of this.children) {
                const childFields = child.getAllFields();
                fields = fields.concat(childFields);
            }
        }

        // unique
        return Array.from(new Set(fields));
    }
}

module.exports = {
    WhereBuilder,
    WHERE_TYPE,
    WHERE_COMPARE,
};