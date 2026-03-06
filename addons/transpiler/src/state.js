/**
 * Minimal atom-based state. Each atom holds a value and notifies subscribers on change.
 *
 * @template T
 * @param {T} initial
 * @returns {{ get: () => T, set: (value: T) => void, subscribe: (cb: (value: T) => void) => () => void }}
 */
export function atom(initial) {
  let value = initial;
  const listeners = new Set();

  return {
    get() {
      return value;
    },
    set(v) {
      if (value !== v) {
        value = v;
        for (const cb of listeners) cb(v);
      }
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

export const buildState = atom(false);
