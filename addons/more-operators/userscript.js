/// <reference path="types/sb3.d.ts" />
/// <reference path="types/userscript.d.ts" />

// class SerializeTransformer {
//   /**
//    * @param {Serialized.Target} target
//    * @param {Userscript.Addon} addon
//    * @param {ScratchBlocks.Blockly} blockly
//    */
//   constructor(target, addon, blockly) {
//     this.addon = addon;
//     this.target = target;
//     this.blockly = blockly;
//     this.blocks = target.blocks;
//     /** @type {Set<string>} */
//     this.movedRef = new Set();
//   }

//   /**
//    * @param {string | undefined} blockId
//    * @param {Partial<Serialized.Block>} newProps
//    */
//   modifyBlock(blockId, newProps) {
//     if (!blockId || !Array.isArray(this.target.blocks[blockId])) return;
//     this.target.blocks[blockId] = { ...this.target.blocks[blockId], ...newProps };
//   }

//   /**
//    * @param {Serialized.Primitive | undefined} primitive
//    * @param {Partial<Serialized.Block>} [newProps]
//    * @returns {Serialized.Primitive | undefined}
//    */
//   moveOrCloneRef(primitive, newProps) {
//     if (!primitive) return primitive;
//     const [type] = primitive;
//     if (type === 2 || type === 1) {
//       const id = primitive[1];
//       if (!id) return primitive;
//       if (typeof id !== "string") return primitive;
//       if (this.movedRef.has(id)) {
//         this.modifyBlock(id, newProps);
//         return primitive;
//       }
//       this.movedRef.add(id);
//       // const newId = this.blockly.utils.genUid();
//       // this.target.blocks[newId] = this.target.blocks[id];
//       // if (newProps) this.modifyBlock(newId, newProps);
//       // return [type, newId];
//       const clonedId = this.cloneTree(id);
//       this.modifyBlock(clonedId, newProps);
//       return [type, clonedId];
//     }
//     if (type === 3) {
//       console.warn(`type ${type} primitive encountered!: ${primitive}`);
//     }
//     return [...primitive];
//   }

//   /**
//    * @param {string | null} blockId
//    * @returns {string | null}
//    */
//   cloneTree(blockId) {
//     if (!blockId) return blockId;
//     const block = this.blocks[blockId];
//     if (!block) return blockId;
//     if (Array.isArray(block)) {
//       // primitive
//       return blockId;
//     }
//     /** @type {Serialized.Block} */
//     const cloned = structuredClone(block);
//     if (cloned.inputs) {
//       for (const input of Object.values(cloned.inputs)) {
//         const [type, arg] = input;
//         if (type <= 3 && typeof arg === "string") {
//           input[1] = this.cloneTree(arg);
//         }
//       }
//     }

//     const newId = this.blockly.utils.genUid();
//     this.blocks[newId] = cloned;
//     return newId;
//   }

//   /**
//    * @param {SerializedBlockSpecification | Serialized.Primitive | null} inputOrSpec
//    * @param {string} parent
//    * @returns {Serialized.Primitive  | null}
//    */
//   buildBlockInput_(inputOrSpec, parent) {
//     if (!inputOrSpec) return null;
//     if (Array.isArray(inputOrSpec)) return this.moveOrCloneRef(inputOrSpec, { parent });
//     const id = this.blockly.utils.genUid();
//     const block = this.buildBlock({ ...inputOrSpec, parent });
//     block.parent = parent;
//     this.target.blocks[id] = block;
//     return [2, id];
//   }

//   /**
//    * @param {SerializedBlockSpecification} spec
//    * @returns {Serialized.Block}
//    */
//   buildBlock(spec) {
//     /** @type {Record<string, Serialized.Primitive>} */
//     const inputs = {};
//     if (spec.inputs) {
//       for (const [arg, val] of Object.entries(spec.inputs)) {
//         if (!val) continue;
//         inputs[arg] = this.buildBlockInput_(val, spec.parent);
//       }
//     }
//     return {
//       opcode: spec.opcode,
//       next: null,
//       parent: null,
//       shadow: false,
//       topLevel: false,
//       ...spec,
//       inputs,
//     };
//   }
//   /**
//    * @param {string} blockId
//    */
//   getTopLevelParent(blockId) {
//     const block = this.blocks[blockId];
//     if (Array.isArray(block)) return null;
//     if (!block.topLevel) this.getTopLevelParent(block.parent);
//     return block;
//   }

//   /**
//    * @param {Partial<Serialized.Comment>} [props]
//    */
//   addComment(props) {
//     const id = this.blockly.utils.genUid();
//     if (props.blockId) {
//       const block = this.blocks[props.blockId];
//       if (Array.isArray(block)) throw new Error("This shouldn't happen");
//       if (block.comment) {
//         delete this.target.comments[props.blockId];
//       }
//       block.comment = id;
//     }
//     this.target.comments[id] = {
//       blockId: null,
//       x: 0,
//       y: 0,
//       width: 200,
//       height: 200,
//       text: "",
//       minimized: true,
//       ...props,
//     };
//   }
// }

// class DeserializeTransformer {
//   /**
//    * @param {ScratchVM.RenderedTarget} target
//    * @param {Userscript.Addon} addon
//    */
//   constructor(target, addon) {
//     this.target = target;
//     this.addon = addon;
//     this.blocks = this.target.blocks._blocks;
//   }

//   /**
//    * @param {string} blockId
//    */
//   deleteTree(blockId) {
//     if (!blockId) return;
//     const block = this.blocks[blockId];
//     for (const input of Object.values(block.inputs)) {
//       this.deleteTree(input.block);
//     }
//     delete this.blocks[blockId];
//   }
// }

/** @param {Userscript.Utilities} utils */
export default async function ({ addon, console }) {
  const Blockly = await addon.tab.traps.getBlockly();
  await addon.tab.scratchClassReady();
  const vm = addon.tab.traps.vm;

  patchCategory();
  patchConnection();
  defineBlocks();
  patchBlockSvg();

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

  function patchCategory() {
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
        <div class="${addon.tab.scratchClass("custom-procedures_checkbox-row")}">
          <label>
            <input id="sa-function-warp-checkbox" type="checkbox" />
            <span>Run without screen refresh</span>
          </label>
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
        /** @type {HTMLInputElement} */
        const warpCheckbox = modal.content.querySelector("#sa-function-warp-checkbox");

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
        const mutationRoot = workspace.newBlock("function_declaration");
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
          const blockDom = xml`<block type="function_definition">
            <value name="custom_reporter">
              <shadow type="function_prototype">
                ${Blockly.Xml.domToText(mutationRoot.mutationToDom(true))}
              </shadow>
            </value>
          </block>`;
          if (!(blockDom instanceof Element)) throw new Error("this should not happen");
          Blockly.Events.setGroup(true);
          const block = Blockly.Xml.domToBlock(blockDom, workspace);
          const scale = workspace.scale;
          const posX = 30 - workspace.scrollX;
          const posY = 30 - workspace.scrollY;
          block.moveBy(posX / scale, posY / scale);
          block.scheduleSnapAndBump();
          Blockly.Events.setGroup(false);
          handleClose();
        }

        /**
         * @this {HTMLInputElement}
         */
        function handleToggleWarp() {
          mutationRoot.setWarp(this.checked);
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
          warpCheckbox.removeEventListener("change", handleToggleWarp);
        }

        warpCheckbox.checked = false;
        numberOrTextInput.addEventListener("click", handleAddTextNumber);
        booleanInput.addEventListener("click", handleAddBoolean);
        labelInput.addEventListener("click", handleAddLabel);
        modal.closeButton.addEventListener("click", handleClose);
        modal.backdrop.addEventListener("click", handleClose);
        cancelButton.addEventListener("click", handleClose);
        okButton.addEventListener("click", handleOk);
        warpCheckbox.addEventListener("change", handleToggleWarp);

        // mutationRoot.domToMutation();
        mutationRoot.procCode_ = "function name";
        mutationRoot.updateDisplay_();
        mutationRoot.initSvg();
        mutationRoot.render();
        setTimeout(() => mutationRoot.focusLastEditor_());
      });

      return [
        xml`<block type="function_return">
          <value name="return_value">
            <shadow type="text">
              <field name="TEXT" />
            </shadow>
          </value>
        </block>`,
        xml`<sep gap="36" />`,
        xml`<button text="Make a Function" callbackKey="${CALLBACK_KEY}" />`,
      ];
    });
  }

  function patchConnection() {
    const originalCanConnectWithReason_ = Blockly.Connection.prototype.canConnectWithReason_;
    /**
     * @param {ScratchBlocks.Connection} target
     * @returns {number}
     */
    Blockly.Connection.prototype.canConnectWithReason_ = function (target) {
      // if (target.type === "function_prototype") {
      //   return Blockly.Connection.CAN_CONNECT;
      // }
      return originalCanConnectWithReason_.call(this, target);
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
      if (this.type === "function_definition") {
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
      if (this.type === "function_definition") {
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
    Blockly.Blocks.function_return = {
      init() {
        this.jsonInit({
          message0: "return %1",
          args0: [
            {
              type: "input_value",
              name: "return_value",
            },
          ],
          extensions: ["colours_more", "shape_end"],
        });
      },
    };

    Blockly.Blocks.function_definition = {
      init() {
        this.jsonInit({
          message0: "define %1",
          args0: [
            {
              type: "input_value",
              name: "custom_reporter",
            },
          ],
          extensions: ["colours_more", "shape_hat", "procedure_def_contextmenu"],
        });
      },
    };

    Blockly.Blocks.function_prototype = {
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

    Blockly.Blocks.function_declaration = {
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
      addProcedureLabel_: function (text) {
        if (text) {
          this.appendDummyInput(Blockly.utils.genUid()).appendField(new LabelFieldTextInputRemovable(text));
        }
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
  }

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
}
