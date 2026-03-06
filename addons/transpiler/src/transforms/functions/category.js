import { BOOLEAN_ICON, FUNCTION_ICON, LABEL_ICON, NUMBER_OR_TEXT_ICON } from "../../editor/icons.js";
import { createXmlParser } from "../../editor/xml.js";
import { assert } from "../../utils.js";
import { FunctionBlockType } from "./shared.js";

/** @typedef {import("../../userscript.js").FunctionContext} FunctionContext */

const CATEGORY_KEY = "FUNCTION";
const CALLBACK_KEY = "CREATE_FUNCTION";

/** @param {Userscript.Addon} addon */
function createFunctionModal(addon) {
  const modal = addon.tab.createModal("Make a Function", { useEditorClasses: true });
  modal.container.style.width = "700px";
  modal.content.innerHTML = /* html */ `
    <div id="sa-function-workspace" class="${addon.tab.scratchClass("custom-procedures_workspace", "box_box")}"></div>
    <div class="${addon.tab.scratchClass("custom-procedures_body", "box_box")}">
      <div class="${addon.tab.scratchClass("custom-procedures_options-row")}">
        <div id="sa-function-number-or-text-input" class="${addon.tab.scratchClass("custom-procedures_option-card")}">
          <img class="${addon.tab.scratchClass("custom-procedures_option-icon")}" src="${NUMBER_OR_TEXT_ICON}" />
          <div class="${addon.tab.scratchClass("custom-procedures_option-title")}">
            <span>Add an input</span>
          </div>
          <div>
            <span>number or text</span>
          </div>
        </div>
        <div id="sa-function-boolean-input" class="${addon.tab.scratchClass("custom-procedures_option-card")}">
          <img class="${addon.tab.scratchClass("custom-procedures_option-icon")}" src="${BOOLEAN_ICON}" />
          <div class="${addon.tab.scratchClass("custom-procedures_option-title")}">
            <span>Add an input</span>
          </div>
          <div>
            <span>boolean</span>
          </div>
        </div>
        <div id="sa-function-label-input" class="${addon.tab.scratchClass("custom-procedures_option-card")}">
          <img class="${addon.tab.scratchClass("custom-procedures_option-icon")}" src="${LABEL_ICON}" />
          <div class="${addon.tab.scratchClass("custom-procedures_option-title")}">
            <span>Add an label</span>
          </div>
        </div>
      </div>
      <div class="${addon.tab.scratchClass("custom-procedures_button-row")}">
        <button id="sa-function-cancel-button">
          <span>Cancel</span>
        </button>
        <button id="sa-function-ok-button" class="${addon.tab.scratchClass("custom-procedures_ok-button")}">
          <span>OK</span>
        </button>
      </div>
    </div>`;
  return modal;
}

/**
 * @param {ScratchBlocks.Blockly} Blockly
 * @param {Element} blocksRef
 */
function createModalWorkspace(Blockly, blocksRef) {
  const oldDefaultToolbox = Blockly.Blocks.defaultToolbox;
  Blockly.Blocks.defaultToolbox = null;
  const modalWorkspace = Blockly.inject(blocksRef, {
    zoom: {
      controls: false,
      wheel: false,
      startScale: 0.9,
    },
    comments: false,
    collapse: false,
    scrollbars: true,
    media: "/static/blocks-media/default/",
  });
  Blockly.Blocks.defaultToolbox = oldDefaultToolbox;
  return modalWorkspace;
}

/**
 * @param {ScratchBlocks.WorkspaceSvg} modalWorkspace
 * @param {ScratchBlocks.Block} mutationRoot
 */
function setupMutationRoot(modalWorkspace, mutationRoot) {
  modalWorkspace.addChangeListener(() => {
    mutationRoot.onChangeFn();
    const metrics = modalWorkspace.getMetrics();
    const { x, y } = mutationRoot.getRelativeToSurfaceXY();
    const dy = metrics.viewHeight / 2 - mutationRoot.height / 2 - y;
    const dx =
      mutationRoot.width > metrics.viewWidth
        ? metrics.viewWidth - mutationRoot.width - x
        : metrics.viewWidth / 2 - mutationRoot.width / 2 - x;
    mutationRoot.moveBy(dx, dy);
  });
}

/**
 * @param {Userscript.Addon} addon
 * @param {ScratchBlocks.Blockly} Blockly
 * @param {(strings: TemplateStringsArray, ...values: any[]) => Node} xml
 * @param {{ open: () => void; close: () => void; content: HTMLElement; backdrop: HTMLElement; closeButton: HTMLElement }} modal
 */
function handleCreateFunction(addon, Blockly, xml, modal) {
  modal.open();

  const blocksRef = modal.content.querySelector("#sa-function-workspace");
  assert(blocksRef, "Blocks reference not found");
  const numberOrTextInput = modal.content.querySelector("#sa-function-number-or-text-input");
  assert(numberOrTextInput, "Number or text input not found");
  const booleanInput = modal.content.querySelector("#sa-function-boolean-input");
  assert(booleanInput, "Boolean input not found");
  const labelInput = modal.content.querySelector("#sa-function-label-input");
  assert(labelInput, "Label input not found");
  const cancelButton = modal.content.querySelector("#sa-function-cancel-button");
  assert(cancelButton, "Cancel button not found");
  const okButton = modal.content.querySelector("#sa-function-ok-button");
  assert(okButton, "OK button not found");

  const modalWorkspace = createModalWorkspace(Blockly, blocksRef);
  const mutationRoot = modalWorkspace.newBlock(FunctionBlockType.DECLARATION);
  mutationRoot.setMovable(false);
  mutationRoot.setDeletable(false);
  mutationRoot.contextMenu = false;
  setupMutationRoot(modalWorkspace, mutationRoot);

  function handleAddTextNumber() {
    mutationRoot.addStringNumberExternal();
  }
  function handleAddBoolean() {
    mutationRoot.addBooleanExternal();
  }
  function handleAddLabel() {
    mutationRoot.addLabelExternal();
  }

  function handleOk() {
    assert(mutationRoot.mutationToDom, "Mutation root mutation to dom is required");
    const mainWorkspace = addon.tab.traps.getWorkspace();
    const blockDom = xml`<block type="${FunctionBlockType.DEFINITION}" gap="16">
        <value name="custom_block">
          <shadow type="${FunctionBlockType.PROTOTYPE}">
            ${Blockly.Xml.domToText(mutationRoot.mutationToDom(true))}
          </shadow>
        </value>
      </block>`;
    assert(blockDom instanceof Element, "Block DOM should be an element");
    Blockly.Events.setGroup(true);
    /** @type {ScratchBlocks.Block} */
    const block = Blockly.Xml.domToBlock(blockDom, mainWorkspace);
    const scale = mainWorkspace.scale;
    const posX = 30 - mainWorkspace.scrollX;
    const posY = 30 - mainWorkspace.scrollY;
    block.moveBy(posX / scale, posY / scale);
    block.scheduleSnapAndBump();
    Blockly.Events.setGroup(false);
    // @ts-ignore
    mainWorkspace.refreshToolboxSelection_();
    handleClose();
  }

  function handleClose() {
    modal.close();
    modalWorkspace.dispose();
    numberOrTextInput?.removeEventListener("click", handleAddTextNumber);
    booleanInput?.removeEventListener("click", handleAddBoolean);
    labelInput?.removeEventListener("click", handleAddLabel);
    modal.backdrop.removeEventListener("click", handleClose);
    modal.closeButton.removeEventListener("click", handleClose);
    cancelButton?.removeEventListener("click", handleClose);
    okButton?.removeEventListener("click", handleOk);
  }

  numberOrTextInput.addEventListener("click", handleAddTextNumber);
  booleanInput.addEventListener("click", handleAddBoolean);
  labelInput.addEventListener("click", handleAddLabel);
  modal.closeButton.addEventListener("click", handleClose);
  modal.backdrop.addEventListener("click", handleClose);
  cancelButton.addEventListener("click", handleClose);
  okButton.addEventListener("click", handleOk);

  mutationRoot.procCode_ = "function name";
  mutationRoot.setWarp(true);
  mutationRoot.updateDisplay_();
  mutationRoot.initSvg();
  mutationRoot.render();
  setTimeout(() => mutationRoot.focusLastEditor_());
}

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

  getContent(context) {
    const { addon, Blockly } = context;
    const { xml } = createXmlParser(Blockly);
    const modal = createFunctionModal(addon);

    return (workspace) => {
      workspace.registerButtonCallback(CALLBACK_KEY, () =>
        handleCreateFunction(addon, Blockly, xml, modal)
      );

      const calls = buildFunctionCalls(workspace, Blockly);
      return buildToolboxContent(xml, calls);
    };
  },
};
