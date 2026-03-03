// @ts-check

// Type definitions for scratch-blocks
// Project: https://github.com/LLK/scratch-blocks

declare namespace ScratchBlocks {
  export type Bruh = import("blockly/core").Block;
  export type BlocklyOptions = import("blockly/core").BlocklyOptions;
  export type Block = import("blockly/core").Block & Record<string, any>;
  export type Xml = typeof import("blockly/core").Xml & {
    textToDom: (text: string) => Node;
  };
  export type BlockSvg = import("blockly/core").BlockSvg & Record<string, any>;
  export type Workspace = import("blockly/core").Workspace;
  type WorkspaceSvg_ = import("blockly/core").WorkspaceSvg;
  export type Field = import("blockly/core").Field;
  export type Connection = Omit<import("blockly/core").Connection, "targetBlock"> & {
    setOffsetInBlock: (x: number, y: number) => void;
    targetBlock: () => BlockSvg;
    CAN_CONNECT: number;
    prototype: {
      canConnectWithReason_(target: Connection): number;
    };
  };
  export type Input = Omit<import("blockly/core").Input, "connection"> & {
    connection: Connection;
    renderWidth: number;
  };
  export type Flyout = import("blockly/core").Flyout;

  export namespace Toolbox {
    export interface Category {
      bubble_: HTMLElement;
      colour_: string;
      contents_: Element[];
      custom_?: string | null;
      hasColours: boolean;
      iconURI_?: string | null;
      id_: string;
      item: HTMLElement;
      label_: HTMLElement;
      name_: string;
      item_: HTMLElement;
      parentHtml_: HTMLElement;
      parent_: CategoryMenu;
      secondaryColour_: string;
      showStatusButton_?: string | null;
      /**
       * Create the DOM for a category in the toolbox.
       */
      createDom(): void;
      /**
       * Dispose of this toolbox.
       */
      dispose(): void;
      /**
       * Get the contents of this category.
       * @return xmlList List of blocks to show, or a string with the name of a custom category.
       */
      getContents(): Node[] | string;
      /**
       * Set the contents of this category from DOM.
       * @param domTree DOM tree of blocks.
       * @constructor
       */
      parseContents_(domTree: Node): void;
      /**
       * Used to determine the css classes for the menu item for this category
       * based on its current state.
       * @param selected Indication whether the category is currently selected.
       * @return The css class names to be applied, space-separated.
       */
      getMenuItemClassName_(selected: boolean): string;
      /**
       * Set the colour of the category's background from a DOM node.
       * @param node DOM node with "colour" and "secondaryColour" attribute.
       *     Colours are a hex string or hue on a colour wheel (0-360).
       */
      setColour(node: Node): void;
      /**
       * Set the selected state of this category.
       * @param selected Whether this category is selected.
       */
      setSelected(selected: boolean): void;
    }

    export interface CategoryMenu {
      categories_: Category[];
      height_: number;
      parentHtml_: HTMLElement;
      parent_: Toolbox;
      table: HTMLElement;
      createDom(): void;
      populate(domTree: Node | null): void;
      dispose(): void;
      getHeight(): number;
    }

    export type IToolbox = import("blockly/core").IToolbox;
    export interface Toolbox extends IToolbox {
      HtmlDiv: HTMLDivElement;
      RTL: boolean;
      categoryMenu_: CategoryMenu;
      flyout_: Flyout;
      horizontalLayout_: boolean;
      iconic_: boolean;
      toolboxPosition: number;
      selectedItem_: Category;
      workspace_: WorkspaceSvg;
    }
  }

  export interface WorkspaceSvg extends WorkspaceSvg_ {
    getToolbox(): Toolbox.Toolbox;
    newBlock(prototypeName: string, opt_id?: string): BlockSvg;
  }

  const enum VariableType {
    Scalar = "",
    List = "list",
    Broadcast = "broadcast_msg",
  }

  export class VariableModel {
    workspace: Workspace;
    name: string;
    type: VariableType;
    id_: string;
    getId(): string;
    isLocal: boolean;
    isCloud: boolean;
  }

  export interface VariableModelConstructor {
    new (
      workspace: Workspace,
      name: string,
      type?: VariableType,
      id?: string,
      isLocal?: boolean,
      isCloud?: boolean
    ): VariableModel;
    compareByName(var1: VariableModel, var2: VariableModel): number;
  }

  export class VariableMap {
    variableMap_: Record<string, VariableModel>;
    workspace: Workspace;
    clear(): void;
    renameVariable(variable: VariableModel, newName: string): void;
    renameVariableById(id: string, newName: string): void;
    renameVariableAndUses_(variable: VariableModel, newName: string, uses: Block[]): void;
    renameVariableWithConflict_(
      variable: VariableModel,
      newName: string,
      conflictingVariable: VariableModel,
      uses: Block[]
    ): void;
    createVariable(name: string, type?: VariableType, id?: string, isLocal?: boolean, isCloud?: boolean): VariableModel;
    deleteVariable(variable: VariableModel): void;
    deleteVariableById(id: string): void;
    deleteVariableInternal_(variable: VariableModel, uses: Block[]): void;
    getVariable(name: string, type?: VariableType): VariableModel | null;
    getVariableById(id: string): VariableModel | null;
    getVariablesOfType(type: VariableType): VariableModel[];
    getVariableTypes(): VariableType[];
    getAllVariables(): VariableModel[];
    getVariableUsesById(id: string): Block[];
  }

  interface Utils {
    /**
     * To allow ADVANCED_OPTIMIZATIONS, combining variable.name and variable['name']
     * is not possible. To access the exported Blockly.Msg.Something it needs to be
     * accessed through the exact name that was exported. Note, that all the exports
     * are happening as the last thing in the generated js files, so they won't be
     * accessible before JavaScript loads!
     * @return The message array.
     * @private
     */
    getMessageArray_(): { [key: string]: string };

    /**
     * Remove an attribute from a element even if it's in IE 10.
     * Similar to Element.removeAttribute() but it works on SVG elements in IE 10.
     * Sets the attribute to null in IE 10, which treats removeAttribute as a no-op
     * if it's called on an SVG element.
     * @param element DOM element to remove attribute from.
     * @param attributeName Name of attribute to remove.
     */
    removeAttribute(element: Element, attributeName: string): void;

    /**
     * Add a CSS class to a element.
     * Similar to Closure's goog.dom.classes.add, except it handles SVG elements.
     * @param element DOM element to add class to.
     * @param className Name of class to add.
     * @return True if class was added, false if already present.
     */
    addClass(element: Element, className: string): boolean;

    /**
     * Remove a CSS class from a element.
     * Similar to Closure's goog.dom.classes.remove, except it handles SVG elements.
     * @param element DOM element to remove class from.
     * @param className Name of class to remove.
     * @return True if class was removed, false if never present.
     */
    removeClass(element: Element, className: string): boolean;

    /**
     * Checks if an element has the specified CSS class.
     * Similar to Closure's goog.dom.classes.has, except it handles SVG elements.
     * @param element DOM element to check.
     * @param className Name of class to check.
     * @return True if class exists, false otherwise.
     * @package
     */
    hasClass(element: Element, className: string): boolean;

    /**
     * Don't do anything for this event, just halt propagation.
     * @param e An event.
     */
    noEvent(e: Event): void;

    /**
     * Is this event targeting a text input widget?
     * @param e An event.
     * @return True if text input.
     */
    isTargetInput(e: Event): boolean;

    /**
     * Return the coordinates of the top-left corner of this element relative to
     * its parent.  Only for SVG elements and children (e.g. rect, g, path).
     * @param element SVG element to find the coordinates of.
     * @return Object with .x and .y properties.
     */
    getRelativeXY(element: Element): { x: number; y: number };

    /**
     * Return the coordinates of the top-left corner of this element relative to
     * the div blockly was injected into.
     * @param element SVG element to find the coordinates of. If this is
     *     not a child of the div blockly was injected into, the behaviour is
     *     undefined.
     * @return Object with .x and .y properties.
     * @private
     */
    getInjectionDivXY_(element: Element): { x: number; y: number };

    /**
     * Return the scale of this element.
     * @param element The element to find the coordinates of.
     * @return number represending the scale applied to the element.
     * @private
     */
    getScale_(element: Element): number;

    /**
     * Helper method for creating SVG elements.
     * @param name Element's tag name.
     * @param attrs Dictionary of attribute names and values.
     * @param parent Optional parent on which to append the element.
     * @return Newly created SVG element.
     */
    createSvgElement(name: string, attrs: { [key: string]: string }, parent?: Element): SVGElement;

    /**
     * Is this event a right-click?
     * @param e Mouse event.
     * @return True if right-click.
     */
    isRightButton(e: MouseEvent): boolean;

    /**
     * Return the converted coordinates of the given mouse event.
     * The origin (0,0) is the top-left corner of the Blockly SVG.
     * @param e Mouse event.
     * @param svg SVG element.
     * @param matrix Inverted screen CTM to use.
     * @return Object with .x and .y properties.
     */
    mouseToSvg(e: MouseEvent, svg: Element, matrix?: SVGMatrix): SVGPoint;

    /**
     * Given an array of strings, return the length of the shortest one.
     * @param array Array of strings.
     * @return Length of shortest string.
     */
    shortestStringLength(array: string[]): number;

    /**
     * Given an array of strings, return the length of the common prefix.
     * Words may not be split.  Any space after a word is included in the length.
     * @param array Array of strings.
     * @param opt_shortest Length of shortest string.
     * @return Length of common prefix.
     */
    commonWordPrefix(array: string[], opt_shortest?: number): number;

    /**
     * Given an array of strings, return the length of the common suffix.
     * Words may not be split.  Any space after a word is included in the length.
     * @param array Array of strings.
     * @param opt_shortest Length of shortest string.
     * @return Length of common suffix.
     */
    commonWordSuffix(array: string[], opt_shortest?: number): number;

    /**
     * Parse a string with any number of interpolation tokens (%1, %2, ...).
     * It will also replace string table references (e.g., %{bky_my_msg} and
     * %{BKY_MY_MSG} will both be replaced with the value in
     * Blockly.Msg['MY_MSG']). Percentage sign characters '%' may be self-escaped
     * (e.g., '%%').
     * @param message Text which might contain string table references and
     *     interpolation tokens.
     * @return Array of strings and numbers.
     */
    tokenizeInterpolation(message: string): Array<string | number>;

    /**
     * Replaces string table references in a message, if the message is a string.
     * For example, "%{bky_my_msg}" and "%{BKY_MY_MSG}" will both be replaced with
     * the value in Blockly.Msg['MY_MSG'].
     * @param message Message, which may be a string that contains
     *                           string table references.
     * @return String with message references replaced.
     */
    replaceMessageReferences(message: any): string;

    /**
     * Validates that any %{BKY_...} references in the message refer to keys of
     * the Blockly.Msg string table.
     * @param message Text which might contain string table references.
     * @return True if all message references have matching values.
     *     Otherwise, false.
     */
    checkMessageReferences(message: string): boolean;

    /**
     * Internal implementation of the message reference and interpolation token
     * parsing used by tokenizeInterpolation() and replaceMessageReferences().
     * @param message Text which might contain string table references and
     *     interpolation tokens.
     * @param parseInterpolationTokens Option to parse numeric
     *     interpolation tokens (%1, %2, ...) when true.
     * @return Array of strings and numbers.
     * @private
     */
    tokenizeInterpolation_(message: string, parseInterpolationTokens: boolean): Array<string | number>;

    /**
     * Generate a unique ID.  This should be globally unique.
     * 87 characters ^ 20 length > 128 bits (better than a UUID).
     * @return A globally unique ID string.
     */
    genUid: {
      (): string;
      /**
       * Legal characters for the unique ID.  Should be all on a US keyboard.
       * No characters that conflict with XML or JSON.  Requests to remove additional
       * 'problematic' characters from this soup will be denied.  That's your failure
       * to properly escape in your own environment.  Issues #251, #625, #682, #1304.
       * @private
       */
      soup_: string;
    };

    /**
     * Wrap text to the specified width.
     * @param text Text to wrap.
     * @param limit Width to wrap each line.
     * @return Wrapped text.
     */
    wrap(text: string, limit: number): string;

    /**
     * Wrap single line of text to the specified width.
     * @param text Text to wrap.
     * @param limit Width to wrap each line.
     * @return Wrapped text.
     * @private
     */
    wrapLine_(text: string, limit: number): string;

    /**
     * Compute a score for how good the wrapping is.
     * @param words Array of each word.
     * @param wordBreaks Array of line breaks.
     * @param limit Width to wrap each line.
     * @return Larger the better.
     * @private
     */
    wrapScore_(words: string[], wordBreaks: boolean[], limit: number): number;

    /**
     * Mutate the array of line break locations until an optimal solution is found.
     * No line breaks are added or deleted, they are simply moved around.
     * @param words Array of each word.
     * @param wordBreaks Array of line breaks.
     * @param limit Width to wrap each line.
     * @return New array of optimal line breaks.
     * @private
     */
    wrapMutate_(words: string[], wordBreaks: boolean[], limit: number): boolean[];

    /**
     * Reassemble the array of words into text, with the specified line breaks.
     * @param words Array of each word.
     * @param wordBreaks Array of line breaks.
     * @return Plain text.
     * @private
     */
    wrapToText_(words: string[], wordBreaks: boolean[]): string;

    /**
     * Check if 3D transforms are supported by adding an element
     * and attempting to set the property.
     * @return true if 3D transforms are supported.
     */
    is3dSupported(): boolean;

    /**
     * Insert a node after a reference node.
     * Contrast with node.insertBefore function.
     * @param newNode New element to insert.
     * @param refNode Existing element to precede new node.
     * @package
     */
    insertAfter(newNode: Element, refNode: Element): void;

    /**
     * Calls a function after the page has loaded, possibly immediately.
     * @param fn Function to run.
     */
    runAfterPageLoad(fn: () => void): void;

    /**
     * Sets the CSS transform property on an element. This function sets the
     * non-vendor-prefixed and vendor-prefixed versions for backwards compatibility
     * with older browsers. See http://caniuse.com/#feat=transforms2d
     * @param node The node which the CSS transform should be applied.
     * @param transform The value of the CSS `transform` property.
     */
    setCssTransform(node: Element, transform: string): void;

    /**
     * Get the position of the current viewport in window coordinates.  This takes
     * scroll into account.
     * @return an object containing window width, height, and scroll
     *     position in window coordinates.
     * @package
     */
    getViewportBBox(): { right: number; bottom: number; top: number; left: number };

    /**
     * Fast prefix-checker.
     * Copied from Closure's goog.string.startsWith.
     * @param str The string to check.
     * @param prefix A string to look for at the start of `str`.
     * @return True if `str` begins with `prefix`.
     * @package
     */
    startsWith(str: string, prefix: string): boolean;

    /**
     * Converts degrees to radians.
     * Copied from Closure's goog.math.toRadians.
     * @param angleDegrees Angle in degrees.
     * @return Angle in radians.
     * @package
     */
    toRadians(angleDegrees: number): number;
  }

  interface ProceduresUtils {
    /**
     * Create XML to represent the (non-editable) name and arguments of a procedure
     * call block.
     * @this Block
     */
    callerMutationToDom(): Element;

    /**
     * Parse XML to restore the (non-editable) name and arguments of a procedure
     * call block.
     * @param xmlElement XML storage element.
     * @this Block
     */
    callerDomToMutation(xmlElement: Element): void;

    /**
     * Create XML to represent the (non-editable) name and arguments of a
     * procedures_prototype block or a procedures_declaration block.
     * @param opt_generateShadows Whether to include the generateshadows
     *     flag in the generated XML.  False if not provided.
     * @this Block
     */
    definitionMutationToDom(opt_generateShadows?: boolean): Element;

    /**
     * Parse XML to restore the (non-editable) name and arguments of a
     * procedures_prototype block or a procedures_declaration block.
     * @param xmlElement XML storage element.
     * @this Block
     */
    definitionDomToMutation(xmlElement: Element): void;

    /**
     * Returns the name of the procedure this block calls, or the empty string if
     * it has not yet been set.
     * @this Block
     */
    getProcCode(): string;

    /**
     * Update the block's structure and appearance to match the internally stored
     * mutation.
     * @private
     * @this Block
     */
    updateDisplay_(): void;

    /**
     * Disconnect old blocks from all value inputs on this block, but hold onto them
     * in case they can be reattached later.  Also save the shadow DOM if it exists.
     * @return An object mapping argument IDs to blocks and shadow DOMs.
     * @private
     * @this Block
     */
    disconnectOldBlocks_(): { [key: string]: { shadow: Element; block: Block } };

    /**
     * Remove all inputs on the block, including dummy inputs.
     * Assumes no input has shadow DOM set.
     * @private
     * @this Block
     */
    removeAllInputs_(): void;

    /**
     * Create all inputs specified by the new procCode, and populate them with
     * shadow blocks or reconnected old blocks as appropriate.
     * @param connectionMap An object mapping argument IDs to blocks and shadow DOMs.
     * @private
     * @this Block
     */
    createAllInputs_(connectionMap: { [key: string]: { shadow: Element; block: Block } }): void;

    /**
     * Delete all shadow blocks in the given map.
     * @param connectionMap An object mapping argument IDs to the blocks that were
     *     connected to those IDs at the beginning of the mutation.
     * @private
     * @this Block
     */
    deleteShadows_(connectionMap: { [key: string]: any }): void;

    /**
     * Add a label field with the given text to a procedures_call or
     * procedures_prototype block.
     * @param text The label text.
     * @private
     */
    addLabelField_(text: string): void;

    /**
     * Add a label editor with the given text to a procedures_declaration
     * block.  Editing the text in the label editor updates the text of the
     * corresponding label fields on function calls.
     * @param text The label text.
     * @private
     */
    addLabelEditor_(text: string): void;

    /**
     * Build a DOM node representing a shadow block of the given type.
     * @param type One of 's' (string) or 'n' (number).
     * @return The DOM node representing the new shadow block.
     * @private
     * @this Block
     */
    buildShadowDom_(type: string): Element;

    /**
     * Create a new shadow block and attach it to the given input.
     * @param input The value input to attach a block to.
     * @param argumentType One of 'b' (boolean), 's' (string) or 'n' (number).
     * @private
     * @this Block
     */
    attachShadow_(input: Input, argumentType: string): void;

    /**
     * Create a new argument reporter block.
     * @param argumentType One of 'b' (boolean), 's' (string) or 'n' (number).
     * @param displayName The name of the argument as provided by the user.
     * @return The newly created argument reporter block.
     * @private
     * @this Block
     */
    createArgumentReporter_(argumentType: string, displayName: string): BlockSvg;

    /**
     * Populate the argument by attaching the correct child block or shadow to the
     * given input.
     * @param type One of 'b' (boolean), 's' (string) or 'n' (number).
     * @param index The index of this argument into the argument id array.
     * @param connectionMap An object mapping argument IDs to blocks and shadow DOMs.
     * @param id The ID of the input to populate.
     * @param input The newly created input to populate.
     * @private
     * @this Block
     */
    populateArgumentOnCaller_(
      type: string,
      index: number,
      connectionMap: { [key: string]: { shadow: Element; block: Block } },
      id: string,
      input: Input
    ): void;

    /**
     * Populate the argument by attaching the correct argument reporter to the given
     * input.
     * @param type One of 'b' (boolean), 's' (string) or 'n' (number).
     * @param index The index of this argument into the argument ID and display name arrays.
     * @param connectionMap An object mapping argument IDs to blocks and shadow DOMs.
     * @param id The ID of the input to populate.
     * @param input The newly created input to populate.
     * @private
     * @this Block
     */
    populateArgumentOnPrototype_(
      type: string,
      index: number,
      connectionMap: { [key: string]: { shadow: Element; block: Block } },
      id: string,
      input: Input
    ): void;

    /**
     * Populate the argument by attaching the correct argument editor to the given
     * input.
     * @param type One of 'b' (boolean), 's' (string) or 'n' (number).
     * @param index The index of this argument into the argument id and display name arrays.
     * @param connectionMap An object mapping argument IDs to blocks and shadow DOMs.
     * @param id The ID of the input to populate.
     * @param input The newly created input to populate.
     * @private
     * @this Block
     */
    populateArgumentOnDeclaration_(
      type: string,
      index: number,
      connectionMap: { [key: string]: { shadow: Element; block: Block } },
      id: string,
      input: Input
    ): void;

    /**
     * Check whether the type of the old block corresponds to the given argument
     * type.
     * @param oldBlock The old block to check.
     * @param type The argument type. One of 'n', 'n', or 's'.
     * @return True if the type matches, false otherwise.
     */
    checkOldTypeMatches_(oldBlock: BlockSvg, type: string): boolean;

    /**
     * Create an argument editor.
     * An argument editor is a shadow block with a single text field, which is used
     * to set the display name of the argument.
     * @param argumentType One of 'b' (boolean), 's' (string) or 'n' (number).
     * @param displayName The display name of this argument.
     * @return The newly created argument editor block.
     * @private
     * @this Block
     */
    createArgumentEditor_(argumentType: string, displayName: string): BlockSvg;

    /**
     * Update the serializable information on the block based on the existing inputs
     * and their text.
     */
    updateDeclarationProcCode_(): void;

    /**
     * Focus on the last argument editor or label editor on the block.
     * @private
     */
    focusLastEditor_(): void;

    /**
     * Externally-visible function to add a label to the procedure declaration.
     * @public
     */
    addLabelExternal(): void;

    /**
     * Externally-visible function to add a boolean argument to the procedure
     * declaration.
     * @public
     */
    addBooleanExternal(): void;

    /**
     * Externally-visible function to add a string/number argument to the procedure
     * declaration.
     * @public
     */
    addStringNumberExternal(): void;

    /**
     * Externally-visible function to get the warp on procedure declaration.
     * @return The value of the warp_ property.
     * @public
     */
    getWarp(): boolean;

    /**
     * Externally-visible function to set the warp on procedure declaration.
     * @param warp The value of the warp_ property.
     * @public
     */
    setWarp(warp: boolean): void;

    /**
     * Callback to remove a field, only for the declaration block.
     * @param field The field being removed.
     * @public
     */
    removeFieldCallback(field: Field): void;

    /**
     * Callback to pass removeField up to the declaration block from arguments.
     * @param field The field being removed.
     * @public
     */
    removeArgumentCallback_(field: Field): void;

    /**
     * Update argument reporter field values after an edit to the prototype mutation
     * using previous argument ids and names.
     * @param prevArgIds The previous ordering of argument ids.
     * @param prevDisplayNames The previous argument names.
     * @this Block
     */
    updateArgumentReporterNames_(prevArgIds: string[], prevDisplayNames: string[]): void;
  }

  interface BlockDefinition {
    [key: string]: (this: BlockSvg, ...args: any[]) => any;
    init(this: BlockSvg): void;
  }

  interface MenuOption {
    enabled: boolean;
    text: string;
    callback(): void;
  }

  interface VerticalExtensions {
    /**
     * Extension to set the colours of a text field, which are all the same.
     */
    COLOUR_TEXTFIELD(): void;
    /**
     * Extension to make represent a boolean reporter in Scratch-Blocks.
     * That means the block has inline inputs, a round output shape, and a 'Boolean'
     * output type.
     * @this {Block}
     * @readonly
     */
    OUTPUT_BOOLEAN(): void;
    /**
     * Extension to make represent a number reporter in Scratch-Blocks.
     * That means the block has inline inputs, a round output shape, and a 'Number'
     * output type.
     * @this {Block}
     * @readonly
     */
    OUTPUT_NUMBER(): void;
    /**
     * Extension to make represent a string reporter in Scratch-Blocks.
     * That means the block has inline inputs, a round output shape, and a 'String'
     * output type.
     * @this {Block}
     * @readonly
     */
    OUTPUT_STRING(): void;
    /**
     * Mixin to add a context menu for a procedure call block.
     * It adds the "edit" option and the "define" option.
     * @mixin
     * @augments Block
     * @package
     * @readonly
     */
    PROCEDURE_CALL_CONTEXTMENU: {
      /**
       * Add the "edit" option to the context menu.
       * @todo Add "go to definition" option once implemented.
       * @param {!Array.<!Object>} menuOptions List of menu options to edit.
       * @this Block
       */
      customContextMenu(menuOptions: MenuOption[]): void;
    };
    /**
     * Mixin to add a context menu for a procedure definition block.
     * It adds the "edit" option and removes the "duplicate" option.
     * @mixin
     * @augments Block
     * @package
     * @readonly
     */
    PROCEDURE_DEF_CONTEXTMENU: {
      /**
       * Add the "edit" option and removes the "duplicate" option from the context
       * menu.
       * @param menuOptions List of menu options to edit.
       * @this Block
       */
      customContextMenu(menuOptions: MenuOption[]): void;
    };
    SCRATCH_EXTENSION(): void;
    /**
     * Extension to make a block be shaped as an end block, regardless of its
     * inputs.  That means the block should have a previous connection and have
     * inline inputs, but have no next connection.
     * @this {Block}
     * @readonly
     */
    SHAPE_END(): void;
    /**
     * Extension to make a block be shaped as a hat block, regardless of its
     * inputs.  That means the block should have a next connection and have inline
     * inputs, but have no previous connection.
     * @this {Block}
     * @readonly
     */
    SHAPE_HAT(): void;
    /**
     * Extension to make a block fit into a stack of statements, regardless of its
     * inputs.  That means the block should have a previous connection and a next
     * connection and have inline inputs.
     * @this {Block}
     * @readonly
     */
    SHAPE_STATEMENT(): void;
    /**
     * Helper function that generates an extension based on a category name.
     * The generated function will set primary, secondary, tertiary, and quaternary
     * colours based on the category name.
     * @param category The name of the category to set colours for.
     * @return An extension function that sets colours based on the given
     *     category.
     */
    colourHelper(category: string): any;
    /**
     * Register all extensions for scratch-blocks.
     * @package
     */
    registerAll(): void;
  }

  export interface Blockly {
    Workspace: {
      new (opt_options?: { RTL?: boolean; horizontalLayout?: boolean; toolboxPosition?: number }): Workspace;
      SCAN_ANGLE: number;
      WorkspaceDB_: Record<string, Workspace>;
      getById(id: string): Workspace | null;
    };
    WorkspaceSvg: WorkspaceSvg;
    utils: Utils;
    Blocks: Record<string, BlockDefinition> & { defaultToolbox: string };
    Field: Field;
    ScratchBlocks: {
      VerticalExtensions: VerticalExtensions;
      ProcedureUtils: ProceduresUtils;
    };
    Categories: {
      control: "control";
      data: "data";
      dataLists: "data-lists";
      event: "events";
      looks: "looks";
      more: "more";
      motion: "motion";
      operators: "operators";
      pen: "pen";
      sensing: "sensing";
      sound: "sounds";
    };
    BlockSvg: BlockSvg;
    Input: Input;
    NEXT_STATEMENT: number;
    PROCEDURES_DEFINITION_BLOCK_TYPE: string;
    INPUT_VALUE: number;
    OUTPUT_SHAPE_ROUND: number;
    Xml: Xml;
    Connection: Connection;
    inject(container: Element | string, options: BlocklyOptions): WorkspaceSvg;
    FieldTextInputRemovable: new (...args: any[]) => Field;
    Block: new (workspace: Workspace, prototypeName?: string, opt_id?: string) => Block;
    [key: string]: any;
  }

  interface BlocklyGlobal {
    
    getMainWorkspace(): Workspace | null;
  }
}

declare const Blockly: ScratchBlocks.BlocklyGlobal | undefined;
