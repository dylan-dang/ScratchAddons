import { validate } from "../validator.js";
import { SerializedBlockGraph } from "./graph.js";
import { TRANSFORMS } from "../../transforms/index.js";

/** @typedef {import("../../userscript.js").FunctionContext} FunctionContext */

class Encoder {
  /**
   * @param {{ Blockly: ScratchBlocks.Blockly, vm: object }} dependencies
   */
  constructor({ Blockly, vm }) {
    this.Blockly = Blockly;
    this.vm = vm;
  }

  /**
   * @param {Serialized.Target} target
   */
  transpileTarget(target) {
    const graph = new SerializedBlockGraph({
      Blockly: this.Blockly,
      target,
    });
    for (const transform of TRANSFORMS) {
      transform.encode(graph);
    }
    for (const error of validate(graph.blocks)) {
      console.warn("Encoding graph validation error: ", error);
    }
  }
}

/** @param {FunctionContext} context */
export function patchSerialization({ Blockly, vm }) {
  const transpiler = new Encoder({ Blockly, vm });
  const vmPrototype = Object.getPrototypeOf(vm);
  const originalToJSON = vmPrototype.toJSON;
  /**
   * @param {string} [optTargetId]
   */
  vmPrototype.toJSON = function (optTargetId) {
    const json = originalToJSON.call(this, optTargetId);
    /** @type {Serialized.Project | Serialized.Sprite} */
    const parsed = JSON.parse(json);
    try {
      const targets = "blocks" in parsed ? [parsed] : parsed.targets;
      for (const target of targets) {
        transpiler.transpileTarget(target);
      }
    } catch (error) {
      console.error("Error serializing project with transpiler: ", error);
      return json;
    }
    return JSON.stringify(parsed);
  };
}

/**
 * rebuild the project and set the editing target to the selected target
 * @param {ScratchVM.VM} vm
 */
export async function rebuild(vm) {
  const targetIdx = vm.editingTarget ? vm.runtime.targets.indexOf(vm.editingTarget) : 1;
  await vm.loadProject(vm.toJSON());
  vm.setEditingTarget(vm.runtime.targets[targetIdx].id);
}
