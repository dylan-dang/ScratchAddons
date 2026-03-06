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


/**
 * @typedef {Object} Transform
 * @property {string} id
 * @property {import("../editor/categories.js").CategoryDefinition} [category]
 * @property {(Blockly: ScratchBlocks.Blockly) => void} [patchBlocks]
 * @property {(vm: ScratchVM.VM) => void} [patchVM]
 * @property {(graph: import("../transform/encode/graph.js").SerializedBlockGraph) => void} encode
 * @property {(graph: import("../transform/decode/graph.js").RuntimeBlockGraph) => void} decode
 */

/**
 * @type {Array<Transform>}
 */
export const TRANSFORMS = [functionsTransform];
