/**
 * Template literal helper for Blockly XML.
 * Available to all transforms via import from editor/xml.js
 *
 * @param {ScratchBlocks.Blockly} Blockly
 * @returns {{ xml: (strings: TemplateStringsArray, ...values: any[]) => Node }}
 */
export function createXmlParser(Blockly) {
  /**
   * Convert template strings to DOM.
   * @param {TemplateStringsArray} strings
   * @param {...any} values
   * @returns {Node}
   */
  function xml(strings, ...values) {
    const interpolated = strings
      .map((str, i) => {
        const value = values[i];
        if (value === undefined || value === null) return str;
        if (typeof value === "object") return `${str}${JSON.stringify(value)}`;
        if (typeof value === "function") return `${str}${value.toString()}`;
        return `${str}${value}`;
      })
      .join("")
      .trim();
    return Blockly.Xml.textToDom(interpolated);
  }
  return { xml };
}
