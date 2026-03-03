import { FunctionBlockType, Signature } from "./constants.js";

/** @typedef {import("../userscript.js").FunctionContext} FunctionContext */

/**
 * @typedef {Object} BlockJsonInputValueArg
 * @prop {"input_value"} type
 * @prop {string} name
 * @prop {string} [check]
 */

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
const InputType = /** @type {const} */ ({
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

class SerializedBlockGraph {
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
   * @param {string | Serialized.Primitive} referenceId
   */
  deleteTreeReference(referenceId) {
    if (typeof referenceId !== "string") return;
    this.deleteTree(this.getBlock(referenceId));
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
   * @param {string} id
   * @returns {RegisteredBlock | undefined}
   */
  getBlock(id) {
    const block = this.blocks[id];
    if (!block) return undefined;
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
          `Sanity check failed: dangling reference to block "${refId}" from ${refs.map((r) => `${r.source} (${r.kind})`).join(", ")}`
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
        `Sanity check failed: block "${id}" (opcode: ${block.opcode}) is neither top-level nor referenced`
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
            `Sanity check failed: block "${id}" has next="${block.next}", but block "${block.next}" has parent="${nextRef.parent}" (expected "${id}")`
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
            `Sanity check failed: block "${id}" has parent="${block.parent}", but parent block does not reference "${id}" in next or inputs`
          );
        }
      }
    }
  }
}

class RegisteredBlock {
  /**
   * @param {Serialized.Block} ref
   * @param {string} id
   * @param {SerializedBlockGraph} graph
   */
  constructor(ref, id, graph) {
    this.ref = ref;
    this.graph = graph;
    this.id = id;
  }

  /**
   * @private
   * @param {RegisteredBlock} parent
   */
  setParent(parent) {
    this.ref.parent = parent.id;
    parent.ref.next = this.id;
  }

  /**
   * @private
   * @param {RegisteredBlock} next
   */
  setNext(next) {
    this.ref.next = next.id;
    next.ref.parent = this.id;
  }

  /**
   * @param {RegisteredBlock} previous
   * @param {RegisteredBlock} replacement
   */
  replaceInputReferences(previous, replacement) {
    for (const input of Object.values(this.ref.inputs)) {
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
   * @returns {RegisteredBlock | undefined} parent
   */
  getParent() {
    return this.graph.getBlock(this.ref.parent);
  }

  /**
   * @returns {RegisteredBlock | undefined} next
   */
  getNext() {
    return this.graph.getBlock(this.ref.next);
  }

  /**
   * @param {RegisteredBlock} other
   */
  insertAfter(other) {
    const next = this.getNext();
    this.setNext(other);
    if (next) next.setParent(other);
  }

  /**
   * @param {RegisteredBlock} other
   */
  insertBefore(other) {
    const parent = this.getParent();
    this.setParent(other);
    if (parent) {
      parent.replaceInputReferences(this, other); // handles branching blocks with substacks
      parent.setNext(other);
    }
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
    return getBlockDefinition(this.graph.Blockly, this.ref.opcode);
  }

  /**
   * get the last block in the chain of blocks
   * @returns {RegisteredBlock}
   */
  tail() {
    /** @type {RegisteredBlock} */
    let tail = this;
    while (tail.ref.next) {
      tail = tail.getNext();
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
      head = head.getParent();
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
      anchor = anchor.getParent();
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
   * copy this block and redirect all inputs to the new block
   * The orignal block should not use inputs after cloning
   * @returns {RegisteredBlock}
   */
  copy() {
    const copy = this.graph.register(structuredClone(this.ref));
    // redirect all inputs to the new block
    for (const inputBlock of this.getInputBlocks()) {
      inputBlock.ref.parent = this.id;
    }
    return copy;
  }

  /**
   * shallow copy the inputs of another block to this block
   * @param {RegisteredBlock} other
   */
  copyInputs(other) {
    for (const [name, input] of Object.entries(other?.ref.inputs ?? {})) {
      const [type, reference] = input;
      switch (type) {
        case InputType.SameShadow:
        case InputType.NoShadow:
        case InputType.DifferentShadow:
          if (typeof reference !== "string") {
            // this shouldn't happen
            this.ref.inputs[name] = input;
            break;
          }
          const copy = this.graph.getBlock(reference).copy();
          /** @type {Serialized.Primitive} */
          const copyRef = [...input];
          copyRef[1] = copy.id;

          this.ref.inputs[name] = copyRef;
          break;
        default:
          this.ref.inputs[name] = input;
          break;
      }
    }
  }

  getScope() {
    const head = this.head();
    if (head.ref.opcode !== "procedures_definition") return undefined;
    const [, prototypeId] = head.ref.inputs.custom_block;
    if (typeof prototypeId !== "string") throw new Error("Definition prototype was not a string");
    return this.graph.getBlock(prototypeId);
  }

  /**
   * @returns {IterableIterator<RegisteredBlock>}
   */
  *getInputBlocks() {
    for (const input of Object.values(this.ref.inputs)) {
      const [type] = input;
      switch (type) {
        case InputType.DifferentShadow:
          if (typeof input[2] === "string") yield this.graph.getBlock(input[2]);
        // fallthrough
        case InputType.SameShadow:
          if (typeof input[1] === "string") yield this.graph.getBlock(input[1]);
          break;
      }
    }
  }
}


/**
 * convert control_stop blocks to empty return blocks so that we can correct them
 * @param {RegisteredBlock} block
 */
function replaceStopScripts(block) {
  if (!block) return;

  if (block.ref.opcode === "control_stop" && block.ref.fields.STOP_OPTION[0] === "this script") {
    block.assign({
      opcode: FunctionBlockType.RETURN,
      mutation: undefined,
      inputs: { ITEM: [InputType.SameShadow, [InputType.Text, ""]] },
      fields: {},
    });
    return;
  }

  replaceStopScripts(block.getNext());
  // handle branching blocks
  for (const [name, [type, refId]] of Object.entries(block.ref.inputs)) {
    if (!name.startsWith("SUBSTACK")) continue;
    if (type > 3 || typeof refId !== "string") continue; // not a block reference
    replaceStopScripts(block.graph.getBlock(refId));
  }
}

/**
 * @param {ScratchBlocks.Blockly} Blockly
 * @param {string} opcode
 * @returns {BlockJson}
 */
function getBlockDefinition(Blockly, opcode) {
  const ctx = {
    /** @type {BlockJson} */
    json: null,
    /** @param {BlockJson} json */
    jsonInit(json) {
      this.json = json;
    },
  };
  Blockly.Blocks[opcode].init.call(ctx);
  return ctx.json;
}

/** @param {FunctionContext} context */
export function patchSerialization({ Blockly, vm }) {

  const vmPrototype = Object.getPrototypeOf(vm);
  const originalToJSON = vmPrototype.toJSON;
  /**
   * @param {string} optTargetId
   */
  vmPrototype.toJSON = function (optTargetId) {
    const json = originalToJSON.call(this, optTargetId);
    /** @type {Serialized.Project | Serialized.Sprite} */
    const parsed = JSON.parse(json);
    const targets = "blocks" in parsed ? [parsed] : parsed.targets;
    for (const target of targets) {
      const graph = new SerializedBlockGraph({
        Blockly,
        blocks: target.blocks,
      });

      for (const prototype of graph.getBlocks([FunctionBlockType.PROTOTYPE])) {
        prototype.assign({
          opcode: "procedures_prototype",
          mutation: {
            ...prototype.ref.mutation,
            proccode: Signature.FUNCTION + prototype.ref.mutation.proccode,
          },
        });
      }

      for (const definition of graph.getBlocks([FunctionBlockType.DEFINITION])) {

        // define stack list if any definitions are present
        target.lists[Signature.STACK] = [Signature.STACK, []];

        definition.assign({ opcode: "procedures_definition" });

        replaceStopScripts(definition);

        const lastBlock = definition.tail();

        // check if last block is a cap block
        if ([
          "control_delete_this_clone",
          "control_forever",
          FunctionBlockType.RETURN,
          "control_stop",
        ].includes(lastBlock.ref.opcode)) continue;
        if (lastBlock.ref.mutation?.hasnext === "false") continue;

        // insert implicit return block after last block
        lastBlock.insertAfter(graph.register({
          opcode: "data_insertatlist",
          inputs: {
            ITEM: [InputType.SameShadow, [InputType.Text, ""]],
            INDEX: [InputType.SameShadow, [InputType.IntegerNumber, "1"]],
          },
          fields: {
            LIST: [Signature.STACK, Signature.STACK],
          },
          shadow: false,
          topLevel: false,
        }));
      }

      for (const returnBlock of graph.getBlocks([FunctionBlockType.RETURN])) {
        returnBlock.assign({
          opcode: "data_insertatlist",
          inputs: {
            ...returnBlock.ref.inputs, // inherit ITEM
            INDEX: [InputType.SameShadow, [InputType.IntegerNumber, "1"]],
          },
          fields: { LIST: [Signature.STACK, Signature.STACK] },
        });

        returnBlock.insertAfter(graph.register({
          opcode: "control_stop",
          fields: {
            STOP_OPTION: ["this script", null],
          },
          inputs: {},
          mutation: {
            children: [],
            hasnext: "false",
            tagName: "mutation",
          },
          shadow: false,
          topLevel: false,
        }));
      }

      // need to handle calls after transpiling returns
      for (const block of graph.getBlocks([FunctionBlockType.CALL])) {
        const anchor = block.getReportingAnchor();

        if (anchor.isReporter()) {
          // TODO handle top level expressions
          graph.deleteTree(anchor);
          continue;
        }


        /**
         * @param {RegisteredBlock} block
         * @param {{counter: number}} [ctx] - Context object for the call number.
         * @returns {RegisteredBlock[]}
         */
        function getAndReplaceCalls(block, ctx = { counter: 1 }) {
          if (block.ref.opcode === FunctionBlockType.CALL) {
            const copy = block.copy();
            block.assign({
              opcode: "data_itemoflist",
              mutation: undefined,
              fields: {
                LIST: [Signature.STACK, Signature.STACK],
              },
              inputs: {
                INDEX: [InputType.SameShadow, [InputType.IntegerNumber, String(ctx.counter++)]],
              },
            });
            return [copy];
          }

          /** @type {string[]} */
          const argumentIds = [
            // Get argument ids from definition
            // In scratch, args1+ only show up on control blocks with substacks and never contain inputs
            ...(block.getBlockDefinition()
              .args0?.filter(({ type }) => type === "input_value")
              .map(({ name }) => name) ?? []),
            // get argument ids from mutation
            ...JSON.parse(block.ref.mutation?.argumentids ?? "[]"),
          ];

          const inputBlocks = argumentIds
            .map((argId) => block.ref.inputs[argId])
            .filter(Boolean)
            .map(([, input]) => {
              if (typeof input !== "string") return;
              return graph.getBlock(input);
            })
            .filter(Boolean);

          return inputBlocks.flatMap((block) => getAndReplaceCalls(block, ctx));
        }

        /**
         * Unfold all function calls to procedure calls from a statement
         * @param {RegisteredBlock} stmt
         * @return {RegisteredBlock | undefined} - first function call
         */
        function transpileStatement(stmt) {
          const calls = getAndReplaceCalls(stmt);
          if (calls.length === 0) return;

          if (stmt.isTopLevel()) {
            const [firstCall] = calls;
            firstCall.assign({
              x: stmt.ref.x,
              y: stmt.ref.y,
              topLevel: true,
            });
            stmt.assign({
              topLevel: false,
              x: undefined,
              y: undefined,
            });
          }

          for (const call of calls) {
            call.assign({
              opcode: "procedures_call",
              mutation: {
                ...call.ref.mutation,
                proccode: Signature.FUNCTION + call.ref.mutation.proccode,
              },
            });
            stmt.insertBefore(call);
          }

          const isCall =
            stmt.ref.opcode === "procedures_call" && stmt.ref.mutation.proccode.startsWith(Signature.FUNCTION);
          const isStackPush = stmt.ref.opcode === "data_insertatlist" && stmt.ref.fields.LIST[0] === Signature.STACK;

          const deleter = graph.register({
            opcode: "data_deleteoflist",
            fields: { LIST: [Signature.STACK, Signature.STACK] },
            // if the stmt we are transpiling is a fn call, we reserve index 1 for the return value
            inputs: { INDEX: [InputType.SameShadow, [InputType.IntegerNumber, isCall || isStackPush ? "2" : "1"]] },
            shadow: false,
            topLevel: false,
          });

          // if there is more than one call replace deleter with repeater
          if (calls.length > 1) {
            const repeater = graph.register({
              opcode: "control_repeat",
              fields: {},
              inputs: {
                TIMES: [InputType.SameShadow, [InputType.WholeNumber, String(calls.length)]],
                SUBSTACK: [InputType.NoShadow, deleter.id],
              },
              shadow: false,
              topLevel: false,
            })
            deleter.ref.parent = repeater.id;

            stmt.insertAfter(repeater);
          } else {
            stmt.insertAfter(deleter);
          }

          let startingCall = null;
          for (const call of calls) {
            const subcall = transpileStatement(call);
            if (startingCall === null) startingCall = subcall;
          }
          return startingCall ?? calls[0];
        }

        /**
         * converts a statement into a atomic procedure call
         * @param {RegisteredBlock} stmt
         * @param {RegisteredBlock} [scope]
         * @returns {RegisteredBlock} - the copied statement with atomic procedure
         */
        function atomicizeStatement(stmt, scope) {
          const proccode = `${Signature.ATOMIC}${stmt.id.replaceAll("%", "\\%")} ${scope?.ref.mutation.proccode.match(/(?<!\\)%[nbs]/g).join(" ") ?? ""
            }`;

          // copy argument reporters
          const argumentids = scope?.ref.mutation.argumentids ?? "[]";

          const prototype = graph.register({
            opcode: "procedures_prototype",
            inputs: {},
            fields: {},
            shadow: true,
            topLevel: false,
            mutation: {
              tagName: "mutation",
              children: [],
              proccode,
              argumentids,
              argumentnames: scope?.ref.mutation.argumentnames ?? "[]",
              argumentdefaults: scope?.ref.mutation.argumentdefaults ?? "[]",
              warp: "true",
            },
          });

          prototype.copyInputs(scope);

          const definition = graph.register({
            opcode: "procedures_definition",
            inputs: {
              custom_block: [1, prototype.id],
            },
            fields: {},
            shadow: false,
            topLevel: true,
            // TODO determine smartly where to place definition
            x: 0,
            y: 0,
          });

          // copy the statement and insert it after the definition
          const copy = stmt.copy();
          definition.insertAfter(copy);

          // convert statement to atomic call
          stmt.assign({
            opcode: "procedures_call",
            comment: undefined,
            inputs: {},
            fields: {},
            shadow: false,
            mutation: {
              tagName: "mutation",
              children: [],
              proccode,
              argumentids,
              warp: "true",
            },
          });

          stmt.copyInputs(scope);

          return copy;
        }

        const scope = anchor.getScope();
        if (scope?.ref.mutation.warp === "true") {
          // we can inline the call
          const block = transpileStatement(anchor);
          if (!block) {
            console.warn("No block id returned from transpileStatement, skipping inline comment");
            continue;
          }
          const commentId = Blockly.utils.genUid();
          target.comments[commentId] = {
            blockId: block.id,
            text: Signature.INLINE,
            minimized: true,
            height: 200,
            width: 200,
            x: 0,
            y: 0,
          };
          block.ref.comment = commentId;
        } else {
          const copy = atomicizeStatement(anchor, scope);
          transpileStatement(copy);
        }
      }
      graph.validate();
    }

    return JSON.stringify(parsed);
  };
}

/** @param {FunctionContext} context */
export function patchDeserialization(context) {
  const { vm } = context;
  const patchedTargets = new WeakSet();
  vm.addListener("targetsUpdate", () => {
    const targets = vm.runtime.targets;
    for (const target of targets) {
      if (patchedTargets.has(target)) continue;
      patchedTargets.add(target);

      /**
       * @param {ScratchVM.Block} block
       * @param {ScratchVM.Block} [replacement]
       */
      function detachBlock(block, replacement) {
        const parent = blocks.getBlock(block.parent);
        if (parent && parent.next === block.id) {
          parent.next = replacement ? replacement.id : block.next;
          for (const input of Object.values(parent.inputs)) {
            if (input.block === block.id) {
              input.block = replacement ? replacement.id : block.next;
            }
          }
        }
        const next = blocks.getBlock(block.next);
        if (next) {
          next.parent = replacement ? replacement.id : block.parent;
        }
        if (replacement) {
          replacement.parent = block.parent;
          replacement.next = block.next;
        }
        block.parent = null;
        block.next = null;
      }

      const blocks = target.blocks;
      const oldForceNoGlow = blocks.forceNoGlow;
      // this disables blocks.emitProjectChanged
      blocks.forceNoGlow = true;

      /**
       * @param {ScratchVM.Block} block
       * @returns {ScratchVM.Block[]}
       */
      function getStackReferences(block) {
        if (block.opcode === "data_itemoflist" && block.fields.LIST.id === Signature.STACK) return [block];
        return Object.values(block.inputs).flatMap(({ block }) => getStackReferences(blocks.getBlock(block)));
      }
      /**
       * @param {string} blockId
       * @returns {ScratchVM.Block}
       */
      function foldCall(blockId) {
        const callStack = [];
        let curr = blocks.getBlock(blockId);
        let foldedStatement = null;
        do {
          if (!curr) throw new Error("Unexpected end of atomic function call stack");
          // order the stack references by descending index
          const stackRefs = getStackReferences(curr).sort((...refs) => {
            const [a, b] = refs.map(({ inputs }) =>
              Number.parseInt(blocks.getBlock(inputs.INDEX.block).fields.NUM.value)
            );
            return b - a;
          });
          for (const stackRef of stackRefs) {
            const correspondingCall = callStack.pop();
            // this should only be the INDEX of the data_itemoflist block
            for (const { block, shadow } of Object.values(stackRef.inputs)) {
              blocks.deleteBlock(block);
              blocks.deleteBlock(shadow);
            }
            stackRef.opcode = FunctionBlockType.CALL;
            stackRef.fields = {};
            stackRef.mutation = correspondingCall.mutation;
            stackRef.mutation.proccode = stackRef.mutation.proccode.slice(Signature.FUNCTION.length);
            stackRef.inputs = correspondingCall.inputs;
            detachBlock(correspondingCall);
            // just delete it directly since we move the inputs to this stack reference
            delete blocks._blocks[correspondingCall.id];
          }
          if (stackRefs.length) {
            foldedStatement = curr;
            const deleter = blocks.getBlock(curr.next);
            detachBlock(deleter);
            blocks.deleteBlock(deleter.id);
          }
          if (curr.opcode === "procedures_call" && curr.mutation.proccode.startsWith(Signature.FUNCTION)) {
            callStack.push(curr);
          }
          curr = blocks.getBlock(curr.next);
        } while (callStack.length);
        return foldedStatement;
      }

      for (const comment of Object.values(target.comments)) {
        if (comment.text === Signature.INLINE) {
          const block = blocks.getBlock(comment.blockId);
          if (!block) {
            console.warn("Inline comment without block", comment);
            continue;
          }
          delete target.comments[comment.id];
          foldCall(block.id);
        }
      }

      // scripts is mutated during the loop, so we need to copy it
      const scripts = [...blocks.getScripts()];
      for (const script of scripts) {
        const topBlock = blocks.getBlock(script);
        if (topBlock.opcode === "procedures_definition") {
          const prototype = blocks.getBlock(topBlock.inputs.custom_block.block);
          if (!prototype || prototype.opcode !== "procedures_prototype") {
            console.warn("Function definition without prototype", topBlock);
            continue;
          }

          if (prototype.mutation.proccode.startsWith(Signature.FUNCTION)) {
            topBlock.opcode = FunctionBlockType.DEFINITION;
            prototype.opcode = FunctionBlockType.PROTOTYPE;
            prototype.mutation.proccode = prototype.mutation.proccode.slice(Signature.FUNCTION.length);
            let lastBlock = topBlock;
            while (lastBlock.next) {
              const nextBlock = blocks.getBlock(lastBlock.next);
              if (!nextBlock) break;
              lastBlock = nextBlock;
            }
            // remove the implicit return
            if (
              lastBlock.opcode === "data_insertatlist" &&
              lastBlock.fields.LIST.id === Signature.STACK &&
              blocks.getBlock(lastBlock.inputs.INDEX.block)?.fields.NUM.value === "1" &&
              blocks.getBlock(lastBlock.inputs.ITEM.block)?.fields.TEXT.value === ""
            ) {
              detachBlock(lastBlock);
              blocks.deleteBlock(lastBlock.id);
            }
          } else if (prototype.mutation.proccode.startsWith(Signature.ATOMIC)) {
            const foldedStatement = foldCall(topBlock.next);
            if (!foldedStatement) {
              console.warn("Atomic definition without folded statement", topBlock);
              continue;
            }
            detachBlock(foldedStatement);
            // replace atomic calls with their folded statement definitions
            for (const block of Object.values(blocks._blocks)) {
              if (block.opcode === "procedures_call" && block.mutation.proccode === prototype.mutation.proccode) {
                detachBlock(block, foldedStatement);
              }
            }
            // delete atomic definition and __stack__ cleanup calls
            blocks.deleteBlock(topBlock.id);
          }
        }
      }

      for (const block of Object.values(blocks._blocks)) {
        if (block.opcode !== "data_insertatlist" || block.fields.LIST.id !== Signature.STACK) continue;
        if (blocks.getBlock(block.inputs.INDEX.block)?.fields.NUM.value !== "1") {
          console.warn("Unexpected stack insertion block", block);
          continue;
        }
        const nextBlock = blocks.getBlock(block.next);
        if (!nextBlock) continue;
        if (!nextBlock || nextBlock.opcode !== "control_stop" || nextBlock.fields.STOP_OPTION.value !== "this script") {
          console.warn("Unexpected stack insertion block next", block, nextBlock);
          continue;
        }
        detachBlock(nextBlock);
        blocks.deleteBlock(nextBlock.id);
        block.opcode = FunctionBlockType.RETURN;

        blocks.deleteBlock(block.inputs.INDEX.block);
        blocks.deleteBlock(block.inputs.INDEX.shadow);
        // biome-ignore lint/performance/noDelete: we want to delete the input
        delete block.inputs.INDEX;
        block.fields = {};
      }
      blocks.forceNoGlow = oldForceNoGlow;
    }
  });
}
