"use strict";

/*
 * Proof-shaped claims in a design artifact that carry no provenance.
 *
 * The checker cannot know what the requester supplied, so it decides the one thing it can:
 * whether the claim says where it came from. A claim with a provenance marker beside it is
 * left alone; a bare number is reported. Lines that cite a rule id are quotations inside a
 * critique, not claims, and fenced blocks are examples rather than surfaces.
 */

const { eachLine } = require("../css.js");

const CLAIMS = [
  {
    name: "a proportion presented as a result",
    test: /\b\d{1,3}(?:[.,]\d+)?\s*%\s*(?:\w+\s+){0,2}(?:uptime|faster|slower|increase|growth|conversion|accuracy|savings|reduction|retention|fewer|more|less)\b/i
  },
  { name: "an audience size", test: /\b(?:trusted|used|loved|chosen|backed)\s+by\s+[\d,.]+\s*[kKmM]?\+?/i },
  {
    name: "a customer count",
    test: /\b[\d][\d,.]*\s*[kKmM]?\+\s*(?:customers|users|teams|companies|developers|downloads|installs|reviews|stars)\b/i
  },
  { name: "a rating", test: /\b[0-5](?:[.,]\d)?\s*(?:\/|\s+out\s+of\s+)\s*5\b/i },
  { name: "a press or award claim", test: /\b(?:as\s+seen\s+(?:in|on)|featured\s+in|award[-\s]winning|winner\s+of|iso\s?\d{4,5}|soc\s?2)\b/i },
  { name: "a benchmark result", test: /\b\d+(?:[.,]\d+)?\s*(?:x|times)\s+(?:faster|cheaper|smaller|higher|better)\b/i }
];

const PROVENANCE = /(source|sources|provided|provided-by|evidence|measured|measured-by|citation|inferred)\s*[:=]|\[(?:unfilled|provided|inferred|no\s+data)\]|\bn\/a\b/i;
const RULE_CITATION = /\b[a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]+\b/;

module.exports = {
  rule: "core:fabricated-evidence",
  tier: "T0",
  inputs: ["artifacts"],
  summary: "reads design artifacts for proof-shaped claims that carry no provenance marker on the same line",
  run(ctx) {
    const results = [];
    for (const artifact of ctx.artifacts) {
      eachLine(
        artifact.text,
        (content, line) => {
          if (PROVENANCE.test(content)) return;
          if (RULE_CITATION.test(content)) return;
          for (const claim of CLAIMS) {
            if (!claim.test.test(content)) continue;
            results.push({
              verdict: "VIOLATION",
              path: artifact.path,
              line,
              violation: `states ${claim.name} the artifact does not source: ${content.trim().slice(0, 90)}`,
              remedy: "render the slot as a named unfilled field until the requester supplies a value, or cite the source beside it"
            });
            break;
          }
        },
        { skipFences: true }
      );
    }
    return results;
  }
};
