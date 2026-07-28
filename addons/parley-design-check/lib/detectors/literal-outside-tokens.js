"use strict";

/*
 * A value the contract governs, written into source instead of resolved through a token.
 *
 * Custom-property declarations are the token layer and are not read here: a literal is only
 * a literal where it bypasses the layer. The governed set is deliberately narrow — colour,
 * the spacing family, type size and radius — because a rule that fires on every hairline
 * border teaches a reader to stop reading it.
 */

const COLOUR_PROPS = /^(color|background|background-color|border(-(top|right|bottom|left))?-color|outline-color|fill|stroke|caret-color|text-decoration-color|box-shadow|accent-color)$/;
const SPACE_PROPS = /^(margin|padding)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap|inset)$/;
const SIZE_PROPS = /^(font-size|border-radius|border(-(top|bottom))?-(left|right)-radius)$/;

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/;
const NAMED_COLOURS = /\b(white|black|red|blue|green|yellow|orange|purple|pink|gray|grey|silver|navy|teal|olive|maroon|lime|aqua|fuchsia|gold|beige|ivory|coral|salmon|khaki|indigo|violet|crimson|tomato|slategray|slategrey)\b/i;
const LENGTH_LITERAL = /(^|[\s(,+*/-])\d*\.?\d+(px|rem|em|pt|ch|ex|vh|vw|vmin|vmax)\b/;
const NEUTRAL = /^(0|0px|auto|none|inherit|initial|unset|revert|currentcolor|transparent|100%|fit-content|max-content|min-content)$/i;

function governed(prop) {
  if (COLOUR_PROPS.test(prop)) return "colour";
  if (SPACE_PROPS.test(prop)) return "spacing";
  if (SIZE_PROPS.test(prop)) return "size";
  return null;
}

function literalIn(kind, value) {
  if (NEUTRAL.test(value.trim())) return null;
  if (kind === "colour") {
    const match = COLOUR_LITERAL.exec(value) || NAMED_COLOURS.exec(value);
    return match ? match[0].trim() : null;
  }
  const match = LENGTH_LITERAL.exec(value);
  return match ? match[0].trim().replace(/^[\s(,+*/-]+/, "") : null;
}

module.exports = {
  rule: "core:literal-outside-token-layer",
  tier: "T1",
  inputs: ["styles"],
  summary: "reports colour, spacing, type-size and radius values written as literals rather than resolved through a token",
  run(ctx) {
    const results = [];
    for (const style of ctx.styles) {
      for (const block of style.blocks) {
        for (const declaration of block.declarations) {
          if (declaration.prop.startsWith("--")) continue;
          const kind = governed(declaration.prop);
          if (!kind) continue;
          const literal = literalIn(kind, declaration.value);
          if (!literal) continue;
          results.push({
            verdict: "VIOLATION",
            path: style.path,
            line: declaration.line,
            violation: `${block.selector} sets ${declaration.prop} to the ${kind} literal ${literal}`,
            remedy: "reference an existing token, or add the step to the contract and reference that; a literal leaves no trace for any other check to read"
          });
        }
      }
    }
    return results;
  }
};
