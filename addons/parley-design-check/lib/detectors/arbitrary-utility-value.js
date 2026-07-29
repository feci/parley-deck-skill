"use strict";

/*
 * A literal value written inline through a utility framework's bracket syntax.
 *
 * The same defect as a literal in a stylesheet, wearing a class attribute, and it evades a
 * token check because it looks like system usage. A bracket that references a custom
 * property is the token layer doing its job and is left alone.
 */

const { classAttributes } = require("../css.js");

const ARBITRARY = /(^|[\s:])([a-z][a-z0-9-]*)-\[([^\]]+)\]/g;
// `VAR(--x)` resolves through the token layer exactly as `var(--x)` does (§3.3).
const THROUGH_TOKEN = /^var\(\s*--/i;

module.exports = {
  rule: "web:arbitrary-utility-value",
  tier: "T1",
  inputs: ["markup"],
  summary: "reports utility classes carrying a bracketed literal instead of a scale step",
  run(ctx) {
    const results = [];
    for (const source of ctx.markup) {
      for (const attribute of classAttributes(source.text)) {
        for (const match of attribute.value.matchAll(ARBITRARY)) {
          const value = match[3].trim();
          if (THROUGH_TOKEN.test(value)) continue;
          results.push({
            verdict: "VIOLATION",
            path: source.path,
            line: attribute.line,
            violation: `the class ${match[2]}-[${value}] writes a literal the contract governs`,
            remedy: "use the scale step, or add one to the contract; the syntax is not the problem, the unratified value is"
          });
        }
      }
    }
    return results;
  }
};
