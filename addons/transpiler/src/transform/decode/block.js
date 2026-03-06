/**
 * Wrapper around ScratchVM.Block, mirroring RegisteredBlock from encode.
 * Use block.ref for raw access, block.getNext() / block.getParent() / block.getInput() for traversal.
 */
export class RuntimeBlock {
  /**
   * @param {ScratchVM.Block} ref
   * @param {import("./graph.js").RuntimeBlockGraph} graph
   */
  constructor(ref, graph) {
    this.ref = ref;
    this.graph = graph;
  }

  get id() {
    return this.ref.id;
  }

  get fields() {
    return this.ref.fields || {};
  }

  get opcode() {
    return this.ref.opcode;
  }

  set opcode(value) {
    this.ref.opcode = value;
  }

  get mutation() {
    return this.ref.mutation ?? null;
  }

  /**
   * @returns {RuntimeBlock | null}
   */
  getNext() {
    return this.ref.next ? this.graph.getBlock(this.ref.next) : null;
  }

  /**
   * @returns {RuntimeBlock | null}
   */
  getParent() {
    return this.ref.parent ? this.graph.getBlock(this.ref.parent) : null;
  }

  /**
   * Get the named field value.
   * @param {string} name
   * @returns {ScratchVM.Field | undefined}
   */
  getField(name) {
    return this.fields[name];
  }

  /**
   * @typedef Input
   * @property {string} name
   * @property {RuntimeBlock | null} block
   * @property {RuntimeBlock | null} shadow
   * @property {ScratchVM.Input} raw
   */

  /**
   * Get the input value.
   * @param {string} name
   * @returns {Input | null}
   */
  getInput(name) {
    const input = this.ref.inputs?.[name];
    if (!input) return null;
    const block = this.graph.getBlock(input.block);
    const shadow = this.graph.getBlock(input.shadow);
    return { name, block, shadow, raw: input };
  }

  /**
   * Get the block connected to the named input.
   * @param {string} name
   * @returns {RuntimeBlock | null}
   */
  getInputBlock(name) {
    const input = this.ref.inputs?.[name];
    if (!input?.block) return null;
    return this.graph.getBlock(input.block);
  }

  /**
   * Iterate over blocks referenced by inputs (VM format: { block, shadow }).
   * @returns {IterableIterator<Input>}
   */
  *getInputs() {
    for (const key of Object.keys(this.ref.inputs)) {
      const input = this.getInput(key);
      if (input) yield input;
    }
  }

  delete() {
    this.detach();
    this.graph.deleteBlockTree(this.id);
  }

  /**
   * Detach a block.
   */
  detach() {
    const parent = this.getParent();
    const next = this.getNext();
    // Detach the block from its parent and from its previous/next chain.
    if (parent) {
      // If block is a next of its parent, disconnect
      if (this.is(parent.getNext())) {
        parent.ref.next = this.ref.next;
      }
      // If block is one of parent's inputs, disconnect
      parent.replaceInputReferences(this, null);
    }
    if (next) {
      next.ref.parent = null;
    }
    this.ref.parent = null;
    this.ref.next = null;
  }

  /**
   * Replace input references to this block with references to another block.
   * @param {RuntimeBlock} before
   * @param {RuntimeBlock | null} after
   */
  replaceInputReferences(before, after) {
    for (const { block, shadow, raw } of this.getInputs()) {
      if (before.is(block)) raw.block = after?.id ?? null;
      if (before.is(shadow)) raw.shadow = after?.id ?? null;
    }
  }

  /**
   * @private
   * UNSAFE: Use with caution, as it can break the block graph.
   * relinks parent and next of this block to the replacement block, and vice versa.
   * @param {RuntimeBlock} replacement
   * @param {RuntimeBlock | null} parent
   * @param {RuntimeBlock | null} next
   */
  transferPositionTo(replacement, parent = this.getParent(), next = this.getNext()) {
    if (parent) {
      if (this.is(parent.getNext())) parent.ref.next = replacement.id;
      parent.replaceInputReferences(this, replacement);
    }
    if (next) next.ref.parent = replacement.id;
    replacement.ref.parent = parent?.id ?? null;
    replacement.ref.next = next?.id ?? null;
  }

  /**
   * Replace this block with another (swap positions).
   * @param {RuntimeBlock} other
   */
  replaceWith(other) {
    const parent = this.getParent();
    const next = this.getNext();
    const otherParent = other.getParent();
    const otherNext = other.getNext();
    this.transferPositionTo(other, parent, next);
    other.transferPositionTo(this, otherParent, otherNext);
  }

  /**
   * Move inputs from this block to another.
   * @param {RuntimeBlock} other
   */
  moveInputsTo(other) {
    for (const { block, shadow } of other.getInputs()) {
      if (block) block.delete();
      if (shadow) shadow.delete();
    }
    for (const { block, shadow } of this.getInputs()) {
      if (block) block.ref.parent = other.id;
      if (shadow) shadow.ref.parent = other.id;
    }
    other.ref.inputs = structuredClone(this.ref.inputs);
    this.ref.inputs = {};
  }

  /**
   * @param {RuntimeBlock | null} other
   * @returns {boolean}
   */
  is(other) {
    return this.id === other?.id;
  }

  /**
   * @param {Partial<ScratchVM.Block>} props
   */
  assign(props) {
    Object.assign(this.ref, props);
  }
}
