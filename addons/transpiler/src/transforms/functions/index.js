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

import { functionsCategory } from "./category.js";
import { defineBlocks, patchBlockDragger, patchBlockSvg, patchConnection } from "./blocks.js";
import { patchVM } from "./vm.js";
import { encode } from "./encode.js";
import { decode } from "./decode.js";

export const functionsTransform = {
  id: "functions",
  category: functionsCategory,
  blocks: {
    defineBlocks,
    patchConnection,
    patchBlockSvg,
    patchBlockDragger,
  },
  vm: { patch: patchVM },
  encode,
  decode,
};
