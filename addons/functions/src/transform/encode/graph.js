import { InputType, RegisteredBlock } from "./block.js";

export class SerializedBlockGraph {
  /**
   * @param {{
   *   blocks: Serialized.Target["blocks"],
   *   Blockly: ScratchBlocks.Blockly
   * }} dependencies
   */
  constructor(dependencies) {
    this.blocks = dependencies.blocks;
    this.Blockly = dependencies.Blockly;
  }

  /**
   * @param {Omit<Serialized.Block, "parent" | "next">} unlinkedBlock
   * @returns {RegisteredBlock}
   */
  register(unlinkedBlock) {
    const blockId = this.Blockly.utils.genUid();
    /** @type {Serialized.Block} */
    const block = { ...unlinkedBlock, parent: null, next: null };
    this.blocks[blockId] = block;
    return new RegisteredBlock(block, blockId, this);
  }

  /**
   * @private
   * @param {string | Serialized.Primitive | null} referenceId
   */
  deleteTreeReference(referenceId) {
    if (typeof referenceId !== "string") return;
    const block = this.getBlock(referenceId);
    if (!block) return;
    this.deleteTree(block);
  }

  /**
   * @param {RegisteredBlock} block
   */
  deleteTree(block) {
    delete this.blocks[block.id];
    /**
     * @param {string | Serialized.Primitive} refId
     */
    for (const input of Object.values(block.ref.inputs)) {
      if (!input) continue;
      const [type] = input;
      switch (type) {
        case InputType.DifferentShadow:
          this.deleteTreeReference(input[2]);
        // fallthrough
        case InputType.SameShadow:
        case InputType.NoShadow:
          this.deleteTreeReference(input[1]);
      }
    }
  }

  /**
   * @param {Iterable<string>} [opcodes]
   * @returns {IterableIterator<RegisteredBlock>}
   */
  *getBlocks(opcodes) {
    const opcodesSet = new Set(opcodes);
    for (const [id, block] of Object.entries(this.blocks)) {
      if (Array.isArray(block)) continue;
      if (opcodes && !opcodesSet.has(block.opcode)) continue;
      yield new RegisteredBlock(block, id, this);
    }
  }

  /**
   * @param {string | null} [id] - The ID of the block to get.
   * @returns {RegisteredBlock | null} - The block with the given ID, or null if the block does not exist.
   */
  getBlock(id) {
    if (!id) return null;
    const block = this.blocks[id];
    if (!block) return null;
    if (Array.isArray(block)) throw Error("Unexpected primitive block");
    return new RegisteredBlock(block, id, this);
  }
}
