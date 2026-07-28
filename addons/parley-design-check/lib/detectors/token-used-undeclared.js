"use strict";

/*
 * A reference to a token the contract does not declare.
 *
 * The value that ships is then whatever the runtime falls back to, so this is reported per
 * reference site rather than once per name: each site is a place where an unratified value
 * reaches a reader, and a fallback in the reference is a literal wearing a token's clothes.
 */

const { declarationVarUses, markupVarUses } = require("../css.js");

/*
 * A reference site is a declaration value in a stylesheet and a line in markup — never a
 * selector, a prelude or a comment, which resolve nothing and whose escaped text read as a
 * reference produced a finding against ordinary utility CSS.
 */
function references(source) {
  return source.blocks ? declarationVarUses(source.blocks) : markupVarUses(source.text);
}

module.exports = {
  rule: "core:token-used-undeclared",
  tier: "T1",
  inputs: ["tokens", "styles"],
  summary: "reports every var() reference with no matching declaration in the ratified token document",
  run(ctx) {
    const declared = new Set([...ctx.tokenIndex.values()].map((token) => token.cssVar));
    const results = [];
    for (const source of [...ctx.styles, ...ctx.markup]) {
      for (const use of references(source)) {
        if (declared.has(use.name)) continue;
        results.push({
          verdict: "VIOLATION",
          path: source.path,
          line: use.line,
          violation: `references ${use.name}, which the ratified token document does not declare`,
          remedy: "declare the token in the contract, or point the reference at an existing one; resolve it before claiming token integrity, because the value that ships is undefined"
        });
      }
    }
    return results;
  }
};
