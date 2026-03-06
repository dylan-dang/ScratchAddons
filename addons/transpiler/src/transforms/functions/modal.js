import { BOOLEAN_ICON, LABEL_ICON, NUMBER_OR_TEXT_ICON } from "../../editor/icons.js";
import { assert } from "../../utils.js";
import { FunctionBlockType } from "./shared.js";

export class FunctionModal {
  /** @type {Userscript.Addon} */
  addon;
  /** @type {Userscript.Modal} */
  modal;
  /** @type {ScratchBlocks.Blockly} */
  Blockly;
  /** @type {ScratchBlocks.BlockSvg} */
  mutationRoot;
  /** @type {ScratchBlocks.WorkspaceSvg} */
  workspace;
  /** @type {Map<Element, EventListenerOrEventListenerObject>} */
  clickListeners = new Map();

  /**
   * @param {Userscript.Addon} addon
   * @param {ScratchBlocks.Blockly} Blockly
   */
  constructor(addon, Blockly) {
    this.addon = addon;
    this.Blockly = Blockly;
    this.modal = addon.tab.createModal("Make a Function", { useEditorClasses: true });
    this.modal.container.style.width = "700px";
    this.modal.content.innerHTML = /* html */ `
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
  }

  /**
   * @private
   * @param {Element} blocksRef
   * @returns {ScratchBlocks.WorkspaceSvg}
   */
  createWorkspace(blocksRef) {
    const oldDefaultToolbox = this.Blockly.Blocks.defaultToolbox;
    this.Blockly.Blocks.defaultToolbox = null;
    const workspace = this.Blockly.inject(blocksRef, {
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
    this.Blockly.Blocks.defaultToolbox = oldDefaultToolbox;
    return workspace;
  }

  /**
   * @private
   * @param {ScratchBlocks.WorkspaceSvg} workspace
   * @param {Node} mutator
   * @returns {ScratchBlocks.BlockSvg}
   */
  setupMutationRoot(workspace, mutator) {
    const mutationRoot = workspace.newBlock(FunctionBlockType.DECLARATION);
    mutationRoot.setMovable(false);
    mutationRoot.setDeletable(false);
    mutationRoot.contextMenu = false;
    workspace.addChangeListener(() => {
      mutationRoot.onChangeFn();
      const metrics = workspace.getMetrics();
      const { x, y } = mutationRoot.getRelativeToSurfaceXY();
      const dy = metrics.viewHeight / 2 - mutationRoot.height / 2 - y;
      const dx =
        mutationRoot.width > metrics.viewWidth
          ? metrics.viewWidth - mutationRoot.width - x
          : metrics.viewWidth / 2 - mutationRoot.width / 2 - x;
      mutationRoot.moveBy(dx, dy);
    });
    mutationRoot.domToMutation?.(mutator);
    mutationRoot.initSvg();
    mutationRoot.render();
    setTimeout(() => mutationRoot.focusLastEditor_());
    return mutationRoot;
  }

  /**
   * @param {Node} mutator
   * @param {(mutation: Element | null) => void} onOk
   */
  open(mutator, onOk) {
    this.modal.open();

    const blocksRef = this.modal.content.querySelector("#sa-function-workspace");
    assert(blocksRef, "Blocks reference not found");

    this.workspace = this.createWorkspace(blocksRef);
    this.mutationRoot = this.setupMutationRoot(this.workspace, mutator);

    const numberOrTextInput = this.modal.content.querySelector("#sa-function-number-or-text-input");
    this.addClickListener(numberOrTextInput, this.handleAddTextNumber.bind(this));
    const booleanInput = this.modal.content.querySelector("#sa-function-boolean-input");
    this.addClickListener(booleanInput, this.handleAddBoolean.bind(this));
    const labelInput = this.modal.content.querySelector("#sa-function-label-input");
    this.addClickListener(labelInput, this.handleAddLabel.bind(this));
    const cancelButton = this.modal.content.querySelector("#sa-function-cancel-button");
    this.addClickListener(cancelButton, this.close.bind(this));
    const okButton = this.modal.content.querySelector("#sa-function-ok-button");
    this.addClickListener(okButton, this.handleOk.bind(this, onOk));

    this.addClickListener(this.modal.backdrop, this.close.bind(this));
    this.addClickListener(this.modal.closeButton, this.close.bind(this));
  }

  /**
   * @private
   * @param {Element | null} elem
   * @param {EventListener} listener
   * @returns
   */
  addClickListener(elem, listener) {
    assert(elem);
    this.clickListeners.set(elem, listener);
    elem.addEventListener("click", listener);
  }

  /**
   * @private
   */
  clearClickListeners() {
    for (const [elem, listener] of this.clickListeners) {
      elem.removeEventListener("click", listener);
    }
    this.clickListeners.clear();
  }

  /**
   * @private
   * @param {(mutation: Element | null) => void} callback
   */
  handleOk(callback) {
    const newMutation = this.mutationRoot?.mutationToDom?.(true) ?? null;
    callback(newMutation);
    this.close();
  }

  close() {
    this.modal.close();
    this.clearClickListeners();
    this.workspace.dispose();
  }

  handleAddTextNumber() {
    if (!this.mutationRoot) return;
    this.mutationRoot.addStringNumberExternal();
  }
  handleAddBoolean() {
    if (!this.mutationRoot) return;
    this.mutationRoot.addBooleanExternal();
  }
  handleAddLabel() {
    if (!this.mutationRoot) return;
    this.mutationRoot.addLabelExternal();
  }
}
