/// <reference path="./types/scratch/sb3.d.ts" />
/// <reference path="./types/userscript.d.ts" />

import { defineBlocks, patchBlockDragger, patchBlockSvg, patchConnection } from "./blocks.js";
import { patchCategory, patchMenuBar, refreshToolbox } from "./editor/ui.js";
import state from "./state.js";
import { patchDeserialization } from "./transform/decode/decoder.js";
import { patchSerialization, rebuild } from "./transform/encode/encoder.js";
import { patchVM } from "./vm.js";

/**
 * @typedef {Object} FunctionContext
 * @property {Userscript.Addon} addon
 * @property {ScratchBlocks.Blockly} Blockly
 * @property {ScratchVM.VM} vm
 */

/** @param {Userscript.Utilities} utils */
export default async function ({ addon }) {
  const Blockly = await addon.tab.traps.getBlockly();
  await addon.tab.scratchClassReady();
  const vm = addon.tab.traps.vm;
  /** @type {FunctionContext} */
  const context = { addon, Blockly, vm };

  patchCategory(context);
  patchConnection(context);
  defineBlocks(context);
  patchBlockSvg(context);
  patchBlockDragger(context);
  patchSerialization(context);
  const transformer = patchDeserialization(context);
  patchMenuBar(context);
  patchVM(context);

  const workspace = addon.tab.traps.getWorkspace();
  state.listen(async (transpiled) => {
    if (transpiled) {
      await rebuild(vm);
      return;
    }
    transformer.transpileTargets();
    refreshToolbox(workspace);
  });

  addon.self.addEventListener("disabled", () => {
    state.transpiled = true;
  });
  addon.self.addEventListener("reenabled", () => {
    state.transpiled = false;
  });

  vm.refreshWorkspace();
}
