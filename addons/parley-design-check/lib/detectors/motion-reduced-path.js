"use strict";

/*
 * Motion the interface starts on its own, with no declared reduced-motion path.
 *
 * A transition waits for the user; an animation does not, so animation is what this reads.
 * A reduced-motion block that suppresses motion for every element satisfies the whole file;
 * one that names selectors satisfies only those, and the rest are NEEDS_REVIEW rather than
 * a pass, because whether the named selector covers the moving element is a cascade
 * question and the cascade is above this tier.
 */

const { selectorBase } = require("../css.js");

const REDUCED = /prefers-reduced-motion\s*:\s*reduce|prefers-reduced-motion\s*\)/i;
const UNIVERSAL = /(^|,)\s*\*(\s|,|$)/;

module.exports = {
  rule: "core:motion-without-reduced-path",
  tier: "T1",
  inputs: ["styles"],
  summary: "reports animation declarations that no prefers-reduced-motion block accounts for",
  run(ctx) {
    const results = [];
    for (const style of ctx.styles) {
      const reducedBlocks = style.blocks.filter((block) =>
        block.atRules.some((at) => at.name === "media" && REDUCED.test(at.prelude))
      );
      const coversEverything = reducedBlocks.some((block) => UNIVERSAL.test(block.selector));
      const covered = new Set();
      for (const block of reducedBlocks) {
        for (const selector of block.selectors) covered.add(selectorBase(selector));
      }
      for (const block of style.blocks) {
        const insideReduced = block.atRules.some((at) => at.name === "media" && REDUCED.test(at.prelude));
        if (insideReduced) continue;
        const insideKeyframes = block.atRules.some((at) => at.name === "keyframes");
        if (insideKeyframes) continue;
        for (const declaration of block.declarations) {
          if (declaration.prop !== "animation" && declaration.prop !== "animation-name") continue;
          if (/^\s*none\s*$/i.test(declaration.value)) continue;
          if (coversEverything) continue;
          const bases = block.selectors.map(selectorBase);
          const named = bases.some((base) => covered.has(base));
          if (reducedBlocks.length === 0) {
            results.push({
              verdict: "VIOLATION",
              path: style.path,
              line: declaration.line,
              violation: `${block.selector} animates with no reduced-motion path anywhere in the file`,
              remedy: "declare the reduced path beside the motion: a real alternative for a user who asked for less movement, not a shorter version of the same movement"
            });
          } else if (!named) {
            results.push({
              verdict: "NEEDS_REVIEW",
              path: style.path,
              line: declaration.line,
              violation: `${block.selector} animates and the file's reduced-motion block names other selectors`,
              remedy: "name this element in the reduced-motion block, or confirm the existing rule reaches it"
            });
          }
        }
      }
    }
    return results;
  }
};
