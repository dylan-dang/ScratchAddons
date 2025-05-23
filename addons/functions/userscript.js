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
  // @ts-ignore
  const workspace = addon.tab.traps.getWorkspace();

  patchCategory();
  patchConnection();
  defineBlocks();
  patchBlockSvg();
  patchBlockDragger();
  patchSerialization();

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
            <value name="custom_block">
              <shadow type="function_prototype">
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
        .filter((block) => block.type === "function_prototype")
        .map((block) => block.mutationToDom(/* opt_generateShadows */ true))
        .filter(Boolean)
        .sort((a, b) =>
          Blockly.scratchBlocksUtils.compareStrings(a.getAttribute("proccode"), b.getAttribute("proccode"))
        )
        .map((mutation) => {
          const block = document.createElementNS(null, "block");
          block.setAttribute("type", "function_call");
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
              xml`<block type="function_return">
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
        (blockA.type === "function_definition" &&
          blockB.type !== "function_prototype" &&
          superiorConn === blockA.getInput("custom_block").connection) ||
        (blockB.type === "function_prototype" && blockA.type !== "function_definition")
      ) {
        // @ts-ignore
        return Blockly.Connection.REASON_CUSTOM_PROCEDURE;
      }

      return Blockly.Connection.CAN_CONNECT;
    };
  }

  function patchBlockDragger() {
    const oldEndBlockDrag = Blockly.BlockDragger.prototype.endBlockDrag;
    Blockly.BlockDragger.prototype.endBlockDrag = function () {
      oldEndBlockDrag.apply(this, arguments);
      if (!(this.wouldDeleteBlock_ && this.draggingBlock_.type === "function_definition")) return;
      /** @type {ScratchBlocks.Workspace} */
      const workspace = this.workspace_;
      setTimeout(() => {
        for (const block of workspace.getAllBlocks()) {
          if (block.type === "function_call") {
            // @ts-ignore
            const procCode = block.getProcCode();
            workspace.getTopBlocks(false);

            const definition = workspace.getTopBlocks(false).find(
              (block) =>
                block.type === "function_definition" &&
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
              name: "ITEM",
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
              name: "custom_block",
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

    Blockly.Blocks.function_call = {
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

  function patchSerialization() {
    const vmPrototype = Object.getPrototypeOf(vm);
    const originalToJSON = vmPrototype.toJSON;
    /**
     * @param {string} optTargetId
     */
    vmPrototype.toJSON = function (optTargetId) {
      const json = originalToJSON.call(this, optTargetId);
      /** @type {Serialized.Project | Serialized.Sprite} */
      const parsed = JSON.parse(json);
      console.log(JSON.parse(json));
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

          // define __stack__ list if any function block is detected
          target.lists.__stack__ = ["__stack__", []];

          if (block.opcode === "function_prototype") {
            block.opcode = "procedures_prototype";
            continue;
          }

          if (block.opcode === "function_definition") {
            block.opcode = "procedures_definition";
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
              lastBlock.opcode === "function_return" ||
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
                LIST: ["__stack__", "__stack__"],
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
          if (block.opcode !== "function_return") continue;
          block.opcode = "data_insertatlist";
          block.inputs.INDEX = [1, [7, "1"]];
          block.fields.LIST = ["__stack__", "__stack__"];
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
          if (block.opcode !== "function_call") continue;

          const reporterExtensions = new Set(["output_boolean", "output_number", "output_string"]);
          /** @param {BlockJson} json */
          const isReporter = (json) =>
            !!json.outputShape || !!json.output || json.extensions?.some((ext) => reporterExtensions.has(ext));

          /** contains either the closest statement or top-level reporter ancestor */
          let ancestorId = id;
          let currentBlock = block;
          let wasReporter = true;
          while (wasReporter) {
            const parentId = currentBlock.parent;
            currentBlock = getNonprimitiveBlock(parentId);
            if (!currentBlock) break;
            ancestorId = parentId;
            wasReporter = isReporter(getBlockDefinition(currentBlock.opcode));
          }

          if (wasReporter) {
            deleteTree(ancestorId);
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
            if (block.opcode === "function_call") {
              const copy = { ...block };
              block.opcode = "data_itemoflist";
              block.mutation = undefined;
              block.fields = {
                LIST: ["__stack__", "__stack__"],
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
              call.parent = prevIds.at(-1);
              target.blocks[currId] = call;

              prevIds.push(currId);
              currId = i === calls.length - 1 ? stmtId : Blockly.utils.genUid();
              call.next = currId;
            }
            stmtBlock.parent = prevIds.at(-1);

            // add deleter after stmt
            /** @type {Serialized.Block} */
            const deleter = {
              opcode: "data_deleteoflist",
              fields: { LIST: ["__stack__", "__stack__"] },
              inputs: { INDEX: [1, [7, "1"]] },
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

            for (const id of prevIds.slice(1)) {
              transpileStatement(id);
            }
          }

          /**
           * @param {string} stmtId
           */
          function atomicizeStatement(stmtId) {
            const stmt = getNonprimitiveBlock(stmtId);
            const prototypeId = Blockly.utils.genUid();
            const definitionId = Blockly.utils.genUid();
            const callId = Blockly.utils.genUid();

            const proccode = `__atomic ${stmtId}`.replaceAll("%", "");

            /** @type {Serialized.Block} */
            const prototype = {
              opcode: "procedures_prototype",
              next: null,
              parent: definitionId,
              inputs: {},
              fields: {},
              shadow: true,
              topLevel: false,
              mutation: {
                tagName: "mutation",
                children: [],
                proccode,
                argumentids: "[]",
                argumentnames: "[]",
                argumentdefaults: "[]",
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
              inputs: {},
              fields: {},
              shadow: false,
              mutation: {
                tagName: "mutation",
                children: [],
                proccode,
                argumentids: "[]",
                warp: "true",
              },
            };
            target.blocks[callId] = call;

            replaceChildStmtRef(getNonprimitiveBlock(stmt.parent), stmtId, callId);
            stmt.parent = definitionId;
            stmt.next = null;
          }

          atomicizeStatement(ancestorId);
          transpileStatement(ancestorId);
        }
      }
      console.log(targets);
      return JSON.stringify(parsed);
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
