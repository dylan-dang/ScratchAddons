/**
 * Throws an Error if the given condition is not truthy.
 * @param {unknown} condition - The assertion condition.
 * @param {string} [message] - The error message to throw if the assertion fails.
 * @return {asserts condition}
 */
export function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
}
