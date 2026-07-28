"use strict";

/*
 * Declared contrast floor, decided from the token graph alone.
 *
 * A pairing this checker cannot compute is NEEDS_REVIEW, never PASS: an uncomputable
 * pairing is the case where illegible text ships behind a clean report.
 */

const { contrastRatio, resolveValue, toSrgb } = require("../artifacts.js");

const EXTENSION = "org.parley.pds";
// WCAG 2.2 published minima. Large text and non-text indicators share the lower floor.
const FLOORS = { text: 4.5, "large-text": 3, "non-text": 3 };

function tokenPath(reference) {
  const text = String(reference).trim();
  const alias = /^\{(.+)\}$/.exec(text);
  return alias ? alias[1].trim() : text;
}

function side(ctx, reference, doc) {
  const wanted = tokenPath(reference);
  const resolved = resolveValue(ctx.tokenIndex, wanted);
  if (resolved.error) return { error: resolved.error };
  const srgb = toSrgb(resolved.value);
  if (srgb.error) return { error: `${wanted}: ${srgb.error}` };
  return { channels: srgb.channels, path: wanted, doc };
}

module.exports = {
  rule: "core:contrast-floor",
  tier: "T0",
  inputs: ["tokens"],
  summary:
    'computes every pairing declared under $extensions["org.parley.pds"].pairings against the published minimum for its kind',
  run(ctx) {
    const pairings = [];
    for (const doc of ctx.tokenDocs) {
      const extension = doc.extensions ? doc.extensions[EXTENSION] : null;
      if (!extension || !Array.isArray(extension.pairings)) continue;
      for (const pairing of extension.pairings) pairings.push({ pairing, doc });
    }
    if (pairings.length === 0) {
      return [
        {
          verdict: "UNJUDGEABLE",
          path: ctx.tokenDocs[0] ? ctx.tokenDocs[0].path : null,
          violation: "no token document declares which pairings are text-bearing",
          remedy: `declare them under $extensions["${EXTENSION}"].pairings as {text, on, kind} so the floor is decidable from the token graph`
        }
      ];
    }
    const results = [];
    for (const { pairing, doc } of pairings) {
      if (!pairing || typeof pairing !== "object" || !pairing.text || !pairing.on) {
        results.push({
          verdict: "VIOLATION",
          path: doc.path,
          line: 0,
          violation: "a declared pairing names no text token or no background token",
          remedy: "give every pairing a text token and an on token, or remove the entry"
        });
        continue;
      }
      const kind = pairing.kind ? String(pairing.kind) : "text";
      const floor = FLOORS[kind];
      if (floor === undefined) {
        results.push({
          verdict: "VIOLATION",
          path: doc.path,
          line: 0,
          violation: `pairing ${pairing.text} on ${pairing.on} declares the unknown kind "${kind}"`,
          remedy: `use one of ${Object.keys(FLOORS).join(", ")}`
        });
        continue;
      }
      const foreground = side(ctx, pairing.text, doc);
      const background = side(ctx, pairing.on, doc);
      const failure = foreground.error || background.error;
      if (failure) {
        results.push({
          verdict: "NEEDS_REVIEW",
          path: doc.path,
          line: 0,
          violation: `pairing ${pairing.text} on ${pairing.on} is not computable here: ${failure}`,
          remedy: "declare the pairing in a colour space this checker can compute, or judge it by hand and record the ratio"
        });
        continue;
      }
      const ratio = contrastRatio(foreground.channels, background.channels);
      if (ratio + 0.005 < floor) {
        results.push({
          verdict: "VIOLATION",
          path: doc.path,
          line: 0,
          violation: `${pairing.text} on ${pairing.on} computes to ${ratio.toFixed(2)}:1 against a ${floor}:1 floor for ${kind}`,
          remedy: "move the foreground until the pairing clears the floor, or stop declaring the pairing as text-bearing; this rule is system-blind, so widening the ramp is not a remedy"
        });
      }
    }
    return results;
  }
};
