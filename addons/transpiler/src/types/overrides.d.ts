interface BlockExecuteCache {
  _blockFunction: (args: Record<string, unknown>, util: ScratchVM.BlockUtility) => unknown;
  opcode: string;
  [sym: symbol]: unknown;
}

declare namespace ScratchVM {
  interface StackFrame {
    returnValue: unknown;
  }

  interface Thread {
    [sym: symbol]: unknown;
  }

  interface Blocks {
    _cache: {
      procedureDefinitions: Record<string, string | null>;
      _functionParamNames?: Record<string, [string[], string[], string[]] | null>;
      _executeCached?: Record<string | symbol, BlockExecuteCache>;
    };

    _getCustomBlockInternal(block: Block): (Block & { mutation: { proccode: string } }) | undefined;
  }
}
