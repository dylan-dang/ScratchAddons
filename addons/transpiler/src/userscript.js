/// <reference path="./types/scratch/sb3.d.ts" />
/// <reference path="./types/userscript.d.ts" />

import { patchCategories } from "./editor/categories.js";
import { patchMenuBar, refreshToolbox } from "./editor/ui.js";
import state from "./state.js";
import { transpileTargets } from "./transform/decode/decoder.js";
import { patchSerialization, rebuild } from "./transform/encode/encoder.js";
import { TRANSFORMS } from "./transforms/index.js";

/**
 * @typedef {Object} FunctionContext
 * @property {Userscript.Addon} addon
 * @property {ScratchBlocks.Blockly} Blockly
 * @property {ScratchVM.VM} vm
 * @property {ScratchBlocks.WorkspaceSvg} workspace
 */

/** @param {Userscript.Utilities} utils */
export default async function ({ addon }) {
  const Blockly = await addon.tab.traps.getBlockly();
  await addon.tab.scratchClassReady();
  const vm = addon.tab.traps.vm;
  const workspace = addon.tab.traps.getWorkspace();

  /** @type {FunctionContext} */
  const context = { addon, Blockly, vm, workspace };

  patchCategories(context, TRANSFORMS);

  for (const transform of TRANSFORMS) {
    transform.patchBlocks?.(Blockly);
    transform.patchVM?.(vm);
  }

  patchSerialization(context);
  patchMenuBar(context);

  // patch first deserialization
  vm.once("targetsUpdate", () => {
    transpileTargets(vm);
    refreshToolbox(workspace);
  });

  state.listen("build", async (build) => {
    if (build) {
      await rebuild(vm);
      return;
    }
    transpileTargets(vm);
    refreshToolbox(workspace);
  });

  addon.self.addEventListener("disabled", () => {
    state.build = true;
  });
  addon.self.addEventListener("reenabled", () => {
    state.build = false;
  });

  vm.refreshWorkspace();
}
