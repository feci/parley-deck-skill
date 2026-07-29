"use strict";

/*
 * One fixture that must fail and one that must pass, per detector, discovered from the
 * detector directory rather than listed here — so a detector added without fixtures fails
 * this file instead of shipping unexercised.
 *
 * The passing fixture is also held to a second condition: the rule must actually have been
 * judged. A rule that passed because nothing looked at it is the failure mode these tests
 * exist to prevent.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { loadRegistry, resolveRegistryPath, tierWord } = require("../lib/registry.js");
const { capabilityOf, loadDetectors, runCheck } = require("../lib/engine.js");

const ADDON_ROOT = path.resolve(__dirname, "..");
const DETECTORS_DIR = path.join(ADDON_ROOT, "lib", "detectors");
const FIXTURES = path.join(__dirname, "fixtures");
const registryPath = resolveRegistryPath({ addonRoot: ADDON_ROOT, cwd: ADDON_ROOT }).path;
const detectors = loadDetectors(DETECTORS_DIR);
const registry = loadRegistry(registryPath);

function check(target, options = {}) {
  return runCheck({
    paths: [target],
    addonRoot: ADDON_ROOT,
    detectorsDir: DETECTORS_DIR,
    cwd: ADDON_ROOT,
    ...options
  });
}

test("the capability summary is generated from the detector directory", () => {
  const files = fs.readdirSync(DETECTORS_DIR).filter((entry) => entry.endsWith(".js"));
  const capability = capabilityOf(detectors);
  assert.equal(capability.detectors.length, files.length);
  assert.deepEqual(
    capability.detectors.map((entry) => `${entry.detector}.js`).sort(),
    files.sort()
  );
  assert.deepEqual(capability.tiers, [tierWord("T0"), tierWord("T1")]);
});

test("every detector implements a rule the registry declares, at the tier the registry gives it", () => {
  for (const detector of detectors) {
    const rule = registry.rules.get(detector.rule);
    assert.ok(rule, `detector ${detector.name} implements ${detector.rule}, which the registry does not declare`);
    assert.equal(
      detector.tier,
      rule.tier,
      `detector ${detector.name} claims ${detector.tier} where the registry declares ${rule.tier}`
    );
    assert.notEqual(
      rule.enforcedBy,
      "agent-judgement",
      `detector ${detector.name} implements a rule the registry reserves for agent judgement`
    );
  }
});

test("every detector ships a fixture that must fail and one that must pass", () => {
  for (const detector of detectors) {
    for (const kind of ["fail", "pass"]) {
      const directory = path.join(FIXTURES, detector.name, kind);
      assert.ok(fs.existsSync(directory), `detector ${detector.name} has no ${kind} fixture at ${directory}`);
      assert.ok(fs.readdirSync(directory).length > 0, `${directory} is empty`);
    }
  }
});

for (const detector of detectors) {
  test(`${detector.name}: the failing fixture is reported`, () => {
    const report = check(path.join(FIXTURES, detector.name, "fail"));
    const raised = report["findings-detail"].filter((finding) => finding.rule === detector.rule);
    assert.ok(
      raised.length > 0,
      `${detector.rule} raised nothing on its failing fixture. Findings: ${JSON.stringify(report.findings, null, 2)}; unjudgeable: ${JSON.stringify(
        report.unjudgeable.filter((entry) => entry.rule === detector.rule)
      )}`
    );
    for (const finding of raised) {
      assert.ok(["VIOLATION", "NEEDS_REVIEW"].includes(finding.verdict));
      assert.ok(finding.violation.trim() !== "" && finding.remedy.trim() !== "");
    }
  });

  test(`${detector.name}: the passing fixture is judged and clean`, () => {
    const report = check(path.join(FIXTURES, detector.name, "pass"));
    const raised = report["findings-detail"].filter((finding) => finding.rule === detector.rule);
    assert.deepEqual(
      raised.map((finding) => finding.violation),
      [],
      `${detector.rule} raised a finding on its passing fixture`
    );
    const skipped = report.unjudgeable.find((entry) => entry.rule === detector.rule);
    assert.equal(
      skipped,
      undefined,
      `${detector.rule} passed by not being judged: ${skipped && skipped.violation}`
    );
  });
}

test("a rule the registry marks checkable, with no detector, is reported UNJUDGEABLE", () => {
  const report = check(path.join(FIXTURES, "literal-outside-tokens", "fail"));
  const implemented = new Set(detectors.map((detector) => detector.rule));
  const expected = [...registry.rules.values()].filter(
    (rule) =>
      (rule.surface === "core" || rule.surface === report.surface) &&
      rule.enforcedBy !== "agent-judgement" &&
      ["T0", "T1"].includes(rule.tier) &&
      !implemented.has(rule.id)
  );
  assert.ok(expected.length > 0, "the registry declares no undetected checkable rule, so this test proves nothing");
  for (const rule of expected) {
    const entry = report.unjudgeable.find((candidate) => candidate.rule === rule.id);
    assert.ok(entry, `${rule.id} has no detector and was not reported UNJUDGEABLE`);
    assert.match(entry.violation, /no detector implements this rule/);
  }
});

test("every rule above this checker's tiers is reported UNJUDGEABLE, never skipped", () => {
  const report = check(path.join(FIXTURES, "literal-outside-tokens", "fail"));
  const above = [...registry.rules.values()].filter(
    (rule) => (rule.surface === "core" || rule.surface === report.surface) && ["T2", "T3"].includes(rule.tier)
  );
  assert.ok(above.length > 0, "the registry declares no rule above T1 SOURCE, so this test proves nothing");
  for (const rule of above) {
    const entry = report.unjudgeable.find((candidate) => candidate.rule === rule.id);
    assert.ok(entry, `${rule.id} is above the checker's tiers and was not reported`);
    assert.match(entry.violation, /is above this checker/);
  }
});

test("a rule belonging to another surface is out of scope rather than passing", () => {
  const report = check(path.join(FIXTURES, "contrast-floor", "pass"));
  assert.equal(report.surface, "core");
  const web = [...registry.rules.values()].filter((rule) => rule.surface === "web");
  assert.ok(web.length > 0);
  for (const rule of web) {
    assert.ok(
      report["out-of-scope"].some((entry) => entry.startsWith(`${rule.id} —`)),
      `${rule.id} was neither reported out of scope nor judged`
    );
    assert.ok(!report.unjudgeable.some((entry) => entry.rule === rule.id));
  }
});

test("a system rule with no ratified contract is UNJUDGEABLE, not clean", () => {
  const report = check(path.join(FIXTURES, "interaction-states", "pass"));
  const systemRules = [...registry.rules.values()].filter(
    (rule) => rule.class === "system" && rule.surface !== "web" && ["T0", "T1"].includes(rule.tier)
  );
  assert.ok(systemRules.length > 0);
  for (const rule of systemRules) {
    const entry = report.unjudgeable.find((candidate) => candidate.rule === rule.id);
    assert.ok(entry, `${rule.id} was judged without a contract`);
  }
});
