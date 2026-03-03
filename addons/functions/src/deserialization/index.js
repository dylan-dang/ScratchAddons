/** @param {FunctionContext} context */
export function patchDeserialization(context) {
    const { vm } = context;
    const patchedTargets = new WeakSet();
    vm.addListener("targetsUpdate", () => {
        const targets = vm.runtime.targets;
        for (const target of targets) {
            if (patchedTargets.has(target)) continue;
            patchedTargets.add(target);

            /**
             * @param {ScratchVM.Block} block
             * @param {ScratchVM.Block} [replacement]
             */
            function detachBlock(block, replacement) {
                const parent = blocks.getBlock(block.parent);
                if (parent && parent.next === block.id) {
                    parent.next = replacement ? replacement.id : block.next;
                    for (const input of Object.values(parent.inputs)) {
                        if (input.block === block.id) {
                            input.block = replacement ? replacement.id : block.next;
                        }
                    }
                }
                const next = blocks.getBlock(block.next);
                if (next) {
                    next.parent = replacement ? replacement.id : block.parent;
                }
                if (replacement) {
                    replacement.parent = block.parent;
                    replacement.next = block.next;
                }
                block.parent = null;
                block.next = null;
            }

            const blocks = target.blocks;
            const oldForceNoGlow = blocks.forceNoGlow;
            // this disables blocks.emitProjectChanged
            blocks.forceNoGlow = true;

            /**
             * @param {ScratchVM.Block} block
             * @returns {ScratchVM.Block[]}
             */
            function getStackReferences(block) {
                if (block.opcode === "data_itemoflist" && block.fields.LIST.id === Signature.STACK) return [block];
                return Object.values(block.inputs).flatMap(({ block }) => getStackReferences(blocks.getBlock(block)));
            }
            /**
             * @param {string} blockId
             * @returns {ScratchVM.Block}
             */
            function foldCall(blockId) {
                const callStack = [];
                let curr = blocks.getBlock(blockId);
                let foldedStatement = null;
                do {
                    if (!curr) throw new Error("Unexpected end of atomic function call stack");
                    // order the stack references by descending index
                    const stackRefs = getStackReferences(curr).sort((...refs) => {
                        const [a, b] = refs.map(({ inputs }) =>
                            Number.parseInt(blocks.getBlock(inputs.INDEX.block).fields.NUM.value)
                        );
                        return b - a;
                    });
                    for (const stackRef of stackRefs) {
                        const correspondingCall = callStack.pop();
                        // this should only be the INDEX of the data_itemoflist block
                        for (const { block, shadow } of Object.values(stackRef.inputs)) {
                            blocks.deleteBlock(block);
                            blocks.deleteBlock(shadow);
                        }
                        stackRef.opcode = FunctionBlockType.CALL;
                        stackRef.fields = {};
                        stackRef.mutation = correspondingCall.mutation;
                        stackRef.mutation.proccode = stackRef.mutation.proccode.slice(Signature.FUNCTION.length);
                        stackRef.inputs = correspondingCall.inputs;
                        detachBlock(correspondingCall);
                        // just delete it directly since we move the inputs to this stack reference
                        delete blocks._blocks[correspondingCall.id];
                    }
                    if (stackRefs.length) {
                        foldedStatement = curr;
                        const deleter = blocks.getBlock(curr.next);
                        detachBlock(deleter);
                        blocks.deleteBlock(deleter.id);
                    }
                    if (curr.opcode === "procedures_call" && curr.mutation.proccode.startsWith(Signature.FUNCTION)) {
                        callStack.push(curr);
                    }
                    curr = blocks.getBlock(curr.next);
                } while (callStack.length);
                return foldedStatement;
            }

            for (const comment of Object.values(target.comments)) {
                if (comment.text === Signature.INLINE) {
                    const block = blocks.getBlock(comment.blockId);
                    if (!block) {
                        console.warn("Inline comment without block", comment);
                        continue;
                    }
                    delete target.comments[comment.id];
                    foldCall(block.id);
                }
            }

            // scripts is mutated during the loop, so we need to copy it
            const scripts = [...blocks.getScripts()];
            for (const script of scripts) {
                const topBlock = blocks.getBlock(script);
                if (topBlock.opcode === "procedures_definition") {
                    const prototype = blocks.getBlock(topBlock.inputs.custom_block.block);
                    if (!prototype || prototype.opcode !== "procedures_prototype") {
                        console.warn("Function definition without prototype", topBlock);
                        continue;
                    }

                    if (prototype.mutation.proccode.startsWith(Signature.FUNCTION)) {
                        topBlock.opcode = FunctionBlockType.DEFINITION;
                        prototype.opcode = FunctionBlockType.PROTOTYPE;
                        prototype.mutation.proccode = prototype.mutation.proccode.slice(Signature.FUNCTION.length);
                        let lastBlock = topBlock;
                        while (lastBlock.next) {
                            const nextBlock = blocks.getBlock(lastBlock.next);
                            if (!nextBlock) break;
                            lastBlock = nextBlock;
                        }
                        // remove the implicit return
                        if (
                            lastBlock.opcode === "data_insertatlist" &&
                            lastBlock.fields.LIST.id === Signature.STACK &&
                            blocks.getBlock(lastBlock.inputs.INDEX.block)?.fields.NUM.value === "1" &&
                            blocks.getBlock(lastBlock.inputs.ITEM.block)?.fields.TEXT.value === ""
                        ) {
                            detachBlock(lastBlock);
                            blocks.deleteBlock(lastBlock.id);
                        }
                    } else if (prototype.mutation.proccode.startsWith(Signature.ATOMIC)) {
                        const foldedStatement = foldCall(topBlock.next);
                        if (!foldedStatement) {
                            console.warn("Atomic definition without folded statement", topBlock);
                            continue;
                        }
                        detachBlock(foldedStatement);
                        // replace atomic calls with their folded statement definitions
                        for (const block of Object.values(blocks._blocks)) {
                            if (block.opcode === "procedures_call" && block.mutation.proccode === prototype.mutation.proccode) {
                                detachBlock(block, foldedStatement);
                            }
                        }
                        // delete atomic definition and __stack__ cleanup calls
                        blocks.deleteBlock(topBlock.id);
                    }
                }
            }

            for (const block of Object.values(blocks._blocks)) {
                if (block.opcode !== "data_insertatlist" || block.fields.LIST.id !== Signature.STACK) continue;
                if (blocks.getBlock(block.inputs.INDEX.block)?.fields.NUM.value !== "1") {
                    console.warn("Unexpected stack insertion block", block);
                    continue;
                }
                const nextBlock = blocks.getBlock(block.next);
                if (!nextBlock) continue;
                if (!nextBlock || nextBlock.opcode !== "control_stop" || nextBlock.fields.STOP_OPTION.value !== "this script") {
                    console.warn("Unexpected stack insertion block next", block, nextBlock);
                    continue;
                }
                detachBlock(nextBlock);
                blocks.deleteBlock(nextBlock.id);
                block.opcode = FunctionBlockType.RETURN;

                blocks.deleteBlock(block.inputs.INDEX.block);
                blocks.deleteBlock(block.inputs.INDEX.shadow);
                // biome-ignore lint/performance/noDelete: we want to delete the input
                delete block.inputs.INDEX;
                block.fields = {};
            }
            blocks.forceNoGlow = oldForceNoGlow;
        }
    });
}
