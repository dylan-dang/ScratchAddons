import { assert, rebindOnce } from "../../utils.js";
import { FunctionBlockType } from "./shared.js";

/** @typedef {import("../../userscript.js").FunctionContext} FunctionContext */

/** Symbol to mark blocks we've already patched (avoid double-wrapping) */
const PATCHED = Symbol("sa-transpiler-patched");

/** @enum {number} */
const Thread = /** @type {const} */ ({
  STATUS_RUNNING: 0,
  STATUS_PROMISE_WAIT: 1,
  STATUS_YIELD: 2,
  STATUS_YIELD_TICK: 3,
  STATUS_DONE: 4,
});

/**
 * @this {ScratchVM.Thread}
 * Pop back down the stack frame until we hit a procedure call or the stack frame is emptied
 */
function stopThisScript() {
  let blockID = this.peekStack();
  while (blockID !== null) {
    const block = this.target.blocks.getBlock(blockID);

    // Reporter form of function_call
    if (this.peekStackFrame()?.waitingReporter) {
      break;
    }

    // Command form of procedures_call
    if (typeof block !== "undefined" && block.opcode === "procedures_call") {
      this.goToNextBlock();
      break;
    }

    this.popStack();
    blockID = this.peekStack();
  }

  if (this.stack.length === 0) {
    // Clean up!
    this.requestScriptGlowInFrame = false;
    this.status = Thread.STATUS_DONE;
  }
}

/**
 * @param {ScratchVM.Thread} thread
 */
function patchThread(thread) {
  if (thread[PATCHED]) return;
  thread[PATCHED] = true;

  const originalGoToNextBlock = thread.goToNextBlock;
  /** @type {ScratchVM.Thread["goToNextBlock"]} */
  thread.goToNextBlock = function () {
    if (this.peekStackFrame()?.waitingReporter) return;
    originalGoToNextBlock.call(this);
  };

  patchBlockExecuteCache(thread.blockContainer);

  thread.stopThisScript = stopThisScript.bind(thread);
}

/**
 * this patches Block.getProcedureDefinition so the sequencer can find our function definition
 * in Sequencer.stepToProcedure
 * @this {ScratchVM.Blocks}
 * @param {string} name
 * @returns {string | null}
 */
function getFunctionDefinition(name) {
  const blockID = this._cache.procedureDefinitions[name];
  if (typeof blockID !== "undefined") {
    return blockID;
  }

  for (const id in this._blocks) {
    if (!Object.prototype.hasOwnProperty.call(this._blocks, id)) continue;
    const block = this._blocks[id];
    if (block.opcode === FunctionBlockType.DEFINITION) {
      const internal = this._getCustomBlockInternal(block);
      if (internal && internal.mutation.proccode === name) {
        return id;
      }
    }
  }

  this._cache.procedureDefinitions[name] = null;
  return null;
}

/**
 * @param {ScratchVM.Blocks} blocks
 * @param {string} proccode
 * @return {[string[], string[], string[]] | null}
 */
function getFunctionParamNamesIdsAndDefaults(blocks, proccode) {
  if (!blocks._cache._functionParamNames) blocks._cache._functionParamNames = {};

  const cachedNames = blocks._cache._functionParamNames[proccode];
  if (typeof cachedNames !== "undefined") {
    return cachedNames;
  }

  for (const id in blocks._blocks) {
    if (!Object.prototype.hasOwnProperty.call(blocks._blocks, id)) continue;
    const block = blocks._blocks[id];
    const mutation = block.mutation;
    if (block.opcode === FunctionBlockType.PROTOTYPE && mutation?.proccode === proccode) {
      assert("argumentnames" in mutation, "Argument names are not set");
      const names = /** @type {string[]} */ (JSON.parse(mutation.argumentnames));
      const ids = /** @type {string[]} */ (JSON.parse(mutation.argumentids));
      const defaults = /** @type {string[]} */ (JSON.parse(mutation.argumentdefaults));

      blocks._cache._functionParamNames[proccode] = [names, ids, defaults];
      return [names, ids, defaults];
    }
  }

  blocks._cache._functionParamNames[proccode] = null;
  return null;
}

/**
 * because execute() is not exposed we will patch every block execute function in the execute cache
 * @param {ScratchVM.Blocks} blocks
 */
function patchBlockExecuteCache(blocks) {
  // Wrap block functions as they're first read from the execute cache.
  blocks._cache._executeCached = new Proxy(/** @type {Record<string | symbol, BlockExecuteCache>} */({}), {
    set(target, prop, value, receiver) {
      if (!value || value[PATCHED] || typeof value._blockFunction !== "function") {
        return Reflect.set(target, prop, value, receiver);
      }
      const originalFn = value._blockFunction;
      /** @param {Record<string, unknown>} args @param {ScratchVM.BlockUtility} util */
      value._blockFunction = function (args, util) {
        const currentStackFrame = util.thread.peekStackFrame();
        const primitiveReportedValue = originalFn(args, util);
        if (!currentStackFrame?.waitingReporter) return primitiveReportedValue;
        // we want to trick the engine into thinking that the primitive returned a promise
        // https://github.com/scratchfoundation/scratch-vm/blob/bb352913b57991713a5ccf0b611fda91056e14ec/src/engine/execute.js#L516
        return {
          // undo thread promise status to running when execute runs handlePromise
          // https://github.com/scratchfoundation/scratch-vm/blob/bb352913b57991713a5ccf0b611fda91056e14ec/src/engine/execute.js#L113
          then() {
            if (util.thread.status === Thread.STATUS_PROMISE_WAIT) {
              util.thread.status = Thread.STATUS_RUNNING;
            }
          },
        };
      };
      value[PATCHED] = true;
      return Reflect.set(target, prop, value, receiver);
    },
    get(target, prop, receiver) {
      return Reflect.get(target, prop, receiver);
    },
  });
}

/** @param {ScratchVM.VM} vm */
export function patchVM(vm) {
  /** @type {ScratchVM.Sequencer["stepThread"]} */
  const originalStepThread = vm.runtime.sequencer.stepThread;
  /** @type {ScratchVM.Sequencer["stepThread"]} */
  vm.runtime.sequencer.stepThread = function (thread) {
    patchThread(thread);
    return originalStepThread.call(this, thread);
  };

  vm.runtime._primitives[FunctionBlockType.DEFINITION] = () => {
    /** no-op */
  };

  /**
   * @param {Record<string, any>} args
   * @param {ScratchVM.BlockUtility} util
   */
  vm.runtime._primitives[FunctionBlockType.CALL] = (args, util) => {
    assert(util.thread[PATCHED], "Thread is not patched");
    const stackFrame = util.stackFrame;
    if (stackFrame.executed) {
      const returnValue = stackFrame.returnValue;
      const threadStackFrame = util.thread.peekStackFrame();
      assert(threadStackFrame, "Thread stack frame is null");
      threadStackFrame.params = null;
      threadStackFrame.waitingReporter = false;
      delete stackFrame.returnValue;
      delete stackFrame.executed;
      return returnValue;
    }

    const procedureCode = args.mutation.proccode;
    const paramNamesIdsAndDefaults = getFunctionParamNamesIdsAndDefaults(util.thread.target.blocks, procedureCode);

    // happens when procedure could not be found, noop
    if (paramNamesIdsAndDefaults === null) return "";

    const [paramNames, paramIds, paramDefaults] = paramNamesIdsAndDefaults;

    util.initParams();
    for (let i = 0; i < paramIds.length; i++) {
      if (Object.prototype.hasOwnProperty.call(args, paramIds[i])) {
        util.pushParam(paramNames[i], args[paramIds[i]]);
      } else {
        util.pushParam(paramNames[i], paramDefaults[i]);
      }
    }

    stackFrame.executed = true;
    const threadStackFrame = util.thread.peekStackFrame();
    assert(threadStackFrame, "Thread stack frame is null");

    threadStackFrame.waitingReporter = true;
    stackFrame.returnValue = ""; // default return value

    rebindOnce(util.thread.target.blocks, "getProcedureDefinition", getFunctionDefinition);
    util.sequencer.stepToProcedure(util.thread, procedureCode);
  };

  /**
   * @param {Record<string, any>} args
   * @param {ScratchVM.BlockUtility} util
   */
  vm.runtime._primitives[FunctionBlockType.RETURN] = (args, util) => {
    assert(util.thread[PATCHED], "Thread is not patched");
    util.stopThisScript();
    // If used outside of function, there may be no stackframe.
    if (util.thread.peekStackFrame()) {
      util.stackFrame.returnValue = args.ITEM;
    }
  };
}
