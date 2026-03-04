/// <reference path="../types/scratch/scratch-vm.d.ts" />

import { InputType } from "./encode/block.js";

/**
 * @typedef BlockLike
 * @type {object}
 * @property {string|null|undefined} [parent]
 * @property {string|null|undefined} [next]
 * @property {Record<string, ScratchVM.Input | Serialized.Primitive | undefined>} [inputs]
 * @property {string|undefined} [opcode]
 * @property {boolean|undefined} [topLevel]
 */

/** @typedef {Record<string, BlockLike | Serialized.Primitive | null>} BlockList */

/**
 * Generic block graph validator. Accepts either VM Blocks or serialized blocks object.
 * Validates:
 * - No dangling references (all referenced block IDs exist)
 * - No orphans (every block is either top-level or referenced)
 * - Next parent link consistency
 * - Parent child link consistency
 *
 * @param {BlockList} blocks - VM Blocks or serialized blocks
 * @yields {string}
 */
export function* validate(blocks) {
    const { blockIds, referencesByBlockId } = buildValidationIndex(blocks);
    yield* validateDanglingReferences(blockIds, referencesByBlockId);
    yield* validateOrphans(blocks, referencesByBlockId);
    yield* validateNextParentLinks(blocks);
    yield* validateParentChildLinks(blocks);
}

/**
 * @param {BlockList} blocks
 * @returns {Iterable<[string, BlockLike]>}
 */
function* iterateBlocks(blocks) {
    for (const [id, blockOrPrimitive] of Object.entries(blocks)) {
        if (!blockOrPrimitive || typeof blockOrPrimitive !== "object") continue;
        if (Array.isArray(blockOrPrimitive)) continue;
        yield [id, blockOrPrimitive];
    }
}

/**
 * @param {BlockList} blocks
 * @returns {Set<string>}
 */
function getTopLevelIds(blocks) {
    const ids = new Set();
    for (const [id, block] of iterateBlocks(blocks)) {
        if (block.topLevel) ids.add(id);
    }
    return ids;
}

/**
 * @param {BlockList} blocks
 * @param {string} id
 * @returns {BlockLike | null}
 */
function getBlock(blocks, id) {
    const block = blocks[id];
    if (!block || Array.isArray(block)) return null;
    return /** @type {BlockLike} */ (block);
}

/**
 * @param {BlockLike} block
 * @returns {Iterable<string>}
 */
function* getInputRefs(block) {
    for (const input of Object.values(block.inputs ?? {})) {
        if (!input) continue;
        if (Array.isArray(input)) {
            const type = input[0];
            if (type !== InputType.SameShadow && type !== InputType.NoShadow && type !== InputType.DifferentShadow) continue;
            if (typeof input[1] === "string") yield input[1];
            if (type === InputType.DifferentShadow && typeof input[2] === "string") yield input[2];
        } else if (typeof input === "object") {
            if (input.block) yield input.block;
            if (input.shadow) yield input.shadow;
        }
    }
}

/**
 * @param {BlockLike} parent
 * @param {string} childId
 * @returns {boolean}
 */
function parentReferencesChild(parent, childId) {
    if (parent.next === childId) return true;
    for (const id of getInputRefs(parent)) {
        if (id === childId) return true;
    }
    return false;
}

/**
 * @typedef {Object} Reference
 * @property {string} source
 * @property {"parent" | "next" | "input"} kind
 */

/**
 * @typedef {Object} ValidationIndex
 * @property {Set<string>} blockIds
 * @property {Map<string, Reference[]>} referencesByBlockId
 */

/**
 * @param {BlockList} blocks
 * @returns {ValidationIndex}
 */
function buildValidationIndex(blocks) {
    const blockIds = new Set();
    /** @type {Map<string, Reference[]>} */
    const referencesByBlockId = new Map();

    for (const [id] of iterateBlocks(blocks)) {
        blockIds.add(id);
    }

    for (const [id, block] of iterateBlocks(blocks)) {
        /** @param {string} refId @param {Reference["kind"]} kind */
        const recordRef = (refId, kind) => {
            if (typeof refId !== "string" || !refId) return;
            const refs = referencesByBlockId.get(refId) ?? [];
            refs.push({ source: id, kind });
            referencesByBlockId.set(refId, refs);
        };

        const parent = block.parent ?? null;
        if (parent) recordRef(parent, "parent");
        const next = block.next ?? null;
        if (next) recordRef(next, "next");
        for (const refId of getInputRefs(block)) {
            recordRef(refId, "input");
        }
    }

    return { blockIds, referencesByBlockId };
}

/**
 * @param {Set<string>} blockIds
 * @param {Map<string, Reference[]>} referencesByBlockId
 */
function* validateDanglingReferences(blockIds, referencesByBlockId) {
    for (const [refId, refs] of referencesByBlockId) {
        if (blockIds.has(refId)) continue;
        yield `Dangling reference: block "${refId}" is referenced but does not exist. Sources: ${refs.map((r) => `${r.source} (${r.kind})`).join(", ")}`;
    }
}

/**
 * @param {BlockList} blocks
 * @param {Map<string, { source: string; kind: "parent" | "next" | "input" }[]>} referencesByBlockId
 */
function* validateOrphans(blocks, referencesByBlockId) {
    const topLevelIds = getTopLevelIds(blocks);
    for (const [id, block] of iterateBlocks(blocks)) {
        if (topLevelIds.has(id)) continue;
        if (referencesByBlockId.has(id)) continue;
        yield `Orphan block: "${id}" (opcode: ${block.opcode ?? "unknown"}) is neither top-level nor referenced`;
    }
}

/**
 * @param {BlockList} blocks
 */
function* validateNextParentLinks(blocks) {
    for (const [id, block] of iterateBlocks(blocks)) {
        const nextId = block.next ?? null;
        if (!nextId) continue;
        const nextBlock = getBlock(blocks, nextId);
        if (!nextBlock) continue;
        if ((nextBlock.parent ?? null) === id) continue;
        yield `Broken next→parent link: block "${id}" has next="${nextId}", but that block has parent="${nextBlock.parent ?? null}" (expected "${id}")`;
    }
}

/**
 * @param {BlockList} blocks
 */
function* validateParentChildLinks(blocks) {
    for (const [id, block] of iterateBlocks(blocks)) {
        const parentId = block.parent ?? null;
        if (!parentId) continue;
        const parentBlock = getBlock(blocks, parentId);
        if (!parentBlock) continue;
        if (parentReferencesChild(parentBlock, id)) continue;
        yield `Broken parent→child link: block "${id}" has parent="${parentId}", but parent does not reference "${id}" in next or inputs`;
    }
}
