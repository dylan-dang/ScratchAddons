/// <reference path="types/sb3.d.ts" />
/// <reference path="types/userscript.d.ts" />

const Signature = {
  FUNCTION: "__function ",
  ATOMIC: "__atomic ",
  STACK: "__stack__",
  INLINE: "__inline",
};

const FunctionBlockType = {
  DEFINITION: "function_definition",
  PROTOTYPE: "function_prototype",
  CALL: "function_call",
  DECLARATION: "function_declaration",
  RETURN: "function_return",
};

/** @param {Userscript.Utilities} utils */
export default async function ({ addon, console }) {
  const Blockly = await addon.tab.traps.getBlockly();
  await addon.tab.scratchClassReady();
  const vm = addon.tab.traps.vm;

  patchCategory();
  patchConnection();
  defineBlocks();
  patchBlockSvg();
  patchBlockDragger();
  patchSerialization();
  patchDeserialization();
  patchVM();

  function patchCategory() {
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

    const FUNCTION_ICON = /* xml */ `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="24px"
      viewBox="0 -960 960 960"
      width="24px"
      fill-rule="evenodd"
      fill="#575E75"
    >
      <path
        d="M400-240v-80h62l105-120-105-120h-66l-64 344q-8 45-37 70.5T221-120q-45 0-73-24t-28-64
        q0-32 17-51.5t43-19.5q25 0 42.5 17t17.5 41q0 5-.5 9t-1.5 9q5-1 8.5-5.5T252-221l62-339
        H200v-80h129l21-114q7-38 37.5-62t72.5-24q44 0 72 26t28 65q0 30-17 49.5T500-680q-25 0-42.5-17
        T440-739q0-5 .5-9t1.5-9q-6 2-9 6t-5 12l-17 99h189v80h-32l52 59 52-59h-32v-80h200v80h-62
        L673-440l105 120h62v80H640v-80h32l-52-60-52 60h32v80H400Z"/>
    </svg>`;

    const NUMBER_OR_TEXT_ICON =
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1NyA0OSI+PGRlZnM+PHN0eWxlPi5jbHMtMXtvcGFjaXR5OjAuMzt9LmNscy0ye29wYWNpdHk6MC4xO30uY2xzLTN7ZmlsbDojZmY2NjgwO3N0cm9rZS1taXRlcmxpbWl0OjEwO30uY2xzLTMsLmNscy00e3N0cm9rZTojZjM1O30uY2xzLTR7ZmlsbDojZmY0ZDZhO3N0cm9rZS1saW5lY2FwOnJvdW5kO3N0cm9rZS1saW5lam9pbjpyb3VuZDt9PC9zdHlsZT48L2RlZnM+PHRpdGxlPlIxXyBDLlByb2NlZHVyZSBFZGl0YmxlIElucHV0czwvdGl0bGU+PGcgaWQ9ImJvb2xlYW5fYm9vbGVhbl9pbnB1dHMiIGRhdGEtbmFtZT0iYm9vbGVhbiArIGJvb2xlYW4gaW5wdXRzIj48cmVjdCBjbGFzcz0iY2xzLTMiIHg9IjAuNSIgeT0iMC41IiB3aWR0aD0iNTYiIGhlaWdodD0iNDgiIHJ4PSI0IiByeT0iNCIvPjxyZWN0IGNsYXNzPSJjbHMtNCIgeD0iOC41IiB5PSI4LjUiIHdpZHRoPSI0MCIgaGVpZ2h0PSIzMiIgcng9IjE2IiByeT0iMTYiLz48L2c+PC9zdmc+";
    const BOOLEAN_ICON =
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1NyA0OSI+PGRlZnM+PHN0eWxlPi5jbHMtMXtvcGFjaXR5OjAuMzt9LmNscy0ye29wYWNpdHk6MC4xO30uY2xzLTN7ZmlsbDojZmY2NjgwO3N0cm9rZS1taXRlcmxpbWl0OjEwO30uY2xzLTMsLmNscy00e3N0cm9rZTojZjM1O30uY2xzLTR7ZmlsbDojZmY0ZDZhO3N0cm9rZS1saW5lY2FwOnJvdW5kO3N0cm9rZS1saW5lam9pbjpyb3VuZDt9PC9zdHlsZT48L2RlZnM+PHRpdGxlPlIxXyBDLlByb2NlZHVyZSBFZGl0YmxlIElucHV0czwvdGl0bGU+PGcgaWQ9ImJvb2xlYW5fYm9vbGVhbl9pbnB1dHMiIGRhdGEtbmFtZT0iYm9vbGVhbiArIGJvb2xlYW4gaW5wdXRzIj48cmVjdCBjbGFzcz0iY2xzLTMiIHg9IjAuNSIgeT0iMC41IiB3aWR0aD0iNTYiIGhlaWdodD0iNDgiIHJ4PSI0IiByeT0iNCIvPjxwYXRoIGNsYXNzPSJjbHMtNCIgZD0iTTMyLjUsNDAuNWgtOGwtMTYtMTZoMGwxNi0xNmg4bDE2LDE2aDBaIi8+PC9nPjwvc3ZnPg==";
    const LABEL_ICON =
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1NyA0OSI+PGRlZnM+PHN0eWxlPi5jbHMtMXtvcGFjaXR5OjAuMzt9LmNscy0ye29wYWNpdHk6MC4xO30uY2xzLTN7ZmlsbDojZmY2NjgwO3N0cm9rZTojZjM1O3N0cm9rZS1taXRlcmxpbWl0OjEwO30uY2xzLTR7Zm9udC1zaXplOjEycHg7ZmlsbDojZmZmO2ZvbnQtZmFtaWx5OkhlbHZldGljYU5ldWUtQm9sZCwgSGVsdmV0aWNhIE5ldWUsIHNhbnMtc2VyaWY7Zm9udC13ZWlnaHQ6NzAwO2xldHRlci1zcGFjaW5nOjBlbTt9PC9zdHlsZT48L2RlZnM+PHRpdGxlPlIxXyBDLlByb2NlZHVyZSBFZGl0YmxlIElucHV0czwvdGl0bGU+PGcgaWQ9ImJvb2xlYW5fYm9vbGVhbl9pbnB1dHMiIGRhdGEtbmFtZT0iYm9vbGVhbiArIGJvb2xlYW4gaW5wdXRzIj48cmVjdCBjbGFzcz0iY2xzLTMiIHg9IjAuNSIgeT0iMC41IiB3aWR0aD0iNTYiIGhlaWdodD0iNDgiIHJ4PSI0IiByeT0iNCIvPjx0ZXh0IGNsYXNzPSJjbHMtNCIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTcuNTcgMjcuNSkiPnRleHQ8L3RleHQ+PC9nPjwvc3ZnPgo=";

    // add category
    const CATEGORY_KEY = "FUNCTION";
    const originalGetBlocksXML = vm.runtime.getBlocksXML;
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
            iconURI="data:image/svg+xml;base64,${btoa(FUNCTION_ICON)}"
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
    workspace.registerToolboxCategoryCallback(CATEGORY_KEY, (workspace) => {
      const CALLBACK_KEY = "CREATE_FUNCTION";
      workspace.registerButtonCallback(CALLBACK_KEY, () => {
        modal.open();
        /** @type {HTMLDivElement} */
        const blocksRef = modal.content.querySelector("#sa-function-workspace");
        const numberOrTextInput = modal.content.querySelector("#sa-function-number-or-text-input");
        const booleanInput = modal.content.querySelector("#sa-function-boolean-input");
        const labelInput = modal.content.querySelector("#sa-function-label-input");

        const cancelButton = modal.content.querySelector("#sa-function-cancel-button");
        const okButton = modal.content.querySelector("#sa-function-ok-button");

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
          const workspace = addon.tab.traps.getWorkspace();
          const blockDom = xml`<block type="${FunctionBlockType.DEFINITION}" gap="16">
            <value name="custom_block">
              <shadow type="${FunctionBlockType.PROTOTYPE}">
                ${Blockly.Xml.domToText(mutationRoot.mutationToDom(true))}
              </shadow>
            </value>
          </block>`;
          if (!(blockDom instanceof Element)) throw new Error("this should not happen");
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
          numberOrTextInput.removeEventListener("click", handleAddTextNumber);
          booleanInput.removeEventListener("click", handleAddBoolean);
          labelInput.removeEventListener("click", handleAddLabel);
          modal.backdrop.removeEventListener("click", handleClose);
          modal.closeButton.removeEventListener("click", handleClose);
          cancelButton.removeEventListener("click", handleClose);
          okButton.removeEventListener("click", handleOk);
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
        .filter((block) => block.type === FunctionBlockType.PROTOTYPE)
        .map((block) => block.mutationToDom(/* opt_generateShadows */ true))
        .filter(Boolean)
        .sort((a, b) =>
          Blockly.scratchBlocksUtils.compareStrings(a.getAttribute("proccode"), b.getAttribute("proccode"))
        )
        .map((mutation) => {
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
    });
  }

  function patchConnection() {
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

  function patchBlockDragger() {
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

  function patchBlockSvg() {
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

  function defineBlocks() {
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
      addProcedureLabel_(text) {
        if (!text) return;
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

  function patchSerialization() {
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
              const nextBlock = getNonprimitiveBlock(lastBlock.next);
              if (!nextBlock) break;
              lastBlock = nextBlock;
              lastBlockId = lastBlock.next;
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
          function replaceChildStmtRef(parent, stmtId, replacementId) {
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
           * Unfold all function calls to procedure calls from a statemtn
           * @param {string} stmtId
           * @return {string | undefined} - first function call id
           */
          function transpileStatement(stmtId) {
            const stmtBlock = getNonprimitiveBlock(stmtId);
            const calls = getAndReplaceCalls(stmtBlock);
            if (calls.length === 0) return;

            let currId = Blockly.utils.genUid();
            replaceChildStmtRef(getNonprimitiveBlock(stmtBlock.parent), stmtId, currId);

            const prevIds = [stmtBlock.parent];
            if (stmtBlock.topLevel) {
              const [firstCall] = calls;
              firstCall.x = stmtBlock.x;
              firstCall.y = stmtBlock.y;
              firstCall.topLevel = true;
              stmtBlock.topLevel = false;
              stmtBlock.x = undefined;
              stmtBlock.y = undefined;
            }

            for (let i = 0; i < calls.length; i++) {
              const call = calls[i];
              call.opcode = "procedures_call";
              call.mutation.proccode = Signature.FUNCTION + call.mutation.proccode;
              call.parent = prevIds.at(-1);
              target.blocks[currId] = call;

              prevIds.push(currId);
              currId = i === calls.length - 1 ? stmtId : Blockly.utils.genUid();
              call.next = currId;
            }
            stmtBlock.parent = prevIds.at(-1);

            const isCall =
              stmtBlock.opcode === "procedures_call" && stmtBlock.mutation.proccode.startsWith(Signature.FUNCTION);
            const isStackPush =
              stmtBlock.opcode === "data_insertatlist" && stmtBlock.fields.LIST[0] === Signature.STACK;
            // add deleter after stmt
            /** @type {Serialized.Block} */
            const deleter = {
              opcode: "data_deleteoflist",
              fields: { LIST: [Signature.STACK, Signature.STACK] },
              // if the stmt we are transpiling is a fn call, we reserve index 1 for the return value
              inputs: { INDEX: [1, [7, isCall || isStackPush ? "2" : "1"]] },
              parent: stmtId,
              next: stmtBlock.next,
              shadow: false,
              topLevel: false,
            };
            const deleterId = Blockly.utils.genUid();
            target.blocks[deleterId] = deleter;
            stmtBlock.next = deleterId;

            // if there is more than one call replace deleter with repeater
            if (calls.length > 1) {
              /** @type {Serialized.Block} */
              const repeater = {
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
              };
              const repeaterId = Blockly.utils.genUid();
              deleter.next = null;
              deleter.parent = repeaterId;
              target.blocks[repeaterId] = repeater;
              stmtBlock.next = repeaterId;
            }

            let startId = prevIds[1];
            for (const [i, id] of prevIds.slice(1).entries()) {
              const subStartId = transpileStatement(id);
              if (i === 0 && subStartId) startId = subStartId;
            }
            return startId;
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

            const proccode = `${Signature.ATOMIC}${stmtId.replaceAll("%", "\\%")} ${
              scope?.mutation.proccode.match(/(?<!\\)%[nbs]/g).join(" ") ?? ""
            }`;

            // clone argument reporters
            const argumentids = scope?.mutation.argumentids ?? "[]";

            /** @type {Serialized.Block} */
            const prototype = {
              opcode: "procedures_prototype",
              next: null,
              parent: definitionId,
              inputs: Object.fromEntries(
                Object.entries(scope?.inputs ?? {}).map(([name, [type, refId]]) => {
                  // this shouldn't happen
                  if (typeof refId !== "string") return [name, [type, refId]];
                  const id = Blockly.utils.genUid();
                  target.blocks[id] = structuredClone(getNonprimitiveBlock(refId));
                  target.blocks[id].parent = prototypeId;
                  return [name, [type, id]];
                })
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
              inputs: Object.fromEntries(
                Object.entries(scope?.inputs ?? {}).map(([name, [type, refId]]) => {
                  // this shouldn't happen
                  if (typeof refId !== "string") return [name, [type, refId]];
                  const id = Blockly.utils.genUid();
                  target.blocks[id] = structuredClone(getNonprimitiveBlock(refId));
                  target.blocks[id].parent = callId;
                  target.blocks[id].shadow = false;
                  return [name, [type, id]];
                })
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

            replaceChildStmtRef(getNonprimitiveBlock(stmt.parent), stmtId, callId);
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

  function patchDeserialization() {
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
}
