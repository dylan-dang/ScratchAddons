import { buildState } from "../state.js";
import { assert } from "../utils.js";
import { BUILD_ICON, DEV_ICON } from "./icons.js";

/** @typedef {import("../userscript.js").FunctionContext} FunctionContext */

/**
 * @param {ScratchBlocks.WorkspaceSvg} workspace
 */
export function refreshToolbox(workspace) {
  workspace.updateToolbox(null);
  workspace.toolboxRefreshEnabled_ = true;
}

/**
 * @param {FunctionContext} context
 */
export function patchMenuBar({ addon }) {
  const fileGroup = document.querySelector(`.${addon.tab.scratchClass("menu-bar_file-group")}`);
  assert(fileGroup, "File group not found");
  const buildButton = document.createElement("div");
  buildButton.classList.add(
    addon.tab.scratchClass("menu-bar_menu-bar-item"),
    addon.tab.scratchClass("menu-bar_hoverable")
  );
  buildButton.role = "button";
  buildButton.ariaPressed = buildState.get() ? "true" : "false";
  const image = document.createElement("img");
  buildButton.appendChild(image);
  image.src = BUILD_ICON;
  buildButton.addEventListener("click", () => {
    buildState.set(!buildState.get());
  });

  buildState.subscribe((build) => {
    if (build) {
      image.src = DEV_ICON;
      buildButton.ariaPressed = "true";
      return;
    }
    image.src = BUILD_ICON;
    buildButton.ariaPressed = "false";
  });

  addon.tab.displayNoneWhileDisabled(buildButton);
  fileGroup.after(buildButton);
}
