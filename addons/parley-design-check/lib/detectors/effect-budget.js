"use strict";

/*
 * Distinct decorative devices in one surface, against the declared budget.
 *
 * The checker treats one style file as one surface and counts device kinds rather than
 * occurrences: a shadow used twelve times is one device, twelve devices used once each are
 * twelve. The budget comes from the contract; absent one, the registry's default applies.
 */

const DEVICES = [
  { kind: "gradient", test: (declaration) => /(linear|radial|conic)-gradient\s*\(/i.test(declaration.value) },
  {
    kind: "shadow",
    test: (declaration) =>
      (declaration.prop === "box-shadow" || declaration.prop === "text-shadow" || /drop-shadow\s*\(/i.test(declaration.value)) &&
      !/^\s*none\s*$/i.test(declaration.value)
  },
  {
    kind: "blur",
    test: (declaration) => declaration.prop === "backdrop-filter" || /\bblur\s*\(/i.test(declaration.value)
  },
  {
    kind: "texture",
    test: (declaration) =>
      (declaration.prop === "background-image" || declaration.prop === "background") &&
      (/url\s*\(/i.test(declaration.value) || /repeating-/i.test(declaration.value))
  },
  {
    kind: "idle motion",
    test: (declaration) => (declaration.prop === "animation" || declaration.prop === "animation-iteration-count") && /\binfinite\b/i.test(declaration.value)
  },
  { kind: "hover transform", test: (declaration, block) => declaration.prop === "transform" && /:hover\b/.test(block.selector) },
  { kind: "chromatic border", test: (declaration) => /^border(-(top|right|bottom|left))?$/.test(declaration.prop) && /\b([3-9]|[1-9]\d+)px\b/i.test(declaration.value) }
];

const DEFAULT_BUDGET = 3;

module.exports = {
  rule: "core:effect-budget-exceeded",
  tier: "T1",
  inputs: ["styles"],
  summary: "counts distinct decorative device kinds per style file against the contract's per-surface budget",
  run(ctx) {
    const declared = ctx.contract ? ctx.contract.data["effect-budget"] : null;
    const budget =
      declared && typeof declared === "object" && Number.isInteger(declared.surface) ? declared.surface : DEFAULT_BUDGET;
    const results = [];
    for (const style of ctx.styles) {
      const found = new Map();
      for (const block of style.blocks) {
        for (const declaration of block.declarations) {
          if (declaration.prop.startsWith("--")) continue;
          for (const device of DEVICES) {
            if (!device.test(declaration, block)) continue;
            if (!found.has(device.kind)) found.set(device.kind, declaration.line);
          }
        }
      }
      if (found.size <= budget) continue;
      const kinds = [...found.keys()].sort();
      results.push({
        verdict: "VIOLATION",
        path: style.path,
        line: Math.min(...found.values()),
        violation: `carries ${found.size} device kinds against a budget of ${budget}: ${kinds.join(", ")}`,
        remedy: "cut to the budget before adding anything and record what was cut, or raise the budget once in the contract with a reason"
      });
    }
    return results;
  }
};
