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

    };

    /**
     * @param {Record<string, any>} args
     * @param {ScratchVM.BlockUtility} util
     */
    vm.runtime._primitives[FunctionBlockType.RETURN] = (args, util) => {
        util.stopThisScript();
        if (util.thread.peekParentStackFrame()) {
            util.stackFrame.returnValue = args.VALUE;
        }
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
