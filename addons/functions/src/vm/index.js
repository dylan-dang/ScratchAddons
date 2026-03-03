import { FunctionBlockType } from "../shared.js";

/** @typedef {import("../userscript.js").FunctionContext} FunctionContext */

/** @param {FunctionContext} context */
export function patchVM({ vm }) {
    /**
     * @param {string} proccode
     * @param {ScratchVM.Blocks | null} blocks
     */
    function getPrototype(blocks, proccode) {
        if (!blocks) return null;
        for (const block of Object.values(blocks._blocks)) {
            if (block.opcode !== FunctionBlockType.PROTOTYPE) continue;
            if (block.mutation?.proccode !== proccode) continue;
            return block;
        }
        return null;
    }

    vm.runtime._primitives[FunctionBlockType.DEFINITION] = () => {
        /** no-op */
    };

    /**
     * @param {Record<string, any>} args
     * @param {ScratchVM.BlockUtility} util
     */
    vm.runtime._primitives[FunctionBlockType.CALL] = (args, util) => {
        if (util.stackFrame.executed) return;
        util.stackFrame.executed = true;
        const thread = util.thread;

        const MAX_DEPTH = 1000;
        if ((thread.function?.depth ?? 0) > MAX_DEPTH) {
            console.log("recursion depth exceeded");
            return undefined;
        }

        const blocks = thread.target.blocks;
        // @ts-ignore
        blocks._cache._executeCached = {};

        const prototype = getPrototype(blocks, args.mutation.proccode);
        if (prototype === null) return;
        const mutation = /** @type {ScratchVM.ProcedurePrototypeMutation} */ (prototype.mutation);
        /** @type {string[]} */
        const names = JSON.parse(mutation.argumentnames);
        /** @type {string[]} */
        const ids = JSON.parse(mutation.argumentids);
        const defaults = JSON.parse(mutation.argumentdefaults);

        const childThread = util.runtime._pushThread(prototype.parent ?? "", util.target);
        const childStackFrame = childThread.peekStackFrame();
        if (childStackFrame)
            childStackFrame.warpMode = JSON.parse(mutation.warp);

        return new Promise((resolve) => {
            childThread.function = {
                depth: thread.function?.depth ?? 0,
                resolve,
                params: Object.fromEntries(
                    ids.map((id, i) => [names[i], Object.prototype.hasOwnProperty.call(args, id) ? args[id] : defaults[i]])
                ),
            };
        });
    };

    /**
     * @param {Record<string, any>} args
     * @param {ScratchVM.BlockUtility} util
     */
    vm.runtime._primitives[FunctionBlockType.RETURN] = (args, util) => {
        util.stopThisScript();
        util.thread.function?.resolve(args.ITEM);
    };

    /**
     * @param {Record<string, any>} args
     * @param {ScratchVM.BlockUtility} util
     */
    function argReporter(args, util) {
        const value = util.getParam(args.VALUE);
        if (value !== null) return value;
        const returnValue = util.thread.function?.params[args.VALUE] ?? null;
        if (returnValue !== null) return returnValue;
        return 0;
    }

    vm.runtime._primitives.argument_reporter_string_number = argReporter;
    vm.runtime._primitives.argument_reporter_boolean = argReporter;
}
