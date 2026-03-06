import { InputType, RegisteredBlock } from "../../transform/encode/block.js";
import { assert } from "../../utils.js";
import { FunctionBlockType, Signature } from "./shared.js";

/** @typedef {import("../../transform/encode/graph.js").SerializedBlockGraph} SerializedBlockGraph */

/**
 * Encode function blocks to Scratch-compatible format (save direction).
 * @param {SerializedBlockGraph} graph
 */
export function encode(graph) {
  transpilePrototypes(graph);
  transpileDefinitions(graph);
  transpileReturns(graph);
  transpileCalls(graph);
}

/**
 * @param {SerializedBlockGraph} graph
 */
function transpilePrototypes(graph) {
  for (const prototype of graph.getBlocks([FunctionBlockType.PROTOTYPE])) {
    assert(prototype.mutation, "Prototype mutation is required");
    prototype.assign({
      opcode: "procedures_prototype",
      mutation: {
        ...prototype.mutation,
        proccode: Signature.FUNCTION + prototype.mutation.proccode,
      },
    });
  }
}

/**
 * convert control_stop blocks to empty return blocks so that we can correct them
 * @param {RegisteredBlock | null} block
 */
function replaceStopScripts(block) {
  if (!block) return;

  if (block.opcode === "control_stop" && block.fields.STOP_OPTION?.[0] === "this script") {
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
  for (const [name, input] of Object.entries(block.inputs)) {
    if (!input) continue;
    const [type, refId] = input;
    if (!name.startsWith("SUBSTACK")) continue; // not a substack input
    if (type > 3) continue; // not a block reference
    if (typeof refId !== "string") continue; // not a block reference
    replaceStopScripts(block.graph.getBlock(refId));
  }
}

/**
 * @param {SerializedBlockGraph} graph
 */
function transpileDefinitions(graph) {
  for (const definition of graph.getBlocks([FunctionBlockType.DEFINITION])) {
    // define stack list if function definition exists
    graph.target.lists[Signature.STACK] = [Signature.STACK, []];

    definition.assign({ opcode: "procedures_definition" });
    replaceStopScripts(definition);

    const lastBlock = definition.tail();

    if (
      ["control_delete_this_clone", "control_forever", FunctionBlockType.RETURN, "control_stop"].includes(
        lastBlock.opcode
      )
    )
      continue;
    if (lastBlock.mutation?.hasnext === "false") continue;

    lastBlock.insertAfter(
      graph.register({
        opcode: "data_insertatlist",
        inputs: {
          ITEM: [InputType.SameShadow, [InputType.Text, ""]],
          INDEX: [InputType.SameShadow, [InputType.IntegerNumber, "1"]],
        },
        fields: { LIST: [Signature.STACK, Signature.STACK] },
        shadow: false,
        topLevel: false,
      })
    );
  }
}

/**
 * @param {SerializedBlockGraph} graph
 */
function transpileReturns(graph) {
  for (const returnBlock of graph.getBlocks([FunctionBlockType.RETURN])) {
    returnBlock.assign({
      opcode: "data_insertatlist",
      inputs: {
        ...returnBlock.inputs,
        INDEX: [InputType.SameShadow, [InputType.IntegerNumber, "1"]],
      },
      fields: { LIST: [Signature.STACK, Signature.STACK] },
    });

    returnBlock.insertAfter(
      graph.register({
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
      })
    );
  }
}

/**
 * @param {SerializedBlockGraph} graph
 */
function transpileCalls(graph) {
  for (const block of graph.getBlocks([FunctionBlockType.CALL])) {
    const anchor = block.getReportingAnchor();

    if (anchor.isReporter()) {
      graph.deleteTree(anchor);
      continue;
    }

    const scope = anchor.getScope();
    if (scope?.mutation?.warp === "true") {
      transpileStatement(anchor, graph);
    } else {
      atomicizeStatement(anchor, graph, scope);
      transpileStatement(anchor, graph);
    }
  }
}

/**
 * @param {RegisteredBlock} block
 * @param {SerializedBlockGraph} graph
 * @param {{ counter: number }} [ctx]
 * @returns {RegisteredBlock[]}
 */
function getAndReplaceCalls(block, graph, ctx = { counter: 1 }) {
  if (block.opcode === FunctionBlockType.CALL) {
    block.swap(
      graph.register({
        opcode: "data_itemoflist",
        mutation: undefined,
        fields: { LIST: [Signature.STACK, Signature.STACK] },
        inputs: {
          INDEX: [InputType.SameShadow, [InputType.IntegerNumber, String(ctx.counter++)]],
        },
        shadow: false,
        topLevel: false,
      })
    );
    return [block];
  }

  /** @type {string[]} */
  const argumentIds = [
    ...(block
      .getBlockDefinition()
      .args0?.filter(({ type }) => type === "input_value")
      .map(({ name }) => name) ?? []),
    ...JSON.parse(block.mutation?.argumentids ?? "[]"),
  ];

  /** @type {RegisteredBlock[]} */
  const inputBlocks = argumentIds
    .map((argId) => block.inputs[argId])
    .filter(/** @returns {primitive is Serialized.Primitive} */ (primitive) => !!primitive)
    .map(([, input]) => {
      if (typeof input !== "string") return;
      return graph.getBlock(input);
    })
    .filter(/** @returns {block is NonNullable<typeof block>} */ (block) => !!block);

  return inputBlocks.flatMap((block) => getAndReplaceCalls(block, graph, ctx));
}

/**
 * @param {RegisteredBlock} stmt
 * @param {SerializedBlockGraph} graph
 * @returns {RegisteredBlock | undefined}
 */
function transpileStatement(stmt, graph) {
  const calls = getAndReplaceCalls(stmt, graph);
  if (calls.length === 0) return;

  if (stmt.isTopLevel()) {
    const [firstCall] = calls;
    firstCall.assign({
      x: stmt.x,
      y: stmt.y,
      topLevel: true,
    });
    stmt.assign({ topLevel: false, x: undefined, y: undefined });
  }

  for (const call of calls) {
    assert(call.mutation, "Call mutation is required");
    call.assign({
      opcode: "procedures_call",
      mutation: {
        ...call.mutation,
        proccode: Signature.FUNCTION + call.mutation.proccode,
      },
    });
    stmt.insertBefore(call);
  }

  const isCall = stmt.opcode === "procedures_call" && stmt.mutation?.proccode?.startsWith(Signature.FUNCTION);
  const isStackPush = stmt.opcode === "data_insertatlist" && stmt.fields?.LIST?.[0] === Signature.STACK;

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
    const subcall = transpileStatement(call, graph);
    if (startingCall === null) startingCall = subcall;
  }
  return startingCall ?? calls[0];
}

/**
 * @param {RegisteredBlock} stmt
 * @param {SerializedBlockGraph} graph
 * @param {RegisteredBlock} [scope]
 */
function atomicizeStatement(stmt, graph, scope) {
  const proccode = `${Signature.ATOMIC}${stmt.id.replaceAll("%", "\\%")} ${scope?.mutation?.proccode?.match(/(?<!\\)%[nbs]/g)?.join(" ") ?? ""}`;
  const argumentids = scope?.mutation?.argumentids ?? "[]";

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
      argumentnames: scope?.mutation?.argumentnames ?? "[]",
      argumentdefaults: scope?.mutation?.argumentdefaults ?? "[]",
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

  const atomicCall = graph.register({
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
    topLevel: false,
  });
  if (scope) {
    atomicCall.copyInputs(scope);
  }

  stmt.swap(atomicCall);

  definition.insertAfter(stmt);
}
