"use strict";

/*
 * The three default-motion shapes that are visible without a layout engine: a transition
 * declared across every property, motion applied to properties that force layout, and
 * easing that overshoots its end value.
 *
 * Overshoot is read off the curve itself — a cubic-bezier whose control points leave the
 * unit range on the output axis passes its end value and comes back, which on an interface
 * control reads as the control disagreeing with the user.
 */

const LAYOUT_PROPS = new Set([
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "top", "right", "bottom", "left", "inset", "margin", "margin-top", "margin-right",
  "margin-bottom", "margin-left", "padding", "padding-top", "padding-right",
  "padding-bottom", "padding-left", "font-size", "line-height", "flex-basis", "gap"
]);

function transitionProperties(declaration) {
  if (declaration.prop === "transition-property") {
    return declaration.value.split(",").map((part) => part.trim().toLowerCase());
  }
  if (declaration.prop === "transition") {
    return declaration.value.split(",").map((part) => part.trim().split(/\s+/)[0].toLowerCase());
  }
  return [];
}

function overshoots(value) {
  for (const match of value.matchAll(/cubic-bezier\s*\(([^)]*)\)/gi)) {
    const numbers = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (numbers.length !== 4 || numbers.some((number) => !Number.isFinite(number))) continue;
    if (numbers[1] < 0 || numbers[1] > 1 || numbers[3] < 0 || numbers[3] > 1) return match[0];
  }
  return null;
}

module.exports = {
  rule: "web:motion-defaults",
  tier: "T1",
  inputs: ["styles"],
  summary: "reports blanket transitions, motion on layout-affecting properties, and overshooting easing",
  run(ctx) {
    const results = [];
    for (const style of ctx.styles) {
      for (const block of style.blocks) {
        for (const declaration of block.declarations) {
          const props = transitionProperties(declaration);
          if (props.includes("all")) {
            results.push({
              verdict: "VIOLATION",
              path: style.path,
              line: declaration.line,
              violation: `${block.selector} transitions every property`,
              remedy: "name the properties that transition, so an unrelated change does not inherit a duration nobody chose"
            });
          }
          const layout = props.filter((prop) => LAYOUT_PROPS.has(prop));
          if (layout.length > 0) {
            results.push({
              verdict: "VIOLATION",
              path: style.path,
              line: declaration.line,
              violation: `${block.selector} animates ${layout.join(", ")}, which forces layout on every frame`,
              remedy: "animate only properties that do not affect layout, and reach the same effect with a transform or an opacity"
            });
          }
          if (block.atRules.some((at) => at.name === "keyframes")) {
            if (LAYOUT_PROPS.has(declaration.prop)) {
              results.push({
                verdict: "VIOLATION",
                path: style.path,
                line: declaration.line,
                violation: `a keyframe changes ${declaration.prop}, which forces layout on every frame`,
                remedy: "move the keyframe onto a transform or an opacity"
              });
            }
          }
          const curve = overshoots(declaration.value);
          if (curve) {
            results.push({
              verdict: "VIOLATION",
              path: style.path,
              line: declaration.line,
              violation: `${block.selector} eases with ${curve}, which passes its end value and returns`,
              remedy: "reserve overshoot for something meant to feel physical; an interface control should stop where the user put it"
            });
          }
        }
      }
    }
    return results;
  }
};
