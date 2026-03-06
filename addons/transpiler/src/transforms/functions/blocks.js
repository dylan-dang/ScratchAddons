import { assert } from "../../utils.js";
import { FunctionBlockType } from "./shared.js";

/**
 * @typedef {import("../../userscript.js").FunctionContext} FunctionContext
 */

/** @param {ScratchBlocks.Blockly} Blockly */
export function patchBlocks(Blockly) {
  patchConnection(Blockly);
  patchBlockDragger(Blockly);
  patchBlockSvg(Blockly);
  defineBlocks(Blockly);
}

/**
 * Patch the connection to handle function block connection.
 * @param {ScratchBlocks.Blockly} Blockly
 */
export function patchConnection(Blockly) {
  const ConnectionPrototype = Blockly.Connection.prototype;

  const originalCanConnectWithReason_ = ConnectionPrototype.canConnectWithReason_;

  /**
   * @this {ScratchBlocks.Connection}
   * @type {ScratchBlocks.Connection["canConnectWithReason_"]}
   */
  ConnectionPrototype.canConnectWithReason_ = function (target) {
    const reason = originalCanConnectWithReason_.call(this, target);
    if (reason !== Blockly.Connection.CAN_CONNECT) return reason;

    /** @type {ScratchBlocks.Block} */
    let blockA;
    /** @type {ScratchBlocks.Block} */
    let blockB;
    /** @type {ScratchBlocks.Connection} */
    let superiorConn;
    if (this.isSuperior()) {
      blockA = this.sourceBlock_;
      blockB = target.getSourceBlock();
      superiorConn = this;
    } else {
      blockA = target.getSourceBlock();
      blockB = this.sourceBlock_;
      superiorConn = target;
    }

    const customBlockConn = /** @type {ScratchBlocks.Connection | undefined} */ (
      /** @type {unknown} */ (blockA.getInput("custom_block")?.connection)
    );
    if (
      (blockA.type === FunctionBlockType.DEFINITION &&
        blockB.type !== FunctionBlockType.PROTOTYPE &&
        superiorConn === customBlockConn) ||
      (blockB.type === FunctionBlockType.PROTOTYPE && blockA.type !== FunctionBlockType.DEFINITION)
    ) {
      return Blockly.Connection.REASON_CUSTOM_PROCEDURE;
    }

    return Blockly.Connection.CAN_CONNECT;
  };
}

/**
 * Patch the block dragger to handle function block deletion.
 * @param {ScratchBlocks.Blockly} Blockly
 */
export function patchBlockDragger(Blockly) {
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

/**
 * @param {ScratchBlocks.Blockly} Blockly
 */
export function patchBlockSvg(Blockly) {
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

  const originalRenderFields = Blockly.BlockSvg.prototype.renderFields_;
  /**
   * Render the fields of the block.
   * @param {ScratchBlocks.Field[]} fieldRow The fields to render.
   * @param {number} fieldX The x position of the fields.
   * @param {number} fieldY The y position of the fields.
   * @return {number} The x position of the fields.
   */
  Blockly.BlockSvg.prototype.renderFields_ = function (fieldRow, fieldX, fieldY) {
    if (this.type === FunctionBlockType.DEFINITION) {
      // move define text field up by 2 units
      fieldY -= 2 * Blockly.BlockSvg.GRID_UNIT;
    }
    return originalRenderFields.call(this, fieldRow, fieldX, fieldY);
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
    if (this.type === FunctionBlockType.CALL || this.type === FunctionBlockType.PROTOTYPE) {
      // remove units from the padding end of the last input row if it ends with an input
      if (this.getProcCode().endsWith("%s")) {
        const amount = this.type === FunctionBlockType.CALL ? 2 : 1;
        inputRows[inputRows.length - 1].paddingEnd -= amount * Blockly.BlockSvg.GRID_UNIT;
      }
    }
    const returnValue = originalRenderDrawRight_.call(this, steps, inputRows, iconWidth);
    if (this.type === FunctionBlockType.DEFINITION) {
      const connection = inputRows[0][0].connection;
      // move the prototype connection up by 2 units
      connection.offsetInBlock_.y -= 2 * Blockly.BlockSvg.GRID_UNIT;
      // change top right corner to define hat corner and shift to the left by the difference in corner radii
      assert(typeof steps[3] === "number");
      steps[3] -= Blockly.BlockSvg.DEFINE_HAT_CORNER_RADIUS - Blockly.BlockSvg.CORNER_RADIUS;
      steps[4] = Blockly.BlockSvg.TOP_RIGHT_CORNER_DEFINE_HAT;
      // increase bottom edge by 1 unit to line up with next block
      assert(typeof steps[6] === "number");
      steps[6] += Blockly.BlockSvg.GRID_UNIT;
    }
    return returnValue;
  };
}

/**
 * @param {ScratchBlocks.Blockly} Blockly
 */
export function defineBlocks(Blockly) {
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
