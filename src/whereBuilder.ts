import { NestedObject } from "./types";

export enum WHERE_TYPE {
    AND='where/and',
    OR='where/or',
    COMPARE='where/compare',
    NESTED='where/nested',
};

export enum WHERE_COMPARE {
    EQ='where/eq',
    NE='where/ne',
    LT='where/lt',
    LTE='where/lte',
    GT='where/gt',
    GTE='where/gte',
};

export type NestedWhere = {
    externalTable: string;
    localField: string;
    externalField: string;
    where: WhereBuilder | NestedObject;
};

type BuilderFunction = (builder: WhereBuilder) => void;

export class WhereBuilder {
    private type: WHERE_TYPE;
    private children: WhereBuilder[];
    private comparison: WHERE_COMPARE | null;
    private field: string | null;
    private externalField: string | null;
    private value: any;
    private table: string | null;

    constructor(type = WHERE_TYPE.AND) {
        this.type = type;
        this.children = [];
        this.comparison = null;
        this.field = null;
        this.externalField = null;
        this.value = null;
        this.table = null;
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

        this.children.push(child);

        return this;
    }

    nested(data: NestedWhere): WhereBuilder {
        const child = new WhereBuilder(WHERE_TYPE.NESTED);
        child.table = data.externalTable;
        child.field = data.localField;
        child.externalField = data.externalField;
        child.value = data.where;

        this.children.push(child);

        return this;
    }

    // utils
    getAllFields(): string[] {
        let fields: string[] = [];

        // nested will not send its child fields, since they will be on a different table
        if (this.type === WHERE_TYPE.COMPARE || this.type === WHERE_TYPE.NESTED) {
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

    getTable(): string | null {
        return this.table;
    }

    getExternalField(): string | null {
        return this.externalField;
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