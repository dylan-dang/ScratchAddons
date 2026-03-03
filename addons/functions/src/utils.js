/**
 * @param {any} item
 * @returns {boolean}
 */
function isObject(item) {
    return item && typeof item === "object" && !Array.isArray(item);
}

/**
 * @template T
 * @typedef {T extends Array<infer U> ? Array<U> :
 * T extends object ? { [P in keyof T]?: DeepPartial<T[P]>; } :
 * T} DeepPartial
 */

/**
 * Recursively merges source properties into a target object.
 * * @template T
 * @param {T} target - The object to be mutated.
 * @param {DeepPartial<T>} source - The object containing updates.
 * @returns {T} The merged target.
 */
export function deepMerge(target, source) {
    for (const key in source) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;

        const sourceValue = source[key];
        const targetValue = /** @type {any} */ (target)[key];

        // handle deletion if source is explicitly undefined
        if (sourceValue === undefined) {
            delete /** @type {any} */ (target)[key];
            continue;
        }

        // handle recursion
        if (isObject(sourceValue) && isObject(targetValue)) {
            deepMerge(targetValue, sourceValue);
        }

        // handle assignment
        else {
        /** @type {any} */ (target)[key] = sourceValue;
        }
    }
    return target;
}
