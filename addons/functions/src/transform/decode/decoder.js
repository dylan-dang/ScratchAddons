import { FunctionBlockType, Signature } from "../../shared.js";
import { assert } from "../../utils.js";
import { validate } from "../validator.js";

/** @typedef {import("../../userscript.js").FunctionContext} FunctionContext */

/**
 * @typedef {Object} FoldCallFoldOperation
 * @property {"fold"} type
 * @property {ScratchVM.Block} stackRef
 * @property {ScratchVM.Block & { mutation: ScratchVM.ProcedureCallMutation }} correspondingCall
 */

/**
 * @typedef {Object} FoldCallDeleteDeleterOperation
 * @property {"deleteDeleter"} type
 * @property {ScratchVM.Block} deleter
 */

/**
 * @typedef {FoldCallFoldOperation | FoldCallDeleteDeleterOperation} FoldCallOperation
 */

export class Decoder {
  /**
   * @param {{ vm: ScratchVM.VM }} dependencies
   */
  constructor({ vm }) {
    this.vm = vm;
  }

  /**
   * @param {ScratchVM.Target} target
   */
  transpileTarget(target) {
    const blocks = target.blocks;
    const oldForceNoGlow = blocks.forceNoGlow;
    blocks.forceNoGlow = true;

    this.transpileDefinitions(blocks);
    this.transpileReturns(blocks);
    assert(!this.hasStackReferences(blocks), "Stack references found in blocks after transpile");
    target.deleteVariable(Signature.STACK);

    for (const error of validate(blocks._blocks)) {
      console.warn("Decoding graph validation error: ", error);
    }

    blocks.forceNoGlow = oldForceNoGlow;
  }

  /**
   * Checks if there are any other references to __stack__ list in the blocks.
   * This utility method scans all blocks for usage of the "__stack__" variable,
   * @param {ScratchVM.Blocks} blocks
   * @returns {boolean}
   */
  hasStackReferences(blocks) {
    for (const block of Object.values(blocks._blocks)) {
      if (!block.fields) continue;
      for (const field of Object.values(block.fields)) {
        if (field.id === Signature.STACK) return true;
      }
    }
    return false;
  }

  transpileTargets() {
    const snapshot = this.vm.toJSON();
    try {
      for (const target of this.vm.runtime.targets) {
        this.transpileTarget(target);
      }
      this.vm.refreshWorkspace();
    } catch (error) {
      console.error("Error transpiling targets: ", error);
      this.vm.loadProject(snapshot);
    }
  }

  /**
   * @private
   * @param {ScratchVM.Blocks} blocks
   * @param {ScratchVM.Block} block
   */
  detachBlock(blocks, block) {
    const parent = block.parent ? blocks.getBlock(block.parent) : null;
    const nextId = block.next || null;
    if (parent) {
      if (parent.next === block.id) parent.next = nextId;
      for (const input of Object.values(parent.inputs || {})) {
        if (!input || input.block !== block.id) continue;
        input.block = nextId;
      }
    }
    const next = block.next ? blocks.getBlock(block.next) : null;
    if (next) {
      next.parent = block.parent;
      if (next.parent === null) blocks._addScript(next.id);
    }
    block.parent = null;
    block.next = null;
    blocks._addScript(block.id);
  }

  /**
   * Replace block with replacement in the graph. Caller must delete the replaced block afterward.
   * @private
   * @param {ScratchVM.Blocks} blocks
   * @param {ScratchVM.Block} block
   * @param {ScratchVM.Block} replacement
   */
  replaceBlock(blocks, block, replacement) {
    const parent = block.parent ? blocks.getBlock(block.parent) : null;
    if (parent) {
      if (parent.next === block.id) parent.next = replacement.id;
      for (const input of Object.values(parent.inputs || {})) {
        if (!input || input.block !== block.id) continue;
        input.block = replacement.id;
      }
    }
    const next = block.next ? blocks.getBlock(block.next) : null;
    if (next) next.parent = replacement.id;
    blocks._deleteScript(replacement.id);
    replacement.parent = block.parent;
    replacement.next = block.next;
    block.parent = null;
    block.next = null;
  }

  /**
   * Reparent all blocks that have oldParentId as parent to newParentId.
   * Call before deleting a block to avoid dangling parent references.
   * @private
   * @param {ScratchVM.Blocks} blocks
   * @param {string} oldParentId
   * @param {string} newParentId
   */
  reparentChildren(blocks, oldParentId, newParentId) {
    for (const block of Object.values(blocks._blocks)) {
      if (!block || typeof block !== "object" || Array.isArray(block)) continue;
      if (block.parent === oldParentId) block.parent = newParentId;
    }
  }

  /**
   * @private
   * @param {ScratchVM.Blocks} blocks
   * @param {ScratchVM.Block} block
   * @returns {ScratchVM.Block[]}
   */
  getStackReferences(blocks, block) {
    if (block.opcode === "data_itemoflist" && block.fields.LIST.id === Signature.STACK) return [block];
    return Object.values(block.inputs).flatMap((input) => {
      const refId = input?.block;
      if (!refId) return [];
      const refBlock = blocks.getBlock(refId);
      if (!refBlock) return [];
      return this.getStackReferences(blocks, refBlock);
    });
  }

  /**
   * @private
   * @param {ScratchVM.Blocks} blocks
   * @param {ScratchVM.Block} block
   * @returns {ScratchVM.Block[]}
   */
  getSortedStackReferences(blocks, block) {
    return this.getStackReferences(blocks, block).sort((a, b) => {
      const indexA = a.inputs.INDEX?.block;
      const indexB = b.inputs.INDEX?.block;
      assert(indexA && indexB, "Stack reference block missing INDEX input");
      const blockA = blocks.getBlock(indexA);
      const blockB = blocks.getBlock(indexB);
      assert(blockA && blockB, "Stack reference INDEX block not found");
      const valA = Number.parseInt(blockA.fields.NUM.value);
      const valB = Number.parseInt(blockB.fields.NUM.value);
      return valB - valA;
    });
  }

  /**
   * @private
   * @param {ScratchVM.Blocks} blocks
   * @param {string} blockId
   * @returns {{ foldedStatement: ScratchVM.Block, operations: FoldCallOperation[] }}
   */
  verifyFoldCall(blocks, blockId) {
    /** @type {(ScratchVM.Block & { mutation: ScratchVM.ProcedureCallMutation })[]} */
    const callStack = [];
    let curr = blocks.getBlock(blockId);
    /** @type {ScratchVM.Block | null} */
    let foldedStatement = null;
    /** @type {FoldCallOperation[]} */
    const operations = [];

    do {
      assert(curr, "Unexpected end of atomic function call stack");
      const stackRefs = this.getSortedStackReferences(blocks, curr);

      for (const stackRef of stackRefs) {
        const correspondingCall = callStack.pop();
        assert(correspondingCall, "Malformed call stack: stack reference without matching call");
        operations.push({ type: "fold", stackRef, correspondingCall });
      }

      if (stackRefs.length) {
        foldedStatement = curr;
        assert(curr.next, "Folded statement missing next block");
        let blockToRemove = blocks.getBlock(curr.next);
        assert(blockToRemove, "Stack deleter block not found");

        /** @type {ScratchVM.Block | undefined} */
        let deleter = blockToRemove;
        if (blockToRemove.opcode === "control_repeat") {
          assert(blockToRemove.inputs.TIMES?.block, "Repeater missing TIMES input");
          const timesBlock = blocks.getBlock(blockToRemove.inputs.TIMES?.block);
          assert(timesBlock, "missing TIMES block");
          assert(timesBlock.opcode === "math_whole_number", "TIMES block is not a math_whole_number block");
          const timesValue = Number.parseInt(timesBlock.fields.NUM.value);
          assert(timesValue, "Repeater has invalid TIMES value");
          assert(timesValue === stackRefs.length, "Repeater has invalid TIMES value");

          const deleterId = blockToRemove.inputs.SUBSTACK?.block;
          assert(deleterId, "Repeater missing SUBSTACK");
          deleter = blocks.getBlock(deleterId);
          assert(deleter, "missing SUBSTACK block");
          assert(!deleter.next, "SUBSTACK block has next block");
        }
        assert(deleter.opcode === "data_deleteoflist", "Stack deleter block is not a data_deleteoflist block");
        assert(deleter.fields.LIST.id === Signature.STACK, "Stack deleter block has incorrect LIST field");
        // TODO: Verify INDEX input is 2 for calls or stack pushes, 1 otherwise

        operations.push({ type: "deleteDeleter", deleter: blockToRemove });
      }

      if (curr.opcode === "procedures_call" && curr.mutation?.proccode.startsWith(Signature.FUNCTION)) {
        callStack.push(/** @type {ScratchVM.Block & { mutation: ScratchVM.ProcedureCallMutation }} */ (curr));
      }
      curr = curr.next ? blocks.getBlock(curr.next) : undefined;
    } while (callStack.length);

    assert(foldedStatement, "Fold produced no folded statement");
    return { foldedStatement, operations };
  }

  /**
   * @private
   * @param {ScratchVM.Blocks} blocks
   * @param {FoldCallOperation[]} operations
   */
  applyFoldCall(blocks, operations) {
    for (const op of operations) {
      if (op.type === "fold") {
        const { stackRef, correspondingCall } = op;
        // stack reference is item of list block
        for (const input of Object.values(stackRef.inputs || {})) {
          if (input?.block) blocks.deleteBlock(input.block);
          if (input?.shadow) blocks.deleteBlock(input.shadow);
        }
        stackRef.opcode = FunctionBlockType.CALL;
        stackRef.fields = {};
        stackRef.mutation = correspondingCall.mutation;
        stackRef.mutation.proccode = stackRef.mutation.proccode.slice(Signature.FUNCTION.length);
        stackRef.inputs = correspondingCall.inputs;
        this.reparentChildren(blocks, correspondingCall.id, stackRef.id);
        this.detachBlock(blocks, correspondingCall);
        blocks._deleteScript(correspondingCall.id);
        delete blocks._blocks[correspondingCall.id];
      } else if (op.type === "deleteDeleter") {
        const { deleter } = op;
        this.detachBlock(blocks, deleter);
        blocks.deleteBlock(deleter.id);
      }
    }
  }

  /**
   * @private
   * @param {ScratchVM.Blocks} blocks
   * @param {string} blockId
   * @returns {ScratchVM.Block | null}
   */
  foldCall(blocks, blockId) {
    try {
      const { foldedStatement, operations } = this.verifyFoldCall(blocks, blockId);
      this.applyFoldCall(blocks, operations);
      return foldedStatement;
    } catch (error) {
      console.warn("Error folding call: ", error);
      return null;
    }
  }

  /**
   * @private
   * @param {ScratchVM.Blocks} blocks
   * @param {ScratchVM.Block} topBlock
   * @param {ScratchVM.Block} prototype
   */
  transpileFunctionDefinitions(blocks, topBlock, prototype) {
    assert(prototype.mutation, "Function prototype without mutation");
    topBlock.opcode = FunctionBlockType.DEFINITION;
    prototype.opcode = FunctionBlockType.PROTOTYPE;
    prototype.mutation.proccode = prototype.mutation.proccode.slice(Signature.FUNCTION.length);
    let lastBlock = topBlock;
    while (lastBlock.next) {
      const nextBlock = blocks.getBlock(lastBlock.next);
      if (!nextBlock) break;
      lastBlock = nextBlock;
    }
    const indexInput = lastBlock.inputs.INDEX;
    const itemInput = lastBlock.inputs.ITEM;
    if (
      lastBlock.opcode === "data_insertatlist" &&
      lastBlock.fields.LIST.id === Signature.STACK &&
      indexInput &&
      itemInput &&
      blocks.getBlock(indexInput.block)?.fields.NUM.value === "1" &&
      blocks.getBlock(itemInput.block)?.fields.TEXT.value === ""
    ) {
      this.detachBlock(blocks, lastBlock);
      blocks.deleteBlock(lastBlock.id);
    }
  }

  /**
   * @private
   * @param {ScratchVM.Blocks} blocks
   * @param {ScratchVM.Block} topBlock
   * @param {ScratchVM.Block} prototype
   */
  transpileAtomicDefinitions(blocks, topBlock, prototype) {
    assert(prototype.mutation, "Atomic prototype without mutation");
    if (!topBlock.next) {
      console.warn("Atomic definition without body", topBlock);
      return;
    }
    const foldedStatement = this.foldCall(blocks, topBlock.next);
    if (!foldedStatement) {
      console.warn("Atomic definition without folded statement", topBlock);
      return;
    }
    this.detachBlock(blocks, foldedStatement);
    for (const block of Object.values(blocks._blocks)) {
      if (block.opcode === "procedures_call" && block.mutation?.proccode === prototype.mutation.proccode) {
        this.replaceBlock(blocks, block, foldedStatement);
        blocks.deleteBlock(block.id);
      }
    }
    blocks.deleteBlock(topBlock.id);
  }

  /**
   * @private
   * @param {ScratchVM.Blocks} blocks
   */
  transpileDefinitions(blocks) {
    const scripts = [...blocks.getScripts()];

    for (const script of scripts) {
      const topBlock = blocks.getBlock(script);
      if (!topBlock) continue;
      if (topBlock.opcode !== "procedures_definition") continue;
      if (!topBlock.inputs.custom_block) continue;

      const prototype = blocks.getBlock(topBlock.inputs.custom_block.block);

      if (!prototype || prototype.opcode !== "procedures_prototype") {
        console.warn("Function definition without prototype", topBlock);
        continue;
      }

      if (!prototype.mutation) {
        console.warn("Function prototype without mutation", prototype);
        continue;
      }

      if (prototype.mutation.proccode.startsWith(Signature.FUNCTION)) {
        this.transpileFunctionDefinitions(blocks, topBlock, prototype);
      } else if (prototype.mutation.proccode.startsWith(Signature.ATOMIC)) {
        this.transpileAtomicDefinitions(blocks, topBlock, prototype);
      }

      if (prototype.mutation?.warp === "true") {
        this.walkCallSites(blocks, topBlock);
      }
    }
  }

  /**
   * @private
   * @param {ScratchVM.Blocks} blocks
   * @param {ScratchVM.Block} start
   */
  walkCallSites(blocks, start) {
    let block = start;
    while (block.next) {
      const nextBlock = blocks.getBlock(block.next);
      if (!nextBlock) break;
      block = nextBlock;
      if (block.opcode === "procedures_call" && block.mutation?.proccode.startsWith(Signature.FUNCTION)) {
        block = this.foldCall(blocks, block.id) ?? block;
      }
      if (block.inputs) {
        for (const inputName in block.inputs) {
          if (inputName.startsWith("SUBSTACK") && block.inputs[inputName] && block.inputs[inputName].block) {
            const substackBlock = blocks.getBlock(block.inputs[inputName].block);
            if (substackBlock) {
              this.walkCallSites(blocks, substackBlock);
            }
          }
        }
      }
    }
    return block;
  }

  /**
   * @private
   * @param {ScratchVM.Blocks} blocks
   */
  transpileReturns(blocks) {
    for (const block of Object.values(blocks._blocks)) {
      if (block.opcode !== "data_insertatlist") continue;
      if (block.fields.LIST.id !== Signature.STACK) continue;

      const indexInput = block.inputs.INDEX;
      assert(indexInput, "Stack insertion block has no index input");

      if (blocks.getBlock(indexInput.block)?.fields.NUM.value !== "1") {
        console.warn("Unexpected stack insertion block", block);
        continue;
      }

      const stopBlock = blocks.getBlock(block.next);
      if (!stopBlock) {
        console.warn("Unexpected stack insertion block next block not found", block);
        continue;
      }

      if (stopBlock.opcode !== "control_stop") {
        console.warn("Unexpected stack insertion block has non-stop next block", block, stopBlock);
        continue;
      }

      if (stopBlock.fields.STOP_OPTION.value !== "this script") {
        console.warn("Unexpected stack insertion next block does not stop this script", block, stopBlock);
        continue;
      }

      blocks.deleteBlock(stopBlock.id);
      block.opcode = FunctionBlockType.RETURN;
      block.fields = {};
      block.next = null;

      if (indexInput.block) blocks.deleteBlock(indexInput.block);
      if (indexInput.shadow) blocks.deleteBlock(indexInput.shadow);
      delete block.inputs.INDEX;
    }
  }
}

/** @param {FunctionContext} context */
export function patchDeserialization(context) {
  const { vm } = context;
  const transformer = new Decoder({ vm });
  vm.once("targetsUpdate", () => {
    transformer.transpileTargets();
  });

  return transformer;
}
