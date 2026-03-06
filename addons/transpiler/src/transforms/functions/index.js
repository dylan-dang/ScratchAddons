/**
 * Functions transform: custom blocks with return values, reporter-style calls.
 *
 * Each transform module exports:
 * - category?: CategoryDefinition - toolbox category (definition only, no patching)
 * - blocks?: { defineBlocks, patchConnection, patchBlockSvg, patchBlockDragger }
 * - vm?: { patch(context) } - runtime patches
 * - encode: (target, graph) => void - save → Scratch-compatible
 * - decode: (target) => void - load → custom blocks
 */

import { patchBlocks } from "./blocks.js";
import { functionsCategory } from "./category.js";
import { decode } from "./decode.js";
import { encode } from "./encode.js";
import { patchVM } from "./vm.js";

/** @type {import("../index.js").Transform} */
export const functionsTransform = {
  id: "functions",
  category: functionsCategory,
  patchBlocks,
  patchVM,
  encode,
  decode,
};
