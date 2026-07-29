"use strict";

/*
 * Glyph shapes filled with a gradient.
 *
 * Visible in source as the clip-to-text idiom, and worth catching precisely because it
 * makes contrast unmeasurable: text with no single foreground colour has no ratio, so every
 * other colour check on the page steps around it.
 */

const GRADIENT = /(linear|radial|conic)-gradient\s*\(/i;

module.exports = {
  rule: "web:gradient-text",
  tier: "T1",
  inputs: ["styles"],
  summary: "reports rules that clip a gradient background to the text box or paint the glyphs transparent over one",
  run(ctx) {
    const results = [];
    for (const style of ctx.styles) {
      for (const block of style.blocks) {
        const gradient = block.declarations.find(
          (declaration) => /^background(-image)?$/.test(declaration.prop) && GRADIENT.test(declaration.value)
        );
        if (!gradient) continue;
        const clipped = block.declarations.some(
          (declaration) => /^(-webkit-)?background-clip$/.test(declaration.prop) && /\btext\b/i.test(declaration.value)
        );
        const transparent = block.declarations.some(
          (declaration) =>
            /^(color|-webkit-text-fill-color)$/.test(declaration.prop) && /^\s*transparent\s*$/i.test(declaration.value)
        );
        if (!clipped && !transparent) continue;
        results.push({
          verdict: "VIOLATION",
          path: style.path,
          line: gradient.line,
          violation: `${block.selector} fills its glyphs with a gradient, so the text has no single foreground colour`,
          remedy: "give the type one foreground colour and put the gradient where it carries no reading"
        });
      }
    }
    return results;
  }
};
