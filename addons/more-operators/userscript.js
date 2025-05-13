/// <reference path="types/sb3.d.ts" />
/// <reference path="types/userscript.d.ts" />

/**
 * @typedef {Object} CustomBlock
 * @property {string} opcode
 * @property {Object} definition
 * @property {(inputs: any) => any} run
 * @property {(this: SerializeTransformer) => void} onSerialize
 * @property {(this: DeserializeTransformer) => void} onDeserialize
 * @property {(menu: ScratchBlocks.Toolbox.CategoryMenu, node: Element) => void} onPopulate
 */

/**
 * @typedef {Partial<Omit<Serialized.Block, 'inputs'>> & { inputs: Record<string, SerializedBlockSpecification | Serialized.Primitive>}} SerializedBlockSpecification
 */

class SerializeTransformer {
  /**
   * @param {Serialized.Target} target
   * @param {Userscript.Addon} addon
   * @param {ScratchBlocks.Blockly} blockly
   */
  constructor(target, addon, blockly) {
    this.addon = addon;
    this.target = target;
    this.blockly = blockly;
    this.blocks = target.blocks;
    /** @type {Set<string>} */
    this.movedRef = new Set();
  }

  /**
   * @param {string | undefined} blockId
   * @param {Partial<Serialized.Block>} newProps
   */
  modifyBlock(blockId, newProps) {
    if (!blockId || !Array.isArray(this.target.blocks[blockId])) return;
    this.target.blocks[blockId] = { ...this.target.blocks[blockId], ...newProps };
  }

  /**
   * @param {Serialized.Primitive | undefined} primitive
   * @param {Partial<Serialized.Block>} [newProps]
   * @returns {Serialized.Primitive | undefined}
   */
  moveOrCloneRef(primitive, newProps) {
    if (!primitive) return primitive;
    const [type] = primitive;
    if (type === 2 || type === 1) {
      const id = primitive[1];
      if (!id) return primitive;
      if (typeof id !== "string") return primitive;
      if (this.movedRef.has(id)) {
        this.modifyBlock(id, newProps);
        return primitive;
      }
      this.movedRef.add(id);
      // const newId = this.blockly.utils.genUid();
      // this.target.blocks[newId] = this.target.blocks[id];
      // if (newProps) this.modifyBlock(newId, newProps);
      // return [type, newId];
      const clonedId = this.cloneTree(id);
      this.modifyBlock(clonedId, newProps);
      return [type, clonedId];
    }
    if (type === 3) {
      console.warn(`type ${type} primitive encountered!: ${primitive}`);
    }
    return [...primitive];
  }

  /**
   * @param {string | null} blockId
   * @returns {string | null}
   */
  cloneTree(blockId) {
    if (!blockId) return blockId;
    const block = this.blocks[blockId];
    if (!block) return blockId;
    if (Array.isArray(block)) {
      // primitive
      return blockId;
    }
    /** @type {Serialized.Block} */
    const cloned = structuredClone(block);
    if (cloned.inputs) {
      for (const input of Object.values(cloned.inputs)) {
        const [type, arg] = input;
        if (type <= 3 && typeof arg === "string") {
          input[1] = this.cloneTree(arg);
        }
      }
    }

    const newId = this.blockly.utils.genUid();
    this.blocks[newId] = cloned;
    return newId;
  }

  /**
   * @param {SerializedBlockSpecification | Serialized.Primitive | null} inputOrSpec
   * @param {string} parent
   * @returns {Serialized.Primitive  | null}
   */
  buildBlockInput_(inputOrSpec, parent) {
    if (!inputOrSpec) return null;
    if (Array.isArray(inputOrSpec)) return this.moveOrCloneRef(inputOrSpec, { parent });
    const id = this.blockly.utils.genUid();
    const block = this.buildBlock({ ...inputOrSpec, parent });
    block.parent = parent;
    this.target.blocks[id] = block;
    return [2, id];
  }

  /**
   * @param {SerializedBlockSpecification} spec
   * @returns {Serialized.Block}
   */
  buildBlock(spec) {
    /** @type {Record<string, Serialized.Primitive>} */
    const inputs = {};
    if (spec.inputs) {
      for (const [arg, val] of Object.entries(spec.inputs)) {
        if (!val) continue;
        inputs[arg] = this.buildBlockInput_(val, spec.parent);
      }
    }
    return {
      opcode: spec.opcode,
      next: null,
      parent: null,
      shadow: false,
      topLevel: false,
      ...spec,
      inputs,
    };
  }
  /**
   * @param {string} blockId
   */
  getTopLevelParent(blockId) {
    const block = this.blocks[blockId];
    if (Array.isArray(block)) return null;
    if (!block.topLevel) this.getTopLevelParent(block.parent);
    return block;
  }

  /**
   * @param {Partial<Serialized.Comment>} [props]
   */
  addComment(props) {
    const id = this.blockly.utils.genUid();
    if (props.blockId) {
      const block = this.blocks[props.blockId];
      if (Array.isArray(block)) throw new Error("This shouldn't happen");
      if (block.comment) {
        delete this.target.comments[props.blockId];
      }
      block.comment = id;
    }
    this.target.comments[id] = {
      blockId: null,
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      text: "",
      minimized: true,
      ...props,
    };
  }
}

class DeserializeTransformer {
  /**
   * @param {ScratchVM.RenderedTarget} target
   * @param {Userscript.Addon} addon
   */
  constructor(target, addon) {
    this.target = target;
    this.addon = addon;
    this.blocks = this.target.blocks._blocks;
  }

  /**
   * @param {string} blockId
   */
  deleteTree(blockId) {
    if (!blockId) return;
    const block = this.blocks[blockId];
    for (const input of Object.values(block.inputs)) {
      this.deleteTree(input.block);
    }
    delete this.blocks[blockId];
  }
}

/** @param {Userscript.Utilities} utils */
export default async function ({ addon, console }) {
  const Blockly = await addon.tab.traps.getBlockly();

  /**
   * Scratch cast to boolean.
   * In Scratch 2.0, this is captured by `interp.boolArg.`
   * Treats some string values differently from JavaScript.
   * @param {*} value Value to cast to boolean.
   * @return {boolean} The Scratch-casted boolean value.
   */
  function castBool(value) {
    // Already a boolean?
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      // These specific strings are treated as false in Scratch.
      if (value === "" || value === "0" || value.toLowerCase() === "false") {
        return false;
      }
      // All other strings treated as true.
      return true;
    }
    // Coerce other values and numbers.
    return Boolean(value);
  }

  injectBlocks([
    {
      opcode: "operator_xor",
      definition: {
        message0: "%1 xor %2",
        args0: [
          {
            type: "input_value",
            name: "OPERAND1",
            check: "Boolean",
          },
          {
            type: "input_value",
            name: "OPERAND2",
            check: "Boolean",
          },
        ],
        category: Blockly.Categories.operators,
        extensions: ["colours_operators", "output_boolean"],
      },
      onPopulate(menu, node) {
        const contents = menu.categories_.find(({ id_ }) => id_ === "operators").contents_;
        const index = contents.findIndex((el) => el.getAttribute("type") === "operator_or") + 1;
        contents.splice(index, 0, node);
      },
      onSerialize() {
        if (!this.target.isStage) console.log("Serialized Sprite: ", this.target);
        const customBlocks = Object.entries(this.blocks).filter(
          ([, block]) => !Array.isArray(block) && block.opcode === "operator_xor"
        );
        for (const [id, block] of customBlocks) {
          if (Array.isArray(block)) continue;

          this.blocks[id] = this.buildBlock({
            ...block,
            __patch: "operator_xor",
            opcode: "operator_and",
            inputs: {
              OPERAND1: {
                opcode: "operator_or",
                inputs: {
                  OPERAND1: block.inputs.OPERAND1,
                  OPERAND2: block.inputs.OPERAND2,
                },
              },
              OPERAND2: {
                opcode: "operator_not",
                inputs: {
                  OPERAND: {
                    opcode: "operator_and",
                    inputs: {
                      OPERAND1: block.inputs.OPERAND1,
                      OPERAND2: block.inputs.OPERAND1,
                    },
                  },
                },
              },
            },
          });

          this.addComment({ blockId: id, text: "operator_xor" });
        }
      },
      onDeserialize() {
        for (const [id, block] of Object.entries(this.blocks)) {
          if (block.__patch === "operator_xor") {
            block.opcode = "operator_xor";
            const or = this.blocks[block.inputs.OPERAND1.block];
            const and = this.blocks[block.inputs.OPERAND2.block];
            block.inputs.OPERAND1.block = or.inputs.OPERAND1?.block;
            block.inputs.OPERAND2.block = or.inputs.OPERAND2?.block;
            if (or.inputs.OPERAND1?.block) this.blocks[block.inputs.OPERAND1.block].parent = id;
            if (or.inputs.OPERAND2?.block) this.blocks[block.inputs.OPERAND2.block].parent = id;
            delete this.blocks[or.id];
            if (and.inputs.OPERAND1?.block) delete this.blocks[and.inputs.OPERAND1.block];
            if (and.inputs.OPERAND2?.block) delete this.blocks[and.inputs.OPERAND2.block];
            delete this.blocks[and.id];
          }
        }
      },
      run({ OPERAND1, OPERAND2 }) {
        return castBool(OPERAND1) !== castBool(OPERAND2);
      },
    },
  ]);

  /**
   * @param {CustomBlock[]} blocks
   */
  function injectBlocks(blocks) {
    for (const block of blocks) {
      // create block definition
      Blockly.Blocks[block.opcode] = {
        init: function () {
          this.jsonInit(block.definition);
        },
      };

      // add execution function
      addon.tab.traps.vm.runtime._primitives[block.opcode] = block.run;
    }

    // add to toolbox when populating category menu
    const categoryMenu = addon.tab.traps.getWorkspace().getToolbox().categoryMenu_;
    const categoryMenuPrototype = Object.getPrototypeOf(categoryMenu);
    const populate = categoryMenuPrototype.populate;
    categoryMenuPrototype.populate = function (/** @type {any} */ ...args) {
      populate.apply(this, ...args);
      for (const block of blocks) {
        const elem = document.createElement("block");
        elem.setAttribute("type", block.opcode);
        block.onPopulate(categoryMenu, elem);
      }
    };

    // patch targets when first loading
    addon.tab.traps.vm.addListener("targetsUpdate", () => {
      const targets = addon.tab.traps.vm.runtime.targets;
      for (const target of targets) {
        if (target.__patched) continue;
        target.__patched = true;
        const transformer = new DeserializeTransformer(target, addon);
        for (const block of blocks) {
          block.onDeserialize.apply(transformer);
        }
      }
    });

    // polyfill custom blocks when saving project
    const vmPrototype = Object.getPrototypeOf(addon.tab.traps.vm);
    const toJSON = vmPrototype.toJSON;
    vmPrototype.toJSON = function (/** @type {any} */ ...args) {
      const json = toJSON.apply(this, ...args);

      /** @type {Serialized.Project | Serialized.Sprite} */
      const parsed = JSON.parse(json);

      const targets = "blocks" in parsed ? [parsed] : parsed.targets;
      for (const target of targets) {
        const transformer = new SerializeTransformer(target, addon, Blockly);
        for (const block of blocks) {
          block.onSerialize.apply(transformer);
        }
      }
      return JSON.stringify(parsed);
    };
  }
}
