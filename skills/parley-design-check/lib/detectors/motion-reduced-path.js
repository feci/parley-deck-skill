"use strict";

/*
 * Motion the interface starts on its own, with no declared reduced-motion path.
 *
 * A transition waits for the user; an animation does not, so animation is what this reads.
 * A reduced-motion block counts as a path only when its declarations actually remove or
 * materially neutralise the motion: the selector being inside the query is not evidence,
 * because a block that recolours something under `prefers-reduced-motion` leaves every
 * moving element moving. A neutralising block that suppresses motion for every element
 * satisfies the whole file; one that names selectors satisfies only those, and the rest
 * are NEEDS_REVIEW rather than a pass, because whether the named selector covers the
 * moving element is a cascade question and the cascade is above this tier.
 */

const { selectorBase } = require("../css.js");

const REDUCED = /prefers-reduced-motion\s*:\s*reduce|prefers-reduced-motion\s*\)/i;
const UNIVERSAL = /(^|,)\s*\*(\s|,|$)/;
// Anything at or under this is a state change rather than a movement a reader can follow.
const INSTANT_SECONDS = 0.05;

function withoutImportant(value) {
  return value.replace(/\s*!important\s*$/i, "").trim();
}

function seconds(value) {
  const match = /^([\d.]+)(ms|s)$/i.exec(withoutImportant(value));
  if (!match) return null;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return null;
  return match[2].toLowerCase() === "ms" ? amount / 1000 : amount;
}

/** Does this declaration remove the motion, rather than merely change something else? */
function neutralises(declaration) {
  const value = withoutImportant(declaration.value);
  if (declaration.prop === "animation" || declaration.prop === "animation-name") {
    return /^none$/i.test(value) || /(^|\s)none(\s|$)/i.test(value);
  }
  if (declaration.prop === "animation-duration") {
    const length = seconds(value);
    return length !== null && length <= INSTANT_SECONDS;
  }
  if (declaration.prop === "animation-play-state") return /^paused$/i.test(value);
  return false;
}

function removesMotion(block) {
  return block.declarations.some(neutralises);
}

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
      // Only the blocks that take the motion away are a path; the others are decoration
      // inside a query, which is the shape this rule exists to catch.
      const neutralising = reducedBlocks.filter(removesMotion);
      const coversEverything = neutralising.some((block) => UNIVERSAL.test(block.selector));
      const covered = new Set();
      for (const block of neutralising) {
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
          if (neutralising.length === 0) {
            const decorative = reducedBlocks.length > 0;
            results.push({
              verdict: "VIOLATION",
              path: style.path,
              line: declaration.line,
              violation: decorative
                ? `${block.selector} animates and the file's prefers-reduced-motion block changes other properties without removing the motion`
                : `${block.selector} animates with no reduced-motion path anywhere in the file`,
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
