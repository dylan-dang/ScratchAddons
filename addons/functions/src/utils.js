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
 * Waits until an element renders, then return the element.
 * @param {string} selector - argument passed to querySelector.
 * @returns {Promise<Element>} - element found.
 */
export async function waitForElement(selector) {
    const element = document.querySelector(selector);
    if (element) return element;

    return new Promise((resolve) => {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    const element = document.querySelector(selector);
                    if (element) {
                        resolve(element);
                        observer.disconnect();
                    }
                }
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    });
}
