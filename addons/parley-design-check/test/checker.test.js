"use strict";

/*
 * The behaviours FINAL.md requires of the checker itself: refusal without a registry,
 * exit codes that distinguish clean from findings from a failed run, a finding format that
 * stays diffable, waivers that cannot be widened, and conformance claims that are verified
 * rather than believed.
 */

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { runCheck } = require("../lib/engine.js");

const ADDON_ROOT = path.resolve(__dirname, "..");
const DETECTORS_DIR = path.join(ADDON_ROOT, "lib", "detectors");
const CLI = path.join(ADDON_ROOT, "bin", "check.js");
const FIXTURES = path.join(__dirname, "fixtures");

function check(target, options = {}) {
  return runCheck({
    paths: [].concat(target),
    addonRoot: ADDON_ROOT,
    detectorsDir: DETECTORS_DIR,
    cwd: ADDON_ROOT,
    ...options
  });
}

function cli(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd: ADDON_ROOT });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/* ------------------------------------------------------------- refusal */

test("with no registry the checker refuses rule checks and says so", () => {
  const report = check(path.join(FIXTURES, "literal-outside-tokens", "fail"), {
    registryPath: path.join(FIXTURES, "registry", "no-such-registry.md")
  });
  assert.equal(report.registry.status, "absent");
  assert.match(report.registry.refused, /refused/);
  assert.equal(report.exit, 3, "a refused run must not exit clean");
  assert.deepEqual(report.findings, [], "no rule finding can be raised without the registry");
  assert.equal(report.verdict, "UNJUDGEABLE");
});

test("the refusal is explicit on stderr and the exit code distinguishes it", () => {
  const result = cli([
    "--registry",
    path.join(FIXTURES, "registry", "no-such-registry.md"),
    path.join(FIXTURES, "literal-outside-tokens", "fail")
  ]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /rule checks were refused/);
  assert.match(result.stderr, /carries no copy/);
});

test("registry-independent structural checks still run when rule checks are refused", () => {
  const report = check(path.join(FIXTURES, "conformance", "collapsed-run"), {
    level: "L1",
    registryPath: path.join(FIXTURES, "registry", "no-such-registry.md")
  });
  assert.equal(report.registry.status, "absent");
  const required = report["findings-detail"].filter((finding) => finding.rule === "pds-check:l1-required-fields");
  assert.ok(required.length > 0, "the artifact lint did not run without the registry");
});

test("the checker carries no registry of its own", () => {
  const offenders = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^RULES\.md$/i.test(entry.name)) offenders.push(full);
    }
  };
  walk(ADDON_ROOT);
  assert.deepEqual(offenders, []);
});

/* -------------------------------------------------------- report shape */

test("every report carries the spec it implements and the digest it ran against", () => {
  const report = check(path.join(FIXTURES, "interaction-states", "pass"));
  assert.equal(report.implements, "PDS/1.0");
  assert.equal(report.registry.status, "loaded");
  assert.match(report.registry.digest, /^[0-9a-f]{12}$/);
  assert.ok(report.capability.detectors.length > 0);
  assert.deepEqual(report.tiers.unavailable, ["T2 RENDERED", "T3 PIXEL"]);
});

test("a finding is always three parts on one line, and the same run twice is the same text", () => {
  const first = check(path.join(FIXTURES, "literal-outside-tokens", "fail"));
  const second = check(path.join(FIXTURES, "literal-outside-tokens", "fail"));
  assert.deepEqual(first.findings, second.findings, "findings are not stable across runs");
  assert.ok(first.findings.length > 0);
  for (const line of first.findings) {
    assert.ok(!line.includes("\n"), "a finding must be one line");
    const parts = line.split(" — ");
    assert.equal(parts.length, 3, `a finding must be rule-id, violation and remedy: ${line}`);
    for (const part of parts) assert.ok(part.trim() !== "", `empty part in: ${line}`);
    assert.match(parts[0], /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/);
  }
});

test("exit codes separate clean, findings and a failed run", () => {
  assert.equal(check(path.join(FIXTURES, "interaction-states", "pass")).exit, 0);
  assert.equal(check(path.join(FIXTURES, "literal-outside-tokens", "fail")).exit, 1);
  assert.equal(cli([path.join(FIXTURES, "interaction-states", "pass")]).status, 0);
  assert.equal(cli([path.join(FIXTURES, "literal-outside-tokens", "fail")]).status, 1);
  assert.equal(cli(["--nonsense", "."]).status, 2);
  assert.equal(cli([path.join(FIXTURES, "no-such-directory")]).status, 2);
});

test("the json report parses and carries the same findings as the text one", () => {
  const result = cli(["--json", path.join(FIXTURES, "literal-outside-tokens", "fail")]);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.implements, "PDS/1.0");
  assert.deepEqual(report.findings, check(path.join(FIXTURES, "literal-outside-tokens", "fail")).findings);
  const text = cli([path.join(FIXTURES, "literal-outside-tokens", "fail")]);
  for (const line of report.findings) assert.ok(text.stdout.includes(line), `text report is missing: ${line}`);
});

test("the checker states what it did not inspect", () => {
  const report = check(path.join(FIXTURES, "icon-provenance", "fail"));
  assert.ok(Array.isArray(report.inputs["not-inspected"]));
  assert.ok(report.inputs.markup.length > 0);
});

/* ------------------------------------------------------------- waivers */

test("a valid waiver suppresses its finding and is recorded", () => {
  const report = check(path.join(FIXTURES, "waivers"));
  assert.deepEqual(report["waiver-errors"], []);
  assert.equal(report["waivers-applied"].length, 1);
  assert.match(report["waivers-applied"][0], /core:literal-outside-token-layer/);
  assert.match(report["waivers-applied"][0], /counter-signed by codex-1/);
  assert.ok(
    !report["findings-detail"].some((finding) => finding.rule === "core:literal-outside-token-layer"),
    "the waived finding is still in the ledger"
  );
});

test("an expired waiver is treated as absent and the finding returns unchanged", () => {
  const report = check(path.join(FIXTURES, "waivers"), {
    waiversPath: path.join(FIXTURES, "waivers", "waiver-expired.md")
  });
  assert.equal(report["waivers-applied"].length, 0);
  assert.ok(report["waiver-errors"].some((entry) => /expired on 2020-01-01/.test(entry)));
  assert.ok(report["findings-detail"].some((finding) => finding.rule === "core:literal-outside-token-layer"));
});

test("a wildcard waiver is rejected", () => {
  const report = check(path.join(FIXTURES, "waivers"), {
    waiversPath: path.join(FIXTURES, "waivers", "waiver-wildcard.md")
  });
  assert.equal(report["waivers-applied"].length, 0);
  assert.ok(report["waiver-errors"].some((entry) => /wildcards are rejected/.test(entry)));
});

test("a system-blind rule cannot be waived by scoping the waiver to the ratified system", () => {
  const report = check(path.join(FIXTURES, "waivers"), {
    waiversPath: path.join(FIXTURES, "waivers", "waiver-widening.md")
  });
  assert.equal(report["waivers-applied"].length, 0);
  assert.ok(report["waiver-errors"].some((entry) => /system-blind/.test(entry)));
  assert.ok(
    report["findings-detail"].some((finding) => finding.rule === "core:contrast-floor"),
    "the system-blind finding was suppressed by a widening waiver"
  );
});

/* --------------------------------------------------------- conformance */

test("a sound run verifies the level it claims", () => {
  const report = check(path.join(FIXTURES, "conformance", "sound-run"), { level: "L2" });
  const conformance = report["findings-detail"].filter((finding) => finding.class === "conformance");
  assert.deepEqual(
    conformance.map((finding) => `${finding.rule}: ${finding.violation}`),
    [],
    "the sound run raised conformance findings"
  );
  assert.equal(report.level.claimed, "L2");
  assert.equal(report.level.verified, "L2");
});

test("a collapsed run fails the gates it never recorded, and the recusal it broke", () => {
  const report = check(path.join(FIXTURES, "conformance", "collapsed-run"), { level: "L2" });
  const raised = report["findings-detail"].filter((finding) => finding.class === "conformance").map((finding) => finding.rule);
  for (const expected of [
    "pds-check:l1-required-fields",
    "pds-check:l2-gate-g1",
    "pds-check:l2-gate-g2",
    "pds-check:l2-recusal",
    "pds-check:l2-gate-recorded"
  ]) {
    assert.ok(raised.includes(expected), `${expected} was not raised; raised: ${[...new Set(raised)].join(", ")}`);
  }
  const g1 = report["findings-detail"].find((finding) => finding.rule === "pds-check:l2-gate-g1");
  assert.match(g1.violation, /G1 DISTINCTNESS: directions '.*' and '.*' differ on 1 declared axis; 2 are required/);
  assert.equal(report.level.verified, null, "a failed level must not be reported as verified");
});

test("token integrity is verified from the token graph", () => {
  const report = check(path.join(FIXTURES, "conformance", "token-drift"), { level: "L3" });
  const raised = report["findings-detail"].filter((finding) => finding.class === "conformance").map((finding) => finding.rule);
  assert.ok(raised.includes("pds-check:l3-alias-resolves"));
  assert.ok(raised.includes("pds-check:l3-colour-computable"));
});

test("a level whose evidence tier is unavailable is reported unverified, never assumed", () => {
  const report = check(path.join(FIXTURES, "conformance", "sound-run"), { level: "L4" });
  assert.equal(report.level.verified, null);
  assert.equal(report.level["highest-verifiable"], "L3");
  assert.ok(report.unjudgeable.some((entry) => entry.rule === "pds-check:l4-rendered"));
});

/* ------------------------------------------------------ standalone-ness */

test("the checker reaches no network and depends on nothing outside Node", () => {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "fixtures") continue;
        walk(full);
      } else if (entry.name.endsWith(".js")) files.push(full);
    }
  };
  walk(ADDON_ROOT);
  assert.ok(files.length > 0);
  const builtins = new Set(require("node:module").builtinModules);
  const forbidden = /\b(fetch|XMLHttpRequest|WebSocket)\s*\(|require\(\s*["']node:(http|https|net|dgram|tls)["']/;
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    assert.ok(!forbidden.test(text), `${path.basename(file)} reaches for the network`);
    for (const match of text.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
      const specifier = match[1];
      assert.ok(
        specifier.startsWith(".") || specifier.startsWith("node:") || builtins.has(specifier),
        `${path.basename(file)} requires ${specifier}, which is not a Node built-in`
      );
    }
  }
});
