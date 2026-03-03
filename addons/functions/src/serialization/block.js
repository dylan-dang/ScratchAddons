/**
 * @typedef {Object} BlockJsonInputValueArg
 * @prop {"input_value"} type
 * @prop {string} name
 * @prop {string} [check]
 */

import { assert } from "../utils.js";

/**
 * @typedef {Object} BlockJson
 * @prop {string} [message0]
 * @prop {string} [message1]
 * @prop {string} [message2]
 * @prop {string} [message3]
 * @prop {BlockJsonInputValueArg[]} [args0]
 * @prop {BlockJsonInputValueArg[]} [args1]
 * @prop {BlockJsonInputValueArg[]} [args2]
 * @prop {BlockJsonInputValueArg[]} [args3]
 * @prop {string} [category]
 * @prop {string[]} [extensions]
 * @prop {string} [output]
 * @prop {string} [colour]
 * @prop {string} [colourSecondary]
 * @prop {string} [colourTertiary]
 * @prop {string} [colourQuaternary]
 * @prop {boolean} [inputsInline]
 * @prop {string|string[]?} [previousStatement]
 * @prop {string|string[]?} [nextStatement]
 * @prop {string} [tooltip]
 * @prop {boolean} [enableContextMenu]
 * @prop {string} [helpUrl]
 * @prop {any} [mutator]
 * @prop {number} [outputShape]
 * @prop {boolean} [checkboxInFlyout]
 */


/** @enum {Serialized.Primitive[0]} */
export const InputType = /** @type {const} */ ({
    SameShadow: 1,
    NoShadow: 2,
    DifferentShadow: 3,
    MathNumber: 4,
    PositiveNumber: 5,
    WholeNumber: 6,
    IntegerNumber: 7,
    AngleNumber: 8,
    ColorPicker: 9,
    Text: 10,
    Broadcast: 11,
    Variable: 12,
    List: 13,
});

export class RegisteredBlock {
    /**
     * @param {Serialized.Block} ref
     * @param {string} id
     * @param {import("./graph.js").SerializedBlockGraph} graph
     */
    constructor(ref, id, graph) {
        this.ref = ref;
        this.graph = graph;
        this.id = id;
    }

    /**
     * @private
     * @param {RegisteredBlock | null} parent
     * @param {boolean} [setNext]
     */
    linkToParent(parent, setNext = true) {
        this.ref.parent = parent?.id ?? null;
        if (parent && setNext) parent.ref.next = this.id;
    }

    /**
     * @private
     * @param {RegisteredBlock | null} next
     */
    linkToNext(next) {
        this.ref.next = next?.id ?? null;
        if (next) next.ref.parent = this.id;
    }

    /**
     * @param {RegisteredBlock} previous
     * @param {RegisteredBlock} replacement
     */
    replaceInputReferences(previous, replacement) {
        for (const input of Object.values(this.ref.inputs)) {
            assert(input);
            const [type] = input;
            switch (type) {
                case InputType.DifferentShadow:
                    if (input[2] === previous.id) input[2] = replacement.id;
                // fallthrough
                case InputType.SameShadow:
                case InputType.NoShadow:
                    if (input[1] === previous.id) input[1] = replacement.id;
                    break;
            }
        }
    }

    /**
     * @returns {RegisteredBlock | null} parent
     */
    getParent() {
        return this.graph.getBlock(this.ref.parent);
    }

    /**
     * @returns {RegisteredBlock | null} next
     */
    getNext() {
        return this.graph.getBlock(this.ref.next);
    }

    /**
     * Should only be used on statement blocks
     * @param {RegisteredBlock} other
     */
    insertAfter(other) {
        const next = this.getNext();
        this.linkToNext(other);
        if (next) next.linkToParent(other);
    }

    /**
     * Should only be used on statement blocks
     * @param {RegisteredBlock} other
     */
    insertBefore(other) {
        const parent = this.getParent();
        this.linkToParent(other);
        if (parent) {
            parent.replaceInputReferences(this, other); // handles branching blocks with substacks
            parent.linkToNext(other);
        }
    }

    /**
     * Swap the position of this block with another block, be careful of connection types
     * @param {RegisteredBlock} other
     */
    swap(other) {
        const parent = this.getParent();
        const next = this.getNext();
        const otherParent = other.getParent();
        const otherNext = other.getNext();

        this.linkToParent(otherParent, otherParent?.ref.next === other.id);
        this.linkToNext(otherNext);
        other.linkToParent(parent, parent?.ref.next === this.id);
        other.linkToNext(next);

        // handle inputs references
        parent?.replaceInputReferences(this, other);
        otherParent?.replaceInputReferences(other, this);
    }


    /**
     * @param {Partial<Serialized.Block>} partial
     */
    assign(partial) {
        Object.assign(this.ref, partial);
    }

    isReporter() {
        const json = this.getBlockDefinition();
        return !!json.outputShape || !!json.output || json.extensions?.some((ext) => ["output_boolean", "output_number", "output_string"].includes(ext));
    }

    /**
     * @returns {BlockJson}
     */
    getBlockDefinition() {
        const ctx = {
            /** @type {BlockJson} */
            // @ts-expect-error - this is initialized in the jsonInit method
            json: null,
            /** @param {BlockJson} json */
            jsonInit(json) {
                this.json = json;
            },
        };
        this.graph.Blockly.Blocks[this.ref.opcode].init.call(ctx);
        return ctx.json;
    }

    /**
     * get the last block in the chain of blocks
     * @returns {RegisteredBlock}
     */
    tail() {
        /** @type {RegisteredBlock} */
        let tail = this;
        while (tail.ref.next) {
            const next = tail.getNext();
            assert(next);
            tail = next;
        }
        return tail;
    }

    /**
     * get the first block in the chain of blocks
     * @returns {RegisteredBlock}
     */
    head() {
        /** @type {RegisteredBlock} */
        let head = this;
        while (head.ref.parent) {
            const parent = head.getParent();
            assert(parent);
            head = parent;
        }
        return head;
    }

    /**
     * Returns the nearest ancestor that either is a statement or a top-level reporter block.
     * @returns {RegisteredBlock}
     */
    getReportingAnchor() {
        /** @type {RegisteredBlock} */
        let anchor = this;
        while (anchor.ref.parent && anchor.isReporter()) {
            const parent = anchor.getParent();
            assert(parent);
            anchor = parent;
        }
        return anchor;
    }

    /**
     * delete the block and all its children
     */
    deleteTree() {
        this.graph.deleteTree(this);
    }

    /**
     * @returns {boolean}
     */
    isTopLevel() {
        return this.ref.topLevel;
    }

    /**
     * @returns {boolean}
     */
    hasNext() {
        return !!this.ref.next;
    }

    /**
     * @returns {boolean}
     */
    hasParent() {
        return !!this.ref.parent;
    }

    /**
     * clone this block and its descendants
     * @returns {RegisteredBlock}
     */
    clone() {
        const clone = this.graph.register(structuredClone(this.ref));
        clone.copyInputs(this);
        const nextClone = this.getNext()?.clone() ?? null;
        this.linkToNext(nextClone);
        return clone;
    }

    /**
     * @param {string | null | Serialized.Primitive} ref
     * @returns {string | null | Serialized.Primitive}
     */
    cloneRef(ref) {
        if (typeof ref === "string") {
            const block = this.graph.getBlock(ref);
            if (block) return block.clone().id;
        }
        return structuredClone(ref);
    };

    /**
     * @template {Serialized.Primitive} T
     * @private
     * @param {T} primitive
     * @returns {T}
     */
    clonePrimitive(primitive) {
        const [type] = primitive;
        switch (type) {
            case InputType.NoShadow:
            case InputType.SameShadow:
                return /** @type {T} */ ([
                    type,
                    this.cloneRef(primitive[1])
                ]);
            case InputType.DifferentShadow:
                return /** @type {T} */ ([
                    type,
                    this.cloneRef(primitive[1]),
                    this.cloneRef(primitive[2])]);
            default:
                return structuredClone(primitive);
        }
    }

    /**
     * clone the inputs of another block and assign them to this block
     * @param {RegisteredBlock } other
     */
    copyInputs(other) {
        for (const [name, input] of Object.entries(other?.ref.inputs ?? {})) {
            if (!input) continue;
            this.ref.inputs[name] = this.clonePrimitive(input);
        }
    }

    /**
     * Returns the scope block of this block if it is a function definition
     * @returns {RegisteredBlock | undefined}
     */
    getScope() {
        const head = this.head();
        if (head.ref.opcode !== "procedures_definition") return undefined;
        assert(head.ref.inputs.custom_block, "custom_block input not found on procedure definition");
        const [, prototypeId] = head.ref.inputs.custom_block;
        assert(typeof prototypeId === "string", "Definition prototype was not a string");
        return this.graph.getBlock(prototypeId) ?? undefined;
    }

    /**
     * @returns {IterableIterator<RegisteredBlock>}
     */
    *getInputBlocks() {
        for (const input of Object.values(this.ref.inputs)) {
            if (!input) continue;
            const [type, ...rest] = input;
            switch (type) {
                case InputType.DifferentShadow:
                case InputType.NoShadow:
                case InputType.SameShadow:
                    for (const referenceId of rest) {
                        if (typeof referenceId !== "string") continue;
                        const block = this.graph.getBlock(referenceId);
                        assert(block);
                        yield block;
                    }
            }
        }
    }
}
