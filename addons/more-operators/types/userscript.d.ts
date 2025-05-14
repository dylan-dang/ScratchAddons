/// <reference path="./scratch-blocks.d.ts" />
/// <reference path="./scratch-vm.d.ts" />

declare namespace Userscript {
  /** Gets localized message from addons-l10n folder. Supports placeholders and plurals. */
  export type MsgFunction = (key: string, placeholder: Record<string, any>) => string;

  type __Trap = import("../../../addon-api/content-script/Trap").default;
  type __Tab = import("../../../addon-api/content-script/Tab").default;
  type __Addon = import("../../../addon-api/content-script/Addon").default;
  type createEditorModal = typeof import("../../../addon-api/content-script/modal").createEditorModal;

  export interface Traps extends __Trap {
    getBlockly(): Promise<ScratchBlocks.Blockly>;
    getWorkspace(): ScratchBlocks.WorkspaceSvg;
    vm: ScratchVM.VM;
  }

  export interface Tab extends Omit<__Tab, "createModal"> {
    traps: Traps;
    createModal(
      title: string,
      opts?: { isOpen?: boolean; useEditorClasses?: boolean; useSizesClass?: boolean }
    ): ReturnType<createEditorModal>;
  }

  export interface Addon extends Omit<__Addon, "tab"> {
    tab: Tab;
  }

  export interface Utilities {
    addon: Addon;
    msg: MsgFunction & {
      /** Current locale used by msg function. */
      locale: string;
    };
    safeMsg: MsgFunction;
    console: Console;
  }
}

declare const __addon: Userscript.Addon;
