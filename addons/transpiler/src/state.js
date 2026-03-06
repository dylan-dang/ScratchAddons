/**
 * A listenable state object
 * @typedef {typeof _state & { listen: <K extends keyof typeof _state>(key: K, cb: (value: typeof _state[K], key: K) => void) => () => void }} TranspilerState
 */

import { assert } from "./utils";

const _state = {
  build: false,
};

/** @type {Map<string | symbol, Set<Function>>} */
const _listeners = new Map();

/**
 * Helper to notify listeners for a given variable
 * @param {string | symbol} key
 * @param {any} value
 */
function _notify(key, value) {
  const set = _listeners.get(key);
  if (set) {
    for (const cb of set) cb(value, key);
  }
}

const state = /** @type {TranspilerState} */ (
  new Proxy(_state, {
    get(target, prop, receiver) {
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      const oldValue = Reflect.get(target, prop, receiver);
      if (oldValue !== value) {
        const result = Reflect.set(target, prop, value, receiver);
        _notify(prop, value);
        return result;
      }
      return true;
    },
  })
);

/**
 * Listen for changes to a specific state variable.
 * @template {keyof typeof _state} K
 * @param {K} key - State variable name
 * @param {(value: typeof _state[K], key: K) => void} cb - Callback for changes
 * @returns {() => void} Unsubscribe function
 */
state.listen = function (key, cb) {
  if (!_listeners.has(key)) {
    _listeners.set(key, new Set());
  }
  const set = _listeners.get(key);
  assert(set, "Set not found");
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) _listeners.delete(key);
  };
};

Object.defineProperty(state, "_listeners", {
  value: _listeners,
  enumerable: false,
  configurable: false,
  writable: false,
});

export default state;
