/**
 * Throws an Error if the given condition is not truthy.
 * @param {unknown} condition - The assertion condition.
 * @param {string} [message] - The error message to throw if the assertion fails.
 * @return {asserts condition}
 */
export function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
}

/**
 * Changes the next invocation of a target's method with a replacement
 * @param {any} target
 * @param {string} methodName
 * @param {Function} replacement
 */
export function rebindOnce(target, methodName, replacement) {
    const original = target[methodName];
    target[methodName] = function () {
        // Restore the original method
        target[methodName] = original;
        // Call the replacement with the provided arguments
        return replacement.apply(this, arguments);
    };
}
