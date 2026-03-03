/// <reference path="types/sb3.d.ts" />
/// <reference path="types/userscript.d.ts" />

import { defineBlocks, patchBlockDragger, patchBlockSvg, patchCategory, patchConnection, patchMenuBar } from "./src/core.js";
import { patchDeserialization } from "./src/deserialization.js";
import { patchSerialization } from "./src/serialization.js";

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
  patchDeserialization(context);
  patchMenuBar(context);
}
