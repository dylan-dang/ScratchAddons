export const Signature = /** @type {const} */ ({
  FUNCTION: "__function ",
  ATOMIC: "__atomic ",
  STACK: "__stack__",
  INLINE: "__inline",
});

export const FunctionBlockType = /** @type {const} */ ({
  DEFINITION: "function_definition",
  PROTOTYPE: "function_prototype",
  CALL: "function_call",
  DECLARATION: "function_declaration",
  RETURN: "function_return",
});
