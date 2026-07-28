"use strict";

/*
 * A token the contract declares that nothing references.
 *
 * A token referenced by another token counts as used, so a primitive behind a semantic
 * alias is not reported. A token held on purpose says so in its own record, under the
 * extension key, which is the difference between a reserved decision and an abandoned one.
 */

const { aliasTarget, toCssVar } = require("../artifacts.js");
const { declarationVarUses, markupVarUses } = require("../css.js");

const EXTENSION = "org.parley.pds";

module.exports = {
  rule: "core:token-declared-unused",
  tier: "T1",
  inputs: ["tokens", "styles"],
  summary: "reports declared tokens that no source file and no other token references",
  run(ctx) {
    const used = new Set();
    // A reference site is a declaration value in a stylesheet and a line in markup: the same
    // reading `core:token-used-undeclared` makes, so a token cannot be undeclared to one rule
    // and used to the other.
    for (const source of ctx.styles) {
      for (const use of declarationVarUses(source.blocks)) used.add(use.name);
    }
    for (const source of ctx.markup) {
      for (const use of markupVarUses(source.text)) used.add(use.name);
    }
    for (const token of ctx.tokenIndex.values()) {
      const target = aliasTarget(token.value);
      if (target) used.add(toCssVar(target));
    }
    const results = [];
    for (const token of [...ctx.tokenIndex.values()].sort((a, b) => a.path.localeCompare(b.path))) {
      if (used.has(token.cssVar)) continue;
      const extension = token.extensions[EXTENSION];
      if (extension && extension.reserved === true) continue;
      results.push({
        verdict: "VIOLATION",
        path: token.file,
        line: token.line,
        violation: `${token.path} is declared and referenced by nothing (${token.cssVar})`,
        remedy: `delete it, or record it in the contract as reserved with the reason it is held ($extensions["${EXTENSION}"].reserved)`
      });
    }
    return results;
  }
};
