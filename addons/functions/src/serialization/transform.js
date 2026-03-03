import { FunctionBlockType, Signature } from "../constants.js";
import { assert } from "../utils.js";
import { InputType, RegisteredBlock } from "./block.js";
import { SerializedBlockGraph } from "./graph.js";

/** @typedef {import("../../userscript.js").FunctionContext} FunctionContext */


class SerializeTransformer {
  /**
   * @param {{ Blockly: ScratchBlocks.Blockly, vm: object }} dependencies
   */
  constructor({ Blockly, vm }) {
    this.Blockly = Blockly;
    this.vm = vm;
  }

  /**
   * @param {Serialized.Target} target
   */
  transpileTarget(target) {
    const graph = new SerializedBlockGraph({
      Blockly: this.Blockly,
      blocks: target.blocks,
    });
    this.transpilePrototypes(graph);
    this.transpileDefinitions(target, graph);
    this.transpileReturns(graph);
    this.transpileCalls(target, graph);
    graph.validate();
  }

  /**
   * @private
   * @param {SerializedBlockGraph} graph
   */
  transpilePrototypes(graph) {
    for (const prototype of graph.getBlocks([FunctionBlockType.PROTOTYPE])) {
      assert(prototype.ref.mutation, "Prototype mutation is required");
      prototype.assign({
        opcode: "procedures_prototype",
        mutation: {
          ...prototype.ref.mutation,
          proccode: Signature.FUNCTION + prototype.ref.mutation.proccode,
        },
      });
    }
  }

  /**
   * @private
   * convert control_stop blocks to empty return blocks so that we can correct them
   * @param {RegisteredBlock | null} block
   */
  replaceStopScripts(block) {
    if (!block) return;

    if (block.ref.opcode === "control_stop" && block.ref.fields?.STOP_OPTION?.[0] === "this script") {
      block.assign({
        opcode: FunctionBlockType.RETURN,
        mutation: undefined,
        inputs: { ITEM: [InputType.SameShadow, [InputType.Text, ""]] },
        fields: {},
      });
      return;
    }

    this.replaceStopScripts(block.getNext());
    // handle branching blocks
    for (const [name, input] of Object.entries(block.ref.inputs)) {
      if (!input) continue;
      const [type, refId] = input;
      if (!name.startsWith("SUBSTACK")) continue; // not a substack input
      if (type > 3) continue; // not a block reference
      if (typeof refId !== "string") continue; // not a block reference
      this.replaceStopScripts(block.graph.getBlock(refId));
    }
  }

  /**
   * @private
   * @param {Serialized.Target} target
   * @param {SerializedBlockGraph} graph
   */
  transpileDefinitions(target, graph) {
    for (const definition of graph.getBlocks([FunctionBlockType.DEFINITION])) {
      // define stack list if function definition exists
      target.lists[Signature.STACK] = [Signature.STACK, []];

      definition.assign({ opcode: "procedures_definition" });
      this.replaceStopScripts(definition);

      const lastBlock = definition.tail();

      if ([
        "control_delete_this_clone",
        "control_forever",
        FunctionBlockType.RETURN,
        "control_stop",
      ].includes(lastBlock.ref.opcode)) continue;
      if (lastBlock.ref.mutation?.hasnext === "false") continue;

      lastBlock.insertAfter(graph.register({
        opcode: "data_insertatlist",
        inputs: {
          ITEM: [InputType.SameShadow, [InputType.Text, ""]],
          INDEX: [InputType.SameShadow, [InputType.IntegerNumber, "1"]],
        },
        fields: { LIST: [Signature.STACK, Signature.STACK] },
        shadow: false,
        topLevel: false,
      }));
    }
  }

  /**
   * @private
   * @param {SerializedBlockGraph} graph
   */
  transpileReturns(graph) {
    for (const returnBlock of graph.getBlocks([FunctionBlockType.RETURN])) {
      returnBlock.assign({
        opcode: "data_insertatlist",
        inputs: {
          ...returnBlock.ref.inputs,
          INDEX: [InputType.SameShadow, [InputType.IntegerNumber, "1"]],
        },
        fields: { LIST: [Signature.STACK, Signature.STACK] },
      });

      returnBlock.insertAfter(graph.register({
        opcode: "control_stop",
        fields: { STOP_OPTION: ["this script", null] },
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
  }

  /**
   * @private
   * @param {Serialized.Target} target
   * @param {SerializedBlockGraph} graph
   */
  transpileCalls(target, graph) {
    for (const block of graph.getBlocks([FunctionBlockType.CALL])) {
      const anchor = block.getReportingAnchor();

      if (anchor.isReporter()) {
        graph.deleteTree(anchor);
        continue;
      }

      const scope = anchor.getScope();
      if (scope?.ref.mutation?.warp === "true") {
        const result = this.transpileStatement(anchor, graph);
        if (!result) continue;

        // TODO add comment with method
        const commentId = this.Blockly.utils.genUid();
        target.comments[commentId] = {
          blockId: result.id,
          text: Signature.INLINE,
          minimized: true,
          height: 200,
          width: 200,
          x: 0,
          y: 0,
        };
        result.ref.comment = commentId;
      } else {
        const copy = this.atomicizeStatement(anchor, graph, scope);
        this.transpileStatement(copy, graph);
      }
    }
  }

  /**
   * @private
   * @param {RegisteredBlock} block
   * @param {SerializedBlockGraph} graph
   * @param {{ counter: number }} [ctx]
   * @returns {RegisteredBlock[]}
   */
  getAndReplaceCalls(block, graph, ctx = { counter: 1 }) {
    if (block.ref.opcode === FunctionBlockType.CALL) {
      block.swap(graph.register({
        opcode: "data_itemoflist",
        mutation: undefined,
        fields: { LIST: [Signature.STACK, Signature.STACK] },
        inputs: {
          INDEX: [InputType.SameShadow, [InputType.IntegerNumber, String(ctx.counter++)]],
        },
        shadow: false,
        topLevel: false
      }));
      return [block];
    }

    /** @type {string[]} */
    const argumentIds = [
      ...(block.getBlockDefinition()
        .args0?.filter(({ type }) => type === "input_value")
        .map(({ name }) => name) ?? []),
      ...JSON.parse(block.ref.mutation?.argumentids ?? "[]"),
    ];

    /** @type {RegisteredBlock[]} */
    const inputBlocks = argumentIds
      .map((argId) => block.ref.inputs[argId])
      .filter(/** @returns {primitive is Serialized.Primitive} */(primitive) => !!primitive)
      .map(([, input]) => {
        if (typeof input !== "string") return;
        return graph.getBlock(input);
      })
      .filter(/** @returns {block is NonNullable<typeof block>} */(block) => !!block);

    return inputBlocks.flatMap((block) => this.getAndReplaceCalls(block, graph, ctx));
  }

  /**
   * @private
   * @param {RegisteredBlock} stmt
   * @param {SerializedBlockGraph} graph
   * @returns {RegisteredBlock | undefined}
   */
  transpileStatement(stmt, graph) {
    const calls = this.getAndReplaceCalls(stmt, graph);
    if (calls.length === 0) return;

    if (stmt.isTopLevel()) {
      const [firstCall] = calls;
      firstCall.assign({
        x: stmt.ref.x,
        y: stmt.ref.y,
        topLevel: true,
      });
      stmt.assign({ topLevel: false, x: undefined, y: undefined });
    }

    for (const call of calls) {
      assert(call.ref.mutation, "Call mutation is required");
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
      stmt.ref.opcode === "procedures_call" && stmt.ref.mutation?.proccode?.startsWith(Signature.FUNCTION);
    const isStackPush = stmt.ref.opcode === "data_insertatlist" && stmt.ref.fields?.LIST?.[0] === Signature.STACK;

    const deleter = graph.register({
      opcode: "data_deleteoflist",
      fields: { LIST: [Signature.STACK, Signature.STACK] },
      inputs: {
        INDEX: [InputType.SameShadow, [InputType.IntegerNumber, isCall || isStackPush ? "2" : "1"]],
      },
      shadow: false,
      topLevel: false,
    });

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
      });
      deleter.ref.parent = repeater.id;
      stmt.insertAfter(repeater);
    } else {
      stmt.insertAfter(deleter);
    }

    let startingCall = null;
    for (const call of calls) {
      const subcall = this.transpileStatement(call, graph);
      if (startingCall === null) startingCall = subcall;
    }
    return startingCall ?? calls[0];
  }

  /**
   * @private
   * @param {RegisteredBlock} stmt
   * @param {SerializedBlockGraph} graph
   * @param {RegisteredBlock} [scope]
   * @returns {RegisteredBlock}
   */
  atomicizeStatement(stmt, graph, scope) {
    const proccode = `${Signature.ATOMIC}${stmt.id.replaceAll("%", "\\%")} ${scope?.ref.mutation?.proccode?.match(/(?<!\\)%[nbs]/g).join(" ") ?? ""}`;
    const argumentids = scope?.ref.mutation?.argumentids ?? "[]";

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
        argumentnames: scope?.ref.mutation?.argumentnames ?? "[]",
        argumentdefaults: scope?.ref.mutation?.argumentdefaults ?? "[]",
        warp: "true",
      },
    });
    if (scope) {
      prototype.copyInputs(scope);
    }

    const definition = graph.register({
      opcode: "procedures_definition",
      inputs: { custom_block: [1, prototype.id] },
      fields: {},
      shadow: false,
      topLevel: true,
      x: 0,
      y: 0,
    });

    const copy = stmt.copy();
    definition.insertAfter(copy);

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
    if (scope) {
      stmt.copyInputs(scope);
    }

    return copy;
  }
}

/** @param {FunctionContext} context */
export function patchSerialization({ Blockly, vm }) {
  const transpiler = new SerializeTransformer({ Blockly, vm });
  const vmPrototype = Object.getPrototypeOf(vm);
  const originalToJSON = vmPrototype.toJSON;
  /**
   * @param {string} [optTargetId]
   */
  vmPrototype.toJSON = function (optTargetId) {
    const json = originalToJSON.call(this, optTargetId);
    /** @type {Serialized.Project | Serialized.Sprite} */
    const parsed = JSON.parse(json);
    const targets = "blocks" in parsed ? [parsed] : parsed.targets;
    for (const target of targets) {
      transpiler.transpileTarget(target);
    }
    return JSON.stringify(parsed);
  };
}
