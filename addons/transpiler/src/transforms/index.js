/**
 * Transform registry.
 *
 * To add a new transform:
 * 1. Create a folder under transforms/ (e.g. transforms/my-feature/)
 * 2. Export an object with: id, category?, blocks?, vm?, encode, decode
 * 3. Add it to the TRANSFORMS array below
 *
 * Transform interface:
 * - id: string
 * - category?: CategoryDefinition - toolbox category (definition only; central patch handles updateToolbox)
 * - blocks?: { defineBlocks, patchConnection?, patchBlockSvg?, patchBlockDragger? }
 * - vm?: { patch(context) } - runtime patches (primitives, sequencer)
 * - encode: (graph) => void - save → Scratch-compatible (graph has target, blocks, register, etc.)
 * - decode: (graph) => void - load → custom blocks (graph has target, blocks, detachBlock, replaceBlock, reparentChildren)
 */

import { functionsTransform } from "./functions/index.js";

/** @type {Array<{
 *   id: string,
 *   category?: import("../editor/categories.js").CategoryDefinition,
 *   blocks?: { defineBlocks: Function, patchConnection?: Function, patchBlockSvg?: Function, patchBlockDragger?: Function },
 *   vm?: { patch: (context: import("../userscript.js").FunctionContext) => void },
 *   encode: (graph: import("../transform/encode/graph.js").SerializedBlockGraph) => void,
 *   decode: (graph: import("../transform/decode/graph.js").RuntimeBlockGraph) => void
 * }>} */
export const TRANSFORMS = [functionsTransform];
