import { TRANSFORMS } from "../../transforms/index.js";
import { validate } from "../validator.js";
import { RuntimeBlockGraph } from "./graph.js";

/** @typedef {import("../../userscript.js").FunctionContext} FunctionContext */

/**
 * @param {ScratchVM.Target} target
 */
function transpileTarget(target) {
  const blocks = target.blocks;
  const oldForceNoGlow = blocks.forceNoGlow;
  blocks.forceNoGlow = true;

  const graph = new RuntimeBlockGraph(target);
  for (const transform of TRANSFORMS) {
    transform.decode(graph);
  }

  for (const error of validate(blocks._blocks)) {
    console.warn("Decoding graph validation error: ", error);
  }

  blocks.forceNoGlow = oldForceNoGlow;
}

/**
 * @param {ScratchVM.VM} vm
 */
export function transpileTargets(vm) {
  const snapshot = vm.toJSON();
  try {
    for (const target of vm.runtime.targets) {
      transpileTarget(target);
    }
    vm.refreshWorkspace();
  } catch (error) {
    console.error("Error transpiling targets: ", error);
    vm.loadProject(snapshot);
  }
}

/** @param {FunctionContext} context */
export function patchFirstDeserialization(context) {
  const { vm } = context;
  vm.once("targetsUpdate", () => {
    transpileTargets(vm);
  });
}
