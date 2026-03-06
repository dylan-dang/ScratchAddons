import { createXmlParser } from "./xml.js";
import state from "../state.js";

/** @typedef {import("../userscript.js").FunctionContext} FunctionContext */

/** Sentinel passed to updateToolbox to refresh without changing content */
export const BACKDOOR_REFRESH = "refresh";

/**
 * @typedef {Object} CategoryDefinition
 * @property {string} id - Category DOM id (e.g. "sa-functions")
 * @property {string} key - Callback key for custom categories (e.g. "FUNCTION")
 * @property {string} name
 * @property {string} colour
 * @property {string} secondaryColour
 * @property {string} iconURI
 * @property {string} insertAfter - Category id to insert after (e.g. "myBlocks")
 * @property {(context: FunctionContext) => (workspace: ScratchBlocks.WorkspaceSvg) => (Node | Node[])} getContent
 */

/**
 * Patch the toolbox once to inject all transform categories.
 * Transforms define their category; they do not patch updateToolbox themselves.
 *
 * @param {FunctionContext} context
 * @param {Array<{ category?: CategoryDefinition }>} transforms
 */
export function patchCategories(context, transforms) {
  const { addon, Blockly } = context;
  const workspace = addon.tab.traps.getWorkspace();
  const { xml } = createXmlParser(Blockly);

  const categoryDefs = transforms
    .map((t) => t.category)
    .filter(/** @param {CategoryDefinition | undefined} def @returns {def is CategoryDefinition} */ (def) => !!def);

  const categoryElements = categoryDefs.map(
    (def) =>
      xml`
    <category
    id="${def.id}"
    name="${def.name}"
    colour="${def.colour}"
    secondaryColour="${def.secondaryColour}"
    custom="${def.key}"
    iconURI="${def.iconURI}"
    />`
  );

  const oldUpdateToolbox = workspace.updateToolbox;
  /** @type {Parameters<typeof workspace.updateToolbox>[0] | null} */
  let savedToolboxXML = null;

  workspace.updateToolbox = function (toolboxXML) {
    const parsedXml = Blockly.Options.parseToolboxTree(toolboxXML === BACKDOOR_REFRESH ? savedToolboxXML : toolboxXML);
    if (toolboxXML !== BACKDOOR_REFRESH) {
      savedToolboxXML = toolboxXML;
    }
    if (!state.transpiled) {
      // Insert in reverse order so final order matches TRANSFORMS array
      for (let i = categoryDefs.length - 1; i >= 0; i--) {
        const def = categoryDefs[i];
        const element = categoryElements[i];
        parsedXml?.querySelector(`category[id="${def.insertAfter}"]`)?.after(element);
      }
    }
    return oldUpdateToolbox.call(this, parsedXml);
  };

  for (const def of categoryDefs) {
    // Node | Node[] is compatible with Blockly's flyout content at runtime
    // @ts-expect-error Blockly's FlyoutDefinition type doesn't include Node
    workspace.registerToolboxCategoryCallback(def.key, def.getContent(context));
  }
}
