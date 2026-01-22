import { NestedObject } from "../../types";
import { WHERE_COMPARE, WHERE_TYPE, WhereBuilder } from "../../whereBuilder";

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

export function doesRowMatchClause(whereClause: WhereBuilder | NestedObject, obj: any) {
    // for some weird reason when we convert to JS, the instanceof is no longer working,
    // so fall back to checking the constructor name
    if (whereClause instanceof WhereBuilder || whereClause.constructor.name === "WhereBuilder") {
        if (whereClause.getType() === WHERE_TYPE.COMPARE) {
            const key = whereClause.getField();
            if (key === null) {
                // we can't really compare against a null field
                return false;
            }
            const value = whereClause.getValue();
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
                const localResult = doesRowMatchClause(child, obj);
                if (localResult) {
                    // for OR, any success is fine
                    return true;
                }
            }
        } else if (whereClause.getType() === WHERE_TYPE.AND) {
            for (const child of whereClause.getChildren()) {
                const localResult = doesRowMatchClause(child, obj);
                if (!localResult) {
                    // for AND, any failure fails all
                    return false;
                }
            }

            return true;
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