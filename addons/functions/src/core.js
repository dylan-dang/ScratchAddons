import { FunctionBlockType } from "./constants.js";
import { BOOLEAN_ICON, BUILD_ICON, DEV_ICON, FUNCTION_ICON, LABEL_ICON, NUMBER_OR_TEXT_ICON } from "./icons.js";
import { assert, waitForElement as getElement } from "./utils.js";

/** @typedef {import("../userscript.js").FunctionContext} FunctionContext */

/** @param {FunctionContext} context */
export function patchCategory({ addon, Blockly, vm }) {
  /**
   * convert template strings to dom
   * @param {TemplateStringsArray} strings
   * @param {...any} values
   * @returns {Node}
   */
  function xml(strings, ...values) {
    const interpolated = strings
      .map((str, i) => {
        const value = values[i];
        if (value === undefined || value === null) return str;
        if (typeof value === "object") return `${str}${JSON.stringify(value)}`;
        if (typeof value === "function") return `${str}${value.toString()}`;
        return `${str}${value}`;
      })
      .join("")
      .trim();
    return Blockly.Xml.textToDom(interpolated);
  }
  // add category
  const CATEGORY_KEY = "FUNCTION";
  const originalGetBlocksXML = vm.runtime.getBlocksXML;
  console.log("patching getBlocksXML");
  /** @param {any} target */
  vm.runtime.getBlocksXML = function (target) {
    const result = originalGetBlocksXML.call(this, target);

    result.unshift({
      id: "sa-functions",
      xml: /* xml */ `
          <category
            id="sa-functions"
            name="Functions"
            colour="#cc5166"
            secondaryColour="#cc5166"
            custom="${CATEGORY_KEY}"
            iconURI="${FUNCTION_ICON}"
          />`,
    });

    return result;
  };

  const modal = addon.tab.createModal("Make a Function", { useEditorClasses: true });
  modal.container.style.width = "700px";
  // we don't have to worry about sanitizing the html since we control the content so XSS is not an issue
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
  // populate category
  const workspace = addon.tab.traps.getWorkspace();
  workspace.registerToolboxCategoryCallback(
    CATEGORY_KEY,
    /** @param {any} workspace */(workspace) => {
      const CALLBACK_KEY = "CREATE_FUNCTION";
      workspace.registerButtonCallback(CALLBACK_KEY, () => {
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

        const oldDefaultToolbox = Blockly.Blocks.defaultToolbox;
        Blockly.Blocks.defaultToolbox = null;
        const workspace = Blockly.inject(blocksRef, {
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
        const mutationRoot = workspace.newBlock(FunctionBlockType.DECLARATION);
        mutationRoot.setMovable(false);
        mutationRoot.setDeletable(false);
        mutationRoot.contextMenu = false;

        workspace.addChangeListener(() => {
          mutationRoot.onChangeFn();
          const metrics = workspace.getMetrics();
          const { x, y } = mutationRoot.getRelativeToSurfaceXY();
          const dy = metrics.viewHeight / 2 - mutationRoot.height / 2 - y;
          // If the procedure declaration is wider than the view width,
          // keep the right-hand side of the procedure in view.
          const dx =
            mutationRoot.width > metrics.viewWidth
              ? metrics.viewWidth - mutationRoot.width - x
              : metrics.viewWidth / 2 - mutationRoot.width / 2 - x;
          mutationRoot.moveBy(dx, dy);
        });

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
          const workspace = addon.tab.traps.getWorkspace();
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
          const block = Blockly.Xml.domToBlock(blockDom, workspace);
          const scale = workspace.scale;
          const posX = 30 - workspace.scrollX;
          const posY = 30 - workspace.scrollY;
          block.moveBy(posX / scale, posY / scale);
          block.scheduleSnapAndBump();
          Blockly.Events.setGroup(false);
          // TODO update when '_' is removed;
          // @ts-ignore
          workspace.refreshToolboxSelection_();
          handleClose();
        }

        function handleClose() {
          modal.close();
          workspace.dispose();
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

        // mutationRoot.domToMutation();
        mutationRoot.procCode_ = "function name";
        mutationRoot.setWarp(true);
        mutationRoot.updateDisplay_();
        mutationRoot.initSvg();
        mutationRoot.render();
        setTimeout(() => mutationRoot.focusLastEditor_());
      });

      const calls = workspace
        .getAllBlocks()
        .filter(/** @param {any} block */(block) => block.type === FunctionBlockType.PROTOTYPE)
        .map(/** @param {any} block */(block) => block.mutationToDom(/* opt_generateShadows */ true))
        .filter(Boolean)
        .sort(
        /** @param {any} a @param {any} b */(a, b) =>
            Blockly.scratchBlocksUtils.compareStrings(a.getAttribute("proccode"), b.getAttribute("proccode"))
        )
        .map(/** @param {any} mutation */(mutation) => {
          const block = document.createElementNS(null, "block");
          block.setAttribute("type", FunctionBlockType.CALL);
          block.setAttribute("gap", "16");
          block.appendChild(mutation);
          return block;
        });

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
  );
}

/** @param {FunctionContext} context */
export function patchConnection({ Blockly }) {
  const originalCanConnectWithReason_ = Blockly.Connection.prototype.canConnectWithReason_;
  // @ts-ignore
  Blockly.Connection.prototype.canConnectWithReason_ = function (target) {
    const reason = originalCanConnectWithReason_.call(this, target);
    if (reason !== Blockly.Connection.CAN_CONNECT) return reason;

    // @ts-ignore
    const superior = this.isSuperior();
    // @ts-ignore
    const blockA = superior ? this.sourceBlock_ : target.getSourceBlock();
    // @ts-ignore
    const blockB = superior ? target.getSourceBlock() : this.sourceBlock_;
    const superiorConn = superior ? this : target;

    if (
      (blockA.type === FunctionBlockType.DEFINITION &&
        blockB.type !== FunctionBlockType.PROTOTYPE &&
        superiorConn === blockA.getInput("custom_block").connection) ||
      (blockB.type === FunctionBlockType.PROTOTYPE && blockA.type !== FunctionBlockType.DEFINITION)
    ) {
      // @ts-ignore
      return Blockly.Connection.REASON_CUSTOM_PROCEDURE;
    }

    return Blockly.Connection.CAN_CONNECT;
  };
}

/** @param {FunctionContext} context */
export function patchBlockDragger({ Blockly }) {
  const oldEndBlockDrag = Blockly.BlockDragger.prototype.endBlockDrag;
  Blockly.BlockDragger.prototype.endBlockDrag = function (/** @type {any} */ ...args) {
    oldEndBlockDrag.apply(this, args);
    if (!(this.wouldDeleteBlock_ && this.draggingBlock_.type === FunctionBlockType.DEFINITION)) return;
    /** @type {ScratchBlocks.Workspace} */
    const workspace = this.workspace_;
    setTimeout(() => {
      for (const block of workspace.getAllBlocks()) {
        if (block.type === FunctionBlockType.CALL) {
          // @ts-ignore
          const procCode = block.getProcCode();
          workspace.getTopBlocks(false);

          const definition = workspace.getTopBlocks(false).find(
            (block) =>
              block.type === FunctionBlockType.DEFINITION &&
              // @ts-ignore
              block.getInput("custom_block").connection.targetBlock().getProcCode?.() === procCode
          );

          // Check for call blocks with no associated define block.
          if (!definition) {
            alert(Blockly.Msg.PROCEDURE_USED.replaceAll("block", "function"));
            workspace.undo(false);
            return;
          }
        }
      }
      // The proc deletion was valid, update the toolbox.
      // @ts-ignore
      workspace.refreshToolboxSelection_();
    });
  };
}

/** @param {FunctionContext} context */
export function patchBlockSvg({ Blockly }) {
  const originalRenderDrawTop_ = Blockly.BlockSvg.prototype.renderDrawTop_;
  /**
   * Render the top edge of the block.
   * @param {string[]} steps Path of block outline.
   * @param {number} rightEdge Minimum width of block.
   * @private
   */
  Blockly.BlockSvg.prototype.renderDrawTop_ = function (steps, rightEdge) {
    if (this.type === FunctionBlockType.DEFINITION) {
      steps.push("m 0, 0");
      steps.push(Blockly.BlockSvg.TOP_LEFT_CORNER_DEFINE_HAT);
      this.width = rightEdge;
      return;
    }
    originalRenderDrawTop_.call(this, steps, rightEdge);
  };

  const originalRenderDrawRight_ = Blockly.BlockSvg.prototype.renderDrawRight_;
  /**
   * Render the right edge of the block.
   * @param {(string | number)[]} steps Path of block outline.
   * @param {(ScratchBlocks.Input[] & {height: number, paddingEnd: number, paddingStart: number, type: number})[] & {bottomEdge: number, hasDummy: boolean, hasStatement: boolean, hasValue: boolean, rightEdge: number, statementEdge: number}} inputRows 2D array of objects, each
   *     containing position information.
   * @param {number} iconWidth Offset of first row due to icons.
   * @return {number} Height of block.
   * @private
   */
  Blockly.BlockSvg.prototype.renderDrawRight_ = function (steps, inputRows, iconWidth) {
    // almost an exact copy of original renderDrawRight_ except for fieldY and connectionY subtraction 12 and radius change
    if (this.type === FunctionBlockType.DEFINITION) {
      let cursorX = 0;
      let cursorY = -4;
      inputRows.forEach((row, y) => {
        cursorX = row.paddingStart;
        if (y === 0) {
          cursorX += this.RTL ? -iconWidth : iconWidth;
        }

        if (row.type === Blockly.BlockSvg.INLINE) {
          // Inline inputs.
          for (const input of row) {
            // Align fields vertically within the row.
            // Moves the field to half of the row's height.
            // In renderFields_, the field is further centered
            // by its own rendered height.
            const fieldY = cursorY + row.height / 2 - 8;
            const fieldX = Blockly.BlockSvg.getAlignedCursor_(cursorX, input, inputRows.rightEdge);

            cursorX = this.renderFields_(input.fieldRow, fieldX, fieldY);
            if (input.type === Blockly.INPUT_VALUE) {
              // Create inline input connection.
              // In blocks with a notch, inputs should be bumped to a min X,
              // to avoid overlapping with the notch.
              if (this.previousConnection) {
                cursorX = Math.max(cursorX, Blockly.BlockSvg.INPUT_AND_FIELD_MIN_X);
              }
              const connectionX = this.RTL ? -cursorX : cursorX;
              // Attempt to center the connection vertically.
              const connectionYOffset = row.height / 2 - 8;
              const connectionY = cursorY + connectionYOffset;
              input.connection.setOffsetInBlock(connectionX, connectionY);
              this.renderInputShape_(input, cursorX, cursorY + connectionYOffset);
              cursorX += input.renderWidth + Blockly.BlockSvg.SEP_SPACE_X;
            }
          }
          // Remove final separator and replace it with right-padding.
          cursorX -= Blockly.BlockSvg.SEP_SPACE_X;
          cursorX += row.paddingEnd;
          // Update right edge for all inputs, such that all rows
          // stretch to be at least the size of all previous rows.
          inputRows.rightEdge = Math.max(cursorX, inputRows.rightEdge);
          // Move to the right edge
          cursorX = Math.max(cursorX, inputRows.rightEdge);
          this.width = Math.max(this.width, cursorX);
          if (!this.edgeShape_) {
            // Include corner radius in drawing the horizontal line.
            steps.push("H", cursorX - Blockly.BlockSvg.DEFINE_HAT_CORNER_RADIUS - this.edgeShapeWidth_);
            steps.push(Blockly.BlockSvg.TOP_RIGHT_CORNER_DEFINE_HAT);
          } else {
            // Don't include corner radius - no corner (edge shape drawn).
            steps.push("H", cursorX - this.edgeShapeWidth_);
          }
          // Subtract CORNER_RADIUS * 2 to account for the top right corner
          // and also the bottom right corner. Only move vertically the non-corner length.
          if (!this.edgeShape_) {
            steps.push("v", row.height - Blockly.BlockSvg.CORNER_RADIUS * 2);
          }
        } else if (row.type === Blockly.NEXT_STATEMENT) {
          // Nested statement.
          const [input] = row;
          const fieldX = cursorX;
          // Align fields vertically within the row.
          // In renderFields_, the field is further centered by its own height.
          const fieldY = cursorY + Blockly.BlockSvg.MIN_STATEMENT_INPUT_HEIGHT;
          this.renderFields_(input.fieldRow, fieldX, fieldY);
          // Move to the start of the notch.
          cursorX = inputRows.statementEdge + Blockly.BlockSvg.NOTCH_WIDTH;

          if (this.type === Blockly.PROCEDURES_DEFINITION_BLOCK_TYPE) {
            this.renderDefineBlock_(steps, inputRows, input, row, cursorY);
          } else {
            Blockly.BlockSvg.drawStatementInputFromTopRight_(steps, cursorX, inputRows.rightEdge, row);
          }

          // Create statement connection.
          const connectionX = this.RTL ? -cursorX : cursorX;
          input.connection.setOffsetInBlock(connectionX, cursorY);
          if (input.connection.isConnected()) {
            this.width = Math.max(
              this.width,
              inputRows.statementEdge + input.connection.targetBlock().getHeightWidth().width
            );
          }
          if (
            this.type !== Blockly.PROCEDURES_DEFINITION_BLOCK_TYPE &&
            (y === inputRows.length - 1 || inputRows[y + 1].type === Blockly.NEXT_STATEMENT)
          ) {
            // If the final input is a statement stack, add a small row underneath.
            // Consecutive statement stacks are also separated by a small divider.
            steps.push(Blockly.BlockSvg.TOP_RIGHT_CORNER);
            steps.push("v", Blockly.BlockSvg.EXTRA_STATEMENT_ROW_Y - 2 * Blockly.BlockSvg.CORNER_RADIUS);
            cursorY += Blockly.BlockSvg.EXTRA_STATEMENT_ROW_Y;
          }
        }
        cursorY += row.height;
      });
      this.drawEdgeShapeRight_(steps);
      if (!inputRows.length) {
        cursorY = Blockly.BlockSvg.MIN_BLOCK_Y;
        steps.push("V", cursorY);
      }
      return cursorY;
    }
    return originalRenderDrawRight_.call(this, steps, inputRows, iconWidth);
  };
}

/** @param {FunctionContext} context */
export function defineBlocks({ Blockly }) {
  Blockly.Blocks[FunctionBlockType.RETURN] = {
    init() {
      this.jsonInit({
        message0: "return %1",
        args0: [
          {
            type: "input_value",
            name: "ITEM",
          },
        ],
        extensions: ["colours_more", "shape_end"],
      });
    },
  };

  Blockly.Blocks[FunctionBlockType.DEFINITION] = {
    init() {
      this.jsonInit({
        message0: "define %1",
        args0: [
          {
            type: "input_value",
            name: "custom_block",
          },
        ],
        extensions: ["colours_more", "shape_hat", "procedure_def_contextmenu"],
      });
    },
  };

  Blockly.Blocks[FunctionBlockType.PROTOTYPE] = {
    init() {
      this.jsonInit({
        // message0: "test",
        inputsInline: true,
        outputShape: Blockly.OUTPUT_SHAPE_ROUND,
        output: "String",
        extensions: ["colours_more"],
      });
      /* Data known about the procedure. */
      this.procCode_ = "";
      this.displayNames_ = [];
      this.argumentIds_ = [];
      this.argumentDefaults_ = [];
      this.warp_ = false;
    },

    // Shared.
    getProcCode: Blockly.ScratchBlocks.ProcedureUtils.getProcCode,
    removeAllInputs_: Blockly.ScratchBlocks.ProcedureUtils.removeAllInputs_,
    disconnectOldBlocks_: Blockly.ScratchBlocks.ProcedureUtils.disconnectOldBlocks_,
    deleteShadows_: Blockly.ScratchBlocks.ProcedureUtils.deleteShadows_,
    createAllInputs_: Blockly.ScratchBlocks.ProcedureUtils.createAllInputs_,
    updateDisplay_: Blockly.ScratchBlocks.ProcedureUtils.updateDisplay_,

    // Exist on all three blocks, but have different implementations.
    mutationToDom: Blockly.ScratchBlocks.ProcedureUtils.definitionMutationToDom,
    domToMutation: Blockly.ScratchBlocks.ProcedureUtils.definitionDomToMutation,
    populateArgument_: Blockly.ScratchBlocks.ProcedureUtils.populateArgumentOnPrototype_,
    addProcedureLabel_: Blockly.ScratchBlocks.ProcedureUtils.addLabelField_,

    // Only exists on prototype.
    createArgumentReporter_: Blockly.ScratchBlocks.ProcedureUtils.createArgumentReporter_,
    updateArgumentReporterNames_: Blockly.ScratchBlocks.ProcedureUtils.updateArgumentReporterNames_,
  };

  /**
   * Fix for removable editable label fields on declarations that are not statement-shaped
   */
  class LabelFieldTextInputRemovable extends Blockly.FieldTextInputRemovable {
    /**
     * Enforce square shape instead of this.sourceBlock_.getOutputShape
     */
    getBorderRadius() {
      return Blockly.BlockSvg.TEXT_FIELD_CORNER_RADIUS;
    }

    /**
     * Fixes bug where a lonely label's click target is directed the parent svg element
     */
    getClickTarget_() {
      const target = super.getClickTarget_();
      if (!target) return null;
      if (target.classList.contains("blocklyEditableText")) return target;
      return Array.from(target.children).find((child) => child.classList.contains("blocklyEditableText")) ?? target;
    }
  }

  Blockly.Blocks[FunctionBlockType.DECLARATION] = {
    init: function () {
      this.jsonInit({
        extensions: ["colours_more", "output_string"],
      });
      /* Data known about the procedure. */
      this.procCode_ = "";
      this.displayNames_ = [];
      this.argumentIds_ = [];
      this.argumentDefaults_ = [];
      this.warp_ = false;
    },
    // Shared.
    getProcCode: Blockly.ScratchBlocks.ProcedureUtils.getProcCode,
    removeAllInputs_: Blockly.ScratchBlocks.ProcedureUtils.removeAllInputs_,
    disconnectOldBlocks_: Blockly.ScratchBlocks.ProcedureUtils.disconnectOldBlocks_,
    deleteShadows_: Blockly.ScratchBlocks.ProcedureUtils.deleteShadows_,
    createAllInputs_: Blockly.ScratchBlocks.ProcedureUtils.createAllInputs_,
    updateDisplay_: Blockly.ScratchBlocks.ProcedureUtils.updateDisplay_,

    // Exist on all three blocks, but have different implementations.
    mutationToDom: Blockly.ScratchBlocks.ProcedureUtils.definitionMutationToDom,
    domToMutation: Blockly.ScratchBlocks.ProcedureUtils.definitionDomToMutation,
    populateArgument_: Blockly.ScratchBlocks.ProcedureUtils.populateArgumentOnDeclaration_,
    // replaces Blockly.ScratchBlocks.ProcedureUtils.addLabelEditor_
    /** @param {any} text */
    addProcedureLabel_(text) {
      if (!text) return;
      // @ts-ignore
      this.appendDummyInput(Blockly.utils.genUid()).appendField(new LabelFieldTextInputRemovable(text));
    },

    // Exist on declaration and arguments editors, with different implementations.
    removeFieldCallback: Blockly.ScratchBlocks.ProcedureUtils.removeFieldCallback,

    // Only exist on procedures_declaration.
    createArgumentEditor_: Blockly.ScratchBlocks.ProcedureUtils.createArgumentEditor_,
    focusLastEditor_: Blockly.ScratchBlocks.ProcedureUtils.focusLastEditor_,
    getWarp: Blockly.ScratchBlocks.ProcedureUtils.getWarp,
    setWarp: Blockly.ScratchBlocks.ProcedureUtils.setWarp,
    addLabelExternal: Blockly.ScratchBlocks.ProcedureUtils.addLabelExternal,
    addBooleanExternal: Blockly.ScratchBlocks.ProcedureUtils.addBooleanExternal,
    addStringNumberExternal: Blockly.ScratchBlocks.ProcedureUtils.addStringNumberExternal,
    onChangeFn: Blockly.ScratchBlocks.ProcedureUtils.updateDeclarationProcCode_,
  };

  Blockly.Blocks[FunctionBlockType.CALL] = {
    init: function () {
      this.jsonInit({
        extensions: ["colours_more", "output_string", "procedure_call_contextmenu"],
      });
      this.procCode_ = "";
      this.argumentIds_ = [];
      this.warp_ = false;
    },
    // Shared.
    getProcCode: Blockly.ScratchBlocks.ProcedureUtils.getProcCode,
    removeAllInputs_: Blockly.ScratchBlocks.ProcedureUtils.removeAllInputs_,
    disconnectOldBlocks_: Blockly.ScratchBlocks.ProcedureUtils.disconnectOldBlocks_,
    deleteShadows_: Blockly.ScratchBlocks.ProcedureUtils.deleteShadows_,
    createAllInputs_: Blockly.ScratchBlocks.ProcedureUtils.createAllInputs_,
    updateDisplay_: Blockly.ScratchBlocks.ProcedureUtils.updateDisplay_,

    // Exist on all three blocks, but have different implementations.
    mutationToDom: Blockly.ScratchBlocks.ProcedureUtils.callerMutationToDom,
    domToMutation: Blockly.ScratchBlocks.ProcedureUtils.callerDomToMutation,
    populateArgument_: Blockly.ScratchBlocks.ProcedureUtils.populateArgumentOnCaller_,
    addProcedureLabel_: Blockly.ScratchBlocks.ProcedureUtils.addLabelField_,

    // Only exists on the external caller.
    attachShadow_: Blockly.ScratchBlocks.ProcedureUtils.attachShadow_,
    buildShadowDom_: Blockly.ScratchBlocks.ProcedureUtils.buildShadowDom_,
  };
}

/** @param {FunctionContext} context */
export function patchVM({ vm }) {
  /**
   * @param {string} proccode
   * @param {ScratchVM.Blocks | null} blocks
   */
  function getPrototype(blocks, proccode) {
    if (!blocks) return null;
    for (const block of Object.values(blocks._blocks)) {
      if (block.opcode !== FunctionBlockType.PROTOTYPE) continue;
      if (block.mutation?.proccode !== proccode) continue;
      return block;
    }
    return null;
  }

  vm.runtime._primitives[FunctionBlockType.DEFINITION] = () => {
    /** no-op */
  };

  /**
   * @param {Record<string, any>} args
   * @param {ScratchVM.BlockUtility} util
   */
  vm.runtime._primitives[FunctionBlockType.CALL] = (args, util) => {
    if (util.stackFrame.executed) return;
    util.stackFrame.executed = true;
    const thread = util.thread;

    const MAX_DEPTH = 1000;
    if ((thread.function?.depth ?? 0) > MAX_DEPTH) {
      console.log("recursion depth exceeded");
      return undefined;
    }

    const blocks = thread.target.blocks;
    // @ts-ignore
    blocks._cache._executeCached = {};

    const prototype = getPrototype(blocks, args.mutation.proccode);
    if (prototype === null) return;
    const mutation = /** @type {ScratchVM.ProcedurePrototypeMutation} */ (prototype.mutation);
    /** @type {string[]} */
    const names = JSON.parse(mutation.argumentnames);
    /** @type {string[]} */
    const ids = JSON.parse(mutation.argumentids);
    const defaults = JSON.parse(mutation.argumentdefaults);

    const childThread = util.runtime._pushThread(prototype.parent ?? "", util.target);
    const childStackFrame = childThread.peekStackFrame();
    if (childStackFrame)
      childStackFrame.warpMode = JSON.parse(mutation.warp);

    return new Promise((resolve) => {
      childThread.function = {
        depth: thread.function?.depth ?? 0,
        resolve,
        params: Object.fromEntries(
          ids.map((id, i) => [names[i], Object.prototype.hasOwnProperty.call(args, id) ? args[id] : defaults[i]])
        ),
      };
    });
  };

  /**
   * @param {Record<string, any>} args
   * @param {ScratchVM.BlockUtility} util
   */
  vm.runtime._primitives[FunctionBlockType.RETURN] = (args, util) => {
    util.stopThisScript();
    util.thread.function?.resolve(args.ITEM);
  };

  /**
   * @param {Record<string, any>} args
   * @param {ScratchVM.BlockUtility} util
   */
  function argReporter(args, util) {
    const value = util.getParam(args.VALUE);
    if (value !== null) return value;
    const returnValue = util.thread.function?.params[args.VALUE] ?? null;
    if (returnValue !== null) return returnValue;
    return 0;
  }

  vm.runtime._primitives.argument_reporter_string_number = argReporter;
  vm.runtime._primitives.argument_reporter_boolean = argReporter;
}

/** @param {FunctionContext} context */
export async function patchMenuBar({ addon }) {
  const fileGroup = await getElement(`.${addon.tab.scratchClass("menu-bar_file-group")}`);
  const buildButton = document.createElement('div');
  buildButton.classList.add(addon.tab.scratchClass("menu-bar_menu-bar-item"), addon.tab.scratchClass("menu-bar_hoverable"));
  buildButton.role = "button";
  buildButton.ariaPressed = "false";
  const image = document.createElement('img');
  buildButton.appendChild(image);
  image.src = BUILD_ICON;
  buildButton.addEventListener("click", () => {
    buildButton.ariaPressed = buildButton.ariaPressed === "true" ? "false" : "true";
    image.src = buildButton.ariaPressed === "true" ? DEV_ICON : BUILD_ICON;
  });
  fileGroup.after(buildButton);
}
