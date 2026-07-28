"use strict";

/*
 * A direction's Signature must be a decision, and a decision closes something.
 *
 * The mechanical proxy for the registry's negation test: a Signature that names no refusal
 * and no cost cannot be violated, so nothing in the artifact would have to change if it
 * were negated. A Signature built only from mood words is reported outright; one that is
 * merely silent about what it gives up is NEEDS_REVIEW, because that judgement is a
 * reader's, not a parser's.
 */

const REFUSAL = /\b(never|no|not|nothing|none|without|refus\w*|forbid\w*|only|instead of|rather than|at the cost of|in exchange for|gives up|drops)\b/i;
const MOOD = new Set([
  "approachable", "beautiful", "bold", "calm", "clean", "confident", "cool", "crisp",
  "delightful", "elegant", "engaging", "fresh", "friendly", "fun", "human", "inviting",
  "minimal", "minimalist", "modern", "playful", "polished", "premium", "professional",
  "refined", "serious", "simple", "sleek", "smooth", "sophisticated", "stylish",
  "timeless", "trustworthy", "vibrant", "warm", "welcoming"
]);
const FILLER = new Set(["a", "an", "and", "but", "or", "the", "with", "yet", "very", "quite", "is", "it", "feels", "feel", "looks", "look", "design", "aesthetic", "style", "tone"]);

function isMoodOnly(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  const content = words.filter((word) => !FILLER.has(word));
  if (content.length === 0) return true;
  return content.every((word) => MOOD.has(word));
}

module.exports = {
  rule: "core:signature-absent-or-mood",
  tier: "T0",
  inputs: ["artifacts"],
  summary: "checks every DIRECTION for a Signature that names a refusal or a cost rather than a mood",
  run(ctx) {
    const directions = ctx.artifacts.filter((artifact) => artifact.kind === "DIRECTION");
    if (directions.length === 0) {
      return [
        {
          verdict: "UNJUDGEABLE",
          violation: "no DIRECTION artifact among the inputs",
          remedy: "pass the round's direction artifacts to judge their Signatures"
        }
      ];
    }
    const results = [];
    for (const direction of directions) {
      const raw = direction.data.signature;
      const signature = typeof raw === "string" ? raw.trim() : "";
      if (signature === "") {
        results.push({
          verdict: "VIOLATION",
          path: direction.path,
          line: 0,
          violation: "the direction declares no Signature",
          remedy: "state one decision that can be violated, and name what it gives up"
        });
        continue;
      }
      if (isMoodOnly(signature)) {
        results.push({
          verdict: "VIOLATION",
          path: direction.path,
          line: 0,
          violation: `the Signature is a mood and cannot be violated: "${signature}"`,
          remedy: "rewrite it as a commitment with a cost, so at least one otherwise attractive option is closed"
        });
        continue;
      }
      if (!REFUSAL.test(signature)) {
        results.push({
          verdict: "NEEDS_REVIEW",
          path: direction.path,
          line: 0,
          violation: `the Signature names nothing it refuses: "${signature}"`,
          remedy: "negate it and record what in the direction would have to change; if the answer is nothing, rewrite it"
        });
      }
    }
    return results;
  }
};
