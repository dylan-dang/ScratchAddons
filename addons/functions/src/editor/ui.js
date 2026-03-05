import { BUILD_ICON, DEV_ICON } from "./icons.js";

/** @typedef {import("../userscript.js").FunctionContext} FunctionContext */
/** @typedef {import("../transform/decode/decoder.js").Decoder} Decoder */

/**
 * @param {FunctionContext} context
 * @param {Decoder} transformer
 */
export async function patchMenuBar({ addon, vm }, transformer) {
  const fileGroup = await addon.tab.waitForElement(`.${addon.tab.scratchClass("menu-bar_file-group")}`);
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
    const doBuild = buildButton.ariaPressed === "false";
    if (doBuild) {
      const targetIdx = vm.editingTarget ? vm.runtime.targets.indexOf(vm.editingTarget) : 1;
      await vm.loadProject(vm.toJSON());
      vm.setEditingTarget(vm.runtime.targets[targetIdx].id);
      image.src = DEV_ICON;
      buildButton.ariaPressed = "true";
    } else {
      transformer.transpileTargets();
      image.src = BUILD_ICON;
      buildButton.ariaPressed = "false";
    }
  });
  fileGroup.after(buildButton);
}
