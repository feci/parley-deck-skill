"use strict";

/*
 * The registry is the contract between the doctrine and this checker, so these tests hold
 * the reader to the grammar the registry itself freezes — including the parts that are
 * supposed to fail loudly.
 */

const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  CheckError,
  loadRegistry,
  parseRegistryFile,
  parseYamlSubset,
  resolveRegistryPath
} = require("../lib/registry.js");

const ADDON_ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(__dirname, "fixtures", "registry");
const installed = resolveRegistryPath({ addonRoot: ADDON_ROOT, cwd: ADDON_ROOT });

test("the installed registry resolves without being told where it is", () => {
  assert.ok(installed.path, `no registry found; searched ${installed.tried.join(", ")}`);
  assert.equal(path.basename(installed.path), "RULES.md");
});

test("the installed registry parses, warning-free, with unique ids", () => {
  const registry = loadRegistry(installed.path);
  assert.ok(registry.rules.size > 0, "the registry declares no rules");
  assert.deepEqual(registry.warnings, [], "the registry uses keys the grammar does not define");
  const ids = [...registry.rules.keys()];
  assert.equal(new Set(ids).size, ids.length, "ids are not unique");
  for (const rule of registry.rules.values()) {
    assert.match(rule.id, /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/);
    assert.ok(["quality", "slop", "system"].includes(rule.class));
    assert.ok(["T0", "T1", "T2", "T3"].includes(rule.tier));
    assert.ok(["check", "agent-judgement", "both"].includes(rule.enforcedBy));
    assert.ok(Number.isInteger(rule.severity) && rule.severity >= 0 && rule.severity <= 4);
  }
});

test("every id the registry's surface table names has a record, and every surface record is in the table", () => {
  const registry = loadRegistry(installed.path);
  assert.deepEqual(
    registry.missingRecords,
    [],
    "the registry names surface rule ids for which no annex carries a record"
  );
  const surfaced = [...registry.rules.values()].filter((rule) => rule.surface !== "core");
  assert.ok(surfaced.length > 0, "no surface rules were loaded from an annex");
  for (const rule of surfaced) {
    assert.ok(
      registry.declaredIds.has(rule.id),
      `${rule.id} has a record in ${path.basename(rule.file)} and is missing from the registry's table`
    );
  }
});

test("the digest is the first twelve hex characters of sha256 over the registry file", () => {
  const registry = loadRegistry(installed.path);
  const expected = crypto.createHash("sha256").update(fs.readFileSync(installed.path)).digest("hex").slice(0, 12);
  assert.equal(registry.digest, expected);
  assert.match(registry.digest, /^[0-9a-f]{12}$/);
});

test("a fence that is not directly under a rule heading is not part of the registry", () => {
  const file = path.join(FIXTURES, "mini-registry.md");
  const parsed = parseRegistryFile(fs.readFileSync(file, "utf8"), file);
  assert.deepEqual(
    parsed.rules.map((rule) => rule.id),
    ["core:example-plain", "core:example-full"]
  );
  assert.deepEqual(parsed.warnings, [], "an x- prefixed key must be ignored in silence");
  const full = parsed.rules[1];
  assert.equal(full.systemBlind, true);
  assert.deepEqual(full.sources, ["WCAG-2.2-SC-1.4.3"]);
});

test("a duplicate id aborts the load and names both sites", () => {
  assert.throws(
    () => loadRegistry(path.join(FIXTURES, "duplicate-ids.md")),
    (error) =>
      error instanceof CheckError &&
      /duplicate rule id core:example-plain/.test(error.message) &&
      /duplicate-ids\.md:\d+ and .*duplicate-ids\.md:\d+/.test(error.message)
  );
});

test("a rule heading with no record is a grammar error, not an empty rule", () => {
  const file = path.join(FIXTURES, "heading-without-record.md");
  assert.throws(
    () => parseRegistryFile(fs.readFileSync(file, "utf8"), file),
    /is not followed by a pds-rule block/
  );
});

test("a record outside the flat subset raises rather than being guessed at", () => {
  const file = path.join(FIXTURES, "nested-map-in-record.md");
  assert.throws(
    () => parseRegistryFile(fs.readFileSync(file, "utf8"), file),
    /accepts scalars and flat lists only/
  );
});

test("the yaml subset reads what the artifacts use and refuses the rest", () => {
  const parsed = parseYamlSubset(
    [
      "spec: PDS/1.0",
      "positions: {density: dense, structure: flat}",
      "axes: {density: [sparse, dense]}",
      'named-rules: ["**The Alignment Rule.** Hierarchy is carried by alignment, never by shadow."]',
      "states: [rest, hover]",
      "entries:",
      "  - {rule-id: core:example, scope: panel.css}",
      "severity: 4",
      "system-blind: true"
    ].join("\n"),
    "test"
  );
  assert.deepEqual(parsed.positions, { density: "dense", structure: "flat" });
  assert.deepEqual(parsed.axes, { density: ["sparse", "dense"] });
  assert.equal(parsed["named-rules"].length, 1);
  assert.match(parsed["named-rules"][0], /^\*\*The Alignment Rule\.\*\*/);
  assert.deepEqual(parsed.states, ["rest", "hover"]);
  assert.deepEqual(parsed.entries, [{ "rule-id": "core:example", scope: "panel.css" }]);
  assert.equal(parsed.severity, 4);
  assert.equal(parsed["system-blind"], true);

  assert.throws(() => parseYamlSubset("key: value\n  stray: line", "test"), /unexpected indentation/);
  assert.throws(() => parseYamlSubset("key value", "test"), /not a key\/value line/);
  assert.throws(() => parseYamlSubset("key: a\nkey: b", "test"), /duplicate key/);
  assert.throws(() => parseYamlSubset("key: [a, b", "test"), /list is not closed|unbalanced/);
  assert.throws(() => parseYamlSubset("key:", "test"), /has no value/);

  // PDS §2 rule 5 stops at a flow collection holding flow collections holding scalars, and
  // never uses a tab. The parser accepts the subset the spec publishes and not one construct
  // more: a parser that reads further makes the published examples stop being the contract.
  assert.deepEqual(parseYamlSubset("gates:\n  - {id: G1, at: [round-01, round-02]}", "test").gates, [
    { id: "G1", at: ["round-01", "round-02"] }
  ]);
  assert.throws(() => parseYamlSubset("key: {a: {b: [c]}}", "test"), /nesting deeper than the canonical/);
  assert.throws(() => parseYamlSubset("key:\tvalue", "test"), /a tab/);
  assert.throws(() => parseYamlSubset("key:\n\t- item", "test"), /a tab/);
});

test("an explicit registry path that does not exist is not silently replaced by another", () => {
  const missing = path.join(FIXTURES, "no-such-registry.md");
  const resolution = resolveRegistryPath({ explicit: missing, addonRoot: ADDON_ROOT, cwd: ADDON_ROOT });
  assert.equal(resolution.path, null, "a missing explicit registry must not fall back to the installed one");
});
