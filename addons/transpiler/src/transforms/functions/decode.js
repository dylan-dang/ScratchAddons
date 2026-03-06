import { assert } from "../../utils.js";
import { FunctionBlockType, Signature } from "./shared.js";

/** @typedef {import("../../transform/decode/graph.js").RuntimeBlockGraph} RuntimeBlockGraph */
/** @typedef {import("../../transform/decode/block.js").RuntimeBlock} RuntimeBlock */

/**
 * Decode Scratch-compatible format back to function blocks (load direction).
 * @param {RuntimeBlockGraph} graph
 */
export function decode(graph) {
  transpileDefinitions(graph);
  transpileReturns(graph);
  assert(!hasStackReferences(graph), "Stack references found in blocks after transpile");
  graph.target.deleteVariable(Signature.STACK);
}

/**
 * @param {RuntimeBlockGraph} graph
 * @returns {boolean}
 */
function hasStackReferences(graph) {
  for (const block of graph.getBlocks()) {
    for (const field of Object.values(block.fields)) {
      if (field.id === Signature.STACK) return true;
    }
  }
  return false;
}

/**
 * @param {RuntimeBlock} block
 * @returns {IterableIterator<RuntimeBlock>}
 */
function* getStackReferences(block) {
  if (block.opcode === "data_itemoflist" && block.getField("LIST")?.id === Signature.STACK) yield block;
  for (const { block: inputBlock } of block.getInputs()) {
    if (!inputBlock) continue;
    yield* getStackReferences(inputBlock);
  }
}

/**
 * @param {RuntimeBlock} block
 * @returns {RuntimeBlock[]}
 */
function getSortedStackReferences(block) {
  return Array.from(getStackReferences(block)).sort((a, b) => {
    const indexBlockA = a.getInputBlock("INDEX");
    const indexBlockB = b.getInputBlock("INDEX");
    assert(indexBlockA && indexBlockB, "Stack reference block missing INDEX input");
    const valA = Number.parseInt(indexBlockA.getField("NUM")?.value ?? "");
    const valB = Number.parseInt(indexBlockB.getField("NUM")?.value ?? "");
    return valB - valA;
  });
}

/**
 * Replace a stack reference block with the corresponding function call.
 * @param {RuntimeBlock} stackRef
 * @param {RuntimeBlock} correspondingCall
 */
function dereferenceCall(stackRef, correspondingCall) {
  assert(correspondingCall.mutation?.proccode, "Corresponding call without proccode");
  const proccode = correspondingCall.mutation.proccode.slice(Signature.FUNCTION.length);
  stackRef.assign({
    opcode: FunctionBlockType.CALL,
    fields: {},
    mutation: {
      ...correspondingCall.mutation,
      proccode,
    },
  });
  correspondingCall.moveInputsTo(stackRef);
  correspondingCall.delete();
}

/**
 * Remove a stack deleter block (data_deleteoflist or control_repeat wrapper).
 * @param {RuntimeBlock | null} blockToRemove
 * @param {number} deleteCount
 */
function deleteDeleter(blockToRemove, deleteCount) {
  assert(blockToRemove, "Stack deleter block not found");

  /** @type {RuntimeBlock | null} */
  let deleter = blockToRemove;
  if (blockToRemove.opcode === "control_repeat") {
    const timesBlock = blockToRemove.getInputBlock("TIMES");
    assert(timesBlock, "Repeater missing TIMES input");
    assert(timesBlock.opcode === "math_whole_number", "TIMES block is not a math_whole_number block");
    const timesValue = Number.parseInt(timesBlock.getField("NUM")?.value ?? "", 10);
    assert(timesValue, "Repeater has invalid TIMES value");
    assert(timesValue === deleteCount, "Repeater has invalid TIMES value");

    deleter = blockToRemove.getInputBlock("SUBSTACK");
    assert(deleter, "Repeater missing SUBSTACK");
    assert(!deleter.getNext(), "SUBSTACK block has next block");
  }

  assert(deleter.opcode === "data_deleteoflist", "Stack deleter block is not a data_deleteoflist block");
  assert(deleter.getField("LIST")?.id === Signature.STACK, `Stack deleter block has incorrect LIST field`);
  // TODO: Verify INDEX input is 2 for calls or stack pushes, 1 otherwise

  blockToRemove.delete();
}

/**
 * @param {RuntimeBlock} block
 * @returns {RuntimeBlock}
 */
function foldCallSite(block) {
  /** @type {RuntimeBlock[]} */
  const callStack = [];
  /** @type {RuntimeBlock | null} */
  let curr = block;
  /** @type {RuntimeBlock | null} */
  let foldedStatement = null;

  do {
    assert(curr, "Unexpected end of atomic function call stack");
    const stackRefs = getSortedStackReferences(curr);

    for (const stackRef of stackRefs) {
      const correspondingCall = callStack.pop();
      assert(correspondingCall, "Malformed call stack: stack reference without matching call");
      dereferenceCall(stackRef, correspondingCall);
    }

    if (stackRefs.length) {
      foldedStatement = curr;
      deleteDeleter(curr.getNext(), stackRefs.length);
    }

    if (curr.opcode === "procedures_call" && curr.mutation?.proccode.startsWith(Signature.FUNCTION)) {
      callStack.push(curr);
    }

    curr = curr.getNext();
  } while (callStack.length);

  assert(foldedStatement, "Fold produced no folded statement");
  return foldedStatement;
}

/**
 * @param {RuntimeBlock} topBlock
 * @param {RuntimeBlock} prototype
 */
function transpileFunctionDefinitions(topBlock, prototype) {
  assert(prototype.mutation, "Function prototype without mutation");
  topBlock.opcode = FunctionBlockType.DEFINITION;
  prototype.opcode = FunctionBlockType.PROTOTYPE;
  prototype.mutation.proccode = prototype.mutation.proccode.slice(Signature.FUNCTION.length);
  let lastBlock = topBlock;
  let nextBlock = lastBlock.getNext();
  while (nextBlock) {
    lastBlock = nextBlock;
    nextBlock = lastBlock.getNext();
  }
  const indexBlock = lastBlock.getInputBlock("INDEX");
  const itemBlock = lastBlock.getInputBlock("ITEM");
  if (
    lastBlock.opcode === "data_insertatlist" &&
    lastBlock.getField("LIST")?.id === Signature.STACK &&
    indexBlock &&
    itemBlock &&
    indexBlock.getField("NUM")?.value === "1" &&
    itemBlock.getField("TEXT")?.value === ""
  ) {
    lastBlock.delete();
  }
}

/**
 * @param {RuntimeBlockGraph} graph
 * @param {RuntimeBlock} topBlock
 * @param {RuntimeBlock} prototype
 */
function transpileAtomicDefinitions(graph, topBlock, prototype) {
  assert(prototype.mutation, "Atomic prototype without mutation");
  const statement = topBlock.getNext();
  assert(statement, "Atomic definition without body");
  assert(!statement.getNext(), "Atomic definition body has next block");
  const proccode = prototype.mutation.proccode;
  for (const call of graph.getBlocks(["procedures_call"])) {
    if (call.mutation?.proccode !== proccode) continue;
    call.replaceWith(statement);
  }
  topBlock.delete();
}

/**
 * @param {RuntimeBlockGraph} graph
 */
function transpileDefinitions(graph) {
  for (const topBlock of graph.getBlocks(["procedures_definition"])) {
    const prototype = topBlock.getInputBlock("custom_block");
    if (!prototype) continue;

    if (!prototype || prototype.opcode !== "procedures_prototype") {
      console.warn("Function definition without prototype", topBlock);
      continue;
    }

    if (!prototype.mutation) {
      console.warn("Function prototype without mutation", prototype);
      continue;
    }

    if (prototype.mutation.proccode.startsWith(Signature.FUNCTION)) {
      transpileFunctionDefinitions(topBlock, prototype);
    }

    // call sites should only exist in an atomic context
    if (prototype.mutation?.warp === "true") {
      walkCallSites(graph, topBlock);
    }

    if (prototype.mutation.proccode.startsWith(Signature.ATOMIC)) {
      transpileAtomicDefinitions(graph, topBlock, prototype);
    }
  }
}

/**
 * @param {RuntimeBlockGraph} graph
 * @param {RuntimeBlock} start
 */
function walkCallSites(graph, start) {
  /** @type {RuntimeBlock | null} */
  let block = start;
  while (block) {
    if (block.opcode === "procedures_call" && block.mutation?.proccode.startsWith(Signature.FUNCTION)) {
      block = foldCallSite(block);
    }
    for (const { name, block: substackBlock } of block.getInputs()) {
      if (!name.startsWith("SUBSTACK")) continue;
      if (!substackBlock) continue;
      walkCallSites(graph, substackBlock);
    }
    block = block.getNext();
  }
}

/**
 * @param {RuntimeBlockGraph} graph
 */
function transpileReturns(graph) {
  for (const block of graph.getBlocks(["data_insertatlist"])) {
    if (block.getField("LIST")?.id !== Signature.STACK) continue;

    const indexBlock = block.getInputBlock("INDEX");
    assert(indexBlock, "Stack insertion block has no index input");
    assert(indexBlock.getField("NUM")?.value === "1", "Unexpected stack insertion block");

    const stopBlock = block.getNext();
    assert(stopBlock, "Unexpected stack insertion block next block not found");

    assert(
      stopBlock.opcode === "control_stop",
      `Unexpected stack insertion block has non-stop next block ${stopBlock.opcode}`
    );

    assert(
      stopBlock.getField("STOP_OPTION")?.value === "this script",
      "Unexpected stack insertion next block does not stop this script"
    );

    const INDEX = block.getInput("INDEX");
    assert(INDEX, "Stack insertion block has no INDEX input");
    INDEX.block?.delete();
    INDEX.shadow?.delete();

    stopBlock.delete();

    block.assign({
      opcode: FunctionBlockType.RETURN,
      fields: {},
      next: null,
      inputs: {
        ITEM: block.getInput("ITEM")?.raw,
      },
    });

    const indexInput = block.ref.inputs?.INDEX;
    if (indexInput?.shadow) graph.blocks.deleteBlock(indexInput.shadow);
    delete block.ref.inputs.INDEX;
  }
}
