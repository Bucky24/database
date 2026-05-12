import { NestedObject } from "../../types";
import { NestedWhere, WHERE_ARITHMATIC, WHERE_COMPARE, WHERE_TYPE, WhereArithmatic, WhereBuilder, WhereBuilderValue } from "../../whereBuilder";

export function compareValues(value1: any, value2: any, negated = false) {
    const result = (res: boolean) => {
        if (negated) {
            return !res;
        }

        return res;
    }
    if (value2 === undefined && value1 === null) {
        return result(true);
    }

    if (Array.isArray(value1)) {
        if (!value1.includes(value2)) {
            return result(false);
        }
    } else if (value1 === false) {
        if (value2) {
            return result(false);
        }
    } else {
        if (value2 != value1) {
            return result(false);
        }
    }

    return result(true);
}

function extractWhereValue(obj: any, value: WhereBuilderValue): any {
    if (typeof value === "string") {
        if (value.startsWith("field.")) {
            const [_, field] = value.split("field.");
            return obj[field];
        }

        return value;
    }
    
    if (typeof value === "number" || value === null) {
        return value;
    }

    // must be an object then
    const valueAsObj = value as Object;

    // only valid object is a WhereArithmatic
    if (valueAsObj.hasOwnProperty('operator')) {
        const arithmatic = valueAsObj as WhereArithmatic;

        const left = extractWhereValue(obj, arithmatic.left);
        const right = extractWhereValue(obj, arithmatic.right);

        switch (arithmatic.operator) {
            case WHERE_ARITHMATIC.PLUS:
                return left + right;
            case WHERE_ARITHMATIC.MINUS:
                return left - right;
            case WHERE_ARITHMATIC.DIVIDE:
                return left / right;
            case WHERE_ARITHMATIC.TIMES:
                return left * right;
            default:
                throw new Error(`Invalid arithmatic operator ${arithmatic.operator}`);
        }
    }

    // failure
    throw new Error(`Invalid where value ${value}`);
}

export async function doesRowMatchClause(whereClause: WhereBuilder | NestedObject, obj: any, nestedSearch: (nested: NestedWhere) => Promise<any[]>) {
    // for some weird reason when we convert to JS, the instanceof is no longer working,
    // so fall back to checking the constructor name
    if (whereClause instanceof WhereBuilder || whereClause.constructor.name === "WhereBuilder") {
        if (whereClause.getType() === WHERE_TYPE.COMPARE) {
            const key = whereClause.getField();
            if (key === null) {
                // we can't really compare against a null field
                return false;
            }
            const value = extractWhereValue(obj, whereClause.getValue());
            if (whereClause.getComparison() === WHERE_COMPARE.EQ) {
                return compareValues(value, obj[key]);
            } else if (whereClause.getComparison() === WHERE_COMPARE.NE) {
                return compareValues(value, obj[key], true);
            } else if (whereClause.getComparison() === WHERE_COMPARE.LT) {
                return obj[key] < value;
            } else if (whereClause.getComparison() === WHERE_COMPARE.LTE) {
                return obj[key] <= value;
            } else if (whereClause.getComparison() === WHERE_COMPARE.GT) {
                return obj[key] > value;
            } else if (whereClause.getComparison() === WHERE_COMPARE.GTE) {
                return obj[key] >= value;
            } else {
                throw new Error(`Unknown WhereBuilder Compare type ${whereClause.getComparison()}`);
            }
        } else if (whereClause.getType() === WHERE_TYPE.OR) {
            for (const child of whereClause.getChildren()) {
                const localResult = await doesRowMatchClause(child, obj, nestedSearch);
                if (localResult) {
                    // for OR, any success is fine
                    return true;
                }
            }
        } else if (whereClause.getType() === WHERE_TYPE.AND) {
            for (const child of whereClause.getChildren()) {
                const localResult = await doesRowMatchClause(child, obj, nestedSearch);
                if (!localResult) {
                    // for AND, any failure fails all
                    return false;
                }
            }

            return true;
        } else if (whereClause.getType() === WHERE_TYPE.NESTED) {
            const nestedResults = await nestedSearch({
                externalTable: whereClause.getTable(),
                externalField: whereClause.getExternalField(),
                localField: whereClause.getField(),
                where: whereClause.getValue() as WhereBuilder | NestedObject,
            });

            const searchValue = obj[whereClause.getField()];

            return nestedResults.includes(searchValue);
        } else {
            throw new Error(`Unknown WhereBuilder type ${whereClause.getType()}`);
        }
    } else {
        let matches = true;
        for (const key in whereClause) {
            const value = whereClause[key];

            const localMatch = compareValues(value, obj[key]);
            if (!localMatch) {
                matches = false;
            }
        }

        return matches;
    }
}