import { FUNCTION_ICON } from "../../editor/icons.js";
import { createXmlParser } from "../../editor/xml.js";
import { assert } from "../../utils.js";
import { FunctionModal } from "./modal.js";
import { FunctionBlockType } from "./shared.js";

/** @typedef {import("../../userscript.js").FunctionContext} FunctionContext */

/**
 * @typedef {ScratchBlocks.Block & {
 *   mutationToDom: () => Element,
 *   domToMutation: (mutation: Element) => void,
 *   getProcCode: () => string
 * }} ProcedureBlock
 */

const CATEGORY_KEY = "FUNCTION";
const CALLBACK_KEY = "CREATE_FUNCTION";

/** @param {ScratchBlocks.WorkspaceSvg} workspace @param {ScratchBlocks.Blockly} Blockly */
function buildFunctionCalls(workspace, Blockly) {
  return workspace
    .getAllBlocks()
    .filter(/** @param {ScratchBlocks.BlockSvg} block */(block) => block.type === FunctionBlockType.PROTOTYPE)
    .map(/** @param {ScratchBlocks.BlockSvg} block */(block) => block.mutationToDom?.(/* opt_generateShadows */ true))
    .filter(Boolean)
    .sort(
      /** @param {Element} a @param {Element} b */(a, b) =>
        Blockly.scratchBlocksUtils.compareStrings(a.getAttribute("proccode"), b.getAttribute("proccode"))
    )
    .map(
      /** @param {Element} mutation */(mutation) => {
        const block = document.createElementNS(null, "block");
        block.setAttribute("type", FunctionBlockType.CALL);
        block.setAttribute("gap", "16");
        block.appendChild(mutation);
        return block;
      }
    );
}

/** @param {(strings: TemplateStringsArray, ...values: any[]) => Node} xml @param {Element[]} calls */
function buildToolboxContent(xml, calls) {
  return [
    xml`<button text="Make a Function" callbackKey="${CALLBACK_KEY}" />`,
    calls,
    calls.length > 0
      ? [
        xml`<sep gap="36" />`,
        xml`<block type="${FunctionBlockType.RETURN}">
                <value name="ITEM">
                  <shadow type="text">
                    <field name="TEXT" />
                  </shadow>
                </value>
              </block>`,
      ]
      : [],
  ].flat();
}

/** @type {import("../../editor/categories.js").CategoryDefinition} */
export const functionsCategory = {
  id: "sa-functions",
  key: CATEGORY_KEY,
  name: "Functions",
  colour: "#cc5166",
  secondaryColour: "#cc5166",
  iconURI: FUNCTION_ICON,
  insertAfter: "myBlocks",

  getContent({ addon, Blockly, workspace }) {
    const { xml } = createXmlParser(Blockly);
    const modal = new FunctionModal(addon, Blockly);

    workspace.registerButtonCallback(CALLBACK_KEY, () => {
      const mutation = xml`
        <mutation proccode="function name"
                  argumentids="[]"
                  argumentnames="[]"
                  argumentdefaults="[]"
                  warp="true">
        </mutation>`;
      assert(mutation, "Mutation not found");

      modal.open(mutation, (mutation) => {
        if (!mutation) return;
        if (mutation.getAttribute("proccode")?.trim().length === 0) return;
        const blockDom = xml`
        <block type="${FunctionBlockType.DEFINITION}">
          <value name="custom_block">
            <shadow type="${FunctionBlockType.PROTOTYPE}">
               ${Blockly.Xml.domToText(mutation)}
            </shadow>
           </value>
         </block>`;
        Blockly.Events.setGroup(true);
        /** @type {ScratchBlocks.Block} */
        Blockly.Events.setGroup(true);
        var block = Blockly.Xml.domToBlock(blockDom, workspace);
        var scale = workspace.scale; // To convert from pixel units to workspace units
        // Position the block so that it is at the top left of the visible workspace,
        // padded from the edge by 30 units. Position in the top right if RTL.
        var posX = -workspace.scrollX;
        if (workspace.RTL) {
          posX += workspace.getMetrics().contentWidth - 30;
        } else {
          posX += 30;
        }
        block.moveBy(posX / scale, (-workspace.scrollY + 30) / scale);
        block.scheduleSnapAndBump();
        Blockly.Events.setGroup(false);
        workspace.refreshToolboxSelection_();
      });
    });

    patchEditProcedureCallback(Blockly, (prototype) => {
      modal.open(prototype.mutationToDom(), (mutation) => {
        if (!mutation) return;
        if (mutation.getAttribute("proccode")?.trim().length === 0) return;
        Blockly.Events.setGroup(true);
        const callers = [...getCallers(prototype.getProcCode(), workspace), prototype];
        for (const caller of callers) {
          const oldMutationDom = caller.mutationToDom();
          const oldMutation = oldMutationDom && Blockly.Xml.domToText(oldMutationDom);
          caller.domToMutation(mutation);
          const newMutationDom = caller.mutationToDom();
          const newMutation = newMutationDom && Blockly.Xml.domToText(newMutationDom);
          if (oldMutation !== newMutation) {
            Blockly.Events.fire(new Blockly.Events.BlockChange(caller, "mutation", null, oldMutation, newMutation));
          }
        }
        workspace.refreshToolboxSelection_();
      });
    });

    return (workspace) => {
      const calls = buildFunctionCalls(workspace, Blockly);
      return buildToolboxContent(xml, calls);
    };
  },
};

/**
 * @param {(ScratchBlocks.BlockSvg | ScratchBlocks.Block)[]} blocks
 */
function* traverse(blocks) {
  for (const block of blocks) {
    yield block;
    yield* block.getDescendants(false);
  }
}

/**
 *
 * @param {string} procCode
 * @param { ScratchBlocks.WorkspaceSvg | ScratchBlocks.Workspace} workspace
 * @returns {Iterable<ScratchBlocks.Block & { mutationToDom: () => Element, domToMutation: (mutation: Element) => void }>}
 */
function* getCallers(procCode, workspace) {
  for (const block of traverse(workspace.getTopBlocks())) {
    if (block.getProcCode?.() !== procCode) continue;
    assert(block.getProcCode, "Block get proc code is required");
    assert(block.mutationToDom, "Block mutation to dom is required");
    assert(block.domToMutation, "Block dom to mutation is required");
    yield /** @type {ProcedureBlock} */ (block);
  }
}

/**
 * @param {ScratchBlocks.Workspace | ScratchBlocks.WorkspaceSvg} workspace
 * @param {string} proccode
 * @returns {ScratchBlocks.Block & { mutationToDom: () => Element, domToMutation: (mutation: Element) => void } | null}
 */
function getPrototypeBlock(workspace, proccode) {
  const topBlocks = workspace.getTopBlocks();
  for (const block of topBlocks) {
    if (block.type !== FunctionBlockType.DEFINITION) continue;
    const input = block.getInput("custom_block");
    assert(input, "Custom block input not found");
    const prototype = input.connection?.targetBlock();
    if (!prototype) continue;
    if (prototype.getProcCode?.() !== proccode) continue;
    assert(prototype.getProcCode, "Prototype proccode is required");
    assert(prototype.mutationToDom, "Prototype mutation to dom is required");
    assert(prototype.domToMutation, "Prototype dom to mutation is required");
    return /** @type {ProcedureBlock} */ (prototype);
  }
  return null;
}

/**
 * @param {ScratchBlocks.Blockly} Blockly
 * @param {(prototype: ScratchBlocks.Block & { mutationToDom: () => Element, domToMutation: (mutation: Element) => void, getProcCode: () => string }) => void} onEdit
 */
function patchEditProcedureCallback(Blockly, onEdit) {
  const oldEditProcedureCallback_ = Blockly.Procedures.editProcedureCallback_;
  /** @param {ScratchBlocks.Block} block */
  Blockly.Procedures.editProcedureCallback_ = function (block) {
    /** @type {ScratchBlocks.Block | null} */
    let prototype = null;
    if (block.type === FunctionBlockType.DEFINITION) {
      const input = block.getInput("custom_block");
      assert(input, "Custom block input not found");
      const conn = input.connection;
      assert(conn, "Custom block connection not found");
      const innerBlock = conn.targetBlock();
      assert(innerBlock, "Inner block not found");
      assert(innerBlock.type === FunctionBlockType.PROTOTYPE, "Inner block is not a prototype");
      prototype = innerBlock;
    } else if (block.type === FunctionBlockType.PROTOTYPE) {
      prototype = block;
    } else if (block.type === FunctionBlockType.CALL) {
      const workspace = block.workspace.isFlyout ? block.workspace.targetWorkspace : block.workspace;
      prototype = getPrototypeBlock(workspace, block.getProcCode?.() ?? "");
      if (!prototype) return;
      block = prototype;
    } else {
      return oldEditProcedureCallback_.call(this, block);
    }
    assert(prototype, "Prototype not found");
    assert(prototype.mutationToDom, "Prototype mutation to dom is required");
    assert(prototype.domToMutation, "Prototype dom to mutation is required");
    assert(prototype.getProcCode, "Prototype get proc code is required");
    onEdit(/** @type {ProcedureBlock} */(prototype));
  };
}
