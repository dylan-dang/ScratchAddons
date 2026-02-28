import { FunctionBlockType, Signature } from "./constants.js";

/** @typedef {import("../userscript.js").FunctionContext} FunctionContext */

/** @param {FunctionContext} context */
export function patchSerialization(context) {
  const { Blockly, vm } = context;
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

  /**
   * @param {string} opcode
   * @returns {BlockJson}
   */
  function getBlockDefinition(opcode) {
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
      /**
       *  @param {string} blockId
       *  @returns {Serialized.Block | undefined}
       */
      function getNonprimitiveBlock(blockId) {
        const block = target.blocks[blockId];
        if (Array.isArray(block)) throw Error("Unexpected primitive block");
        return block;
      }

      /** @param {string} blockId */
      function deleteTree(blockId) {
        const block = target.blocks[blockId];
        target.blocks[blockId] = undefined;
        if (Array.isArray(block)) return;
        for (const [type, input, maybeShadow] of Object.values(block.inputs)) {
          if (type > 3) continue;
          if (typeof input === "string") deleteTree(input);
          if (typeof maybeShadow === "string") deleteTree(maybeShadow);
        }
      }

      for (const [id, block] of Object.entries(target.blocks)) {
        if (Array.isArray(block)) continue; // primitive
        if (!block.opcode.startsWith("function")) continue;

        // define stack list if any function block is detected
        target.lists[Signature.STACK] = [Signature.STACK, []];

        if (block.opcode === FunctionBlockType.PROTOTYPE) {
          block.opcode = "procedures_prototype";
          block.mutation.proccode = Signature.FUNCTION + block.mutation.proccode;
          continue;
        }

        if (block.opcode === FunctionBlockType.DEFINITION) {
          block.opcode = "procedures_definition";

          /**
           * @param {Serialized.Block} block
           */
          function replaceStopScript(block) {
            if (!block) return;

            if (block.opcode === "control_stop" && block.fields.STOP_OPTION[0] === "this script") {
              block.opcode = FunctionBlockType.RETURN;
              block.mutation = undefined;
              block.inputs = { ITEM: [1, [10, ""]] };
              block.fields = {};
              return;
            }

            replaceStopScript(getNonprimitiveBlock(block.next));
            for (const [name, [type, refId]] of Object.entries(block.inputs)) {
              if (!name.startsWith("SUBSTACK")) continue;
              if (type > 3 || typeof refId !== "string") continue; // not a block reference
              replaceStopScript(getNonprimitiveBlock(refId));
            }
          }

          replaceStopScript(block);

          let lastBlock = block;
          let lastBlockId = id;
          while (lastBlock.next) {
            const id = lastBlock.next;
            const nextBlock = getNonprimitiveBlock(id);
            if (!nextBlock) break;
            lastBlock = nextBlock;
            lastBlockId = id;
          }

          // check for cap blocks
          if (
            lastBlock.opcode === "control_delete_this_clone" ||
            lastBlock.opcode === "control_forever" ||
            lastBlock.opcode === FunctionBlockType.RETURN ||
            lastBlock.mutation?.hasnext === "false"
          )
            continue;

          const implicitReturnId = Blockly.utils.genUid();
          /** @type {Serialized.Block} */
          const implicitReturn = {
            opcode: "data_insertatlist",
            next: null,
            parent: lastBlockId,
            inputs: {
              ITEM: [1, [10, ""]],
              INDEX: [1, [7, "1"]],
            },
            fields: {
              LIST: [Signature.STACK, Signature.STACK],
            },
            shadow: false,
            topLevel: false,
          };
          target.blocks[implicitReturnId] = implicitReturn;
          lastBlock.next = implicitReturnId;
        }
      }

      // handle function returns
      for (const [id, block] of Object.entries(target.blocks)) {
        if (Array.isArray(block)) continue; // primitive
        if (block.opcode !== FunctionBlockType.RETURN) continue;
        block.opcode = "data_insertatlist";
        block.inputs.INDEX = [1, [7, "1"]];
        block.fields.LIST = [Signature.STACK, Signature.STACK];
        block.next = Blockly.utils.genUid();
        target.blocks[block.next] = {
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
          next: null,
          parent: id,
          shadow: false,
          topLevel: false,
        };
      }

      // handle calls after transpiling returns
      for (const [id, block] of Object.entries(target.blocks)) {
        if (Array.isArray(block)) continue; // primitive
        if (block.opcode !== FunctionBlockType.CALL) continue;

        const reporterExtensions = new Set(["output_boolean", "output_number", "output_string"]);
        /** @param {BlockJson} json */
        const isReporter = (json) =>
          !!json.outputShape || !!json.output || json.extensions?.some((ext) => reporterExtensions.has(ext));

        let highestAncestor = block;
        /** contains either the closest statement or top-level reporter ancestor */
        let closestStatementId = id;
        let wasReporter = true;
        while (highestAncestor.parent) {
          const parentId = highestAncestor.parent;
          if (!parentId) break;
          highestAncestor = getNonprimitiveBlock(parentId);
          if (wasReporter) {
            closestStatementId = parentId;
            wasReporter = isReporter(getBlockDefinition(highestAncestor.opcode));
          }
        }

        if (wasReporter) {
          deleteTree(closestStatementId);
          continue;
          // TODO handle top level expressions
        }

        // TODO handle loudness greater than hat workaround

        /**
         * @param {Serialized.Block} block
         * @param {{counter: number}} [ctx] - Context object for the call number.
         * @returns {Serialized.Block[]}
         */
        function getAndReplaceCalls(block, ctx = { counter: 1 }) {
          if (block.opcode === FunctionBlockType.CALL) {
            const copy = { ...block };
            copy.comment = undefined;
            copy.next = null;
            copy.parent = null;
            block.opcode = "data_itemoflist";
            block.mutation = undefined;
            block.fields = {
              LIST: [Signature.STACK, Signature.STACK],
            };
            block.inputs = {
              INDEX: [1, [7, String(ctx.counter++)]],
            };
            return [copy];
          }

          /** @type {string[]} */
          const argumentIds = [
            // Get argument ids from definition
            // In scratch, args1+ only show up on control blocks with substacks and never contain inputs
            ...(getBlockDefinition(block.opcode)
              .args0?.filter(({ type }) => type === "input_value")
              .map(({ name }) => name) ?? []),
            // get argument ids from mutation
            ...JSON.parse(block.mutation?.argumentids ?? "[]"),
          ];

          const inputBlocks = argumentIds
            .map((argId) => block.inputs[argId])
            .filter(Boolean)
            .map(([, input]) => {
              if (typeof input !== "string") return;
              const block = target.blocks[input];
              if (!block || Array.isArray(block)) return;
              return block;
            })
            .filter(Boolean);

          return inputBlocks.flatMap((block) => getAndReplaceCalls(block, ctx));
        }

        /**
         * @param {Serialized.Block | undefined} parent
         * @param {string} stmtId
         * @param {string} replacementId
         */
        function replaceChildStatementReference(parent, stmtId, replacementId) {
          if (!parent) return;
          // replace next block reference
          if (parent.next === stmtId) parent.next = replacementId;
          // replace any input_statements in inputs
          for (const input of Object.values(parent.inputs)) {
            const [type, refId] = input;
            if (type <= 3 && refId === stmtId) input[1] = replacementId;
          }
        }

        /**
         * @param {string} nextId
         * @param {Serialized.Block} block
         */
        function insertBefore(nextId, block) {
          if (block.parent === null) throw new Error("block.parent must be null");
          if (block.next === null) throw new Error("block.next must be null");
          const nextBlock = getNonprimitiveBlock(nextId);
          if (!nextBlock) throw new Error("tried to insert block before nonexistent block");
          const parentId = nextBlock.parent;
          const parentBlock = getNonprimitiveBlock(parentId);
          const id = Blockly.utils.genUid();
          target.blocks[id] = block;

          replaceChildStatementReference(parentBlock, nextId, id);
          block.parent = parentId;
          block.next = nextId;
          nextBlock.parent = id;

          return id;
        }

        /**
         * @param {string} parentId
         * @param {Serialized.Block} block
         */
        function insertAfter(parentId, block) {
          if (block.parent === null) throw new Error("block.parent must be null");
          if (block.next === null) throw new Error("block.next must be null");
          const parentBlock = getNonprimitiveBlock(parentId);
          if (!parentBlock) throw new Error("tried to insert block before nonexistent block");
          const nextId = parentBlock.next;
          const nextBlock = getNonprimitiveBlock(nextId);
          const id = Blockly.utils.genUid();
          target.blocks[id] = block;

          parentBlock.next = id;
          block.parent = parentId;
          block.next = nextId;
          if (nextBlock) nextBlock.parent = id;

          return id;
        }

        /**
         * Unfold all function calls to procedure calls from a statemtn
         * @param {string} stmtId
         * @return {string | undefined} - first function call id
         */
        function transpileStatement(stmtId) {
          const stmtBlock = getNonprimitiveBlock(stmtId);
          const next = stmtBlock.next;

          const nextBlock = getNonprimitiveBlock(next);

          const calls = getAndReplaceCalls(stmtBlock);
          if (calls.length === 0) return;

          if (stmtBlock.topLevel) {
            const [firstCall] = calls;
            firstCall.x = stmtBlock.x;
            firstCall.y = stmtBlock.y;
            firstCall.topLevel = true;
            stmtBlock.topLevel = false;
            stmtBlock.x = undefined;
            stmtBlock.y = undefined;
          }

          const callStmtIds = [];
          for (const call of calls) {
            call.opcode = "procedures_call";
            call.mutation.proccode = Signature.FUNCTION + call.mutation.proccode;
            callStmtIds.push(insertBefore(stmtId, call));
          }

          const isCall =
            stmtBlock.opcode === "procedures_call" && stmtBlock.mutation.proccode.startsWith(Signature.FUNCTION);
          const isStackPush = stmtBlock.opcode === "data_insertatlist" && stmtBlock.fields.LIST[0] === Signature.STACK;

          /** @type {Serialized.Block} */
          const deleter = {
            opcode: "data_deleteoflist",
            fields: { LIST: [Signature.STACK, Signature.STACK] },
            // if the stmt we are transpiling is a fn call, we reserve index 1 for the return value
            inputs: { INDEX: [1, [7, isCall || isStackPush ? "2" : "1"]] },
            shadow: false,
            topLevel: false,
            next: null,
            parent: null,
          };

          // if there is more than one call replace deleter with repeater
          if (calls.length > 1) {
            const deleterId = Blockly.utils.genUid();
            const repeaterId = insertAfter(stmtId, {
              opcode: "control_repeat",
              fields: {},
              inputs: {
                TIMES: [1, [6, String(calls.length)]],
                SUBSTACK: [2, deleterId],
              },
              parent: deleter.parent,
              next: deleter.next,
              shadow: false,
              topLevel: false,
            });
            deleter.next = null;
            deleter.parent = repeaterId;
            target.blocks[deleterId] = deleter;
          } else {
            insertAfter(stmtId, deleter);
          }

          let startId = null;
          for (const callStmtId of callStmtIds) {
            const subStartId = transpileStatement(callStmtId);
            if (startId === null) startId = subStartId;
          }
          return startId ?? callStmtIds[0];
        }

        /**
         * @param {string} stmtId
         * @param {Serialized.Block} [scope]
         */
        function atomicizeStatement(stmtId, scope) {
          const stmt = getNonprimitiveBlock(stmtId);
          const prototypeId = Blockly.utils.genUid();
          const definitionId = Blockly.utils.genUid();
          const callId = Blockly.utils.genUid();

          const proccode = `${Signature.ATOMIC}${stmtId.replaceAll("%", "\\%")} ${scope?.mutation.proccode.match(/(?<!\\)%[nbs]/g).join(" ") ?? ""
            }`;

          // clone argument reporters
          const argumentids = scope?.mutation.argumentids ?? "[]";

          /** @type {Serialized.Block} */
          const prototype = {
            opcode: "procedures_prototype",
            next: null,
            parent: definitionId,
            inputs: /** @type {any} */ (
              Object.fromEntries(
                Object.entries(scope?.inputs ?? {}).map(([name, [type, refId]]) => {
                  // this shouldn't happen
                  if (typeof refId !== "string") return [name, [type, refId]];
                  const id = Blockly.utils.genUid();
                  target.blocks[id] = structuredClone(getNonprimitiveBlock(refId));
                  target.blocks[id].parent = prototypeId;
                  return [name, [type, id]];
                })
              )
            ),
            fields: {},
            shadow: true,
            topLevel: false,
            mutation: {
              tagName: "mutation",
              children: [],
              proccode,
              argumentids,
              argumentnames: scope?.mutation.argumentnames ?? "[]",
              argumentdefaults: scope?.mutation.argumentdefaults ?? "[]",
              warp: "true",
            },
          };
          target.blocks[prototypeId] = prototype;

          /** @type {Serialized.Block} */
          const definition = {
            opcode: "procedures_definition",
            next: stmtId,
            parent: null,
            inputs: {
              custom_block: [1, prototypeId],
            },
            fields: {},
            shadow: false,
            topLevel: true,
            // TODO determine smartly where to place definition
            x: 0,
            y: 0,
          };
          target.blocks[definitionId] = definition;

          /** @type {Serialized.Block} */
          const call = {
            // copy stmt info like toplevel, x, y, parent, and next
            ...stmt,
            opcode: "procedures_call",
            comment: undefined,
            inputs: /** @type {any} */ (
              Object.fromEntries(
                Object.entries(scope?.inputs ?? {}).map(([name, [type, refId]]) => {
                  // this shouldn't happen
                  if (typeof refId !== "string") return [name, [type, refId]];
                  const id = Blockly.utils.genUid();
                  target.blocks[id] = structuredClone(getNonprimitiveBlock(refId));
                  target.blocks[id].parent = callId;
                  target.blocks[id].shadow = false;
                  return [name, [type, id]];
                })
              )
            ),
            fields: {},
            shadow: false,
            mutation: {
              tagName: "mutation",
              children: [],
              proccode,
              argumentids,
              warp: "true",
            },
          };
          target.blocks[callId] = call;

          replaceChildStatementReference(getNonprimitiveBlock(stmt.parent), stmtId, callId);
          stmt.parent = definitionId;
          stmt.next = null;
        }

        function getScope() {
          if (highestAncestor.opcode !== "procedures_definition") return undefined;
          const [, prototypeId] = highestAncestor.inputs.custom_block;
          if (typeof prototypeId !== "string") throw new Error("Definition prototype was not a string");
          return getNonprimitiveBlock(prototypeId);
        }

        const scope = getScope();
        if (scope?.mutation.warp === "true") {
          // we can inline the call
          const blockId = transpileStatement(closestStatementId);
          if (!blockId) {
            console.warn("No block id returned from transpileStatement, skipping inline comment");
            continue;
          }
          const commentId = Blockly.utils.genUid();
          target.comments[commentId] = {
            blockId,
            text: Signature.INLINE,
            minimized: true,
            height: 200,
            width: 200,
            x: 0,
            y: 0,
          };
          getNonprimitiveBlock(blockId).comment = commentId;
        } else {
          atomicizeStatement(closestStatementId, scope);
          transpileStatement(closestStatementId);
        }
      }
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
            const [a, b] = refs.map(({ inputs }) => Number.parseInt(blocks.getBlock(inputs.INDEX.block).fields.NUM.value));
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
        if (
          !nextBlock ||
          nextBlock.opcode !== "control_stop" ||
          nextBlock.fields.STOP_OPTION.value !== "this script"
        ) {
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
