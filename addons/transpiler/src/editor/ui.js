import { FunctionBlockType } from "../shared.js";
import { rebuild } from "../transform/encode/encoder.js";
import { assert } from "../utils.js";
import { BOOLEAN_ICON, BUILD_ICON, DEV_ICON, FUNCTION_ICON, LABEL_ICON, NUMBER_OR_TEXT_ICON } from "./icons.js";

/** @typedef {import("../userscript.js").FunctionContext} FunctionContext */
/** @typedef {import("../transform/decode/decoder.js").Decoder} Decoder */

const CATEGORY_KEY = "FUNCTION";
const BACKDOOR_REFRESH = "refresh";
/** @type {"raw" | "cooked"} */
let state = "cooked";

/** @param {ScratchBlocks.Blockly} Blockly */
function createXmlParser(Blockly) {
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
  return { xml };
}

/** @param {FunctionContext} context */
export function patchCategory({ addon, Blockly }) {
  const workspace = addon.tab.traps.getWorkspace();
  // add category
  const { xml } = createXmlParser(Blockly);

  const functionCategory = xml`
    <category
    id="sa-functions"
    name="Functions"
    colour="#cc5166"
    secondaryColour="#cc5166"
    custom="${CATEGORY_KEY}"
    iconURI="${FUNCTION_ICON}"
    />`;

  const oldUpdateToolbox = workspace.updateToolbox;
  /** @type {Parameters<typeof workspace.updateToolbox>[0] | null} */
  let savedToolboxXML = null;
  workspace.updateToolbox = function (toolboxXML) {
    const xml = Blockly.Options.parseToolboxTree(toolboxXML === BACKDOOR_REFRESH ? savedToolboxXML : toolboxXML);
    if (toolboxXML !== BACKDOOR_REFRESH) {
      savedToolboxXML = toolboxXML;
    }
    if (state === "cooked") {
      xml?.querySelector(`category[id="myBlocks"]`)?.after(functionCategory);
    }
    return oldUpdateToolbox.call(this, xml);
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
        .map(
          /** @param {any} mutation */(mutation) => {
            const block = document.createElementNS(null, "block");
            block.setAttribute("type", FunctionBlockType.CALL);
            block.setAttribute("gap", "16");
            block.appendChild(mutation);
            return block;
          }
        );

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

/**
 * @param {FunctionContext} context
 * @param {Decoder} transformer
 */
export function patchMenuBar({ addon, vm }, transformer) {
  const workspace = addon.tab.traps.getWorkspace();

  const fileGroup = document.querySelector(`.${addon.tab.scratchClass("menu-bar_file-group")}`);
  assert(fileGroup, "File group not found");
  const buildButton = document.createElement("div");
  buildButton.classList.add(
    addon.tab.scratchClass("menu-bar_menu-bar-item"),
    addon.tab.scratchClass("menu-bar_hoverable")
  );
  buildButton.role = "button";
  buildButton.ariaPressed = "false";
  const image = document.createElement("img");
  buildButton.appendChild(image);
  image.src = BUILD_ICON;
  buildButton.addEventListener("click", async () => {
    if (addon.self.disabled) return;
    const doBuild = buildButton.ariaPressed === "false";
    if (doBuild) {
      state = "raw";
      await rebuild(vm);
      image.src = DEV_ICON;
      buildButton.ariaPressed = "true";
    } else {
      state = "cooked";
      transformer.transpileTargets();
      workspace.updateToolbox(BACKDOOR_REFRESH);
      workspace.toolboxRefreshEnabled_ = true;
      image.src = BUILD_ICON;
      buildButton.ariaPressed = "false";
    }
  });
  addon.tab.displayNoneWhileDisabled(buildButton);
  fileGroup.after(buildButton);
}
