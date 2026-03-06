import { buildState } from "../state.js";
import { createXmlParser } from "./xml.js";

/** @typedef {import("../userscript.js").FunctionContext} FunctionContext */

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
    .filter(/** @param {CategoryDefinition | undefined} def @returns {def is CategoryDefinition} */(def) => !!def);

  const categoryElements = categoryDefs
    .map(
      (def) =>
        /** @type {[CategoryDefinition, Node]} */([
        def,
        xml`
            <category
              id="${def.id}"
              name="${def.name}"
              colour="${def.colour}"
              secondaryColour="${def.secondaryColour}"
              custom="${def.key}"
              iconURI="${def.iconURI}"
            />
          `,
      ])
    )
    .reverse();

  const oldUpdateToolbox = workspace.updateToolbox;
  workspace.updateToolbox = function (toolboxXML) {
    const parsedXml = Blockly.Options.parseToolboxTree(toolboxXML ?? this.options.languageTree);
    if (!buildState.get()) {
      // Insert in reverse order so final order matches TRANSFORMS array
      for (const [def, element] of categoryElements) {
        parsedXml?.querySelector(`category[id="${def.insertAfter}"]`)?.after(element);
      }
    }
    oldUpdateToolbox.call(this, parsedXml);
  };

  for (const def of categoryDefs) {
    workspace.registerToolboxCategoryCallback(def.key, def.getContent(context));
  }
}
