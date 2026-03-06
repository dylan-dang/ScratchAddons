import { TRANSFORMS } from "../../transforms/index.js";
import { validate } from "../validator.js";
import { SerializedBlockGraph } from "./graph.js";

/** @typedef {import("../../userscript.js").FunctionContext} FunctionContext */

/**
 * @param {ScratchBlocks.Blockly} Blockly
 * @param {Serialized.Target} target
 */
export function transpileTarget(Blockly, target) {
  const graph = new SerializedBlockGraph({
    Blockly,
    target,
  });
  for (const transform of TRANSFORMS) {
    transform.encode(graph);
  }
  for (const error of validate(graph.blocks)) {
    console.warn("Encoding graph validation error: ", error);
  }
}

/**
 * @param {ScratchBlocks.Blockly} Blockly
 * @param {Serialized.Target[]} targets
 */
export function transpileTargets(Blockly, targets) {
  for (const target of targets) {
    transpileTarget(Blockly, target);
  }
}

/** @param {FunctionContext} context */
export function patchSerialization({ Blockly, vm }) {
  const vmPrototype = Object.getPrototypeOf(vm);
  const originalToJSON = vmPrototype.toJSON;
  /**
   * @param {string} [optTargetId]
   */
  vmPrototype.toJSON = function (optTargetId) {
    const json = originalToJSON.call(this, optTargetId);
    /** @type {Serialized.Project | Serialized.Sprite} */
    const parsed = JSON.parse(json);
    const targets = "blocks" in parsed ? [parsed] : parsed.targets;
    try {
      transpileTargets(Blockly, targets);
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
