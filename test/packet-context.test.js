"use strict";

// Source-side instruction change for idea meta-protocol-change-evidence-first-efficiency (D4):
// the skill's standing context instructions and the packaged protocol's §9 item 1 must both
// require the shared renderer's launch attestation, keep full context as the default, keep the
// explicit full/fallback path, and never present the optimized packet as enabled.
//
// These tests read the SOURCE files in this repository. They say nothing about any installed
// skill copy or about the CLI's runner wiring, which are separate deliverables.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const SKILL = fs.readFileSync(path.join(PACKAGE_ROOT, "skills", "parley-deck", "SKILL.md"), "utf8");
const PACKAGED = fs.readFileSync(path.join(PACKAGE_ROOT, "skills", "parley-deck", "references", "COOPERATION.md"), "utf8");

const ATTESTATION_KEYS = ["context_mode", "source_sha256", "packet_sha256", "fallback_reason"];

function section(text, heading, nextHeadingPrefix) {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing heading ${heading}`);
  const rest = text.slice(start + heading.length);
  const end = rest.indexOf(`\n${nextHeadingPrefix}`);
  return end === -1 ? rest : rest.slice(0, end);
}

test("SKILL.md standing context instructions require the renderer attestation", () => {
  const ctx = section(SKILL, "## Required Protocol Context", "## ");
  assert.match(ctx, /parley protocol packet --phase N --track T --json/);
  for (const key of ATTESTATION_KEYS) {
    assert.ok(ctx.includes(`\`${key}\``), `attestation key ${key} is not named`);
  }
  assert.match(ctx, /live resolved authority/);
  assert.match(ctx, /never replaces a live file that exists/);
});

test("SKILL.md keeps full context as the default and the optimized packet explicit", () => {
  const ctx = section(SKILL, "## Required Protocol Context", "## ");
  assert.match(ctx, /default `context_mode` is `full`/);
  assert.match(ctx, /`--optimize` is the explicit experimental input/);
  assert.match(ctx, /never a default/);
  assert.doesNotMatch(SKILL, /--optimize` by default|default(s)? to `--optimize|packet mode is enabled/i);
});

test("SKILL.md preserves the explicit full/fallback path and refusal semantics", () => {
  const ctx = section(SKILL, "## Required Protocol Context", "## ");
  // Semantics, not article wording: the no-CLI path reads the live file in full and records
  // the fallback mode together with its reason.
  assert.match(ctx, /`context_mode=full-fallback` with (?:the|its) reason \(for example `no-parley-cli`\)/);
  assert.match(ctx, /read the live project file `parley-deck\/COOPERATION\.md` in full/);
  // The bundled snapshot is local orientation only; it cannot authorize a protocol task launch.
  assert.match(ctx, /reason `bundled-snapshot`/);
  assert.match(ctx, /LOCAL ORIENTATION ONLY/);
  assert.match(ctx, /cannot authorize a protocol task launch/);
  assert.match(ctx, /live authority cannot be established, that task stays blocked/);
  assert.match(ctx, /If both are unavailable, stop and ask for the protocol\./);
  // `refused` stays a stop and is never satisfied by substituting other protocol text,
  // while `full-fallback` stays the disclosed read of the live authority itself.
  assert.match(ctx, /`full-fallback` reads the live authority in full and proceeds/);
  assert.match(ctx, /`refused` \(unprovable authority, a detected secret\) is a \*\*stop\*\*/);
  assert.match(ctx, /never substitute another authority for it/);
  assert.match(ctx, /never continue that launch on unattested text/);
  // The manual hash comparison stays as the drift check for the bundled snapshot.
  assert.match(SKILL, /shasum -a 256 <project-root>\/parley-deck\/COOPERATION\.md <skill-root>\/references\/COOPERATION\.md/);
});

test("SKILL.md core rule and startup flow point at the attested context, not a bare read", () => {
  assert.match(SKILL, /Always load the protocol context first, the way "Required Protocol Context" says, and record its attestation\./);
  assert.match(SKILL, /1\. Load the protocol context as "Required Protocol Context" requires \(attestation recorded\)/);
});

test("packaged protocol §9 item 1 consumes the attestation and keeps the full-read fallback", () => {
  const nine = section(PACKAGED, "## 9. Session-start checklist for every agent", "## 1");
  const item = nine.split("\n").find((l) => l.startsWith("1. "));
  assert.ok(item, "§9 item 1 not found");
  assert.match(item, /shared renderer \(`parley protocol packet`\)/);
  for (const key of ATTESTATION_KEYS) {
    assert.ok(item.includes(`\`${key}\``), `§9 item 1 does not name ${key}`);
  }
  assert.match(item, /`full` is the default/);
  assert.match(item, /never a bundled snapshot/);
  // Semantics, not article wording ("the reason" vs "its reason"): the full-fallback path is a
  // visible result that reads the live authority in full and records the mode plus its reason.
  assert.match(item, /`full-fallback` is a valid, visible result/);
  assert.ok(item.includes("read all of `parley-deck/COOPERATION.md` — the live authority itself"));
  assert.match(item, /record `context_mode=full-fallback` with (?:the|its) reason/);
  // `refused` remains a stop; it is never downgraded into a full-fallback over substituted text.
  assert.match(item, /`refused` is a \*\*stop\*\*/);
  assert.match(item, /never permission to emit the refused content, to substitute some other authority for it/);
  assert.match(item, /a disclosed fallback to the live authority, never a substitute for it/);
  assert.match(item, /note the active `Transport:` and check `meta\/protocol-changelog\.md` for updates/);
  assert.match(item, /`meta\/packet-applicability\.yaml` is protocol/);
});

test("the packaged protocol keeps every ratified never-cut section", () => {
  for (const heading of [
    "### Non-solo execution requirement",
    "### 4.0 — Track selection (conditional rigor)",
    "### Escalation to user (any phase)",
    "## 6. Conflict-avoidance mechanics",
    "## 7. Changing this protocol",
    "## 14. Automated outer loop (loop engineering) — the human brake",
    "### 15.1 Scope, ownership, location",
    "### 15.4 Exemption-claim admissibility",
    "### 15.7 Per-track binding",
  ]) {
    assert.ok(PACKAGED.includes(`\n${heading}\n`), `missing ${heading}`);
  }
});
