"use strict";

/*
 * A rounded container carrying one thick coloured edge.
 *
 * Source can see the shape — a single-side border, thick, on a rule that also rounds its
 * corners — but not whether the colour distinguishes anything, which is the part that
 * decides the rule. What source sees is enough to raise it; the anchor question belongs to
 * the reviewer, and the remedy says so.
 */

const { asWritten } = require("../css.js");

const SIDE_BORDER = /^border-(top|right|bottom|left)(-width)?$/;
const THICK = /(^|[^\d.])([3-9]|[1-9]\d+)(\.\d+)?px\b/;
const ABSENT = /^\s*(none|0(px)?|hidden)\s*$/i;

module.exports = {
  rule: "web:edge-stripe",
  tier: "T1",
  inputs: ["styles"],
  summary: "reports rounded containers whose only thick border is on one side",
  run(ctx) {
    const results = [];
    for (const style of ctx.styles) {
      for (const block of style.blocks) {
        const rounded = block.declarations.some(
          (declaration) => declaration.prop.startsWith("border") && declaration.prop.includes("radius") && !/^\s*0(px)?\s*$/.test(declaration.value)
        );
        if (!rounded) continue;
        const allSides = block.declarations.some(
          (declaration) => (declaration.prop === "border" || declaration.prop === "border-width") && !ABSENT.test(declaration.value)
        );
        if (allSides) continue;
        const stripe = block.declarations.find(
          (declaration) => SIDE_BORDER.test(declaration.prop) && !ABSENT.test(declaration.value) && THICK.test(declaration.value)
        );
        if (!stripe) continue;
        results.push({
          verdict: "VIOLATION",
          path: style.path,
          line: stripe.line,
          violation: `${block.selector} rounds its corners and carries one thick edge (${stripe.prop})${asWritten(stripe)}`,
          remedy: "remove it, or make the edge carry a variable declared in the contract (a status, a category, an owner), so it distinguishes something"
        });
      }
    }
    return results;
  }
};
