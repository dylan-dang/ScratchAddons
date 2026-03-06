/**
 * A listenable state object for transpiled state.
 */
const state = {
  /** @type {boolean} */
  _transpiled: false,

  /** @type {Set<((v: boolean) => void)>} */
  _listeners: new Set(),

  get transpiled() {
    return this._transpiled;
  },

  set transpiled(newValue) {
    if (this._transpiled !== newValue) {
      this._transpiled = newValue;
      for (const cb of this._listeners) cb(newValue);
    }
  },
  /**
   * Listen for state changes.
   * @param {(v: boolean) => void} cb
   * @returns {() => void} Unsubscribe
   */
  listen(cb) {
    this._listeners.add(cb);
    return () => {
      this._listeners.delete(cb);
    };
  },
};

export default state;
