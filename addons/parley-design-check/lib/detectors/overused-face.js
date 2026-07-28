"use strict";

/*
 * A primary face this surface's annex records as reached for unprompted.
 *
 * The names are read out of the annex that defines the rule, never carried here: the list
 * is an observation with a date on it, it will rot, and a copy inside a checker is how a
 * rotting list outlives the file that owns it. If the names cannot be extracted, this
 * reports UNJUDGEABLE rather than guessing.
 */

const fs = require("node:fs");
const { asWritten } = require("../css.js");

const SEPARATOR = "·";

/** Bands are the separated runs of names in the annex; a label in bold introduces each. */
function readBands(annexPath) {
  const text = fs.readFileSync(annexPath, "utf8");
  const paragraphs = text.split(/\n\s*\n/);
  const names = new Set();
  for (const paragraph of paragraphs) {
    if (!paragraph.includes(SEPARATOR)) continue;
    if (!/\*\*[^*]+\*\*/.test(paragraph)) continue;
    const body = paragraph.replace(/\*\*[^*]+\*\*/g, " ").replace(/\s+/g, " ");
    const items = body
      .split(SEPARATOR)
      .map((item) => item.trim().replace(/[.,;]+$/, "").trim())
      .filter((item) => /^[A-Za-z][A-Za-z0-9 ]{1,28}$/.test(item) && item.split(" ").length <= 3);
    if (items.length < 3) continue;
    for (const item of items) names.add(item.toLowerCase());
  }
  return names;
}

function primaryFamily(value) {
  const first = value.split(",")[0].trim().replace(/^["']|["']$/g, "");
  return first.startsWith("var(") ? null : first;
}

function recordedReason(contract, face) {
  if (!contract || !Array.isArray(contract.data.faces)) return false;
  return contract.data.faces.some((entry) => {
    if (entry === null || typeof entry !== "object") return false;
    const name = String(entry.name ?? "").toLowerCase();
    const why = entry.why ?? entry.reason;
    return name === face.toLowerCase() && typeof why === "string" && why.trim() !== "";
  });
}

module.exports = {
  rule: "web:overused-face",
  tier: "T1",
  inputs: ["styles"],
  summary: "matches each primary font-family against the face bands recorded in the surface annex",
  run(ctx) {
    let bands;
    try {
      bands = readBands(ctx.rule.file);
    } catch (error) {
      return [
        {
          verdict: "UNJUDGEABLE",
          path: ctx.rule.file,
          violation: `the annex that defines this rule could not be read: ${error.message}`,
          remedy: "restore the annex; this checker keeps no copy of the face bands"
        }
      ];
    }
    if (bands.size === 0) {
      return [
        {
          verdict: "UNJUDGEABLE",
          path: ctx.rule.file,
          violation: "no face bands could be extracted from the annex",
          remedy: "record the bands in the annex as separated runs of names under a bold label, or judge this rule by hand"
        }
      ];
    }
    const results = [];
    for (const style of ctx.styles) {
      for (const block of style.blocks) {
        for (const declaration of block.declarations) {
          if (declaration.prop !== "font-family") continue;
          const face = primaryFamily(declaration.value);
          if (!face || !bands.has(face.toLowerCase())) continue;
          if (recordedReason(ctx.contract, face)) continue;
          results.push({
            verdict: "VIOLATION",
            path: style.path,
            line: declaration.line,
            violation: `${block.selector} takes "${face}" as its primary face, which the annex records as an unprompted default${asWritten(declaration)}`,
            remedy: "record in the contract why this face and not its nearest alternative; the record satisfies the rule, the name does not"
          });
        }
      }
    }
    return results;
  }
};
