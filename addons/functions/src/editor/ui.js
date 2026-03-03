import { BUILD_ICON, DEV_ICON } from "./icons.js";

/** @typedef {import("../userscript.js").FunctionContext} FunctionContext */
/** @typedef {import("../transform/decode/decoder.js").Decoder} Decoder */

/**
 * @param {import("blockly").WorkspaceSvg} workspace
 * @returns {{ x: number, y: number } | undefined}
 */
function saveScrollPosition(workspace) {
    if (!workspace.scrollbar) return;
    const hScroll = workspace.scrollbar.hScroll;
    const vScroll = workspace.scrollbar.vScroll;
    if (!hScroll || !vScroll) return;
    return {
        x: hScroll.handlePosition_ / hScroll.ratio_,
        y: vScroll.handlePosition_ / vScroll.ratio_,
    };
}

/**
 * @param {FunctionContext} context
 * @param {Decoder} transformer
 */
export async function patchMenuBar({ addon, vm }, transformer) {
    const fileGroup = await addon.tab.waitForElement(`.${addon.tab.scratchClass("menu-bar_file-group")}`);
    const buildButton = document.createElement('div');
    buildButton.classList.add(addon.tab.scratchClass("menu-bar_menu-bar-item"), addon.tab.scratchClass("menu-bar_hoverable"));
    buildButton.role = "button";
    buildButton.ariaPressed = "false";
    const image = document.createElement('img');
    buildButton.appendChild(image);
    image.src = BUILD_ICON;
    buildButton.addEventListener("click", async () => {
        const doBuild = buildButton.ariaPressed === "false";
        const workspace = addon.tab.traps.getWorkspace();
        const scroll = saveScrollPosition(workspace);
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
        if (scroll) workspace.scrollbar?.set(scroll.x, scroll.y);
    });
    fileGroup.after(buildButton);
}
