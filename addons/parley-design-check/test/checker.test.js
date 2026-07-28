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
const os = require("node:os");
const path = require("node:path");

const { runCheck } = require("../lib/engine.js");
const { parseYamlSubset } = require("../lib/registry.js");

const ADDON_ROOT = path.resolve(__dirname, "..");
const DETECTORS_DIR = path.join(ADDON_ROOT, "lib", "detectors");
const CLI = path.join(ADDON_ROOT, "bin", "check.js");
const FIXTURES = path.join(__dirname, "fixtures");
const SOUND_RUN = path.join(FIXTURES, "conformance", "sound-run");
const DOCTRINE = path.resolve(ADDON_ROOT, "..", "parley-design", "references", "PDS.md");

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

/*
 * A negative conformance fixture is the sound run with one documented edit. The run that
 * verifies is the control; the edit is the defect, and it is legible in one line here
 * instead of buried in the eighth near-identical copy of a directory tree. Each edit is
 * asserted to have applied, so a fixture rename cannot turn one of these into a test that
 * quietly checks nothing.
 */
function mutatedRun(t, edits) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "pds-check-"));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  fs.cpSync(SOUND_RUN, target, { recursive: true });
  for (const edit of edits) {
    const full = path.join(target, edit.file);
    if (edit.remove) {
      fs.rmSync(full);
      continue;
    }
    if (edit.write !== undefined) {
      fs.writeFileSync(full, edit.write);
      continue;
    }
    const text = fs.readFileSync(full, "utf8");
    assert.ok(text.includes(edit.from), `the fixture edit ${JSON.stringify(edit.from)} is not in ${edit.file}`);
    fs.writeFileSync(full, text.replace(edit.from, edit.to));
  }
  return target;
}

function unmet(report) {
  return report.level.unmet;
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

// A waiver file the checker can accept: every field §8 requires, and two ids the run
// records. Written here rather than in a fixture directory because the roster is the point —
// the same entry is valid in a run that names its participants and invalid in one that does
// not, and the pair reads as one thought only when both sit together.
function waiverFile(entry) {
  return ["---", "spec: PDS/1.0", "kind: WAIVERS", "entries:", `  - ${entry}`, "---", "", "# Waivers", ""].join("\n");
}

const VALID_ENTRY =
  '{rule-id: core:literal-outside-token-layer, scope: panel.css, expiry: 2099-01-01, reason: "the legacy panel is replaced this quarter", granted-by: claude-1, counter-signed-by: codex-1}';

test("a valid waiver suppresses its finding when the run records both signers", (t) => {
  const run = mutatedRun(t, [
    { file: "panel.css", from: "color: var(--color-text-body);", to: "color: #1b1b1b;" },
    { file: "WAIVERS.md", write: waiverFile(VALID_ENTRY) }
  ]);
  const report = check(run, { level: "L2" });
  assert.deepEqual(report["waiver-errors"], []);
  assert.equal(report["waivers-applied"].length, 1);
  assert.match(report["waivers-applied"][0], /core:literal-outside-token-layer/);
  assert.match(report["waivers-applied"][0], /counter-signed by codex-1/);
  assert.ok(
    !report["findings-detail"].some((finding) => finding.rule === "core:literal-outside-token-layer"),
    "the waived finding is still in the ledger"
  );
});

test("with no roster to check the signers against, a waiver establishes no independence", () => {
  // The ordinary `check src/ --contract FINAL.md` invocation: no participant-bearing
  // artifact, so `granted-by: nobody-1, counter-signed-by: ghost-2` is two strings differing
  // and nothing more. §8 rule 2 and consensus AF-2: the finding stays, and the report says so.
  const report = check(path.join(FIXTURES, "waivers"));
  assert.equal(report["waivers-applied"].length, 0, "a waiver nobody could check suppressed its finding");
  assert.ok(
    report["waiver-errors"].some((entry) => /the run records no participants, so the independence of/.test(entry)),
    `waiver errors: ${report["waiver-errors"].join("; ")}`
  );
  assert.ok(
    report["findings-detail"].some((finding) => finding.rule === "core:literal-outside-token-layer"),
    "the finding an unestablished independence claimed to excuse left the ledger"
  );
});

test("two ids differing is not independence: unknown signers are refused with no roster too", () => {
  const report = check(path.join(FIXTURES, "waivers"), {
    waiversPath: path.join(FIXTURES, "waivers", "waiver-ghost-signers.md")
  });
  assert.equal(report["waivers-applied"].length, 0);
  assert.ok(report["waiver-errors"].some((entry) => /independence of nobody-1 and ghost-2 cannot be established/.test(entry)));
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

test("a participant cannot counter-sign its own waiver", () => {
  const report = check(path.join(FIXTURES, "waivers"), {
    waiversPath: path.join(FIXTURES, "waivers", "waiver-self-signed.md")
  });
  assert.equal(report["waivers-applied"].length, 0, "a self-signed waiver suppressed its finding");
  assert.ok(report["waiver-errors"].some((entry) => /counter-signed its own waiver/.test(entry)));
  assert.ok(
    report["findings-detail"].some((finding) => finding.rule === "core:literal-outside-token-layer"),
    "the finding a self-signed waiver claimed to excuse left the ledger"
  );
});

test("a waiver naming no granting participant establishes no independence", () => {
  const report = check(path.join(FIXTURES, "waivers"), {
    waiversPath: path.join(FIXTURES, "waivers", "waiver-no-grantor.md")
  });
  assert.equal(report["waivers-applied"].length, 0);
  assert.ok(report["waiver-errors"].some((entry) => /names no granting participant/.test(entry)));
  assert.ok(report["findings-detail"].some((finding) => finding.rule === "core:literal-outside-token-layer"));
});

test("a counter-signer the run never recorded is not an independent one", (t) => {
  const waivers = [
    "---",
    "spec: PDS/1.0",
    "kind: WAIVERS",
    "entries:",
    '  - {rule-id: core:literal-outside-token-layer, scope: panel.css, expiry: 2099-01-01, reason: "the legacy panel is replaced this quarter", granted-by: claude-1, counter-signed-by: mallory-9}',
    "---",
    "",
    "# Waivers",
    "",
    "The counter-signer is not a participant this run records.",
    ""
  ].join("\n");
  const run = mutatedRun(t, [{ file: "WAIVERS.md", write: waivers }]);
  const report = check(run, { level: "L2" });
  assert.equal(report["waivers-applied"].length, 0);
  assert.ok(
    report["waiver-errors"].some((entry) => /counter-signer mallory-9 is not a participant this run records/.test(entry)),
    `waiver errors: ${report["waiver-errors"].join("; ")}`
  );
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

test("recusal is decided from the artifact path, not from the agent a critique declares", (t) => {
  // The proposer of ledger writes round-02/claude-1.md and signs it `agent: someone-else`.
  // Before the path binding this verified L2 with unmet [].
  const critique = fs
    .readFileSync(path.join(SOUND_RUN, "round-02", "hermes-1.md"), "utf8")
    .replace("agent: hermes-1", "agent: someone-else");
  const run = mutatedRun(t, [{ file: path.join("round-02", "hermes-1.md"), remove: true }]);
  fs.writeFileSync(path.join(run, "round-02", "claude-1.md"), critique);
  const report = check(run, { level: "L2" });
  const raised = report["findings-detail"].filter((entry) => entry.rule === "pds-check:l2-recusal");
  assert.ok(
    raised.some((entry) => /claude-1 critiques its own direction "ledger"/.test(entry.violation)),
    `recusal findings: ${raised.map((entry) => entry.violation).join(" | ")}`
  );
  assert.ok(
    raised.some((entry) => /declares agent 'someone-else' and is filed as 'claude-1'/.test(entry.violation)),
    "an identity that disagrees with its own file name was accepted"
  );
  assert.ok(unmet(report).includes("pds-check:l2-recusal"));
  assert.equal(report.level.verified, null);
});

// A critique filed under a chosen id, targeting whatever the caller passes. The evasion under
// test needs no collision with an existing id, so the file name is the whole of the setup.
function critiqueAs(id, targets) {
  return fs
    .readFileSync(path.join(SOUND_RUN, "round-02", "hermes-1.md"), "utf8")
    .replace("agent: hermes-1", `agent: ${id}`)
    .replace("targets: [ledger, atrium]", `targets: [${targets.join(", ")}]`);
}

test("a critique filed under an id minted from a proposer's own fails recusal", (t) => {
  // The proposer of ledger files round-02/claude-1.critique.md and signs it with the same
  // minted id, so the declared agent agrees with the path and the equality against the
  // DIRECTION authors finds nothing. Before this, the run verified L2 with unmet [].
  const run = mutatedRun(t, [{ file: path.join("round-02", "hermes-1.md"), remove: true }]);
  fs.writeFileSync(path.join(run, "round-02", "claude-1.critique.md"), critiqueAs("claude-1.critique", ["ledger", "atrium"]));
  const report = check(run, { level: "L2" });
  const raised = report["findings-detail"].filter((entry) => entry.rule === "pds-check:l2-recusal");
  assert.ok(
    raised.some((entry) =>
      /filed as 'claude-1.critique', an id minted from the proposer id 'claude-1', and critiques that proposer's own direction "ledger"/.test(
        entry.violation
      )
    ),
    `recusal findings: ${raised.map((entry) => entry.violation).join(" | ")}`
  );
  assert.ok(unmet(report).includes("pds-check:l2-recusal"));
  assert.equal(report.level.verified, null);
});

test("an id that merely shares a prefix with a proposer's is a different participant", (t) => {
  // The boundary the minting test turns on: claude-10 is its own id, not claude-1 with a
  // suffix, and a check that cannot tell those apart would fail honest runs.
  const run = mutatedRun(t, [{ file: path.join("round-02", "hermes-1.md"), remove: true }]);
  fs.writeFileSync(path.join(run, "round-02", "claude-10.md"), critiqueAs("claude-10", ["ledger", "atrium"]));
  const report = check(run, { level: "L2" });
  assert.deepEqual(unmet(report), [], "a distinct id was read as minted from a proposer's own");
  assert.equal(report.level.verified, "L2");
});

test("the level names every critique author no other artifact of the run records", () => {
  // What the path anchor cannot do, said out loud: hermes-1 critiques and proposes nothing, so
  // no other artifact corroborates the id, and a proposer filing under a fresh id would read
  // the same. The level carries the list, so "verified L2" is never read without it.
  const report = check(SOUND_RUN, { level: "L2" });
  assert.equal(report.level.verified, "L2");
  assert.deepEqual(report.level["recusal-not-anchored"], ["hermes-1"]);
  const rendered = cli(["--level", "L2", SOUND_RUN]);
  assert.match(rendered.stdout, /recusal\s+not anchored for hermes-1: no other artifact of the run records the id/);
});

test("a waived disposition that resolves to no valid waiver entry fails G2", (t) => {
  // Before this, `disposition: waived` was itself the answer: the sound run's waiver file is
  // empty and the claim verified L2 anyway.
  const run = mutatedRun(t, [{ file: "consensus.md", from: "disposition: accepted", to: "disposition: waived" }]);
  const report = check(run, { level: "L2" });
  const finding = report["findings-detail"].find((entry) => entry.rule === "pds-check:l2-gate-g2");
  assert.ok(finding, "a waived answer resting on no waiver raised nothing");
  assert.match(finding.violation, /is disposed waived and the waiver file carries no valid entry for it/);
  assert.ok(unmet(report).includes("pds-check:l2-gate-g2"));
  assert.equal(report.level.verified, null);
});

test("a waived disposition backed by a valid, independent waiver entry passes G2", (t) => {
  const run = mutatedRun(t, [
    { file: "consensus.md", from: "disposition: accepted", to: "disposition: waived" },
    {
      file: "WAIVERS.md",
      write: waiverFile(
        '{rule-id: core:interaction-states-incomplete, scope: round-01/claude-1.md, expiry: 2099-01-01, reason: "the record list never waits: it is rendered from data already held", granted-by: claude-1, counter-signed-by: codex-1}'
      )
    }
  ]);
  const report = check(run, { level: "L2" });
  assert.deepEqual(report["waiver-errors"], []);
  assert.deepEqual(unmet(report), [], "a waived answer with a valid waiver behind it still failed");
  assert.equal(report.level.verified, "L2");
});

test("a waived disposition whose waiver is self-signed fails G2 with it", (t) => {
  const run = mutatedRun(t, [
    { file: "consensus.md", from: "disposition: accepted", to: "disposition: waived" },
    {
      file: "WAIVERS.md",
      write: waiverFile(
        '{rule-id: core:interaction-states-incomplete, scope: round-01/claude-1.md, expiry: 2099-01-01, reason: "the record list never waits", granted-by: claude-1, counter-signed-by: claude-1}'
      )
    }
  ]);
  const report = check(run, { level: "L2" });
  assert.ok(report["waiver-errors"].some((entry) => /counter-signed its own waiver/.test(entry)));
  assert.ok(
    report["findings-detail"].some(
      (entry) => entry.rule === "pds-check:l2-gate-g2" && /carries no valid entry for it/.test(entry.violation)
    ),
    "a self-signed waiver answered a violation against the winner"
  );
});

test("a waived disposition whose waiver scopes outside the winner's work fails G2", (t) => {
  // Before the scope test, `disposition: waived` resolved by rule id alone: an entry scoped at
  // a path that neither exists nor bears on the finding answered a VIOLATION against the
  // winner, and the run verified L2. §8 rule 3 asks for the narrowest scope covering the work.
  const run = mutatedRun(t, [
    { file: "consensus.md", from: "disposition: accepted", to: "disposition: waived" },
    {
      file: "WAIVERS.md",
      write: waiverFile(
        '{rule-id: core:interaction-states-incomplete, scope: nowhere/does-not-exist.css, expiry: 2099-01-01, reason: "the record list never waits", granted-by: claude-1, counter-signed-by: codex-1}'
      )
    }
  ]);
  const report = check(run, { level: "L2" });
  assert.deepEqual(report["waiver-errors"], [], "the entry is valid on its own fields; the scope is what fails");
  const finding = report["findings-detail"].find((entry) => entry.rule === "pds-check:l2-gate-g2");
  assert.ok(finding, "a waiver scoped at an unrelated path raised nothing");
  assert.match(finding.violation, /every valid entry for it scopes outside the winner's work/);
  assert.ok(unmet(report).includes("pds-check:l2-gate-g2"));
  assert.equal(report.level.verified, null);
});

test("a waiver scoped at the token file the winner names answers the finding", (t) => {
  // The other half of the scope test: the winner's own token document is the winner's work,
  // so a waiver narrowed to it covers the finding rather than being rejected with it.
  const run = mutatedRun(t, [
    { file: "consensus.md", from: "disposition: accepted", to: "disposition: waived" },
    {
      file: "WAIVERS.md",
      write: waiverFile(
        '{rule-id: core:interaction-states-incomplete, scope: tokens.json, expiry: 2099-01-01, reason: "the record list never waits: it is rendered from data already held", granted-by: claude-1, counter-signed-by: codex-1}'
      )
    }
  ]);
  const report = check(run, { level: "L2" });
  assert.deepEqual(report["waiver-errors"], []);
  assert.deepEqual(unmet(report), [], "a waiver scoped at the winner's token file was read as scoping outside it");
  assert.equal(report.level.verified, "L2");
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

/* ------------------------------------------- conformance as an obligation set */

test("the sound run verifies L3, and the level names every obligation it was held to", () => {
  const report = check(SOUND_RUN, { level: "L3" });
  assert.equal(report.level.verified, "L3");
  assert.deepEqual(unmet(report), []);
  const owed = report.level.obligations.map((entry) => entry.obligation);
  for (const obligation of [
    "pds-check:l1-required-fields",
    "pds-check:l2-assignment",
    "pds-check:l2-gate-g1",
    "pds-check:l2-gate-g2",
    "pds-check:l2-gate-recorded",
    "pds-check:l2-cited-rules",
    "pds-check:l3-token-document",
    "pds-check:l3-colour-space",
    "pds-check:l3-system-rules"
  ]) {
    assert.ok(owed.includes(obligation), `${obligation} was never declared, so nothing could report it unmet`);
  }
  assert.ok(report.level.obligations.every((entry) => entry.result === "met"));
  // The rules the checker has no detector for are named on the level itself, so "verified"
  // is never read without what was not decided.
  assert.deepEqual(report.level["system-rules-not-decided"], ["core:colour-off-ramp", "core:value-off-scale"]);
});

test("a wrong assigned position fails L2: the U1 rotation is recomputed, not believed", (t) => {
  const run = mutatedRun(t, [{ file: path.join("round-01", "claude-1.md"), from: "assigned: flat", to: "assigned: layered" }]);
  const report = check(run, { level: "L2" });
  assert.ok(unmet(report).includes("pds-check:l2-assignment"), `unmet: ${unmet(report).join(", ")}`);
  assert.equal(report.level.verified, null);
  const finding = report["findings-detail"].find((entry) => entry.rule === "pds-check:l2-assignment");
  assert.match(finding.violation, /claude-1 is assigned 'flat' by the seeded rotation and records 'layered'/);
});

test("a position taken against the assignment needs a recorded decline", (t) => {
  const taken = { file: path.join("round-01", "codex-1.md"), from: "structure: layered}", to: "structure: flat}" };
  const without = check(mutatedRun(t, [taken]), { level: "L2" });
  assert.ok(unmet(without).includes("pds-check:l2-assignment"));
  const withDecline = check(
    mutatedRun(t, [taken, { file: path.join("round-01", "codex-1.md"), from: "assigned: layered", to: "assigned: layered\ndeclined: \"the settings surface needs one column, and layering it hides the record\"" }]),
    { level: "L2" }
  );
  assert.ok(
    !unmet(withDecline).includes("pds-check:l2-assignment"),
    `a recorded decline still failed the assignment: ${unmet(withDecline).join(", ")}`
  );
  // §4 rule 3: declining does not relax G1, and the converged set still fails it.
  assert.ok(unmet(withDecline).includes("pds-check:l2-gate-g1"));
});

test("a run whose G1 records no banned-slop signature cannot verify L2", (t) => {
  const run = mutatedRun(t, [
    { file: "consensus.md", from: "g1-signatures:\n  - {direction: ledger, fires: []}\n", to: "" },
    { file: "consensus.md", from: '  - {direction: atrium, fires: ["core:decoration-unmotivated=the corner numeral"]}\n', to: "" }
  ]);
  const report = check(run, { level: "L2" });
  assert.ok(unmet(report).includes("pds-check:l2-gate-g1"));
  assert.ok(
    report.unjudgeable.some((entry) => /records no banned-slop signature/.test(entry.violation)),
    "the missing signature ledger was not reported as unrecomputable"
  );
});

test("two directions sharing a banned-slop signature fail G1", (t) => {
  const run = mutatedRun(t, [
    {
      file: "consensus.md",
      from: "  - {direction: ledger, fires: []}",
      to: '  - {direction: ledger, fires: ["core:decoration-unmotivated=the corner numeral"]}'
    }
  ]);
  const report = check(run, { level: "L2" });
  const finding = report["findings-detail"].find((entry) => entry.rule === "pds-check:l2-gate-g1");
  assert.ok(finding, "a shared signature raised no G1 finding");
  assert.match(finding.violation, /share a banned-slop signature \(core:decoration-unmotivated\)/);
  assert.equal(report.level.verified, null);
});

test("a G1 ledger the run's own findings refute cannot verify L2", (t) => {
  // Both directions declare the same unanchored device, so core:decoration-unmotivated — a
  // ban-list rule with a working detector — fires against both on the same declared value,
  // which per RULES.md IS sharing a banned-slop signature. The ledger records empty sets for
  // both. Before the cross-check this verified L2 with unmet [] while the checker's own
  // findings said otherwise.
  const run = mutatedRun(t, [
    {
      file: path.join("round-01", "claude-1.md"),
      from: 'effects: [{name: rule-line, anchor: "the boundary between two column groups; it disappears when a group has one column"}]',
      to: "effects: [corner-numeral]"
    },
    { file: path.join("round-01", "codex-1.md"), from: "effects: []", to: "effects: [corner-numeral]" },
    {
      file: "consensus.md",
      from: '  - {direction: atrium, fires: ["core:decoration-unmotivated=the corner numeral"]}',
      to: "  - {direction: atrium, fires: []}"
    }
  ]);
  const report = check(run, { level: "L2" });
  const raised = report["findings-detail"].filter((entry) => entry.rule === "pds-check:l2-gate-g1");
  assert.ok(
    raised.some((entry) => /share a banned-slop signature \(core:decoration-unmotivated\) by this run's own ban-list findings/.test(entry.violation)),
    `G1 findings: ${raised.map((entry) => entry.violation).join(" | ")}`
  );
  assert.ok(
    raised.some((entry) => /omits 'core:decoration-unmotivated', which this run's own findings show firing against it/.test(entry.violation)),
    "a ledger contradicted by the run's own findings was accepted"
  );
  assert.ok(unmet(report).includes("pds-check:l2-gate-g1"));
  assert.equal(report.level.verified, null);
});

test("a waiver cannot launder G1: the cross-check reads findings before suppression", (t) => {
  const run = mutatedRun(t, [
    {
      file: path.join("round-01", "claude-1.md"),
      from: 'effects: [{name: rule-line, anchor: "the boundary between two column groups; it disappears when a group has one column"}]',
      to: "effects: [corner-numeral]"
    },
    { file: path.join("round-01", "codex-1.md"), from: "effects: []", to: "effects: [corner-numeral]" },
    {
      file: "WAIVERS.md",
      write: waiverFile(
        '{rule-id: core:decoration-unmotivated, scope: round-01/claude-1.md, expiry: 2099-01-01, reason: "the numeral ships with the launch surface", granted-by: claude-1, counter-signed-by: codex-1}'
      )
    }
  ]);
  const report = check(run, { level: "L2" });
  assert.ok(
    report["findings-detail"].some(
      (entry) => entry.rule === "pds-check:l2-gate-g1" && /share a banned-slop signature/.test(entry.violation)
    ),
    "a waiver scoped at one direction suppressed what the pair shares"
  );
});

test("a signature naming an id outside the ban list fails G1", (t) => {
  const run = mutatedRun(t, [
    {
      file: "consensus.md",
      from: '  - {direction: atrium, fires: ["core:decoration-unmotivated=the corner numeral"]}',
      to: '  - {direction: atrium, fires: ["core:focus-indication=the outline is off"]}'
    }
  ]);
  const report = check(run, { level: "L2" });
  const finding = report["findings-detail"].find((entry) => entry.rule === "pds-check:l2-gate-g1");
  assert.match(finding.violation, /the ban list does not carry it/);
});

test("a gate the run crossed and never recorded fails L2, for G3 and for G4 alike", (t) => {
  const withoutG3 = check(
    mutatedRun(t, [{ file: "consensus.md", from: '\n  - {id: G3, outcome: pass, at: "at token ratification"}', to: "" }]),
    { level: "L2" }
  );
  assert.ok(unmet(withoutG3).includes("pds-check:l2-gate-recorded"));
  assert.ok(
    withoutG3["findings-detail"].some((entry) => /G3 has no recorded outcome/.test(entry.violation)),
    "a contract with no ratification gate verified anyway"
  );
  const audit = [
    "---",
    "spec: PDS/1.0",
    "kind: AUDIT",
    "implements: PDS/1.0",
    "registry-digest: 000000000000",
    "tiers: {requested: [T0 ARTIFACT], executed: [T0 ARTIFACT], unavailable: [T2 RENDERED]}",
    "findings: []",
    "level: L2",
    "---",
    "",
    "# Audit",
    "",
    "The run reached its audit, which is where G4 is recorded.",
    ""
  ].join("\n");
  const withoutG4 = check(mutatedRun(t, [{ file: "AUDIT.md", write: audit }]), { level: "L2" });
  assert.ok(
    withoutG4["findings-detail"].some((entry) => /G4 has no recorded outcome/.test(entry.violation)),
    "an audited run with no G4 record verified anyway"
  );
});

test("a gate recorded as failed cannot be crossed", (t) => {
  const run = mutatedRun(t, [{ file: "consensus.md", from: "{id: G1, outcome: pass", to: "{id: G1, outcome: fail" }]);
  const report = check(run, { level: "L2" });
  assert.ok(
    report["findings-detail"].some((entry) => /G1 is recorded fail and the run went on to critique/.test(entry.violation))
  );
});

test("a graft the winner's tokens do not declare fails G2", (t) => {
  const run = mutatedRun(t, [{ file: "consensus.md", from: "as: space.gap.lg", to: "as: space.gap.xl" }]);
  const report = check(run, { level: "L2" });
  const finding = report["findings-detail"].find((entry) => entry.rule === "pds-check:l2-gate-g2");
  assert.ok(finding, "a graft outside the winner's tokens raised nothing");
  assert.match(finding.violation, /which the winner's tokens do not declare/);
});

test("a graft that adds its token to the winner's file fails G2, re-expressible or not", (t) => {
  // §3 G2's first conjunct. The graft names a token that resolves, is referenced in source so
  // no unused-token finding fires, and has still modified the file the contract ratifies.
  // Before the digest comparison this run returned PASS, exit 0, verified L3, unmet [].
  const run = mutatedRun(t, [
    {
      file: "tokens.json",
      from: '      "lg": { "$value": "24px" }',
      to: '      "lg": { "$value": "24px" },\n      "xxl": { "$value": "48px" }'
    },
    { file: "consensus.md", from: "as: space.gap.lg", to: "as: space.gap.xxl" },
    { file: "panel.css", from: "  gap: var(--space-gap-lg);", to: "  gap: var(--space-gap-lg);\n  margin-block: var(--space-gap-xxl);" }
  ]);
  const report = check(run, { level: "L3" });
  const finding = report["findings-detail"].find((entry) => entry.rule === "pds-check:l2-gate-g2");
  assert.ok(finding, "a graft that edited the winner's token file raised nothing");
  assert.match(finding.violation, /so a graft modifies the winner's token file/);
  assert.ok(unmet(report).includes("pds-check:l2-gate-g2"), `unmet: ${unmet(report).join(", ")}`);
  assert.equal(report.level.verified, null);
  assert.notEqual(report.exit, 0);
});

test("a verdict recording no tokens-digest leaves G2's first conjunct unverified", (t) => {
  const run = mutatedRun(t, [{ file: "consensus.md", from: "tokens-digest: 80f03f57a042\n", to: "" }]);
  const report = check(run, { level: "L2" });
  assert.ok(unmet(report).includes("pds-check:l2-gate-g2"));
  assert.ok(
    report.unjudgeable.some((entry) => /records no twelve-character tokens-digest/.test(entry.violation)),
    "an absent digest verified the conjunct it makes uncheckable"
  );
});

test("a violation against the winner that the verdict never answers fails G2", (t) => {
  const run = mutatedRun(t, [
    { file: "consensus.md", from: "answers: [{rule-id: core:interaction-states-incomplete, disposition: accepted}]", to: "answers: []" }
  ]);
  const report = check(run, { level: "L2" });
  const finding = report["findings-detail"].find((entry) => entry.rule === "pds-check:l2-gate-g2");
  assert.match(finding.violation, /core:interaction-states-incomplete' is recorded VIOLATION against the winner 'ledger'/);
});

test("L3 is not verified when no source was passed for the rules G3 names", (t) => {
  const run = mutatedRun(t, [{ file: "panel.css", remove: true }, { file: "page.html", remove: true }]);
  const report = check(run, { level: "L3" });
  assert.equal(report.level.verified, null);
  assert.ok(unmet(report).includes("pds-check:l3-system-rules"), `unmet: ${unmet(report).join(", ")}`);
  assert.ok(report.unjudgeable.some((entry) => /was not decided in this run/.test(entry.violation)));
  assert.notEqual(report.exit, 0, "a level claim that rests on absent evidence exited clean");
});

test("a colour token with a plain-string value fails L3: computable is not declared", (t) => {
  const run = mutatedRun(t, [
    { file: "tokens.json", from: '{ "colorSpace": "srgb", "components": [1, 1, 1], "hex": "#ffffff" }', to: '"#ffffff"' }
  ]);
  const report = check(run, { level: "L3" });
  assert.ok(unmet(report).includes("pds-check:l3-colour-space"));
  const finding = report["findings-detail"].find((entry) => entry.rule === "pds-check:l3-colour-space");
  assert.match(finding.violation, /color\.surface\.page declares no colorSpace/);
});

test("an open system rule fails L3 rather than leaving the level verified", (t) => {
  const run = mutatedRun(t, [{ file: "panel.css", from: "color: var(--color-text-body);", to: "color: #1b1b1b;" }]);
  const report = check(run, { level: "L3" });
  assert.equal(report.level.verified, null);
  assert.ok(unmet(report).includes("pds-check:l3-system-rules"));
  assert.ok(report["findings-detail"].some((entry) => entry.rule === "core:literal-outside-token-layer"));
});

/* --------------------------------------------------- artifact ingestion */

test("every frontmatter example the spec publishes parses with the checker's own parser", () => {
  const text = fs.readFileSync(DOCTRINE, "utf8");
  const examples = [...text.matchAll(/```yaml\n([\s\S]*?)```/g)].map((match) => match[1]);
  assert.ok(examples.length >= 8, "the spec publishes fewer examples than it has artifact kinds");
  for (const [index, example] of examples.entries()) {
    assert.doesNotThrow(
      () => parseYamlSubset(example, `PDS.md example ${index + 1}`),
      `example ${index + 1} in PDS.md does not parse as the canonical subset`
    );
  }
});

test("a candidate artifact that does not parse is reported, never demoted to not-inspected", () => {
  const report = check(path.join(FIXTURES, "artifacts"), { level: "L1" });
  const finding = report["findings-detail"].find((entry) => entry.rule === "pds-check:l1-frontmatter-parses");
  assert.ok(finding, "an unparsable PDS artifact raised nothing while its neighbour carried a level claim");
  assert.match(finding.violation, /declares spec PDS\/1\.0 and its frontmatter is outside the canonical subset/);
  assert.equal(report.level.verified, null);
  assert.ok(report.inputs.unparsable.length === 1);
});

test("a rule id the registry does not declare is UNJUDGEABLE and leaves L2 unverified", (t) => {
  const run = mutatedRun(t, [
    { file: path.join("round-02", "hermes-1.md"), from: "core:interaction-states-incomplete", to: "project:unknown-thing" }
  ]);
  const report = check(run, { level: "L2" });
  const entry = report.unjudgeable.find((candidate) => candidate.rule === "project:unknown-thing");
  assert.ok(entry, "an unknown cited id was neither a finding nor UNJUDGEABLE");
  assert.match(entry.violation, /the loaded registry does not declare it/);
  assert.ok(unmet(report).includes("pds-check:l2-cited-rules"));
});

/* --------------------------------------------------------- exit codes */

test("a run that inspected nothing does not exit clean", () => {
  const notice = path.resolve(ADDON_ROOT, "..", "..", "NOTICE.md");
  assert.ok(fs.existsSync(notice), "expected a file the checker cannot inspect");
  const report = check(notice);
  assert.equal(report.verdict, "UNJUDGEABLE");
  assert.equal(report.exit, 4, "a checker that judged nothing reported a clean run");
  assert.equal(cli([notice]).status, 4);
});

/* -------------------------------------------------- detector correctness */

test("a reduced-motion block that reduces no motion is not a reduced-motion path", () => {
  const report = check(path.join(FIXTURES, "motion-reduced-path", "fail", "decorative-reduced.css"));
  const raised = report["findings-detail"].filter((finding) => finding.rule === "core:motion-without-reduced-path");
  assert.equal(raised.length, 1, "a block that only recolours under the query counted as coverage");
  assert.equal(raised[0].verdict, "VIOLATION");
  assert.match(raised[0].violation, /changes other properties without removing the motion/);
});

test("a focus replacement declared outside the removing block is found", () => {
  const report = check(path.join(FIXTURES, "focus-indication", "pass", "split-focus.css"));
  assert.deepEqual(
    report["findings-detail"].filter((finding) => finding.rule === "core:focus-indication").map((finding) => finding.violation),
    [],
    "the conforming split outline/:focus-visible idiom was reported as a violation"
  );
  assert.ok(!report.unjudgeable.some((entry) => entry.rule === "core:focus-indication"));
});

test("one icon package is one icon source", () => {
  const report = check(path.join(FIXTURES, "icon-provenance", "one-package"));
  assert.deepEqual(
    report["findings-detail"].filter((finding) => finding.rule === "web:icon-provenance").map((finding) => finding.violation),
    [],
    "a single Heroicons import was counted as a mixture of sources"
  );
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
