/// <reference path="./types/sb3.d.ts" />
/// <reference path="./types/userscript.d.ts" />

import { defineBlocks, patchBlockDragger, patchBlockSvg, patchConnection } from "./blocks/index.js";
import { patchCategory } from "./editor/patches.js";
import { patchMenuBar } from "./editor/ui.js";
import { patchDeserialization } from "./transform/decode/decoder.js";
import { patchSerialization } from "./transform/encode/encoder.js";
import { patchVM } from "./vm/index.js";

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
  patchMenuBar(context, transformer);
  patchVM(context);

  vm.refreshWorkspace();
}
