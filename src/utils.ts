export function difference<T>(list1: T[], list2: T[]): T[] {
    const result = list1.filter(x => !list2.includes(x)); 

    return result;
}