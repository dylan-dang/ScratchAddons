import { validate } from "../validator.js";
import { RuntimeBlockGraph } from "./graph.js";
import { TRANSFORMS } from "../../transforms/index.js";

/** @typedef {import("../../userscript.js").FunctionContext} FunctionContext */

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

    const graph = new RuntimeBlockGraph(target);
    for (const transform of TRANSFORMS) {
      transform.decode(graph);
    }

    for (const error of validate(blocks._blocks)) {
      console.warn("Decoding graph validation error: ", error);
    }

    blocks.forceNoGlow = oldForceNoGlow;
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
