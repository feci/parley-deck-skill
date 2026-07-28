"use strict";

/*
 * Focus indication that was removed, or that arrives late.
 *
 * Two shapes are visible in source: an outline switched off with nothing put in its place,
 * and an indicator that transitions in. A user tabbing at speed outruns an animated
 * indicator and loses their place, which is the failure the indicator exists to prevent.
 *
 * The replacement is looked for across the whole stylesheet rather than inside the block
 * that removed the outline, because `button { outline: none }` beside
 * `button:focus-visible { outline: 2px solid }` is the conforming idiom, not a defect. Where
 * a focus rule supplies an indicator for some other selector the result is NEEDS_REVIEW:
 * whether it reaches this element is a cascade question, and the cascade is above this tier.
 */

const { selectorBase } = require("../css.js");

const INDICATOR = new Set(["outline", "outline-color", "outline-width", "outline-style", "outline-offset", "box-shadow"]);
const REPLACEMENT = new Set(["box-shadow", "border", "border-color", "border-width", "border-bottom", "outline", "outline-width", "outline-color", "background-color", "text-decoration"]);
const FOCUS = /:focus(-visible|-within)?\b/;

function transitionProperties(declaration) {
  if (declaration.prop === "transition-property") {
    return declaration.value.split(",").map((part) => part.trim().toLowerCase());
  }
  if (declaration.prop === "transition") {
    return declaration.value.split(",").map((part) => part.trim().split(/\s+/)[0].toLowerCase());
  }
  return [];
}

function declaresIndicator(declaration) {
  if (!REPLACEMENT.has(declaration.prop)) return false;
  if (removesOutline(declaration)) return false;
  return !/^\s*(none|0(px)?)\s*$/i.test(declaration.value);
}

function removesOutline(declaration) {
  if (declaration.prop === "outline") return /^\s*(none|0(px)?)\s*$/i.test(declaration.value);
  if (declaration.prop === "outline-style") return /^\s*none\s*$/i.test(declaration.value);
  if (declaration.prop === "outline-width") return /^\s*0(px|rem|em)?\s*$/i.test(declaration.value);
  return false;
}

module.exports = {
  rule: "core:focus-indication",
  tier: "T1",
  inputs: ["styles"],
  summary: "reports outlines removed without a replacement, and focus indication that transitions or animates in",
  run(ctx) {
    const results = [];
    for (const style of ctx.styles) {
      const transitionsByBase = new Map();
      for (const block of style.blocks) {
        const props = block.declarations.flatMap(transitionProperties);
        if (props.length === 0) continue;
        for (const selector of block.selectors) {
          const base = selectorBase(selector);
          if (!transitionsByBase.has(base)) transitionsByBase.set(base, new Set());
          for (const prop of props) transitionsByBase.get(base).add(prop);
        }
      }
      // Every element for which some focus rule in this file declares a real indicator.
      const indicatedBases = new Set();
      for (const block of style.blocks) {
        if (!block.selectors.some((selector) => FOCUS.test(selector))) continue;
        if (!block.declarations.some(declaresIndicator)) continue;
        for (const selector of block.selectors) {
          if (FOCUS.test(selector)) indicatedBases.add(selectorBase(selector));
        }
      }
      for (const block of style.blocks) {
        const removal = block.declarations.find(removesOutline);
        if (removal) {
          const replaced = block.declarations.some(declaresIndicator);
          const bases = block.selectors.map(selectorBase);
          const elsewhere = bases.filter((base) => indicatedBases.has(base));
          if (!replaced && elsewhere.length === 0) {
            results.push({
              verdict: indicatedBases.size > 0 ? "NEEDS_REVIEW" : "VIOLATION",
              path: style.path,
              line: removal.line,
              violation:
                indicatedBases.size > 0
                  ? `${block.selector} removes the outline and the file's focus indication is declared for other selectors`
                  : `${block.selector} removes the outline and no focus rule in the file declares a replacement indicator`,
              remedy: "keep the outline, or declare a visible indicator in a focus rule for the same element that cannot be obscured by anything drawn over it"
            });
          }
        }
        const isFocus = block.selectors.some((selector) => FOCUS.test(selector));
        if (!isFocus) continue;
        const indicators = block.declarations.filter((declaration) => INDICATOR.has(declaration.prop));
        if (indicators.length === 0) continue;
        const ownTransitions = new Set(block.declarations.flatMap(transitionProperties));
        const animated = block.declarations.some(
          (declaration) => (declaration.prop === "animation" || declaration.prop === "animation-name") && !/^\s*none\s*$/i.test(declaration.value)
        );
        const bases = block.selectors.map(selectorBase);
        const inherited = new Set();
        for (const base of bases) {
          for (const prop of transitionsByBase.get(base) || []) inherited.add(prop);
        }
        for (const indicator of indicators) {
          const timed = ownTransitions.has("all") || ownTransitions.has(indicator.prop) || inherited.has("all") || inherited.has(indicator.prop);
          if (!timed && !animated) continue;
          results.push({
            verdict: "VIOLATION",
            path: style.path,
            line: indicator.line,
            violation: `${block.selector} gives the focus indicator (${indicator.prop}) a transition or an animation`,
            remedy: "let focus indication appear in the same frame focus moves; exclude it from the element's transition list"
          });
        }
      }
    }
    return results;
  }
};
