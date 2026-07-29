"use strict";

/*
 * A typeface used in source that the contract's allowlist does not carry.
 *
 * Generic families are not faces and are ignored. How many faces a project allows, and in
 * what roles, is the contract's business; this only holds the build to what was declared,
 * including faces that arrive through a dependency's defaults.
 */

const { asWritten } = require("../css.js");

const GENERIC = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif",
  "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong", "inherit",
  "initial", "unset", "revert", "-apple-system", "blinkmacsystemfont"
]);

function families(value) {
  return value
    .split(",")
    .map((part) => part.trim().replace(/^["']|["']$/g, ""))
    .filter((part) => part !== "" && !part.startsWith("var("));
}

module.exports = {
  rule: "core:face-outside-allowlist",
  tier: "T1",
  inputs: ["styles"],
  summary: "compares every font-family named in source against the contract's faces allowlist",
  run(ctx) {
    // An allowlist entry is a name, or a name with the reason it was chosen over its
    // nearest alternative; both forms declare the same face.
    const allowed = ctx.contract && Array.isArray(ctx.contract.data.faces)
      ? ctx.contract.data.faces.map((face) =>
          String(face !== null && typeof face === "object" ? face.name ?? "" : face).toLowerCase()
        )
      : null;
    if (!allowed) {
      return [
        {
          verdict: "UNJUDGEABLE",
          path: ctx.contract ? ctx.contract.path : null,
          violation: "the contract declares no faces allowlist",
          remedy: "list the ratified faces and their roles in the contract, then this is decidable from source"
        }
      ];
    }
    const results = [];
    for (const style of ctx.styles) {
      for (const block of style.blocks) {
        // `@font-face` names the face it is defining, not one it is using. Reading it as a use
        // would report every project that self-hosts a ratified face against its own allowlist.
        if (block.atBlock && block.atBlock.name === "font-face") continue;
        for (const declaration of block.declarations) {
          if (declaration.prop !== "font-family") continue;
          for (const family of families(declaration.value)) {
            const key = family.toLowerCase();
            if (GENERIC.has(key) || allowed.includes(key)) continue;
            results.push({
              verdict: "VIOLATION",
              path: style.path,
              line: declaration.line,
              violation: `${block.selector} uses the unratified face "${family}"${asWritten(declaration)}`,
              remedy: "add the face to the contract's allowlist with its role, or remove it; a face arriving through a dependency is still unratified"
            });
          }
        }
      }
    }
    return results;
  }
};
