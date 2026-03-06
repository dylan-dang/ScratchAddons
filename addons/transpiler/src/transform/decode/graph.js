import { RuntimeBlock } from "./block.js";

/**
 * Wrapper around ScratchVM.Blocks
 * graph.getBlock(id) returns RuntimeBlock with getNext(), getParent(), getInput().
 */
export class RuntimeBlockGraph {
  /**
   * @param {ScratchVM.Target} target
   */
  constructor(target) {
    this.target = target;
    this.blocks = target.blocks;
  }

  /**
   * @param {string | null} id
   * @returns {RuntimeBlock | null}
   */
  getBlock(id) {
    if (!id) return null;
    const block = this.blocks.getBlock(id);
    if (!block) return null;
    return new RuntimeBlock(block, this);
  }

  /**
   * @param {Iterable<string>} [opcodes]
   * @returns {IterableIterator<RuntimeBlock>}
   */
  *getBlocks(opcodes) {
    const opcodesSet = opcodes ? new Set(opcodes) : null;
    for (const block of Object.values(this.blocks._blocks)) {
      if (!block || typeof block !== "object" || Array.isArray(block)) continue;
      if (opcodesSet && !opcodesSet.has(block.opcode)) continue;
      const wrapped = this.getBlock(block.id);
      if (wrapped) yield wrapped;
    }
  }

  /**
   * @returns {IterableIterator<RuntimeBlock>}
   */
  *getScripts() {
    for (const id of this.blocks.getScripts()) {
      const block = this.getBlock(id);
      if (block) yield block;
    }
  }

  /**
   * Replace a block with another in the graph. Caller must delete the replaced block afterward.
   * @param {RuntimeBlock} block
   * @param {RuntimeBlock} replacement
   */
  replaceBlock(block, replacement) {
    const rawBlock = block.ref;
    const rawReplacement = replacement.ref;
    const parent = rawBlock.parent ? this.blocks.getBlock(rawBlock.parent) : null;
    if (parent) {
      if (parent.next === rawBlock.id) parent.next = rawReplacement.id;
      for (const input of Object.values(parent.inputs || {})) {
        if (!input || input.block !== rawBlock.id) continue;
        input.block = rawReplacement.id;
      }
    }
    const next = rawBlock.next ? this.blocks.getBlock(rawBlock.next) : null;
    if (next) next.parent = rawReplacement.id;
    this.blocks._deleteScript(rawReplacement.id);
    rawReplacement.parent = rawBlock.parent;
    rawReplacement.next = rawBlock.next;
    rawBlock.parent = null;
    rawBlock.next = null;
  }

  /**
   * @param {string} id
   */
  deleteBlockTree(id) {
    this.blocks.deleteBlock(id);
  }
}
