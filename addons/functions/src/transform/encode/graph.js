import { InputType, RegisteredBlock } from "./block.js";

export class SerializedBlockGraph {
    /**
     * @param {{
     *   blocks: Serialized.Target["blocks"],
     *   Blockly: ScratchBlocks.Blockly
     * }} dependencies
     */
    constructor(dependencies) {
        this.blocks = dependencies.blocks;
        this.Blockly = dependencies.Blockly;
    }

    /**
     * @param {Omit<Serialized.Block, "parent" | "next">} unlinkedBlock
     * @returns {RegisteredBlock}
     */
    register(unlinkedBlock) {
        const blockId = this.Blockly.utils.genUid();
        /** @type {Serialized.Block} */
        const block = { ...unlinkedBlock, parent: null, next: null };
        this.blocks[blockId] = block;
        return new RegisteredBlock(block, blockId, this);
    }

    /**
     * @private
     * @param {string | Serialized.Primitive | null} referenceId
     */
    deleteTreeReference(referenceId) {
        if (typeof referenceId !== "string") return;
        const block = this.getBlock(referenceId);
        if (!block) return;
        this.deleteTree(block);
    }

    /**
     * @param {RegisteredBlock} block
     */
    deleteTree(block) {
        delete this.blocks[block.id];
        /**
         * @param {string | Serialized.Primitive} refId
         */
        for (const input of Object.values(block.ref.inputs)) {
            if (!input) continue;
            const [type] = input;
            switch (type) {
                case InputType.DifferentShadow:
                    this.deleteTreeReference(input[2]);
                // fallthrough
                case InputType.SameShadow:
                case InputType.NoShadow:
                    this.deleteTreeReference(input[1]);
            }
        }
    }

    /**
     * @param {Iterable<string>} [opcodes]
     * @returns {IterableIterator<RegisteredBlock>}
     */
    *getBlocks(opcodes) {
        const opcodesSet = new Set(opcodes);
        for (const [id, block] of Object.entries(this.blocks)) {
            if (Array.isArray(block)) continue;
            if (opcodes && !opcodesSet.has(block.opcode)) continue;
            yield new RegisteredBlock(block, id, this);
        }
    }

    /**
     * @param {string | null} [id] - The ID of the block to get.
     * @returns {RegisteredBlock | null} - The block with the given ID, or null if the block does not exist.
     */
    getBlock(id) {
        if (!id) return null;
        const block = this.blocks[id];
        if (!block) return null;
        if (Array.isArray(block)) throw Error("Unexpected primitive block");
        return new RegisteredBlock(block, id, this);
    }

    /**
     * Sanity check the block graph after transpilation:
     * - No dangling references (all referenced block IDs exist)
     * - Every block is either top-level or referenced (no orphaned blocks)
     * - If block B is next on block A, then B.parent === A
     * - If block A has parent B, then B has A as next or in one of its inputs
     *   (a block can be parent of multiple children via next and/or inputs)
     */
    validate() {
        const { blockIds, referencesByBlockId } = this.collectReferences();
        this.checkDanglingReferences(blockIds, referencesByBlockId);
        this.checkOrphanedBlocks(referencesByBlockId);
        this.checkLinkConsistency();
    }

    /**
     * @private
     * @returns {{ blockIds: Set<string>, referencesByBlockId: Map<string, { source: string; kind: "parent" | "next" | "input" }[]> }}
     */
    collectReferences() {
        const blockIds = new Set();
        /** @type {Map<string, { source: string; kind: "parent" | "next" | "input" }[]>} */
        const referencesByBlockId = new Map();

        for (const [id, blockOrPrimitive] of Object.entries(this.blocks)) {
            if (Array.isArray(blockOrPrimitive)) continue;
            blockIds.add(id);
        }

        for (const [id, blockOrPrimitive] of Object.entries(this.blocks)) {
            if (Array.isArray(blockOrPrimitive)) continue;
            const block = /** @type {Serialized.Block} */ (blockOrPrimitive);

            if (block.parent) this.recordReference(referencesByBlockId, block.parent, id, "parent");
            if (block.next) this.recordReference(referencesByBlockId, block.next, id, "next");

            for (const input of Object.values(block.inputs ?? {})) {
                if (!input || typeof input[0] !== "number") continue;
                const [type] = input;
                switch (type) {
                    case InputType.SameShadow:
                    case InputType.NoShadow:
                        if (typeof input[1] === "string") this.recordReference(referencesByBlockId, input[1], id, "input");
                        break;
                    case InputType.DifferentShadow:
                        if (typeof input[1] === "string") this.recordReference(referencesByBlockId, input[1], id, "input");
                        if (typeof input[2] === "string") this.recordReference(referencesByBlockId, input[2], id, "input");
                        break;
                }
            }
        }

        return { blockIds, referencesByBlockId };
    }

    /**
     * @private
     * @param {Map<string, { source: string; kind: "parent" | "next" | "input" }[]>} referencesByBlockId
     * @param {string} refId
     * @param {string} sourceId
     * @param {"parent" | "next" | "input"} kind
     */
    recordReference(referencesByBlockId, refId, sourceId, kind) {
        if (typeof refId !== "string" || !refId) return;
        const refs = referencesByBlockId.get(refId) ?? [];
        refs.push({ source: sourceId, kind });
        referencesByBlockId.set(refId, refs);
    }

    /**
     * @private
     * @param {Set<string>} blockIds
     * @param {Map<string, { source: string; kind: "parent" | "next" | "input" }[]>} referencesByBlockId
     */
    checkDanglingReferences(blockIds, referencesByBlockId) {
        for (const [refId, refs] of referencesByBlockId) {
            if (!blockIds.has(refId)) {
                console.warn(
                    `Encoder: dangling reference to block "${refId}" from ${refs.map((r) => `${r.source} (${r.kind})`).join(", ")}`
                );
            }
        }
    }

    /**
     * @private
     * @param {Map<string, { source: string; kind: "parent" | "next" | "input" }[]>} referencesByBlockId
     */
    checkOrphanedBlocks(referencesByBlockId) {
        for (const [id, blockOrPrimitive] of Object.entries(this.blocks)) {
            if (Array.isArray(blockOrPrimitive)) continue;
            const block = /** @type {Serialized.Block} */ (blockOrPrimitive);
            if (block.topLevel) continue;
            if (referencesByBlockId.has(id)) continue;
            console.warn(
                `Encoder: block "${id}" (opcode: ${block.opcode}) is neither top-level nor referenced`
            );
        }
    }

    /** @private */
    checkLinkConsistency() {
        const { blocks } = this;
        for (const [id, blockOrPrimitive] of Object.entries(blocks)) {
            if (Array.isArray(blockOrPrimitive)) continue;
            const block = /** @type {Serialized.Block} */ (blockOrPrimitive);

            if (block.next) {
                const nextBlock = blocks[block.next];
                if (!nextBlock || Array.isArray(nextBlock)) continue;
                const nextRef = /** @type {Serialized.Block} */ (nextBlock);
                if (nextRef.parent !== id) {
                    console.warn(
                        `Encoder: block "${id}" has next="${block.next}", but block "${block.next}" has parent="${nextRef.parent}" (expected "${id}")`
                    );
                }
            }

            if (block.parent) {
                const parentBlock = blocks[block.parent];
                if (!parentBlock || Array.isArray(parentBlock)) continue;
                const parentRef = /** @type {Serialized.Block} */ (parentBlock);

                let found = parentRef.next === id;
                if (!found) {
                    for (const input of Object.values(parentRef.inputs ?? {})) {
                        if (!input || typeof input[0] !== "number") continue;
                        const [type] = input;
                        switch (type) {
                            case InputType.SameShadow:
                            case InputType.NoShadow:
                                if (input[1] === id) found = true;
                                break;
                            case InputType.DifferentShadow:
                                if (input[1] === id || input[2] === id) found = true;
                                break;
                        }
                        if (found) break;
                    }
                }

                if (!found) {
                    console.warn(
                        `Encoder: block "${id}" has parent="${block.parent}", but parent block does not reference "${id}" in next or inputs`
                    );
                }
            }
        }
    }
}
