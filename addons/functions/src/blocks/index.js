import { FunctionBlockType } from "../shared.js";

/**
 * @typedef {import("../userscript.js").FunctionContext} FunctionContext
 */

/**
 * Patch the connection to handle function block connection.
 * @param {FunctionContext} context
 */
export function patchConnection({ Blockly }) {
    const ConnectionPrototype = Object.getPrototypeOf(Blockly.Connection);

    /** @type {ScratchBlocks.Connection["canConnectWithReason_"]} */
    const originalCanConnectWithReason_ = ConnectionPrototype.canConnectWithReason_;

    /** @type {ScratchBlocks.Connection["canConnectWithReason_"]} */
    ConnectionPrototype.canConnectWithReason_ = function (target) {
        const connection = /** @type {ScratchBlocks.Connection} */ ( /** @type {unknown} */ (this));
        const reason = originalCanConnectWithReason_.call(this, target);
        if (reason !== Blockly.Connection.CAN_CONNECT) return reason;

        const superior = connection.isSuperior();
        const blockA = superior ? connection.sourceBlock_ : target.getSourceBlock();
        const blockB = superior ? target.getSourceBlock() : connection.sourceBlock_;
        const superiorConn = superior ? this : target;

        if (
            (blockA.type === FunctionBlockType.DEFINITION &&
                blockB.type !== FunctionBlockType.PROTOTYPE &&
                superiorConn === blockA.getInput("custom_block")?.connection) ||
            (blockB.type === FunctionBlockType.PROTOTYPE && blockA.type !== FunctionBlockType.DEFINITION)
        ) {
            // @ts-ignore
            return Blockly.Connection.REASON_CUSTOM_PROCEDURE;
        }

        return Blockly.Connection.CAN_CONNECT;
    };
}

/**
 * Patch the block dragger to handle function block deletion.
 * @param {FunctionContext} context
 */
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
