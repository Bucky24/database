export enum WHERE_TYPE {
    AND='where/and',
    OR='where/or',
    COMPARE='where/compare',
};

export enum WHERE_COMPARE {
    EQ='where/eq',
    NE='where/ne',
    LT='where/lt',
    LTE='where/lte',
    GT='where/gt',
    GTE='where/gte',
};

type BuilderFunction = (builder: WhereBuilder) => void;

export class WhereBuilder {
    private type: WHERE_TYPE;
    private children: WhereBuilder[];
    private comparison: WHERE_COMPARE | null;
    private field: string | null;
    private value: any;
    private negated: boolean;

    constructor(type = WHERE_TYPE.AND) {
        this.type = type;
        this.children = [];
        this.comparison = null;
        this.field = null;
        this.value = null;
        this.negated = false;
    }

    static new(): WhereBuilder {
        return new WhereBuilder();
    }

    and(cb: BuilderFunction) {
        const child = new WhereBuilder(WHERE_TYPE.AND);
        cb(child);
        this.children.push(child);
        return this;
    }

    or(cb: BuilderFunction) {
        const child = new WhereBuilder(WHERE_TYPE.OR);
        cb(child);
        this.children.push(child);
        return this;
    }

    compare(field: string, compare: WHERE_COMPARE, value: any) {
        const child = new WhereBuilder(WHERE_TYPE.COMPARE);
        child.comparison = compare;
        child.field = field;
        child.value = value;
        child.negated = false;

        this.children.push(child);

        return this;
    }

    // utils

    getAllFields(): string[] {
        let fields: string[] = [];

        if (this.type === WHERE_TYPE.COMPARE) {
            if (this.field) {
                fields.push(this.field);
            }
        } else if (this.type === WHERE_TYPE.OR || this.type === WHERE_TYPE.AND) {
            for (const child of this.children) {
                const childFields = child.getAllFields();
                fields = fields.concat(childFields);
            }
        }

        // unique
        return Array.from(new Set(fields));
    }

    getType(): string {
        return this.type;
    }

    getField(): string | null {
        return this.field;
    }

    getValue(): any {
        return this.value;
    }

    getComparison(): WHERE_COMPARE | null {
        return this.comparison;
    }

    getChildren(): WhereBuilder[] {
        return this.children;
    }
}