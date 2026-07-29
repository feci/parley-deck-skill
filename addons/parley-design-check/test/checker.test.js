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

const { loadDetectors, runCheck } = require("../lib/engine.js");
const { parseYamlSubset } = require("../lib/registry.js");
const { markupVarUses, maskOpaqueTokens, parseStylesheet, scanStylesheet, stripComments, varUses } = require("../lib/css.js");

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
        '{rule-id: core:interaction-states-incomplete, scope: round-01/claude-1.tokens.json, expiry: 2099-01-01, reason: "the record list never waits: it is rendered from data already held", granted-by: claude-1, counter-signed-by: codex-1}'
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
      file: path.join("round-01", "claude-1.tokens.json"),
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

test("an empty path field is a field that names no file, not a crash", (t) => {
  // §2 rule 3 and §2 rule 5: `""` is a value the canonical frontmatter subset publishes, and a
  // contract with no waivers is a legitimate state. Resolving it gave the contract's own
  // directory, which fs.existsSync accepts and the reader crashes on — EISDIR, exit 2, "the run
  // itself failed" reported against a valid input.
  const empty = check(mutatedRun(t, [{ file: "FINAL.md", from: "waivers: WAIVERS.md", to: 'waivers: ""' }]), { level: "L2" });
  assert.equal(empty.verdict, "PASS");
  assert.equal(empty.exit, 0, "a contract declaring no waiver file failed the run");
  assert.deepEqual(empty["waiver-errors"], []);
  assert.deepEqual(empty["waivers-applied"], []);
  const tokens = check(
    mutatedRun(t, [{ file: "FINAL.md", from: "tokens: round-01/claude-1.tokens.json", to: 'tokens: ""' }]),
    { level: "L2" }
  );
  assert.notEqual(tokens.exit, 2, "an empty tokens field failed the run rather than being read as naming no file");
});

test("an alias that points up the tiers, or sideways at the floor, fails L3", () => {
  // Round-02 hermes-1: FINAL.md binds alias direction into L3 token integrity, §3 G3 defines it,
  // and nothing verified it. A primitive aliasing another primitive and a semantic aliasing a
  // component both resolve without a cycle, so before this the document verified L3 clean.
  const report = check(path.join(FIXTURES, "conformance", "alias-direction"), { level: "L3" });
  const raised = report["findings-detail"].filter((entry) => entry.rule === "pds-check:l3-alias-direction");
  assert.ok(
    raised.some((entry) => /primitive\.ink is a primitive and aliases the primitive primitive\.slate/.test(entry.violation)),
    `alias-direction findings: ${raised.map((entry) => entry.violation).join(" | ")}`
  );
  assert.ok(
    raised.some((entry) => /semantic\.border is a semantic and aliases component\.panel, which is a component/.test(entry.violation)),
    "an alias pointing up the tiers was accepted"
  );
  assert.ok(unmet(report).includes("pds-check:l3-alias-direction"));
  assert.equal(report.level.verified, null);
});

test("an alias pointing sideways at its own tier fails L3, at every tier", () => {
  // Round-03 codex-1. Cycle 4 rejected upward aliases and the primitive floor, so
  // `semantic.medium -> {semantic.small}` and `component.card -> {component.panel}` resolved,
  // reported the alias obligation met and certified a run at L3 with PASS and exit 0. §3 G3
  // has a reference descend the declared primitive, semantic, component order, and a same-tier
  // edge descends nothing while leaving a cycle inside one tier structurally possible.
  const report = check(path.join(FIXTURES, "conformance", "alias-same-tier"), { level: "L3" });
  const raised = report["findings-detail"].filter((entry) => entry.rule === "pds-check:l3-alias-direction");
  assert.ok(
    raised.some((entry) => /semantic\.medium is a semantic and aliases the semantic semantic\.small/.test(entry.violation)),
    `alias-direction findings: ${raised.map((entry) => entry.violation).join(" | ")}`
  );
  assert.ok(
    raised.some((entry) => /component\.card is a component and aliases the component component\.panel/.test(entry.violation)),
    "a component aliasing another component was accepted"
  );
  // The fixture also carries semantic.small -> primitive.step and component.panel ->
  // semantic.medium, both descending. Exactly the two sideways edges are reported.
  assert.equal(raised.length, 2, `alias-direction findings: ${raised.map((entry) => entry.violation).join(" | ")}`);
  assert.ok(unmet(report).includes("pds-check:l3-alias-direction"));
  assert.equal(report.level.verified, null);
  assert.notEqual(report.exit, 0);
});

test("an alias pointing down the tiers, and a document naming none, are both clean", (t) => {
  // The conjunct is vacuous where a document names no tier group — the sound run's tokens.json
  // is grouped by `color` and `space` — and satisfied where the tiers run the right way.
  const declared = check(path.join(FIXTURES, "conformance", "alias-direction"), { level: "L3" });
  const raised = declared["findings-detail"].filter((entry) => entry.rule === "pds-check:l3-alias-direction");
  // The fixture also carries semantic.text -> primitive.slate and component.panel ->
  // semantic.text, both pointing down. Exactly the two offending aliases are reported.
  assert.equal(raised.length, 2, `alias-direction findings: ${raised.map((entry) => entry.violation).join(" | ")}`);
  const untiered = check(mutatedRun(t, []), { level: "L3" });
  assert.deepEqual(
    untiered["findings-detail"].filter((entry) => entry.rule === "pds-check:l3-alias-direction"),
    [],
    "a token document naming no tier group was held to a tier order it never declared"
  );
  assert.equal(untiered.level.verified, "L3");
});

test("a colour token with a plain-string value fails L3: computable is not declared", (t) => {
  const run = mutatedRun(t, [
    {
      file: path.join("round-01", "claude-1.tokens.json"),
      from: '{ "colorSpace": "srgb", "components": [1, 1, 1], "hex": "#ffffff" }',
      to: '"#ffffff"'
    }
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

/* ------------------------------- the level obligations, probed as certificates */

test("an axis no brief declares is not a difference G1 counts", (t) => {
  // Round-02 AF-1(a). Both directions agree on the brief's `density` axis and invent `mood` to
  // differ on, so the union of supplied keys shows two differences and G1's two-axis test was
  // satisfied by a word the brief never declared. Before this the run verified L2 with unmet [].
  const run = mutatedRun(t, [
    {
      file: path.join("round-01", "claude-1.md"),
      from: "positions: {density: dense, structure: flat}",
      to: "positions: {density: dense, structure: flat, mood: calm}"
    },
    {
      file: path.join("round-01", "codex-1.md"),
      from: "positions: {density: sparse, structure: layered}",
      to: "positions: {density: dense, structure: layered, mood: loud}"
    }
  ]);
  const report = check(run, { level: "L2" });
  const raised = report["findings-detail"].filter((entry) => entry.rule === "pds-check:l2-gate-g1");
  assert.ok(
    raised.some((entry) => /declares a position on 'mood', which the brief does not declare as an axis/.test(entry.violation)),
    `G1 findings: ${raised.map((entry) => entry.violation).join(" | ")}`
  );
  assert.ok(
    raised.some((entry) => /differ on 1 declared axis; 2 are required/.test(entry.violation)),
    "the invented axis was still counted as a difference"
  );
  assert.ok(unmet(report).includes("pds-check:l2-gate-g1"));
  assert.equal(report.level.verified, null);
});

test("a position the brief does not enumerate fails G1", (t) => {
  const run = mutatedRun(t, [
    {
      file: path.join("round-01", "codex-1.md"),
      from: "positions: {density: sparse, structure: layered}",
      to: "positions: {density: airy, structure: layered}"
    }
  ]);
  const report = check(run, { level: "L2" });
  const raised = report["findings-detail"].filter((entry) => entry.rule === "pds-check:l2-gate-g1");
  assert.ok(
    raised.some((entry) => /takes 'airy' on 'density', which the brief does not enumerate/.test(entry.violation)),
    `G1 findings: ${raised.map((entry) => entry.violation).join(" | ")}`
  );
  assert.equal(report.level.verified, null);
});

test("a repeated primary position cannot assign two proposers the same one", (t) => {
  // Round-02 AF-1(b). The rotation ran over the list as written, so `[flat, flat, layered]`
  // handed `flat` to both proposers and both recorded what they were "given". Two other axes
  // differ, so G1 is silent, and before this the run verified L2 with unmet [].
  const run = mutatedRun(t, [
    {
      file: "DESIGN-BRIEF.md",
      from: "axes: {density: [sparse, dense], structure: [flat, layered]}",
      to: "axes: {density: [sparse, dense], weight: [light, heavy], structure: [flat, flat, layered]}"
    },
    {
      file: path.join("round-01", "claude-1.md"),
      from: "positions: {density: dense, structure: flat}",
      to: "positions: {density: dense, weight: light, structure: flat}"
    },
    {
      file: path.join("round-01", "codex-1.md"),
      from: "positions: {density: sparse, structure: layered}",
      to: "positions: {density: sparse, weight: heavy, structure: flat}"
    },
    { file: path.join("round-01", "codex-1.md"), from: "assigned: layered", to: "assigned: flat" }
  ]);
  const report = check(run, { level: "L2" });
  const raised = report["findings-detail"].filter((entry) => entry.rule === "pds-check:l2-assignment");
  assert.ok(
    raised.some((entry) => /enumerates 'structure' with a position it lists more than once/.test(entry.violation)),
    `assignment findings: ${raised.map((entry) => entry.violation).join(" | ")}`
  );
  assert.ok(
    raised.some((entry) => /codex-1 is assigned 'layered' by the seeded rotation and records 'flat'/.test(entry.violation)),
    "the deduplicated rotation was not what the proposers were compared against"
  );
  assert.ok(unmet(report).includes("pds-check:l2-assignment"));
  assert.equal(report.level.verified, null);
});

test("swapping round-01 and round-02 fails process order", (t) => {
  // Round-02 AF-1(c). The obligation counted artifacts and never read §1's mapping, so a run
  // with its directions filed in round-02 and its critique in round-01 satisfied every count
  // and verified L2 with unmet []. The order is what L2 certifies.
  const run = mutatedRun(t, []);
  const move = (from, to) => {
    fs.mkdirSync(path.dirname(path.join(run, to)), { recursive: true });
    fs.renameSync(path.join(run, from), path.join(run, to));
  };
  move(path.join("round-02", "hermes-1.md"), path.join("round-02", "hermes-1.tmp"));
  move(path.join("round-01", "claude-1.md"), path.join("round-02", "claude-1.md"));
  move(path.join("round-01", "codex-1.md"), path.join("round-02", "codex-1.md"));
  move(path.join("round-02", "hermes-1.tmp"), path.join("round-01", "hermes-1.md"));
  const report = check(run, { level: "L2" });
  const raised = report["findings-detail"].filter((entry) => entry.rule === "pds-check:l2-process-order");
  assert.ok(
    raised.some((entry) => /the DIRECTION is filed outside §1's mapping, which names it round-01\/<agent>\.md/.test(entry.violation)),
    `process-order findings: ${raised.map((entry) => entry.violation).join(" | ")}`
  );
  assert.ok(
    raised.some((entry) => /the CRITIQUE is filed outside §1's mapping, which names it round-02\/<agent>\.md/.test(entry.violation)),
    "a critique filed in round-01 was accepted as process order"
  );
  assert.ok(unmet(report).includes("pds-check:l2-process-order"));
  assert.equal(report.level.verified, null);
});

/* ------------------------------- §1's token sidecar, one per proposer */

// Round-03 codex-1. §1 maps DIVERGE to two files per proposer — `round-01/<agent>.md` and
// `<agent>.tokens.json` — and the process-home check read only the markdown. The shipped sound
// run itself had both DIRECTIONs naming one root-level `../tokens.json` and still certified L3
// with PASS and exit 0, so a run could replace two independently authored token proposals with
// one file and collect a process-conformance certificate for it. These four probe the sidecar
// shared, misnamed, cross-owned and missing.

test("two DIRECTIONs resolving their tokens to one file fail process order", (t) => {
  const run = mutatedRun(t, [
    { file: path.join("round-01", "claude-1.md"), from: "tokens: claude-1.tokens.json", to: "tokens: ../tokens.json" },
    { file: path.join("round-01", "codex-1.md"), from: "tokens: codex-1.tokens.json", to: "tokens: ../tokens.json" }
  ]);
  fs.cpSync(path.join(run, "round-01", "claude-1.tokens.json"), path.join(run, "tokens.json"));
  const report = check(run, { level: "L3" });
  const raised = report["findings-detail"].filter((entry) => entry.rule === "pds-check:l2-process-order");
  assert.ok(
    raised.some((entry) => /the DIRECTIONs filed as 'claude-1' and 'codex-1' resolve their token files to one path/.test(entry.violation)),
    `process-order findings: ${raised.map((entry) => entry.violation).join(" | ")}`
  );
  assert.ok(unmet(report).includes("pds-check:l2-process-order"));
  assert.equal(report.level.verified, null);
  assert.notEqual(report.exit, 0);
});

test("a DIRECTION whose sidecar is not the adjacent one §1 names fails process order", (t) => {
  const run = mutatedRun(t, [
    { file: path.join("round-01", "codex-1.md"), from: "tokens: codex-1.tokens.json", to: "tokens: ../atrium.tokens.json" }
  ]);
  fs.renameSync(path.join(run, "round-01", "codex-1.tokens.json"), path.join(run, "atrium.tokens.json"));
  const report = check(run, { level: "L3" });
  const raised = report["findings-detail"].filter((entry) => entry.rule === "pds-check:l2-process-order");
  assert.ok(
    raised.some((entry) =>
      /the DIRECTION filed as 'codex-1' names the token file \.\.\/atrium\.tokens\.json, and §1 maps its sidecar to codex-1\.tokens\.json beside it/.test(
        entry.violation
      )
    ),
    `process-order findings: ${raised.map((entry) => entry.violation).join(" | ")}`
  );
  assert.ok(
    !raised.some((entry) => /resolve their token files to one path/.test(entry.violation)),
    "two distinct paths were reported as one shared file"
  );
  assert.equal(report.level.verified, null);
});

test("a DIRECTION naming another proposer's sidecar fails process order", (t) => {
  const run = mutatedRun(t, [
    { file: path.join("round-01", "codex-1.md"), from: "tokens: codex-1.tokens.json", to: "tokens: claude-1.tokens.json" }
  ]);
  const report = check(run, { level: "L3" });
  const raised = report["findings-detail"].filter((entry) => entry.rule === "pds-check:l2-process-order");
  assert.ok(
    raised.some((entry) =>
      /the DIRECTION filed as 'codex-1' names the token file claude-1\.tokens\.json, and §1 maps its sidecar to codex-1\.tokens\.json beside it/.test(
        entry.violation
      )
    ),
    `process-order findings: ${raised.map((entry) => entry.violation).join(" | ")}`
  );
  assert.ok(
    raised.some((entry) => /resolve their token files to one path/.test(entry.violation)),
    "a proposer taking another proposer's sidecar still read as two token proposals"
  );
  assert.equal(report.level.verified, null);
});

test("a DIRECTION whose token sidecar is absent fails process order", (t) => {
  const run = mutatedRun(t, [{ file: path.join("round-01", "codex-1.tokens.json"), remove: true }]);
  const report = check(run, { level: "L3" });
  assert.ok(
    report["findings-detail"].some(
      (entry) =>
        entry.rule === "pds-check:l2-process-order" &&
        /the DIRECTION filed as 'codex-1' names codex-1\.tokens\.json and this run could read no file there/.test(entry.violation)
    ),
    "a DIRECTION whose token half was never committed verified anyway"
  );
  assert.ok(unmet(report).includes("pds-check:l2-process-order"));
  assert.equal(report.level.verified, null);
});

test("a brief filed under any other name fails process order", (t) => {
  const run = mutatedRun(t, []);
  fs.renameSync(path.join(run, "DESIGN-BRIEF.md"), path.join(run, "brief.md"));
  const report = check(run, { level: "L2" });
  assert.ok(
    report["findings-detail"].some(
      (entry) => entry.rule === "pds-check:l2-process-order" && /names it DESIGN-BRIEF\.md/.test(entry.violation)
    ),
    "an artifact filed outside the name §1 gives it was accepted"
  );
  assert.equal(report.level.verified, null);
});

test("G3 recorded pass beside a raw literal cannot verify L2", (t) => {
  // Round-02 AF-1(d). The gate check validated the recorded word and nothing else: the run
  // raised core:literal-outside-token-layer, reported VIOLATION, and still certified
  // "verified L2" with an empty unmet set beside a G3 its own findings refute.
  const run = mutatedRun(t, [{ file: "panel.css", from: "color: var(--color-text-body);", to: "color: #1b1b1b;" }]);
  const report = check(run, { level: "L2" });
  const raised = report["findings-detail"].filter((entry) => entry.rule === "pds-check:l2-gate-recorded");
  assert.ok(
    raised.some((entry) =>
      /G3 is recorded pass and this run's own findings refute its conditions: core:literal-outside-token-layer/.test(entry.violation)
    ),
    `gate findings: ${raised.map((entry) => entry.violation).join(" | ")}`
  );
  assert.ok(unmet(report).includes("pds-check:l2-gate-recorded"));
  assert.equal(report.level.verified, null);
});

test("G4 recorded pass beside an open quality violation cannot verify L2", (t) => {
  const audit = [
    "---",
    "spec: PDS/1.0",
    "kind: AUDIT",
    "implements: PDS/1.0",
    "registry-digest: 000000000000",
    "tiers: {requested: [T0 ARTIFACT], executed: [T0 ARTIFACT], unavailable: [T2 RENDERED]}",
    "findings: []",
    "level: L2",
    "gates:",
    '  - {id: G4, outcome: pass, at: "at the audit, before a terminal state"}',
    "---",
    "",
    "# Audit",
    "",
    "The audit records G4 as passing while a quality rule is open against the applied surface.",
    ""
  ].join("\n");
  const run = mutatedRun(t, [
    { file: "AUDIT.md", write: audit },
    { file: "panel.css", from: ".record {", to: ".record {\n  animation: pulse 2s infinite;" }
  ]);
  const report = check(run, { level: "L2" });
  const raised = report["findings-detail"].filter((entry) => entry.rule === "pds-check:l2-gate-recorded");
  assert.ok(
    raised.some((entry) =>
      /G4 is recorded pass and this run's own findings refute its conditions: core:motion-without-reduced-path/.test(entry.violation)
    ),
    `gate findings: ${raised.map((entry) => entry.violation).join(" | ")}`
  );
  assert.ok(unmet(report).includes("pds-check:l2-gate-recorded"));
  assert.equal(report.level.verified, null);
});

test("a quoted brace is text, and the declarations after it are still read", () => {
  // Round-02 AF-1(e). The stack machine treated `{`, `}` and `;` inside a quoted string as
  // structure, so `content: "}"` closed the block early and every later declaration — a raw
  // colour among them — fell outside any rule and was never judged. L3 came back clean.
  const blocks = parseStylesheet('.trap::before { content: "}"; color: #ff0000; }');
  assert.equal(blocks.length, 1, "a quoted brace opened or closed a block");
  assert.deepEqual(
    blocks[0].declarations.map((declaration) => declaration.prop),
    ["content", "color"],
    "a declaration after a quoted brace was lost"
  );
  const report = check(path.join(FIXTURES, "literal-outside-tokens", "fail"));
  assert.ok(
    report["findings-detail"].some(
      (entry) => entry.rule === "core:literal-outside-token-layer" && /quoted-brace\.css/.test(entry.path || "")
    ),
    `a raw colour hidden behind a quoted brace was not found: ${report.findings.join(" | ")}`
  );
});

test("an unterminated string ends at the newline, and the rules after it are still read", () => {
  /*
   * Round-03 kimi-1. Cycle 4 made the scanner quote-aware, which closed `content: "}"`. An
   * unterminated quote is the same hole reached from the other side: the scanner read
   * everything after the opening quote as string content to the end of the file, while CSS
   * Syntax §4.3.5 ends the string at the newline and a browser goes on applying the rules
   * that follow. Before this, the raw colour and radius in the ordinary rule below were
   * invisible to every detector and the run over the fixture directory never saw them.
   */
  const source = '.c::before { content: "unterminated\n color: #ff0000; }\n.hint { color: #ff0000; }\n';
  const blocks = parseStylesheet(source);
  assert.equal(blocks.length, 2, "the rule after an unterminated string was read as string content");
  assert.deepEqual(blocks[1].selectors, [".hint"]);
  assert.deepEqual(blocks[1].declarations.map((declaration) => declaration.prop), ["color"]);
  assert.equal(blocks[1].declarations[0].line, 3, "the line count did not survive the recovery");

  // stripComments carries the same rule, or a comment after the bad string is never stripped
  // and its body is scanned as stylesheet.
  const withComment = '.a { content: "oops\n}\n/* a hidden comment */\n.b { color: #ff0000; }\n';
  const stripped = stripComments(withComment);
  assert.ok(!stripped.includes("hidden"), "a comment after an unterminated string was left in place");
  assert.equal(stripped.length, withComment.length, "stripping moved the offsets the line numbers rest on");

  const report = check(path.join(FIXTURES, "literal-outside-tokens", "fail"));
  const hidden = report["findings-detail"].filter(
    (entry) => entry.rule === "core:literal-outside-token-layer" && /unterminated-string\.css/.test(entry.path || "")
  );
  assert.ok(
    hidden.some((entry) => /sets color to the colour literal #ff0000/.test(entry.violation)),
    `a raw colour hidden behind an unterminated string was not found: ${report.findings.join(" | ")}`
  );
  assert.ok(
    hidden.some((entry) => /sets border-radius to the size literal 11px/.test(entry.violation)),
    "only part of the rule an unterminated string hid came back into scope"
  );

  // The cycle-4 case is untouched: a quoted brace is still text, not structure.
  const quotedBrace = parseStylesheet('.trap::before { content: "}"; color: #ff0000; }');
  assert.equal(quotedBrace.length, 1, "a quoted brace opened or closed a block");
  assert.deepEqual(quotedBrace[0].declarations.map((declaration) => declaration.prop), ["content", "color"]);
});

test("a brace inside an unquoted url() is text, and the declarations after it are still read", () => {
  /*
   * Round-03. The quoted-brace fix (cycle 4) and the unterminated-string fix read strings
   * correctly, but an unquoted url() is not a string: CSS Syntax §4.3.6 ends the token at `)`
   * and reads `{`, `}`, `;` and `:` inside it as ordinary code points, so a browser applies
   * every declaration after `url(a}b)`. The scanner read that brace as a block terminator and
   * dropped the rest of the rule, which is the same false-clean hole as the two before it: a
   * raw colour that ships is a declaration no detector can see.
   */
  const blocks = parseStylesheet(".a { background: url(a}b); color: #ff0000; }");
  assert.equal(blocks.length, 1, "a brace inside an unquoted url() opened or closed a block");
  assert.deepEqual(
    blocks[0].declarations.map((declaration) => declaration.prop),
    ["background", "color"],
    "a declaration after a brace inside an unquoted url() was lost"
  );
  assert.equal(blocks[0].declarations[0].value, "url(a}b)", "the url token was cut short");

  // The token ends at `)` and nowhere else: a `;` or `:` inside it is not a declaration edge,
  // and the quoted form is a string the existing quote handling already reads.
  assert.deepEqual(
    parseStylesheet(".a { background: url(a;b); color: #ff0000; }")[0].declarations.map((d) => d.prop),
    ["background", "color"]
  );
  assert.deepEqual(
    parseStylesheet(".a { background: url(https://example.test/i.png); color: #ff0000; }")[0].declarations.map(
      (d) => d.value
    ),
    ["url(https://example.test/i.png)", "#ff0000"]
  );
  assert.deepEqual(
    parseStylesheet('.a { background: url("a}b"); color: #ff0000; }')[0].declarations.map((d) => d.prop),
    ["background", "color"]
  );
  // Only a bare `url` ident opens the token; `myurl(` is an ordinary function.
  assert.deepEqual(
    parseStylesheet(".a { background: myurl(a); color: #ff0000; }")[0].declarations.map((d) => d.prop),
    ["background", "color"]
  );
  // A newline inside the token is whitespace, not a terminator, and the line count survives it.
  const wrapped = parseStylesheet(".a { background: url(a\nb); color: #ff0000; }");
  assert.equal(wrapped[0].declarations[1].line, 2, "the line count did not survive a wrapped url token");

  const report = check(path.join(FIXTURES, "literal-outside-tokens", "fail"));
  const hidden = report["findings-detail"].filter(
    (entry) => entry.rule === "core:literal-outside-token-layer" && /url-brace\.css/.test(entry.path || "")
  );
  assert.ok(
    hidden.some((entry) => /sets color to the colour literal #ff0000/.test(entry.violation)),
    `a raw colour hidden behind a url() brace was not found: ${report.findings.join(" | ")}`
  );
  assert.ok(
    hidden.some((entry) => /sets border-radius to the size literal 11px/.test(entry.violation)),
    "only part of the rule a url() brace hid came back into scope"
  );

  // Neither sibling fix moves: a quoted brace is still text, and an unterminated string still
  // recovers at the newline.
  const quotedBrace = parseStylesheet('.trap::before { content: "}"; color: #ff0000; }');
  assert.equal(quotedBrace.length, 1, "a quoted brace opened or closed a block");
  assert.deepEqual(quotedBrace[0].declarations.map((declaration) => declaration.prop), ["content", "color"]);
  const badString = parseStylesheet('.c::before { content: "unterminated\n color: #ff0000; }\n.hint { color: #ff0000; }\n');
  assert.equal(badString.length, 2, "the rule after an unterminated string was read as string content");
  assert.deepEqual(badString[1].selectors, [".hint"]);
});

/*
 * The fail-safe, and then the constructs it was built beside.
 *
 * A hidden declaration is the whole failure mode of this family: the scanner returns fewer
 * declarations than the browser applies, every detector reports nothing against the ones it
 * never saw, and the file is certified clean. Seven members have now been found one at a time,
 * each by a probe, so the eighth is a matter of when and not whether — which is what the
 * fail-safe is for, and what this test holds it to.
 *
 * `HIDDEN_BY_A_CONSTRUCT` is a file the scanner and a browser read differently and the scanner
 * can tell: the second `)` closes nothing, so a browser throws the whole declaration away
 * (css-syntax-3 §2.2 seeks the next `;`) while the scanner reads it as a declaration whose
 * value ends where it guessed. Neither reading is the other's, and the checker must not report
 * that file as clean — not because it knows this construct, but because it knows it could not
 * tokenise the file. The brace inside the function is no longer part of what it cannot read:
 * `image-set(a} b)` is one value now (see the matched-bracket test below), and it is left in
 * here so a regression in that reading would show up as a second unreadable reason.
 */
const HIDDEN_BY_A_CONSTRUCT = [".tile {", "  grid-area: image-set(a} b));", "  --stripe: #ff0000;", "}", ""].join("\n");

test("a stylesheet the scanner cannot tokenise is reported unreadable, and no rule that read it can pass", (t) => {
  // The control first: the same directory without the untokenisable file is a clean pass, so
  // what follows is the fail-safe firing and not a checker that never passes anything.
  const control = check(path.join(FIXTURES, "literal-outside-tokens", "pass"));
  assert.equal(control.verdict, "PASS");
  assert.equal(control.exit, 0);
  assert.deepEqual(control.inputs.unreadable, []);

  const target = fs.mkdtempSync(path.join(os.tmpdir(), "pds-check-"));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  fs.cpSync(path.join(FIXTURES, "literal-outside-tokens", "pass"), target, { recursive: true });
  fs.writeFileSync(path.join(target, "hidden.css"), HIDDEN_BY_A_CONSTRUCT);
  const report = check(target);

  // Nothing found the hidden literal: that is the point. The file is reported unreadable, with
  // the reason, rather than passing on the declarations the scanner did manage to read.
  assert.ok(
    !report["findings-detail"].some((finding) => /hidden\.css/.test(finding.path || "")),
    "the probe construct is no longer hiding its literal, so this test no longer proves the fail-safe"
  );
  assert.equal(report.inputs.unreadable.length, 1, `unreadable: ${JSON.stringify(report.inputs.unreadable)}`);
  assert.match(report.inputs.unreadable[0], /hidden\.css/);
  assert.match(report.inputs.unreadable[0], /does not balance its parentheses/);

  const styleDetectors = loadDetectors(DETECTORS_DIR).filter((detector) => detector.inputs.includes("styles"));
  assert.ok(styleDetectors.length > 0, "no detector reads styles, so this test proves nothing");
  for (const detector of styleDetectors) {
    const entry = report.unjudgeable.find(
      (candidate) => candidate.rule === detector.rule && /hidden\.css/.test(candidate.violation)
    );
    assert.ok(entry, `${detector.rule} read a file the scanner could not tokenise and was not reported UNJUDGEABLE`);
    assert.match(entry.violation, /could not be tokenised/);
    assert.ok(
      !report["findings-detail"].some((finding) => finding.rule === detector.rule && finding.verdict === "PASS"),
      `${detector.rule} passed over a file the scanner could not read`
    );
  }
  // The process exit is what CI gates on, so the unreadable input reaches it.
  assert.equal(report.verdict, "UNJUDGEABLE");
  assert.equal(report.exit, 4);
  const text = cli([target]);
  assert.equal(text.status, 4);
  assert.match(text.stdout, /unreadable\s+.*hidden\.css/);
  assert.match(text.stdout, /does not balance its parentheses/);
});

test("each construct the scanner cannot tokenise is named, and one sinks a level claim", (t) => {
  // One signal per line of the fail-safe. The reasons are prose a reader can act on, so they
  // are asserted as such: a fail-safe nobody can read is a fail-safe nobody acts on.
  const signals = [
    [".a { color: var(--x); }\n/* opened and never closed\n.b { color: #ff0000; }\n", /a comment opened at line 2 is never closed/],
    ['.a { content: "oops', /the string opened at line 1 is still open at end of file/],
    [".a { background: url(sprite.svg", /an unquoted url\(\) token opened at line 1 is still open at end of file/],
    [".a { color: var(--x);\n", /1 block opened and never closed, the outermost at line 1/],
    [".a { color: var(--x); } }\n", /the closing brace at line 1 closes no block/],
    // A function opened and never closed is a block open at end of input, which is what the
    // matched-bracket stack makes of it — a browser ends it at end of input too, and applies
    // nothing after it (§5.4.7). Everything from the `(` on is text no detector ever saw.
    [".a { background: linear-gradient(90deg, red; }\n", /2 blocks opened and never closed, the outermost at line 1/],
    // A closer that matches no opener is a component value to a browser, which then throws the
    // whole declaration away; the scanner keeps it, so the two readings of the file differ and
    // the difference is reported rather than certified over.
    [".a { background: rgb(0, 0, 0)); }\n", /does not balance its parentheses/],
    [".a { color var(--x); }\n", /is not a declaration this scanner can read/],
    // The two escapes this scanner will not decode: one it cannot classify (§4.3.8) and one
    // inside a string that spells a code point the consumers of a value split on.
    [".a { color: var(--x)\\\n; }\n", /escapes nothing this scanner can read/],
    ['.a { font-family: "Foo\\2c Bar"; }\n', /carries a string escape spelling ",", which this scanner will not decode/]
  ];
  for (const [source, expected] of signals) {
    const reasons = scanStylesheet(source).unreadable;
    assert.match(reasons.join(" | "), expected, `a construct the scanner could not read was reported as readable: ${source}`);
  }
  // And the other side of it: an ordinary stylesheet reports nothing, or every file is
  // unreadable and the fail-safe means nothing.
  for (const source of [
    ".a { color: var(--x); }\n",
    '.a::before { content: "}"; color: var(--x); }\n',
    ".a { background: url(a}b); color: var(--x); }\n",
    ".a { background: url(a/*b); color: var(--x); }\n",
    ".a { font-family: A\\}B; color: var(--x); }\n",
    "@media (prefers-reduced-motion: reduce) {\n  * { animation: none; }\n}\n"
  ]) {
    assert.deepEqual(scanStylesheet(source).unreadable, [], `an ordinary stylesheet was reported unreadable: ${source}`);
  }

  /*
   * End to end, on the run that verifies: the sound run gains one rule carrying the same
   * construct, its raw colour is invisible to every detector, and before the fail-safe the
   * document certified L3 with PASS and exit 0 over a file the checker had not read.
   */
  const run = mutatedRun(t, [
    { file: "panel.css", from: ".record__code {", to: `${HIDDEN_BY_A_CONSTRUCT}\n.record__code {` }
  ]);
  const report = check(run, { level: "L3" });
  assert.ok(
    report.inputs.unreadable.some((entry) => /panel\.css/.test(entry)),
    `the mutated stylesheet was read as tokenisable: ${JSON.stringify(report.inputs.unreadable)}`
  );
  assert.equal(report.level.verified, null, "a level verified over a file the scanner could not read");
  assert.ok(unmet(report).includes("pds-check:l3-system-rules"), `unmet: ${unmet(report).join(", ")}`);
  assert.notEqual(report.exit, 0, "a run over an unreadable source exited clean");
});

test("a comment delimiter inside an unquoted url() is text, and the declarations after it are still read", () => {
  /*
   * Round-03, named and left unfixed by the pass before this one. Comments are consumed by the
   * top-level tokenizer and never inside a url token (§4.3.2, §4.3.6), so the delimiter in
   * `url(a/*b)` is two ordinary code points and a browser applies every declaration after it.
   * The comment stripper ran first and knew nothing about url tokens: it opened a comment there
   * and blanked the rest of the file, so the rule came back with no declarations at all and the
   * raw colour in it was judged by nothing. Same family, same false clean, one layer earlier.
   */
  const source = ".a { background: url(a/*b); color: #ff0000; }";
  const blocks = parseStylesheet(source);
  assert.equal(blocks.length, 1, "a comment delimiter inside an unquoted url() opened or closed a block");
  assert.deepEqual(
    blocks[0].declarations.map((declaration) => declaration.prop),
    ["background", "color"],
    "a declaration after a comment delimiter inside an unquoted url() was lost"
  );
  assert.equal(blocks[0].declarations[0].value, "url(a/*b)", "the url token was cut short at the delimiter");
  // The stripper leaves the delimiter where the url token carries it, and moves no offset.
  assert.equal(stripComments(source), source, "a delimiter inside a url token was stripped as a comment");

  // A genuine comment is still stripped, including one that mentions a url token: whichever
  // construct opens first wins, which is the order the tokenizer reads them in.
  const commented = "/* url(a */ .b { color: #ff0000; }";
  const stripped = stripComments(commented);
  assert.ok(!stripped.includes("url("), "a comment holding a url token was left in place");
  assert.equal(stripped.length, commented.length, "stripping moved the offsets the line numbers rest on");
  assert.deepEqual(
    parseStylesheet(commented).map((block) => block.selector),
    [".b"],
    "a comment holding a url token was read as structure"
  );

  const report = check(path.join(FIXTURES, "literal-outside-tokens", "fail"));
  const hidden = report["findings-detail"].filter(
    (entry) => entry.rule === "core:literal-outside-token-layer" && /url-comment\.css/.test(entry.path || "")
  );
  assert.ok(
    hidden.some((entry) => /sets color to the colour literal #ff0000/.test(entry.violation)),
    `a raw colour hidden behind a delimiter inside a url token was not found: ${report.findings.join(" | ")}`
  );
  assert.ok(
    hidden.some((entry) => /sets border-radius to the size literal 11px/.test(entry.violation)),
    "only part of the rule a delimiter inside a url token hid came back into scope"
  );
});

test("an escaped brace is part of the ident, and the declarations after it are still read", () => {
  /*
   * Round-03, the second construct named and left unfixed. §4.3.7 makes the escaped code point
   * part of the ident that carries it, so `A\}B` is one value and `.a\}` is one selector; a
   * browser applies the declarations after either. The scanner read the brace as structure,
   * closed a block the stylesheet never closed, and every declaration after it fell outside any
   * rule — the quoted-brace hole reached from a third side, with the same raw colour shipping
   * unjudged.
   */
  const value = parseStylesheet(".a { font-family: A\\}B; color: #ff0000; }");
  assert.equal(value.length, 1, "an escaped brace in a value opened or closed a block");
  assert.deepEqual(
    value[0].declarations.map((declaration) => declaration.prop),
    ["font-family", "color"],
    "a declaration after an escaped brace was lost"
  );
  // Both spellings survive: the file's, so a reader can find it, and the browser's, so every
  // detector matches what is applied rather than what is typed.
  assert.equal(value[0].declarations[0].rawValue, "A\\}B", "the escape was cut out of the value");
  assert.equal(value[0].declarations[0].value, "A}B", "the escape was not decoded into what it spells");

  const selector = parseStylesheet(".a\\} { color: #ff0000; }");
  assert.equal(selector.length, 1, "an escaped brace in a selector opened or closed a block");
  assert.deepEqual(selector[0].selectors, [".a\\}"], "the escape was cut out of the selector");
  assert.deepEqual(selector[0].declarations.map((declaration) => declaration.prop), ["color"]);

  // The same rule reaches the other code points that carry structure: an escaped colon divides
  // no declaration, and an escaped quote opens no string.
  assert.deepEqual(
    parseStylesheet(".a { grid-area: a\\:b; color: #ff0000; }")[0].declarations.map((d) => `${d.rawProp}=${d.rawValue}`),
    ["grid-area=a\\:b", "color=#ff0000"]
  );
  assert.deepEqual(
    parseStylesheet(".a { grid-area: a\\:b; color: #ff0000; }")[0].declarations.map((d) => `${d.prop}=${d.value}`),
    ["grid-area=a:b", "color=#ff0000"]
  );
  assert.deepEqual(
    parseStylesheet('.a { content: \\"; color: #ff0000; }')[0].declarations.map((d) => d.prop),
    ["content", "color"]
  );

  const report = check(path.join(FIXTURES, "literal-outside-tokens", "fail"));
  const hidden = report["findings-detail"].filter(
    (entry) => entry.rule === "core:literal-outside-token-layer" && /escaped-brace\.css/.test(entry.path || "")
  );
  assert.ok(
    hidden.some((entry) => /sets color to the colour literal #ff0000/.test(entry.violation)),
    `a raw colour hidden behind an escaped brace was not found: ${report.findings.join(" | ")}`
  );
  assert.ok(
    hidden.some((entry) => /sets border-radius to the size literal 11px/.test(entry.violation)),
    "only part of the rule an escaped brace hid came back into scope"
  );
});

/*
 * Round-04 codex-1, filed exactly as the probe was filed: the sixth member of the family, and
 * the first to get past the fail-safe as well as past the scanner.
 *
 * CSS decodes an ident's escapes before it decides what token the ident opens (§4.3.7, §4.3.4),
 * so `u\72l(` is the `url` ident and everything after its `(` is url content up to the closing
 * `)` (§4.3.6). Chromium closed the url at that paren and applied `color: #ff0000`; the comment
 * stripper recognised only a literal `url(`, opened a comment at the delimiter inside the url
 * token, blanked through the closing delimiter that came after the colour, and deleted the
 * declaration. What was left balanced its parentheses and braces, so the scanner recorded no
 * reason it could not read the file: `check --level L3 --json` returned verdict PASS, exit 0,
 * verified L3, an empty unreadable list and no raw-literal finding, over a stylesheet whose
 * CSSOM was `.probe { background: url("a/*"); color: rgb(255, 0, 0); }`.
 */
const ESCAPED_URL_IDENT = [".probe {", "  background: u\\72l(a/*) ; color: #ff0000; */b);", "}", ""].join("\n");

// The passing control the counter-proposal asks for beside it: ordinary escaped selectors are
// not this construct, and decoding escapes must not turn a utility class into a finding.
const ESCAPED_SELECTORS = [
  "/* Escaped selectors of the kind a utility framework emits, and one escaped ident that",
  "   spells something other than url. Every governed value resolves through the token layer. */",
  ".md\\:flex { display: flex; }",
  ".w-\\[10px\\] { color: var(--color-text-body); }",
  ".\\32 xl\\:block { display: block; }",
  ".u\\72 lish { background-color: var(--color-surface-page); }",
  ".panel { grid-template: fn(a, {b: c}); padding: var(--space-gap-md); }",
  ""
].join("\n");

test("an escaped spelling of the url ident opens the same token, and hides nothing", (t) => {
  // The scanner half. An escaped `url` opens a url token, so a brace inside that token is
  // ordinary text and the declaration after it is still read.
  const blocks = parseStylesheet(".a { background: u\\72l(a}b); color: #ff0000; }");
  assert.equal(blocks.length, 1, "an escaped url ident let a brace inside the token close a block");
  assert.deepEqual(
    blocks[0].declarations.map((declaration) => declaration.prop),
    ["background", "color"],
    "a declaration after an escaped url ident was lost"
  );
  assert.equal(blocks[0].declarations[0].rawValue, "u\\72l(a}b)", "the url token was cut short");
  // §4.3.4 decides the token's class on what the ident spells, and so does every detector now.
  assert.equal(blocks[0].declarations[0].value, "url(a}b)", "the escaped url ident was not decoded");

  // §4.3.7: a hex escape takes up to six digits and one trailing whitespace with it, and the
  // token test is on what the ident spells — case-insensitively — never on how it is written.
  for (const spelling of ["\\75 rl", "U\\52 L", "\\75\\72\\6c"]) {
    assert.deepEqual(
      parseStylesheet(`.a { background: ${spelling}(a}b); color: #ff0000; }`)[0].declarations.map((d) => d.prop),
      ["background", "color"],
      `${spelling} was not read as the url ident`
    );
  }
  // And an escaped ident that spells something else opens no url token, exactly as `myurl(`
  // does not: the escape is read, and then it is read as what it says.
  assert.deepEqual(
    parseStylesheet(".a { background: my\\75 rl(a); color: #ff0000; }")[0].declarations.map((d) => `${d.rawProp}=${d.rawValue}`),
    ["background=my\\75 rl(a)", "color=#ff0000"]
  );
  assert.deepEqual(
    parseStylesheet(".a { background: my\\75 rl(a); color: #ff0000; }")[0].declarations.map((d) => `${d.prop}=${d.value}`),
    ["background=myurl(a)", "color=#ff0000"]
  );

  /*
   * End to end, on the run that verifies, with codex-1's probe byte for byte. Its counter-
   * proposal fixes what the run must produce: the raw-literal violation, or unreadable and
   * UNJUDGEABLE with exit 4. A clean pass is the failure this test exists to catch.
   */
  const run = mutatedRun(t, [{ file: "probe.css", write: ESCAPED_URL_IDENT }]);
  const report = check(run, { level: "L3" });
  const raw = report["findings-detail"].filter(
    (entry) => entry.rule === "core:literal-outside-token-layer" && /probe\.css/.test(entry.path || "")
  );
  const unreadable = report.inputs.unreadable.filter((entry) => /probe\.css/.test(entry));
  assert.ok(
    raw.length > 0 || unreadable.length > 0,
    `the escaped url ident hid its colour from the detectors and from the fail-safe both: ${JSON.stringify(report)}`
  );
  assert.ok(
    raw.some((entry) => /\.probe sets color to the colour literal #ff0000/.test(entry.violation)),
    `the colour a browser applies to .probe was not reported: ${report.findings.join(" | ")}`
  );
  assert.notEqual(report.verdict, "PASS", "a stylesheet hiding an applied colour was certified clean");
  assert.notEqual(report.exit, 0, "a run over a hidden applied colour exited clean");
  assert.equal(report.level.verified, null, "L3 was verified over a declaration no detector saw");
  // The process exit is what CI gates on, so the refusal has to reach it.
  assert.notEqual(cli(["--level", "L3", run]).status, 0, "the CLI exited clean over the probe");

  // The control: reading escapes properly must not manufacture findings against ordinary CSS.
  const control = mutatedRun(t, [{ file: "escaped-selectors.css", write: ESCAPED_SELECTORS }]);
  const clean = check(control, { level: "L3" });
  assert.deepEqual(clean.inputs.unreadable, [], "an ordinary escaped selector was reported unreadable");
  assert.deepEqual(
    clean["findings-detail"].map((finding) => `${finding.rule}: ${finding.violation}`),
    [],
    "an ordinary escaped selector raised a finding"
  );
  assert.equal(clean.verdict, "PASS");
  assert.equal(clean.exit, 0);
  assert.equal(clean.level.verified, "L3");
});

/*
 * Round-04 kimi-1, CRITICAL, filed with its three reproducers.
 *
 * css-syntax-3 §5.4 makes `(`, `[` and `{` matched simple blocks: a brace inside a function or a
 * bracket is a component value, never rule structure. The scanner read `{` and `}` as structure
 * wherever they appeared, so any function carrying a brace closed the rule early, everything
 * between there and the next `{` was dropped as top-level text, and that `{` opened a phantom
 * block. One re-balancing brace left every residue check quiet — each flushed fragment balanced
 * its own parentheses while the structure between flushes was wrong — so all three of these
 * returned `verified L3`, PASS, exit 0 and `unreadable: []` while a browser applied the colour.
 * ev2 needs no escape and no malformed input: it is ordinary CSS any minifier can emit.
 */
const BRACE_IN_A_BLOCK = {
  "ev1 an escaped url ident": ".a { background: x) \\75 rl(}y); color: #ff0000; dummy: z) \\75 rl({w: (1); }\n",
  "ev2 an ordinary function": ".a { background: x) fn(}y); color: #ff0000; dummy: z) fn({w: (1); }\n",
  "ev3 url and a space": ".a { background: x) url (}y); color: #ff0000; dummy: z) url ({w: (1); }\n"
};

test("a brace inside a function or a bracket is content, and the declaration after it is still read", (t) => {
  // The scanner half, on all three reproducers: one rule, and the colour a browser applies is
  // in it. Before the matched-bracket stack each of these returned two blocks — `.a` without
  // its colour, and a phantom whose selector was the text the scanner had dropped.
  for (const [name, source] of Object.entries(BRACE_IN_A_BLOCK)) {
    const blocks = parseStylesheet(source);
    assert.deepEqual(blocks.map((block) => block.selector), [".a"], `${name} opened or closed a block`);
    assert.ok(
      blocks[0].declarations.some((d) => d.prop === "color" && d.value === "#ff0000"),
      `${name} hid the colour a browser applies: ${JSON.stringify(blocks[0].declarations)}`
    );
  }

  // The same shape without the re-balancing brace, and the bracket form of it. A `[` opens a
  // simple block too, so a brace inside an attribute selector or a track list is content.
  for (const source of [
    ".a { background: image-set(a} b); color: #ff0000; }",
    ".a { background: linear-gradient(to top, red } blue); color: #ff0000; }",
    ".a { grid-template-columns: [a}b] 1fr; color: #ff0000; }",
    ".a { background: u\\72l/*x*/(a}b); color: #ff0000; }"
  ]) {
    const blocks = parseStylesheet(source);
    assert.equal(blocks.length, 1, `a brace inside a block opened or closed a rule: ${source}`);
    assert.ok(
      blocks[0].declarations.some((d) => d.prop === "color" && d.value === "#ff0000"),
      `a declaration after a brace inside a block was lost: ${source}`
    );
  }

  // The seventh construct beside the six the combined test carries, so a fix for it cannot cost
  // one of them: every rule below is read, and none of them is reported unreadable.
  const together = [
    '.one::before { content: "}"; color: #ff0000; }',
    ".three { background: url(a}b); color: #ff0000; }",
    ".five { font-family: A\\}B; color: #ff0000; }",
    ".six { background: u\\72l(a}b); color: #ff0000; }",
    ".seven { background: fn(a}b); color: #ff0000; }"
  ].join("\n");
  const scan = scanStylesheet(together);
  assert.deepEqual(
    scan.blocks.map((block) => block.selector),
    [".one::before", ".three", ".five", ".six", ".seven"],
    "one of the seven constructs closed a block the stylesheet never closed"
  );
  assert.deepEqual(scan.unreadable, [], "a readable stylesheet was reported unreadable");

  /*
   * The passing side kimi-1 asks for beside them. A `{…}` inside a function is a value, a `;`
   * inside one is a preserved token and not a declaration edge, and a closer that matches no
   * opener is a component value a browser hands to the declaration and then throws away — the
   * scanner keeps reading the file at all three, and reports nothing it did not have to.
   */
  const control = scanStylesheet(".a { grid-template: var(--x, {a: b}); transition: fn(1;2); color: var(--y); }\n");
  assert.deepEqual(control.blocks.map((block) => block.selector), [".a"]);
  assert.deepEqual(
    control.blocks[0].declarations.map((d) => d.prop),
    ["grid-template", "transition", "color"],
    "a brace or a semicolon inside a function was read as structure"
  );
  assert.deepEqual(control.unreadable, [], "an ordinary function value was reported unreadable");
  assert.deepEqual(
    parseStylesheet("@media (min-width: 40em) { .a[data-x] { color: var(--y); } }").map((b) => b.selector),
    [".a[data-x]"],
    "the bracket stack swallowed an at-rule prelude or an attribute selector"
  );

  /*
   * End to end, on the run that verifies. kimi-1's counter-proposal fixes what each must
   * produce: the finding, or unreadable and UNJUDGEABLE. A clean pass is the failure.
   */
  for (const [name, source] of Object.entries(BRACE_IN_A_BLOCK)) {
    const run = mutatedRun(t, [{ file: "probe.css", write: source }]);
    const report = check(run, { level: "L3" });
    const raw = report["findings-detail"].filter(
      (entry) => entry.rule === "core:literal-outside-token-layer" && /probe\.css/.test(entry.path || "")
    );
    const unreadable = report.inputs.unreadable.filter((entry) => /probe\.css/.test(entry));
    assert.ok(
      raw.length > 0 || unreadable.length > 0,
      `${name} hid its colour from the detectors and from the fail-safe both: ${JSON.stringify(report)}`
    );
    assert.ok(
      raw.some((entry) => /\.a sets color to the colour literal #ff0000/.test(entry.violation)),
      `${name}: the colour a browser applies to .a was not reported: ${report.findings.join(" | ")}`
    );
    assert.notEqual(report.verdict, "PASS", `${name} certified a stylesheet hiding an applied colour`);
    assert.notEqual(report.exit, 0, `${name} exited clean over a hidden applied colour`);
    assert.equal(report.level.verified, null, `${name} verified L3 over a declaration no detector saw`);
    // The process exit is what CI gates on, so the refusal has to reach it.
    assert.notEqual(cli(["--level", "L3", run]).status, 0, `${name}: the CLI exited clean over the probe`);
  }
});

/*
 * Round-04, found while closing the escaped-url evasion and verified against headless Chromium.
 *
 * The scanner tokenises escapes correctly and the fail-safe correctly stays quiet — and the
 * certificate was still false one layer up, because every detector matched the RAW text of a
 * declaration while a browser matches the DECODED one. `literal-outside-tokens` regexes
 * `#[0-9a-fA-F]{3,8}` and never sees `#\66 f0000`; the governed-property test never sees
 * `col\6fr` as `color`. Each of the four below, dropped beside the sound run at `--level L3`,
 * returned PASS, exit 0, verified L3, an empty unreadable list and zero findings while Chromium
 * computed the value in the second column. This is generic to all eighteen detectors.
 */
const SPELLED_NOT_WRITTEN = [
  ["an escaped hex colour", "color: #\\66 f0000", /sets color to the colour literal #ff0000/, "rgb(255, 0, 0)"],
  ["an escaped property name", "col\\6fr: #ff0000", /sets color to the colour literal #ff0000/, "rgb(255, 0, 0)"],
  ["an escaped named colour", "color: \\72 ed", /sets color to the colour literal red/, "red"],
  ["an escaped unit", "border-radius: 11p\\78", /sets border-radius to the size literal 11px/, "11px"]
];

test("a declaration is matched as it spells, not as it is written", (t) => {
  // The scanner half: both spellings come back, and the spelled one is what a browser computes.
  const decoded = (source) => parseStylesheet(`.probe { ${source}; }`)[0].declarations[0];
  assert.equal(decoded("color: #\\66 f0000").value, "#ff0000");
  assert.equal(decoded("color: #\\66 f0000").rawValue, "#\\66 f0000");
  assert.equal(decoded("col\\6fr: #ff0000").prop, "color");
  assert.equal(decoded("col\\6fr: #ff0000").rawProp, "col\\6fr");
  assert.equal(decoded("color: \\72 ed").value, "red");
  assert.equal(decoded("border-radius: 11p\\78").value, "11px");
  // Case-insensitively, in every escape form §4.3.7 allows, and on the custom-property prefix
  // the token layer is recognised by.
  assert.equal(decoded("color: \\52 \\45 D").value, "RED");
  assert.equal(decoded("\\2d\\2d brand: #ff0000").prop, "--brand");
  // A hex escape takes up to six digits, so the digits of the next word are its digits too:
  // `\2d\2dbrand` spells `-˛rand` in a browser and has to spell it here.
  assert.equal(decoded("\\2d\\2dbrand: #ff0000").prop, "-˛rand");

  /*
   * A string's contents are decoded only as far as they can be decoded safely. `"\49 nter"` is
   * `Inter` to a browser, and the face rules have to read it as `Inter` or no allowlist and no
   * annex will ever match it. An escape spelling a code point the consumers of a value split on
   * — a comma, a quote, a backslash — would corrupt the value instead, so the string is left as
   * written and the file goes to the fail-safe rather than to a detector that cannot trust it.
   */
  assert.equal(decoded('font-family: "\\49 nter"').value, '"Inter"');
  assert.deepEqual(scanStylesheet('.a { font-family: "\\49 nter"; }').unreadable, []);
  const corrupting = scanStylesheet('.a { font-family: "Foo\\2c Bar"; }');
  assert.equal(corrupting.blocks[0].declarations[0].value, '"Foo\\2c Bar"', "a comma was decoded into a value");
  assert.match(corrupting.unreadable.join(" | "), /string escape spelling ","/);
  // And a url token's contents stay as written, so a decoded `\29` cannot put a `)` in a value.
  assert.equal(decoded("background: u\\72l(a\\29 b)").value, "url(a\\29 b)");

  /*
   * The same defect one layer out, found while closing the four above: `var()` references were
   * matched by a regular expression over the raw line. Chromium resolves `\76 ar(--nope)` and
   * `var(\2d\2d nope)` alike — the fallback in `.probe { grid-area: \76 ar(--nope, #ff0000) }`
   * computes to `rgb(255, 0, 0)` — while `core:token-used-undeclared` reported nothing and the
   * run certified L3 with PASS and exit 0. The fail-safe never sees this one: the file
   * tokenises, so `unreadable` is correctly empty.
   */
  assert.deepEqual(
    varUses(".probe { grid-area: \\76 ar(--nope); }").map((use) => use.name),
    ["--nope"],
    "an escaped var ident hid a reference to an undeclared token"
  );
  assert.deepEqual(
    varUses(".probe { grid-area: var(\\2d\\2d nope); }").map((use) => use.name),
    ["--nope"],
    "an escaped custom-property name hid a reference to an undeclared token"
  );
  // And the line numbers, and the ordinary lines beside them, survive the decoding.
  assert.deepEqual(
    varUses(".md\\:flex { color: var(--a); }\n.b { color: var(--c); }").map((use) => `${use.name}@${use.line}`),
    ["--a@1", "--c@2"]
  );
  for (const source of ["grid-area: \\76 ar(--nope);", "grid-area: var(\\2d\\2d nope);"]) {
    const run = mutatedRun(t, [{ file: "probe.css", write: `.probe {\n  ${source}\n}\n` }]);
    const report = check(run, { level: "L3" });
    assert.ok(
      report["findings-detail"].some(
        (entry) => entry.rule === "core:token-used-undeclared" && /references --nope/.test(entry.violation)
      ),
      `${source}: the reference a browser resolves was not reported: ${report.findings.join(" | ")}`
    );
    assert.notEqual(report.verdict, "PASS", `${source} certified a reference to an undeclared token`);
    assert.equal(report.level.verified, null, `${source} verified L3 over a reference no rule saw`);
  }

  /*
   * End to end, on the run that verifies, one file per reproducer. Each must produce the
   * finding, or unreadable and UNJUDGEABLE; a clean pass is the failure this test exists to
   * catch. The message names the value a browser applies and the spelling the file carries,
   * because the second is what a reader has to search for.
   */
  for (const [name, source, expected] of SPELLED_NOT_WRITTEN) {
    const run = mutatedRun(t, [{ file: "probe.css", write: `.probe {\n  ${source};\n}\n` }]);
    const report = check(run, { level: "L3" });
    const found = report["findings-detail"].filter((entry) => /probe\.css/.test(entry.path || ""));
    const unreadable = report.inputs.unreadable.filter((entry) => /probe\.css/.test(entry));
    assert.ok(
      found.length > 0 || unreadable.length > 0,
      `${name} was invisible to every detector and to the fail-safe both: ${JSON.stringify(report)}`
    );
    assert.ok(
      found.some((entry) => entry.rule === "core:literal-outside-token-layer" && expected.test(entry.violation)),
      `${name}: the value a browser applies was not reported: ${report.findings.join(" | ")}`
    );
    assert.ok(
      found.some((entry) => entry.violation.includes(`(written \`${source}\`)`)),
      `${name}: the finding did not name the spelling the file carries: ${report.findings.join(" | ")}`
    );
    assert.notEqual(report.verdict, "PASS", `${name} certified a stylesheet carrying an applied literal`);
    assert.notEqual(report.exit, 0, `${name} exited clean over an applied literal`);
    assert.equal(report.level.verified, null, `${name} verified L3 over a literal no detector saw`);
    assert.notEqual(cli(["--level", "L3", run]).status, 0, `${name}: the CLI exited clean over the probe`);
  }

  // The control, once: decoding must not manufacture a finding out of ordinary escaped CSS.
  const control = mutatedRun(t, [{ file: "escaped-selectors.css", write: ESCAPED_SELECTORS }]);
  const clean = check(control, { level: "L3" });
  assert.deepEqual(clean.inputs.unreadable, [], "an ordinary escaped selector was reported unreadable");
  assert.deepEqual(clean["findings-detail"].map((finding) => `${finding.rule}: ${finding.violation}`), []);
  assert.equal(clean.verdict, "PASS");
  assert.equal(clean.exit, 0);
  assert.equal(clean.level.verified, "L3");
});

/*
 * Round-05 codex-1, CRITICAL, filed with the probe and the browser reading beside it.
 *
 * The eighth member, and the one that ended the practice of closing them one at a time. The
 * round-04 fix tracked `(` and `[` but let a `{` inside one of them stay content, so the stack
 * stopped describing the file: a browser keeps the `)` in `fn({)` inside the brace block, while
 * the scanner popped the function there, read the next `}` as the end of the rule, dropped
 * `color: #ff0000` as top-level text no rule owned, and opened a phantom rule at the later `{`.
 * Everything ended balanced, so `unreadable` was `[]`, L3 verified, verdict PASS, exit 0 — over
 * a stylesheet whose CSSOM was `.probe { color: rgb(255, 0, 0); }`.
 *
 * What replaced it is the block model itself (§5.4.4), not a ninth special case: one stack, a
 * closer that pops only its own opener, and `{`, `}` and `;` as structure only where no
 * component-value block is open. Each probe below is checked against headless Chromium; the
 * controls beside them are the ordinary shape of the same construct, and a finding against one
 * of those would be the false positive that makes a gate get switched off.
 */
const NESTED_CURLY_BLOCK = {
  "codex-1's probe, byte for byte": [
    ".probe {",
    "  background: fn({) }x);",
    "  color: #ff0000;",
    "  dummy: fn({) {y: (1);",
    "}",
    ""
  ].join("\n"),
  "the same shape through a bracket": [
    ".probe {",
    "  grid-template-columns: [{] }a] 1fr;",
    "  color: #ff0000;",
    "  dummy: [{] {y: [1];",
    "}",
    ""
  ].join("\n"),
  "the same shape with no re-balancing brace": ".probe { background: fn({) }x); color: #ff0000; }\n",
  "the same shape two blocks deep": ".probe { background: fn({{)}}x); color: #ff0000; }\n"
};

test("a curly block nested inside a function or a bracket is a value, and hides no declaration", (t) => {
  /*
   * The scanner half. Chromium applies `color: #ff0000` to `.probe` in every one of these and
   * reports one rule; so must the scanner, or the phantom-rule shape is back.
   */
  for (const [name, source] of Object.entries(NESTED_CURLY_BLOCK)) {
    const scan = scanStylesheet(source);
    assert.deepEqual(scan.blocks.map((block) => block.selector), [".probe"], `${name} opened a phantom rule`);
    assert.ok(
      scan.blocks[0].declarations.some((d) => d.prop === "color" && d.value === "#ff0000"),
      `${name} hid the colour a browser applies: ${JSON.stringify(scan.blocks[0].declarations)}`
    );
  }
  // A block still open at end of input is the residue codex-1's probe leaves, and it reaches
  // the fail-safe: the model reads the colour *and* says what it could not close.
  assert.match(
    scanStylesheet(NESTED_CURLY_BLOCK["codex-1's probe, byte for byte"]).unreadable.join(" | "),
    /3 blocks opened and never closed/
  );

  /*
   * The passing side codex-1 asks for: braces inside `var()`-style functions. A matched `{…}`
   * in a component value is ordinary CSS, and the scanner must read straight through it —
   * every declaration present, one rule, and nothing reported.
   */
  for (const source of [
    ".a { background: fn({b: c}); color: var(--x); }\n",
    ".a { grid-template: var(--x, {a: b}); color: var(--y); }\n",
    ".a { grid-template-columns: [{a}] 1fr; color: var(--x); }\n",
    ".a { background: fn(g({a: b}), h({c: d})); color: var(--x); }\n",
    ".a { background: fn({ {} }); color: var(--x); }\n"
  ]) {
    const scan = scanStylesheet(source);
    assert.deepEqual(scan.blocks.map((block) => block.selector), [".a"], `a matched curly block broke a rule: ${source}`);
    assert.ok(
      scan.blocks[0].declarations.some((d) => d.prop === "color"),
      `a declaration after a matched curly block was lost: ${source}`
    );
    assert.deepEqual(scan.unreadable, [], `an ordinary function value was reported unreadable: ${source}`);
  }

  /*
   * The same rule one step further out, found while building the model and checked against
   * Chromium: a custom property's value may be a `{…}` block, and Chromium's CSSOM for
   * `.a { --x: { color: #ff0000 }; }` is that one declaration applying the colour to nothing.
   * Reading the brace as a nested rule put the colour in a phantom block and reported a raw
   * literal no browser paints. A nested rule is still a nested rule: only a custom property
   * opens a value block here, and `&:hover {` and `.b {` carry a name and a colon too.
   */
  for (const [source, expected] of [
    [".a { --x: { color: #ff0000 }; color: var(--y); }", [".a { --x: { color: #ff0000 }; color: var(--y) }"]],
    [".a { --x: a{b}c; color: var(--y); }", [".a { --x: a{b}c; color: var(--y) }"]],
    [".a { \\2d\\2d x: { color: #ff0000 }; }", [".a { --x: { color: #ff0000 } }"]],
    [".a { &:hover { color: var(--y); } }", [".a {  }", "&:hover { color: var(--y) }"]],
    [".a { .b { color: var(--y); } }", [".a {  }", ".b { color: var(--y) }"]]
  ]) {
    const scan = scanStylesheet(source);
    assert.deepEqual(
      scan.blocks.map((b) => `${b.selector} { ${b.declarations.map((d) => `${d.prop}: ${d.value}`).join("; ")} }`),
      expected,
      `a custom-property value block or a nested rule was read as the other: ${source}`
    );
    assert.deepEqual(scan.unreadable, [], `ordinary CSS was reported unreadable: ${source}`);
  }

  /*
   * End to end, on the run that verifies. codex-1's counter-proposal fixes what each must
   * produce: the raw-literal finding, or unreadable and UNJUDGEABLE. A clean pass is the
   * failure this test exists to catch, because that is what the probe produced.
   */
  for (const [name, source] of Object.entries(NESTED_CURLY_BLOCK)) {
    const run = mutatedRun(t, [{ file: "probe.css", write: source }]);
    const report = check(run, { level: "L3" });
    const raw = report["findings-detail"].filter(
      (entry) => entry.rule === "core:literal-outside-token-layer" && /probe\.css/.test(entry.path || "")
    );
    const unreadable = report.inputs.unreadable.filter((entry) => /probe\.css/.test(entry));
    assert.ok(
      raw.length > 0 || unreadable.length > 0,
      `${name} hid its colour from the detectors and from the fail-safe both: ${JSON.stringify(report)}`
    );
    assert.ok(
      raw.some((entry) => /\.probe sets color to the colour literal #ff0000/.test(entry.violation)),
      `${name}: the colour a browser applies to .probe was not reported: ${report.findings.join(" | ")}`
    );
    assert.notEqual(report.verdict, "PASS", `${name} certified a stylesheet hiding an applied colour`);
    assert.notEqual(report.exit, 0, `${name} exited clean over a hidden applied colour`);
    assert.equal(report.level.verified, null, `${name} verified L3 over a declaration no detector saw`);
    // The process exit is what CI gates on, so the refusal has to reach it.
    assert.notEqual(cli(["--level", "L3", run]).status, 0, `${name}: the CLI exited clean over the probe`);
  }
});

/*
 * Round-05 codex-1, MAJOR, and the other half of the same lesson.
 *
 * Matching detectors against the decoded spelling was right; discovering `var()` uses by
 * decoding whole source lines was not. The decoder does not know which bytes are a selector, so
 * the utility class `.supports-\[var\(--ghost\)\]` spelled `.supports-[var(--ghost)]` and
 * `--ghost` was reported as a reference to an undeclared token — a clean L3 run at `e3ca916`
 * turned into VIOLATION, unverified L3 and exit 1 at `f1c123d` over ordinary CSS.
 *
 * A false finding is as damaging as a false clean: it is the failure mode that makes a rule
 * system get switched off. So uses are discovered from parsed declaration values, and the two
 * fixtures are asserted together — the escaped selector stays clean, and the escaped reference
 * that a browser really does resolve keeps being found.
 */
const ESCAPED_VAR_SELECTOR = [".supports-\\[var\\(--ghost\\)\\] {", "  color: var(--color-text-body);", "}", ""].join("\n");

test("a var() use is read from a declaration value, never from a decoded selector", (t) => {
  // The scanner half, on codex-1's fixture: one reference, and it is the declared one.
  assert.deepEqual(
    varUses(ESCAPED_VAR_SELECTOR).map((use) => `${use.name}@${use.line}`),
    ["--color-text-body@2"],
    "escaped selector text was read as a var() reference"
  );
  // The same for the shapes a utility framework emits, and for a comment that mentions a token.
  assert.deepEqual(varUses(".w-\\[var\\(--ghost\\)\\] { display: flex; }").map((use) => use.name), []);
  assert.deepEqual(varUses("/* var(--ghost) is deliberately not used here */\n.a { color: red; }").map((u) => u.name), []);

  // And the true positive it must not cost: a browser resolves these, so the checker reads them.
  assert.deepEqual(varUses(".probe { grid-area: \\76 ar(--nope); }").map((use) => use.name), ["--nope"]);
  assert.deepEqual(varUses(".probe { grid-area: var(\\2d\\2d nope); }").map((use) => use.name), ["--nope"]);

  /*
   * Markup is not CSS and is read as written — a `class` attribute's arbitrary utility value is
   * a real reference site and carries no CSS escapes to decode. A `<style>` element is CSS, so
   * it goes through the stylesheet path and an escaped spelling inside one is still found.
   */
  assert.deepEqual(
    markupVarUses(
      [
        '<p class="mt-2 text-[var(--utility)]">x</p>',
        '<span style="color: var(--inline)">y</span>',
        "<style>",
        "  .a { color: \\76 ar(--in-style); }",
        "</style>"
      ].join("\n")
    ).map((use) => `${use.name}@${use.line}`),
    ["--utility@1", "--inline@2", "--in-style@4"]
  );

  /*
   * End to end, on the run that verifies. The escaped selector is a clean L3 pass; the escaped
   * reference beside it is still a finding. Neither result may move without the other.
   */
  const clean = check(mutatedRun(t, [{ file: "supports.css", write: ESCAPED_VAR_SELECTOR }]), { level: "L3" });
  assert.deepEqual(
    clean["findings-detail"].map((finding) => `${finding.rule}: ${finding.violation}`),
    [],
    "an ordinary escaped selector raised a finding"
  );
  assert.deepEqual(clean.inputs.unreadable, [], "an ordinary escaped selector was reported unreadable");
  assert.equal(clean.verdict, "PASS");
  assert.equal(clean.exit, 0);
  assert.equal(clean.level.verified, "L3");

  const found = check(mutatedRun(t, [{ file: "probe.css", write: ".probe {\n  grid-area: \\76 ar(--nope);\n}\n" }]), {
    level: "L3"
  });
  assert.ok(
    found["findings-detail"].some(
      (entry) => entry.rule === "core:token-used-undeclared" && /references --nope/.test(entry.violation)
    ),
    `the escaped reference a browser resolves was not reported: ${found.findings.join(" | ")}`
  );
  assert.notEqual(found.exit, 0);
});

/*
 * Round-05 hermes-1, MAJOR, and the arm of this family that is not about tokenisation.
 *
 * The block model says where a block begins and ends. It does not say whether the things inside
 * one are rules or declarations, and a declaration with no rule to be attributed to was dropped
 * — silently, because dropping it is what a browser does with a bare declaration inside
 * `@media`. It is not what Chromium does inside `@scope`: it applies the declaration to the
 * scope root, and `@scope (.probe) { color: #ff0000 }` returned PASS, exit 0, verified L3 and
 * `unreadable: []` while the browser painted it red.
 *
 * Widening the fail-safe to report every such discard was available and is not the fix: it
 * would report `@font-face` in nearly every real stylesheet, and a rule that fires everywhere
 * is a rule that gets switched off. So the at-rules whose body is a list of declarations are
 * modelled as declaration blocks, the at-rules whose body is a list of rules keep dropping bare
 * declarations exactly as a browser does, and an at-rule in neither class goes to the fail-safe.
 */
test("an at-rule that holds declarations is read as one, and one that holds rules still drops them", (t) => {
  // hermes-1's reproducer: the declaration Chromium applies is now in a block a detector reads.
  const scoped = scanStylesheet("@scope (.probe) {\n  color: #ff0000;\n}\n");
  assert.deepEqual(scoped.blocks.map((block) => block.selector), ["@scope (.probe)"]);
  assert.deepEqual(
    scoped.blocks[0].declarations.map((d) => `${d.prop}=${d.value}`),
    ["color=#ff0000"],
    "the declaration Chromium applies to the scope root was dropped"
  );
  assert.deepEqual(scoped.unreadable, []);

  // The other declaration-holding at-rules, and the rules nested inside one of them.
  for (const [source, expected] of [
    ["@font-face { font-family: \"Deck\"; src: url(a.woff2); }\n", ["font-family", "src"]],
    ["@page { margin: 20px; }\n", ["margin"]],
    ["@property --ink { syntax: \"<color>\"; initial-value: #ff0000; }\n", ["syntax", "initial-value"]],
    ["@counter-style deck { system: cyclic; symbols: \"x\"; }\n", ["system", "symbols"]]
  ]) {
    const scan = scanStylesheet(source);
    assert.deepEqual(scan.blocks.map((b) => b.declarations.map((d) => d.prop)), [expected], `dropped: ${source}`);
    assert.deepEqual(scan.unreadable, [], `an ordinary at-rule was reported unreadable: ${source}`);
  }
  assert.deepEqual(
    scanStylesheet("@scope (.a) { .b { color: #ff0000; } }").blocks.map((b) => `${b.selector}<${b.atRules.map((a) => a.name)}`),
    ["@scope (.a)<", ".b<scope"],
    "a rule nested inside a declaration-holding at-rule lost its context"
  );

  /*
   * The other side, and the reason the fail-safe was not widened: a bare declaration inside an
   * at-rule whose body is a list of rules is discarded by the browser too, so the two readings
   * agree and nothing is reported. An at-rule in neither class is the shape this scanner cannot
   * model, and there it says so rather than passing in silence.
   */
  for (const source of [
    "@media all { color: #ff0000; }\n",
    "@supports (color: red) { color: #ff0000; }\n",
    "@layer base { color: #ff0000; }\n",
    "@keyframes drift { from { opacity: 0; } }\n"
  ]) {
    assert.deepEqual(scanStylesheet(source).unreadable, [], `a discard a browser also makes was reported: ${source}`);
  }
  assert.match(
    scanStylesheet("@wat (x) { color: #ff0000; }\n").unreadable.join(" | "),
    /sits directly inside @wat, whose body this scanner can read neither as rules nor as declarations/,
    "an at-rule whose body this scanner cannot classify passed in silence"
  );

  /*
   * How that list is calibrated, and why it is not a guess. Run over 278 real stylesheets
   * (2.0 MB) the fail-safe above fired on exactly one at-rule: Tailwind v4's `@theme`, in 32 of
   * them. An at-rule that is the token layer of a whole ecosystem is a body of declarations, not
   * an unreadable file, and reporting those 32 would have been the false alarm in every file
   * that a reader learns to ignore. So it is read, and the corpus now reports none.
   */
  const theme = scanStylesheet("@theme inline {\n  --color-ink: var(--ink);\n  --radius-lg: var(--radius);\n}\n");
  assert.deepEqual(theme.blocks.map((b) => b.declarations.map((d) => d.prop)), [["--color-ink", "--radius-lg"]]);
  assert.deepEqual(theme.unreadable, [], "a Tailwind v4 @theme block was reported unreadable");

  /*
   * End to end. The `@scope` probe must produce the raw-literal finding; the ordinary
   * `@font-face` beside it must stay a clean L3 pass, because a `@font-face` names the face it
   * defines and reading that name as a use would report every project that self-hosts a
   * ratified face against its own allowlist.
   */
  const report = check(mutatedRun(t, [{ file: "probe.css", write: "@scope (.record) {\n  color: #ff0000;\n}\n" }]), {
    level: "L3"
  });
  assert.ok(
    report["findings-detail"].some(
      (entry) =>
        entry.rule === "core:literal-outside-token-layer" &&
        /@scope \(\.record\) sets color to the colour literal #ff0000/.test(entry.violation)
    ),
    `the declaration Chromium applies to the scope root was not reported: ${report.findings.join(" | ")}`
  );
  assert.notEqual(report.verdict, "PASS");
  assert.notEqual(report.exit, 0);
  assert.equal(report.level.verified, null);
  assert.notEqual(cli(["--level", "L3", mutatedRun(t, [{ file: "probe.css", write: "@scope (.record) {\n  color: #ff0000;\n}\n" }])]).status, 0);

  // The control: a self-hosted ratified face, defined and then used, is a clean run.
  const face = [
    "@font-face {",
    '  font-family: "Chartwell Text";',
    '  src: url(/fonts/chartwell-text.woff2) format("woff2");',
    "  font-weight: 400;",
    "  font-display: swap;",
    "}",
    ""
  ].join("\n");
  const clean = check(mutatedRun(t, [{ file: "face.css", write: face }]), { level: "L3" });
  assert.deepEqual(
    clean["findings-detail"].map((finding) => `${finding.rule}: ${finding.violation}`),
    [],
    "an ordinary @font-face raised a finding against the face it defines"
  );
  assert.deepEqual(clean.inputs.unreadable, [], "an ordinary @font-face was reported unreadable");
  assert.equal(clean.verdict, "PASS");
  assert.equal(clean.exit, 0);
  assert.equal(clean.level.verified, "L3");
});

/*
 * Round-06 codex-1, CRITICAL, and the layer under the block model.
 *
 * Cycle 9 replaced nine cycles of special cases with the matched-block model, and the model is
 * right — but a correct stack over the wrong token stream is not a correct scanner. `identLikeToken`
 * refused a candidate only when an ident code point stood before it, so at `#url(` and `@url(` it
 * started again at the `u` and consumed a url token through the first `)`. CSS Syntax reads `#url`
 * as one hash-token and `@url` as one at-keyword (§4.3.1), and leaves the `(` after either to open
 * a matched simple block — the very parentheses that decide what the later braces mean. Consuming
 * the url first meant the stack never saw them: codex-1's probe dropped the applied colour as
 * top-level text, opened a phantom rule, finished balanced, and returned `unreadable: []`, verified
 * L3, PASS and exit 0 while Chromium computed `rgb(255, 0, 0)` and its CSSOM held one rule.
 *
 * The fix is a token, not a case: `#` and `@` bind the ident after them, so no ident inside either
 * can open anything of its own — which is also why the escaped spellings below close with it, and
 * why the enumeration of §4 that produced it is recorded at the head of `css.js`.
 */
const HASH_AT_URL = {
  "codex-1's #url( probe, byte for byte": [
    ".probe {",
    "  background: x) #url((y)} z);",
    "  color: #ff0000;",
    "  dummy: w) #url((a) {b: (1);",
    "}",
    ""
  ].join("\n"),
  "the same probe through @url(": [
    ".probe {",
    "  background: x) @url((y)} z);",
    "  color: #ff0000;",
    "  dummy: w) @url((a) {b: (1);",
    "}",
    ""
  ].join("\n"),
  "the same probe through the escaped #\\75 rl(": [
    ".probe {",
    "  background: x) #\\75 rl((y)} z);",
    "  color: #ff0000;",
    "  dummy: w) #\\75 rl((a) {b: (1);",
    "}",
    ""
  ].join("\n"),
  "the same probe through the escaped @\\75 rl(": [
    ".probe {",
    "  background: x) @\\75 rl((y)} z);",
    "  color: #ff0000;",
    "  dummy: w) @\\75 rl((a) {b: (1);",
    "}",
    ""
  ].join("\n")
};

test("a hash-token and an at-keyword bind the url ident inside them, and hide no declaration", (t) => {
  /*
   * The scanner half. Chromium's CSSOM for every one of these is `.probe { color: rgb(255,0,0) }`
   * and one rule; so must the scanner's be, or the phantom-rule shape is back one layer down.
   */
  for (const [name, source] of Object.entries(HASH_AT_URL)) {
    const scan = scanStylesheet(source);
    assert.deepEqual(scan.blocks.map((block) => block.selector), [".probe"], `${name} opened a phantom rule`);
    assert.ok(
      scan.blocks[0].declarations.some((d) => d.prop === "color" && d.value === "#ff0000"),
      `${name} hid the colour a browser applies: ${JSON.stringify(scan.blocks[0].declarations)}`
    );
    // The residue the probe leaves reaches the fail-safe as well: the model reads the colour
    // *and* says what it could not close.
    assert.notDeepEqual(scan.unreadable, [], `${name} left the fail-safe silent over an unclosed block`);
  }

  /*
   * The controls codex-1 asks for beside them. A `#` inside a url token's contents, an ordinary
   * hash colour, a genuine `url(...)` and `@import url(...)` are the shapes real stylesheets are
   * made of; a finding or an unreadable line against one of these is the false alarm that makes a
   * gate get switched off.
   */
  for (const source of [
    ".a { background: url(#fragment); color: var(--x); }",
    ".a { background: url(/i.png); color: var(--x); }",
    "@import url(other.css);\n.a { color: var(--x); }",
    ".a { background: +url(a}b); color: var(--x); }"
  ]) {
    const scan = scanStylesheet(source);
    assert.deepEqual(scan.unreadable, [], `an ordinary url or hash was reported unreadable: ${source}`);
    assert.deepEqual(scan.blocks.map((block) => block.selector), [".a"], `an ordinary url or hash broke a rule: ${source}`);
    assert.ok(
      scan.blocks[0].declarations.some((d) => d.prop === "color" && d.value === "var(--x)"),
      `an ordinary url or hash lost the declaration after it: ${source}`
    );
  }
  // And the hash- and at-bound spellings really do stop being urls: the brace inside is content
  // of the matched block the `(` opens, and the declaration after it survives.
  for (const source of [
    ".a { background: #url(a}b); color: var(--x); }",
    ".a { background: @url(a}b); color: var(--x); }",
    ".a { grid-area: #url/*x*/(a}b); color: var(--x); }",
    ".a { grid-area: # url(a}b); color: var(--x); }"
  ]) {
    const scan = scanStylesheet(source);
    assert.deepEqual(scan.blocks.map((block) => block.selector), [".a"], `a hash- or at-bound ident broke a rule: ${source}`);
    assert.ok(
      scan.blocks[0].declarations.some((d) => d.prop === "color"),
      `a declaration after a hash- or at-bound ident was lost: ${source}`
    );
    assert.deepEqual(scan.unreadable, [], `a balanced hash- or at-bound ident was reported unreadable: ${source}`);
  }

  /*
   * An at-rule's shape follows what its keyword *spells* (§4.3.11), for the same reason a
   * declaration does. `@\73 cope` is `@scope` to a browser, which applies its declarations to the
   * scope root; matched as written it was an at-rule this scanner could classify as neither
   * rules nor declarations, so the colour reached the fail-safe instead of a detector.
   */
  const escapedScope = scanStylesheet("@\\73 cope (.probe) {\n  color: #ff0000;\n}\n");
  assert.deepEqual(
    escapedScope.blocks.map((b) => b.declarations.map((d) => `${d.prop}=${d.value}`)),
    [["color=#ff0000"]],
    "an escaped @scope was not read as @scope"
  );
  assert.deepEqual(escapedScope.unreadable, []);
  assert.deepEqual(
    scanStylesheet("@-webkit-\\6be\\79 frames drift { from { opacity: 0; } }\n.a { color: var(--x); }")
      .blocks.map((b) => b.selector),
    ["from", ".a"],
    "a vendor-prefixed escaped at-keyword was not read as the at-rule it spells"
  );

  /*
   * End to end, on the run that verifies. codex-1's counter-proposal fixes what each must
   * produce: the raw-literal finding, or unreadable and UNJUDGEABLE. A clean PASS is the failure
   * this test exists to catch, because a clean PASS is what the probe produced.
   */
  for (const [name, source] of Object.entries(HASH_AT_URL)) {
    const run = mutatedRun(t, [{ file: "probe.css", write: source }]);
    const report = check(run, { level: "L3" });
    const raw = report["findings-detail"].filter(
      (entry) => entry.rule === "core:literal-outside-token-layer" && /probe\.css/.test(entry.path || "")
    );
    const unreadable = report.inputs.unreadable.filter((entry) => /probe\.css/.test(entry));
    assert.ok(
      raw.length > 0 || unreadable.length > 0,
      `${name} hid its colour from the detectors and from the fail-safe both: ${JSON.stringify(report)}`
    );
    assert.ok(
      raw.some((entry) => /\.probe sets color to the colour literal #ff0000/.test(entry.violation)),
      `${name}: the colour a browser applies to .probe was not reported: ${report.findings.join(" | ")}`
    );
    assert.notEqual(report.verdict, "PASS", `${name} certified a stylesheet hiding an applied colour`);
    assert.notEqual(report.exit, 0, `${name} exited clean over a hidden applied colour`);
    assert.equal(report.level.verified, null, `${name} verified L3 over a declaration no detector saw`);
    assert.notEqual(cli(["--level", "L3", run]).status, 0, `${name}: the CLI exited clean over the probe`);
  }

  // The passing side, end to end: an ordinary `url(#fragment)` beside a token-resolved rule is a
  // clean L3 run, and the escaped `@scope` beside it is still a finding.
  const clean = check(mutatedRun(t, [
    { file: "probe.css", write: ".probe {\n  background: url(#fragment);\n  color: var(--color-text-body);\n}\n" }
  ]), { level: "L3" });
  assert.deepEqual(
    clean["findings-detail"].map((finding) => `${finding.rule}: ${finding.violation}`),
    [],
    "an ordinary url(#fragment) raised a finding"
  );
  assert.deepEqual(clean.inputs.unreadable, [], "an ordinary url(#fragment) was reported unreadable");
  assert.equal(clean.verdict, "PASS");
  assert.equal(clean.exit, 0);
  assert.equal(clean.level.verified, "L3");

  const scoped = check(mutatedRun(t, [{ file: "probe.css", write: "@\\73 cope (.record) {\n  color: #ff0000;\n}\n" }]), {
    level: "L3"
  });
  assert.ok(
    scoped["findings-detail"].some(
      (entry) => entry.rule === "core:literal-outside-token-layer" && /sets color to the colour literal #ff0000/.test(entry.violation)
    ),
    `the declaration Chromium applies to an escaped scope root was not reported: ${scoped.findings.join(" | ")}`
  );
  assert.notEqual(scoped.exit, 0);
});

/*
 * Round-06 codex-1, MAJOR, and the same lesson as round-05 on the other kind of input.
 *
 * Cycle 9 moved stylesheet `var()` discovery onto parsed declaration values. The markup path kept
 * a regular expression over every raw line — including the contents of a `<style>` element, which
 * were then *also* parsed as CSS. So `var(--ghost)` written inside the attribute selector
 * `[data-value="var(--ghost)"]` became a reference to an undeclared token: CI rejected valid HTML
 * whose only declaration used a ratified token, while Chromium kept that text in `selectorText`
 * and resolved nothing. A false finding is as damaging as a false clean — it is how a rule system
 * gets switched off.
 *
 * The span that is CSS is read as CSS and contributes only its declarations; the markup around it
 * is read as written. codex-1 also proposed narrowing markup discovery to `style` attributes and
 * supported utility brackets, and that half was measured rather than believed: over the 2,113
 * markup files in the corpus it lost 1,799 references across 203 files —
 * `cn("h-[var(--radix-select-trigger-height)]")`, `stopColor="hsl(var(--primary))"`,
 * `const COLORS = ['hsl(var(--chart-2))']` — every one of which a browser resolves. So it was not
 * taken: the false clean it would buy is larger than the false finding it would close.
 */
const STYLE_SELECTOR_MARKUP = [
  "<style>",
  '  [data-value="var(--ghost)"] {',
  "    color: var(--color-text-body);",
  "  }",
  "</style>",
  ""
].join("\n");

test("a var() use in markup is read from a declaration, never from selector text in <style>", (t) => {
  // codex-1's fixture: one reference, and it is the declared one on the line that declares it.
  assert.deepEqual(
    markupVarUses(STYLE_SELECTOR_MARKUP).map((use) => `${use.name}@${use.line}`),
    ["--color-text-body@3"],
    "selector text inside a <style> element was read as a var() reference"
  );
  // Every span inside a `<style>` element that a browser resolves nothing from: the selector
  // above, a prelude, a comment. Plus the markup comment, which resolves nothing anywhere.
  for (const markup of [
    "<style>\n  /* var(--ghost) */\n  .a { color: red; }\n</style>",
    "<style>\n  @media (min-width: 40em) and (--ghost: var(--ghost)) { .a { color: red; } }\n</style>",
    "<style>\n  .supports-\\[var\\(--ghost\\)\\] { color: red; }\n</style>",
    "<!-- var(--ghost) is deliberately not used here -->"
  ]) {
    assert.deepEqual(markupVarUses(markup).map((use) => use.name), [], `markup that resolves nothing raised a reference: ${markup}`);
  }

  /*
   * And the true positives it must not cost. Two go through the CSS path and are read as they
   * spell, because a browser resolves an escaped spelling: a `<style>` declaration and a `style`
   * attribute. The rest is markup read as written — the utility bracket, and the shapes a real
   * component tree is made of, which the corpus says are where most markup references live.
   */
  assert.deepEqual(
    markupVarUses(
      [
        '<p class="mt-2 text-[var(--utility)]">x</p>',
        '<span style="color: var(--inline)">y</span>',
        "<style>",
        "  .a { color: \\76 ar(--in-style); }",
        "</style>",
        "<div style='background: \\76 ar(--single-quoted)'></div>",
        'const COLORS = ["hsl(var(--chart-2))"];',
        '<stop stopColor="hsl(var(--primary))" />',
        'cn("h-[calc(100svh-var(--banner-height))]")'
      ].join("\n")
    ).map((use) => `${use.name}@${use.line}`),
    [
      "--utility@1", "--inline@2", "--in-style@4", "--single-quoted@6",
      "--chart-2@7", "--primary@8", "--banner-height@9"
    ]
  );

  /*
   * End to end, on the run that verifies. The `<style>` selector is a clean L3 pass; the inline
   * style attribute beside it is still a finding. Neither result may move without the other.
   */
  const clean = check(mutatedRun(t, [{ file: "probe.html", write: STYLE_SELECTOR_MARKUP }]), { level: "L3" });
  assert.deepEqual(
    clean["findings-detail"].map((finding) => `${finding.rule}: ${finding.violation}`),
    [],
    "selector text inside a <style> element raised a finding"
  );
  assert.deepEqual(clean.inputs.unreadable, [], "an ordinary <style> element was reported unreadable");
  assert.equal(clean.verdict, "PASS");
  assert.equal(clean.exit, 0);
  assert.equal(clean.level.verified, "L3");

  for (const markup of [
    '<span style="color: var(--nope)">y</span>\n',
    '<p class="text-[var(--nope)]">x</p>\n',
    "<style>\n  .a { color: \\76 ar(--nope); }\n</style>\n"
  ]) {
    const found = check(mutatedRun(t, [{ file: "probe.html", write: markup }]), { level: "L3" });
    assert.ok(
      found["findings-detail"].some(
        (entry) => entry.rule === "core:token-used-undeclared" && /references --nope/.test(entry.violation)
      ),
      `a reference a browser really resolves was not reported: ${markup} -> ${found.findings.join(" | ")}`
    );
    assert.notEqual(found.exit, 0);
  }
});

/*
 * Found by the §4 enumeration rather than by a reviewer, and in the other direction: not a
 * declaration the checker misses, but one it invents.
 *
 * §4.3.5 makes a bad-string end at the newline; §5.4 throws away the construct holding it, blocks
 * and all, up to the `;` or `}` that ends it. Recovering at the newline and then reading what
 * follows as ordinary stylesheet was only the first half, and the second half was load-bearing:
 * for `.a::before { content: "x` — newline — `.probe { color: #ff0000; } }` Chromium's CSSOM is
 * `.a::before { }` and this scanner built a phantom `.probe` rule carrying a colour no browser
 * paints, reported it, and left `unreadable` empty. Two of the 521 stylesheets in the real-world
 * corpus carry this shape.
 */
test("a bad-string throws away the declaration that holds it, blocks and all", () => {
  for (const [source, expected] of [
    // Chromium: `.a::before { }` — the brace block is part of the bad declaration, not a rule.
    ['.a::before { content: "x\n.probe { color: #ff0000; } }', [".a::before {  }"]],
    // Chromium: an empty stylesheet — the bad prelude takes its block with it.
    ['"x\n.probe { color: #ff0000; }', []],
    // Chromium: `.probe { }` — the declaration ends at the `}` and is discarded.
    ['.probe { content: "x\n color: #ff0000; }', [".probe {  }"]],
    // Chromium: `.probe { color: rgb(255,0,0) }` — the `;` ends the bad declaration, and the
    // declaration after it is ordinary CSS again, so recovery may not swallow it.
    ['.probe { content: "x\n; color: #ff0000; }', [".probe { color: #ff0000 }"]],
    // A bad-string inside a function still only costs its own declaration.
    ['.probe { background: fn("x\n); color: #ff0000; }', [".probe { color: #ff0000 }"]]
  ]) {
    const scan = scanStylesheet(source);
    assert.deepEqual(
      scan.blocks.map((b) => `${b.selector} { ${b.declarations.map((d) => `${d.prop}: ${d.value}`).join("; ")} }`),
      expected,
      `a bad-string built a rule or a declaration Chromium does not: ${JSON.stringify(source)}`
    );
  }
  // The half that was already right and may not be lost: a bad-string does not swallow the rest
  // of the file, so the rules after it are still read.
  const after = scanStylesheet('.c::before { content: "unterminated\n color: #ff0000; }\n.hint { color: #ff0000; }\n');
  assert.deepEqual(after.blocks.map((b) => b.selector), [".c::before", ".hint"]);
  assert.ok(after.blocks[1].declarations.some((d) => d.prop === "color" && d.value === "#ff0000"));
  assert.deepEqual(after.unreadable, []);

  /*
   * And the newline that is not a bad-string at all, which the same enumeration turned up on the
   * other side: §4.3.7 lets a hex escape take one trailing whitespace with it, and that
   * whitespace may be the newline. Chromium's CSSOM for `content: "x\41` — newline — `"` is
   * `content: "xA"` with the colour after it applied; a scanner reading only `\` and one code
   * point ended the string at the newline, lost the colour, and reported three tokenisation
   * problems against a stylesheet that has none — a false alarm and a false clean at once.
   */
  const escapedNewline = scanStylesheet('.probe { content: "x\\41\n"; color: #ff0000; }');
  assert.deepEqual(
    escapedNewline.blocks.map((b) => `${b.selector} { ${b.declarations.map((d) => `${d.prop}: ${d.value}`).join("; ")} }`),
    ['.probe { content: "xA"; color: #ff0000 }'],
    "a hex escape that swallows the newline ended the string anyway"
  );
  assert.deepEqual(escapedNewline.unreadable, [], "a legal stylesheet was reported unreadable");
  // The line continuation beside it (§4.3.5) still stays inside the string, and the escapes the
  // decoder already refused are still refused.
  assert.deepEqual(scanStylesheet('.probe { content: "a\\\nb"; color: #ff0000; }').unreadable, []);
  assert.match(
    scanStylesheet('.probe { font-family: "Foo\\2c Bar"; }').unreadable.join(" | "),
    /string escape spelling ","/
  );
});

/*
 * Round-07 codex-1, CRITICAL, and the assertion directly above this one is why it survived.
 *
 * That assertion is right and it was checked against the wrong pass. `css.js` had two readers of
 * the string token: the stack machine's, which called `consumeEscape` and is what the test above
 * exercises, and a second one private to the comment pre-pass, which advanced one code point after
 * each backslash. §4.3.7 takes up to six hexadecimal digits and one trailing whitespace code point
 * with them, and that whitespace may be the newline — so the two readers disagreed about where
 * `content: "x\41` — newline — `"` ends. The pre-pass ended it at the newline, the quote on the
 * line below opened a string it had invented, and the real comment that followed fell inside that
 * invented string and was left in the source. The stack machine then read the comment as CSS:
 * `color: #ff0000` fell outside every rule, a phantom declaration and a phantom rule took its
 * place, every block and every parenthesis balanced, `unreadable` stayed empty, and the run
 * certified L3 with PASS and exit 0 while Chromium applied the raw colour. It runs the other way
 * too — a comment delimiter written inside a string was blanked as a comment, which silently
 * rewrote the string's value or discarded the rest of the file.
 *
 * The repair is not a third reader that agrees with the second: two implementations that agree
 * today drift tomorrow, which is what this one did. `stringToken` is now the only string consumer
 * in `css.js`, and the pre-pass, the stack machine, the declaration splitter and the parenthesis
 * balance all call it, so there is nothing left to diverge. This test therefore asserts the
 * pre-pass output beside the parse: a verdict taken from one pass is a verdict about one pass.
 */
const STRING_COMMENT_PROBES = {
  // Chromium: `.probe { content: "xA"; color: rgb(255, 0, 0); }` — one rule, and the colour applies.
  "codex-1's probe, byte for byte": [
    ".probe {",
    '  content: "x\\41',
    '"; /* x: 1; } */',
    "  color: #ff0000;",
    "  dummy: y { z: 1;",
    "}",
    ""
  ].join("\n"),
  // The same construct through the other quote.
  "the same probe through a single-quoted string": [
    ".probe {",
    "  content: 'x\\41",
    "'; /* x: 1; } */",
    "  color: #ff0000;",
    "  dummy: y { z: 1;",
    "}",
    ""
  ].join("\n"),
  // Stripped of the unclosed block, so the fail-safe cannot answer for the detectors.
  "the probe with nothing left open": '.probe { content: "x\\41\n"; /* x: 1; } */ color: #ff0000; }',
  // The escape at its longest: six hexadecimal digits, then the newline they take with them.
  "six hexadecimal digits, then the newline": '.probe { content: "x\\000041\n"; /* x: 1; } */ color: #ff0000; }',
  /*
   * kimi-1's independent spelling, which runs the desynchronisation the other way: the opening
   * delimiter is inside the browser's string, so the pre-pass — whose string had already ended —
   * read it as a comment and blanked the browser-live `color: #ff0000` through the closer on the
   * line below. Chromium: `.probe { content: "xA/*"; color: rgb(255, 0, 0); }`. Both spellings
   * certified L3 with PASS, exit 0 and `unreadable: []`, which is why one consumer and not two
   * agreeing readers is the repair.
   */
  "kimi-1's spelling, the delimiter inside the string": '.probe { content: "x\\41\n/*"; color: #ff0000; dummy: "*/"; }'
};

// What each probe's `content` declaration must spell, which is what Chromium's CSSOM carries.
const PROBE_CONTENT = {
  "codex-1's probe, byte for byte": '"xA"',
  "the same probe through a single-quoted string": "'xA'",
  "the probe with nothing left open": '"xA"',
  "six hexadecimal digits, then the newline": '"xA"',
  "kimi-1's spelling, the delimiter inside the string": '"xA/*"'
};

test("one string consumer: the comment pre-pass ends a string where the stack machine does", (t) => {
  /*
   * The pre-pass half, which is where the defect lived and which no earlier test read. Blanking is
   * the only thing this pass may do, and it may do it only to a comment: the probe's real comment
   * becomes spaces, and every other code point — the string, its escape, the newline the escape
   * swallows — comes back unchanged.
   */
  const stripped = stripComments(STRING_COMMENT_PROBES["codex-1's probe, byte for byte"]);
  assert.equal(
    stripped,
    ['.probe {', '  content: "x\\41', '";              ', "  color: #ff0000;", "  dummy: y { z: 1;", "}", ""].join("\n"),
    "the pre-pass and the tokenizer disagree about where the string ends"
  );

  /*
   * The scanner half. Chromium's CSSOM for each probe carries `content: "xA"` and the applied
   * colour; so must the scanner's, and the phantom declaration the desynchronisation manufactured
   * (`/* x`) may not be anywhere in it.
   */
  for (const [name, source] of Object.entries(STRING_COMMENT_PROBES)) {
    const scan = scanStylesheet(source);
    const probe = scan.blocks.find((block) => block.selector === ".probe");
    assert.ok(probe, `${name} lost the .probe rule entirely`);
    assert.ok(
      probe.declarations.some((d) => d.prop === "content" && d.value === PROBE_CONTENT[name]),
      `${name} did not read the string as the one token a browser reads: ${JSON.stringify(probe.declarations)}`
    );
    assert.ok(
      probe.declarations.some((d) => d.prop === "color" && d.value === "#ff0000"),
      `${name} hid the colour a browser applies: ${JSON.stringify(probe.declarations)}`
    );
    assert.ok(
      !scan.blocks.some((block) => block.declarations.some((d) => d.prop.includes("/*"))),
      `${name} read a comment as a declaration: ${JSON.stringify(scan.blocks.map((b) => b.declarations))}`
    );
  }
  // The two probes that close everything they open are ordinary stylesheets, and a false alarm
  // against one of them is the other way this gate gets switched off.
  for (const name of [
    "the probe with nothing left open",
    "six hexadecimal digits, then the newline",
    "kimi-1's spelling, the delimiter inside the string"
  ]) {
    assert.deepEqual(
      scanStylesheet(STRING_COMMENT_PROBES[name]).unreadable,
      [],
      `${name}: a stylesheet the scanner reads exactly was reported unreadable`
    );
  }

  /*
   * The other direction, which the same divergence produced: a comment delimiter written *inside*
   * a string is text (§4.3.2), and the pre-pass may not blank it. The two sources below are the
   * opening delimiter alone and an opening and closing pair; Chromium keeps both verbatim in the
   * string and applies the colour after it, while the second reader blanked the pair out of the
   * value in one and discarded the rest of the file in the other. The expected `content` values
   * are the assertion's second column.
   */
  for (const [source, content] of [
    ['.probe { content: "x\\41\n/* }"; color: #ff0000; }', '"xA/* }"'],
    ['.probe { content: "x\\41\n/* } */"; color: #ff0000; }', '"xA/* } */"']
  ]) {
    const scan = scanStylesheet(source);
    assert.deepEqual(
      scan.blocks.map((b) => `${b.selector} { ${b.declarations.map((d) => `${d.prop}: ${d.value}`).join("; ")} }`),
      [`.probe { content: ${content}; color: #ff0000 }`],
      `a comment delimiter inside a string was read as a comment: ${JSON.stringify(source)}`
    );
    assert.deepEqual(scan.unreadable, [], `a legal stylesheet was reported unreadable: ${JSON.stringify(source)}`);
  }

  /*
   * The controls codex-1's counter-proposal names, each one a string the two passes must still
   * agree about: an ordinary string, a bad string, a line continuation, and the same hexadecimal
   * escape whose optional trailing whitespace is *not* a newline. Each is given with what Chromium
   * builds for it, because "the scanner is self-consistent" is the claim that was already false.
   */
  for (const [source, expected] of [
    // Chromium: `.probe { content: "ab"; color: rgb(255, 0, 0); }`.
    ['.probe { content: "ab"; /* x: 1; } */ color: #ff0000; }', ['.probe { content: "ab"; color: #ff0000 }']],
    // The escape's trailing whitespace is a space, and then a tab: the string ends at its quote.
    ['.probe { content: "x\\41 "; /* x: 1; } */ color: #ff0000; }', ['.probe { content: "xA"; color: #ff0000 }']],
    ['.probe { content: "x\\41\t"; /* x: 1; } */ color: #ff0000; }', ['.probe { content: "xA"; color: #ff0000 }']],
    // Chromium: `.probe { }` — the bad-string's declaration is a parse error and recovery runs to
    // the `;` after the colour, so the colour is not applied and the scanner may not report it.
    ['.probe { content: "x\n/* y: 1; } */ color: #ff0000; }', [".probe {  }"]],
    // A `}` inside a comment inside a rule is still a comment.
    ['.probe { color: #ff0000; /* } */ }', [".probe { color: #ff0000 }"]]
  ]) {
    const scan = scanStylesheet(source);
    assert.deepEqual(
      scan.blocks.map((b) => `${b.selector} { ${b.declarations.map((d) => `${d.prop}: ${d.value}`).join("; ")} }`),
      expected,
      `a control string was read as something Chromium does not build: ${JSON.stringify(source)}`
    );
    assert.deepEqual(scan.unreadable, [], `an ordinary stylesheet was reported unreadable: ${JSON.stringify(source)}`);
  }
  // The line continuation (§4.3.5) still stays inside the string across a following comment, and
  // an unterminated string is still reported rather than read to the end of the file.
  assert.deepEqual(scanStylesheet('.probe { content: "a\\\nb"; /* x: 1; } */ color: #ff0000; }').unreadable, []);
  assert.match(
    scanStylesheet('.probe { color: #ff0000; content: "x\\41').unreadable.join(" | "),
    /the string opened at line 1 is still open at end of file/
  );

  /*
   * End to end, on the run that verifies. codex-1's counter-proposal fixes what this must produce:
   * the raw-literal finding, or unreadable and no verified level. A clean PASS is the failure this
   * test exists to catch, because a clean PASS with `unreadable: []` and exit 0 is what the probe
   * produced.
   */
  for (const [name, source] of Object.entries(STRING_COMMENT_PROBES)) {
    const run = mutatedRun(t, [{ file: "probe.css", write: source }]);
    const report = check(run, { level: "L3" });
    const raw = report["findings-detail"].filter(
      (entry) => entry.rule === "core:literal-outside-token-layer" && /probe\.css/.test(entry.path || "")
    );
    const unreadable = report.inputs.unreadable.filter((entry) => /probe\.css/.test(entry));
    assert.ok(
      raw.length > 0 || unreadable.length > 0,
      `${name} hid its colour from the detectors and from the fail-safe both: ${JSON.stringify(report)}`
    );
    assert.ok(
      raw.some((entry) => /\.probe sets color to the colour literal #ff0000/.test(entry.violation)),
      `${name}: the colour a browser applies to .probe was not reported: ${report.findings.join(" | ")}`
    );
    assert.notEqual(report.verdict, "PASS", `${name} certified a stylesheet hiding an applied colour`);
    assert.notEqual(report.exit, 0, `${name} exited clean over a hidden applied colour`);
    assert.equal(report.level.verified, null, `${name} verified L3 over a declaration no detector saw`);
    assert.notEqual(cli(["--level", "L3", run]).status, 0, `${name}: the CLI exited clean over the probe`);
  }

  // The passing side, end to end: the same string and the same comment beside a token-resolved
  // declaration is a clean L3 run, so the fix buys its finding without buying a false alarm.
  const clean = check(mutatedRun(t, [
    { file: "probe.css", write: '.probe {\n  content: "x\\41\n"; /* x: 1; } */\n  color: var(--color-text-body);\n}\n' }
  ]), { level: "L3" });
  assert.deepEqual(
    clean["findings-detail"].map((finding) => `${finding.rule}: ${finding.violation}`),
    [],
    "an ordinary string beside a comment raised a finding"
  );
  assert.deepEqual(clean.inputs.unreadable, [], "an ordinary string beside a comment was reported unreadable");
  assert.equal(clean.verdict, "PASS");
  assert.equal(clean.exit, 0);
  assert.equal(clean.level.verified, "L3");
});

/*
 * The other thing the enumeration turned up, in §4.3.3.
 *
 * A dimension is a number and then an ident sequence, and the two are separate tokens: `1\31 px`
 * is the number `1` with the unit `1px`, which Chromium discards, while the decoded text reads
 * `11px` and a size rule reports a literal that never ships. The flat decoded value cannot say
 * where the number ends, so where flattening would change it the value is left as written and the
 * file goes to the fail-safe — which costs those rules their verdict instead of a false finding.
 */
test("a dimension whose unit begins with a digit is not flattened into its number", () => {
  const scan = scanStylesheet(".probe { border-radius: 1\\31 px; color: #ff0000; }");
  assert.equal(scan.blocks[0].declarations[0].value, "1\\31 px", "a unit was flattened into the number before it");
  assert.match(scan.unreadable.join(" | "), /directly after a digit, which this scanner cannot spell/);
  // The escapes it must not touch: a unit that spells an ordinary unit, an ident carrying digits,
  // and a hash body — all of which a browser reads exactly as the flattened text spells them.
  for (const [source, expected] of [
    ["border-radius: 11p\\78", "11px"],
    ["margin: 1\\65 m", "1em"],
    ["grid-area: a1\\31 b", "a11b"],
    ["color: #f\\66 0000", "#ff0000"],
    ["width: 50%\\31 px", "50%1px"]
  ]) {
    const one = scanStylesheet(`.probe { ${source}; }`);
    assert.equal(one.blocks[0].declarations[0].value, expected, `an ordinary escape was refused: ${source}`);
    assert.deepEqual(one.unreadable, [], `an ordinary escape was reported unreadable: ${source}`);
  }
});

test("the six constructs of this family are all still read, together", () => {
  // Every member found so far, in one file: a fix for the newest must not cost an older one.
  const source = [
    '.one::before { content: "}"; color: #ff0000; }',
    '.two::before { content: "unterminated',
    " color: #ff0000; }",
    ".three { background: url(a}b); color: #ff0000; }",
    ".four { background: url(a/*b); color: #ff0000; }",
    ".five { font-family: A\\}B; color: #ff0000; }",
    ".six { background: u\\72l(a}b); color: #ff0000; }"
  ].join("\n");
  const blocks = parseStylesheet(source);
  assert.deepEqual(
    blocks.map((block) => block.selector),
    [".one::before", ".two::before", ".three", ".four", ".five", ".six"],
    "one of the six constructs closed a block the stylesheet never closed"
  );
  for (const selector of [".one::before", ".three", ".four", ".five", ".six"]) {
    const block = blocks.find((candidate) => candidate.selector === selector);
    assert.ok(
      block.declarations.some((declaration) => declaration.prop === "color" && declaration.value === "#ff0000"),
      `${selector} lost the declaration after the construct`
    );
  }
  assert.deepEqual(scanStylesheet(source).unreadable, [], "a readable stylesheet was reported unreadable");
});

/*
 * Round-07 kimi-1, and one lesson under all six: every one of these fires on CSS that ships. A
 * checker that reports ordinary files is switched off, and a checker that is switched off cannot
 * report anything — so a false alarm against real CSS is the same failure as a false clean, and
 * the fixtures below are shipped shapes rather than probes. Each carries what Chromium builds for
 * it, because "what the scanner does" is not the standard either half is held to.
 */
test("a function name and a unit are case-insensitive idents, and a token name is not", (t) => {
  /*
   * §3.3: an ident is ASCII case-insensitive, so `RGB(255, 0, 0)`, `VAR(--x)` and `11PX` are the
   * declarations their lowercase spellings are — Chromium applies all three, and normalises the
   * unit to `11px` in its own CSSOM. Matched as written, each passed clean while the browser
   * applied it. What is *not* folded with them is the custom property name: it is case-sensitive,
   * so `--Brand` and `--brand` are two tokens and folding them would resolve a reference against
   * a declaration that does not answer it.
   */
  assert.deepEqual(
    varUses(".a { color: VAR(--Brand); background: var(--brand); }").map((use) => use.name),
    ["--Brand", "--brand"],
    "the case of a token name was folded, or an uppercase VAR( reference was missed"
  );

  // Chromium: `.probe { color: rgb(255, 0, 0); }` and `.probe { border-radius: 11px; }`.
  for (const [source, expected] of [
    [".probe { color: RGB(255, 0, 0); }", /colour literal RGB\(/],
    [".probe { color: HSL(0, 100%, 50%); }", /colour literal HSL\(/],
    [".probe { border-radius: 11PX; }", /size literal 11PX/],
    [".probe { padding: 4REM; }", /spacing literal 4REM/]
  ]) {
    const report = check(mutatedRun(t, [{ file: "probe.css", write: source }]), { level: "L3" });
    assert.ok(
      report["findings-detail"].some(
        (entry) => entry.rule === "core:literal-outside-token-layer" && expected.test(entry.violation)
      ),
      `an uppercase spelling of a literal a browser applies was not reported: ${source} — ${report.findings.join(" | ")}`
    );
  }
  // And the uppercase reference to an undeclared token is a finding, as its lowercase spelling is.
  const uppercase = check(mutatedRun(t, [{ file: "probe.css", write: ".probe { color: VAR(--ghost); }" }]), {
    level: "L3"
  });
  assert.ok(
    uppercase["findings-detail"].some(
      (entry) => entry.rule === "core:token-used-undeclared" && /--ghost/.test(entry.violation)
    ),
    `an uppercase VAR( reference to an undeclared token was not reported: ${uppercase.findings.join(" | ")}`
  );
});

test("a url token's contents and a string's are not values, and no literal is read out of them", (t) => {
  /*
   * §4.3.6: everything between `url(` and `)` is one opaque locator. Chromium's CSSOM for
   * `fill: url(#fade)` is `fill: url("#fade")` — a reference to an SVG gradient, and the only
   * colour on the element is the one declared beside it. Read through the token boundary, `#fade`
   * was a four-digit hexadecimal colour and the checker exited 1 against ordinary CSS; a file name
   * carrying `red` was the same finding one spelling along.
   */
  assert.equal(maskOpaqueTokens("url(#fade) #ff0000"), "url(     ) #ff0000");
  assert.equal(maskOpaqueTokens('"#ff0000" #00ff00'), '"       " #00ff00');
  assert.equal(maskOpaqueTokens("\\75 rl(#fade) red"), "\\75 rl(     ) red", "an escaped url spelling was not masked");

  for (const source of [
    ".probe { fill: url(#fade); color: var(--color-text-body); }",
    ".probe { background: url(/img/red-banner.png); color: var(--color-text-body); }",
    '.probe { background: url("#gold"); color: var(--color-text-body); }',
    ".probe { fill: url(#fade); stroke: url(#silver); }"
  ]) {
    const report = check(mutatedRun(t, [{ file: "probe.css", write: source }]), { level: "L3" });
    assert.deepEqual(
      report["findings-detail"].map((finding) => `${finding.rule}: ${finding.violation}`),
      [],
      `a locator inside a url token was read as a value: ${source}`
    );
    assert.equal(report.verdict, "PASS", `an ordinary url() left the run unclean: ${source}`);
    assert.equal(report.level.verified, "L3");
  }

  // The control that keeps the rule a rule: the same literal outside any url token is still found.
  const outside = check(mutatedRun(t, [{ file: "probe.css", write: ".probe { fill: #fade; }" }]), { level: "L3" });
  assert.ok(
    outside["findings-detail"].some(
      (entry) => entry.rule === "core:literal-outside-token-layer" && /colour literal #fade/.test(entry.violation)
    ),
    `a colour literal outside a url token was lost with the masking: ${outside.findings.join(" | ")}`
  );
});

test("an escaped quote or backslash in a string costs the file nothing", (t) => {
  /*
   * The fail-closed routing was right about the code points a later reader counts and wrong about
   * these two. Nothing downstream splits a decoded value on a quote or a backslash, and
   * `content: "say \"hi\""` is CSS that ships — Chromium builds it verbatim. Reporting it made the
   * whole file unreadable, so every rule that read the file went UNJUDGEABLE and the run exited 4
   * over a string a browser has no difficulty with.
   */
  for (const source of [
    '.probe { content: "say \\"hi\\""; color: var(--color-text-body); }',
    ".probe { content: 'it\\'s'; color: var(--color-text-body); }",
    '.probe { content: "a\\\\b"; color: var(--color-text-body); }',
    '.probe::after { content: "\\201C" attr(data-x) "\\201D"; color: var(--color-text-body); }'
  ]) {
    const scan = scanStylesheet(source);
    assert.deepEqual(scan.unreadable, [], `an ordinary string cost the file its verdict: ${source}`);
    const report = check(mutatedRun(t, [{ file: "probe.css", write: source }]), { level: "L3" });
    assert.deepEqual(report.inputs.unreadable, [], `an ordinary string reached the fail-safe: ${source}`);
    assert.equal(report.verdict, "PASS", `an ordinary string left the run unclean: ${source}`);
    assert.equal(report.exit, 0);
    assert.equal(report.level.verified, "L3");
  }

  /*
   * The half that stays: an escape spelling a code point a later reader *does* count is still kept
   * as written and still reported, because decoding it would change what that reader counts. The
   * comma a font-family list is split on is the case the face rules depend on.
   */
  for (const [source, expected] of [
    ['.probe { font-family: "Foo\\2c Bar"; }', /string escape spelling ","/],
    ['.probe { grid-area: "a\\28 b"; }', /string escape spelling "\("/],
    ['.probe { grid-area: "a\\7b b"; }', /string escape spelling "\{"/]
  ]) {
    assert.match(
      scanStylesheet(source).unreadable.join(" | "),
      expected,
      `an escape a later reader counts stopped being reported: ${source}`
    );
  }
});

test("the at-rules whose body shape is known are read, and only the unknown ones are guarded", (t) => {
  /*
   * `@function`, `@try` and `@position-fallback` all ship, and all three reached the guard for an
   * at-rule this scanner can classify as neither rules nor declarations — a false unreadable that
   * cost every rule reading the file its verdict, and exit 4, against ordinary CSS. Chromium
   * applies the `.probe` rule beside each of them.
   */
  for (const source of [
    "@function --double(--x) {\n  result: calc(var(--x) * 2);\n}\n.probe { color: var(--color-text-body); }",
    "@position-fallback --pf {\n  @try { top: 1px; }\n}\n.probe { color: var(--color-text-body); }",
    "@try { top: 1px; }\n.probe { color: var(--color-text-body); }"
  ]) {
    const scan = scanStylesheet(source);
    assert.deepEqual(scan.unreadable, [], `a shipped at-rule was reported unreadable: ${source}`);
    const report = check(mutatedRun(t, [{ file: "probe.css", write: source }]), { level: "L3" });
    assert.deepEqual(report.inputs.unreadable, [], `a shipped at-rule reached the fail-safe: ${source}`);
    assert.deepEqual(
      report["findings-detail"].map((finding) => `${finding.rule}: ${finding.violation}`),
      [],
      `a shipped at-rule raised a finding: ${source}`
    );
    assert.equal(report.verdict, "PASS", `a shipped at-rule left the run unclean: ${source}`);
    assert.equal(report.level.verified, "L3");
  }

  /*
   * An `@function` prelude binds its parameters, and a reference to one resolves from the caller's
   * argument rather than from the token layer. Reading the body as declarations is what makes that
   * reference visible at all, so the binding has to be read with it or the fix for the false
   * unreadable buys a false VIOLATION instead.
   */
  assert.deepEqual(
    varUses("@function --double(--x, --y) { result: calc(var(--x) + var(--y)); }\n.a { color: var(--brand); }")
      .map((use) => use.name),
    ["--brand"],
    "an @function parameter was read as a reference to a ratified token"
  );

  // The guard itself is not weakened: an at-rule nobody can classify still costs the verdict,
  // because guessing its body's shape is the false clean `@scope` already demonstrated.
  assert.match(
    scanStylesheet("@nonesuch (.probe) { color: #ff0000; }").unreadable.join(" | "),
    /sits directly inside @nonesuch, whose body this scanner can read neither as rules nor as declarations/,
    "an at-rule this scanner cannot classify stopped reaching the fail-safe"
  );
});

/*
 * codex-1's round-08 reproducer, browser-confirmed: Chromium 150 parses this as a real
 * `CSSFunctionRule`, answers true to `CSS.supports("color", "--pick()")`, and computes the probe
 * colour as `rgb(255, 0, 0)` — out of `--ghost`, which no ratified token document declares.
 *
 * Closing the false *unreadable* on `@function` bought a false *clean*, which is the worse
 * direction of the same bug. `--x` is the one formal parameter here; `--ghost` is a reference in
 * that parameter's default value. Binding every `--name` after the opening parenthesis bound
 * `--ghost` too, so the body's real use of it was suppressed as if the caller supplied it, the
 * reference in the default was never collected at all, and the run reported PASS, verified L3, an
 * empty unreadable list and exit 0 over a token the browser resolves. A default value is a value.
 */
const FUNCTION_DEFAULT_REPRODUCER = [
  ":root { --ghost: rgb(255,0,0); }",
  "@function --pick(--x: var(--ghost)) { result: var(--ghost); }",
  ".probe { color: --pick(); }",
  ""
].join("\n");

/* The two clean controls the finding names, which the repair may not cost. */
const FUNCTION_BOUND_PARAMETER = [
  "@function --pick(--x) { result: var(--x); }",
  ".probe { color: --pick(var(--color-text-body)); }",
  ""
].join("\n");
const FUNCTION_DECLARED_DEFAULT = [
  "@function --pick(--x: var(--color-text-body)) { result: var(--x); }",
  ".probe { color: --pick(); }",
  ""
].join("\n");

test("an @function binds its parameters and uses its defaults, and a default is never a binding", (t) => {
  /*
   * The scanner half. Only the leading custom-property name of each top-level segment is bound,
   * and every reference in what follows it is a use — so the reproducer yields `--ghost` twice,
   * once for the default and once for the body, and never `--x`.
   */
  assert.deepEqual(
    varUses(FUNCTION_DEFAULT_REPRODUCER).map((use) => `${use.name}@${use.line}`),
    ["--ghost@2", "--ghost@2"],
    "a reference in a parameter default was bound as a parameter"
  );
  assert.deepEqual(
    varUses(FUNCTION_BOUND_PARAMETER).map((use) => `${use.name}@${use.line}`),
    ["--color-text-body@2"],
    "the bound parameter was read as a reference to a ratified token"
  );
  assert.deepEqual(
    varUses(FUNCTION_DECLARED_DEFAULT).map((use) => `${use.name}@${use.line}`),
    ["--color-text-body@1"],
    "a default referencing a declared token stopped being read as a use"
  );

  /*
   * The list divides at its own commas only: a comma inside a nested function, a bracket block or
   * a string divides nothing, an escaped one is part of the ident that carries it, and the
   * `returns` clause sits outside the parentheses and binds nothing. A `<css-type>` may carry no
   * `var()`, so reading it with the default costs no use and no binding.
   */
  for (const [source, expected] of [
    ["@function --f(--x <length>: 1px, --y type(<length>): var(--gap)) { result: var(--x); }", ["--gap"]],
    ["@function --f(--x: rgb(1, 2, 3), --y: var(--gap)) { result: calc(var(--x) + var(--y)); }", ["--gap"]],
    ['@function --f(--x: "a, --y") { result: var(--x); }', []],
    ["@function --f(--x: [a, var(--gap)]) { result: var(--x); }", ["--gap"]],
    ["@function --f(--x: 1) returns <length> { result: var(--x); }", []],
    ["@function --now() { result: 1; }\n.a { color: var(--gap); }", ["--gap"]],
    // Read as it spells, not as it is written, on both sides of the binding (§4.3.11).
    ["@function --f(\\2d\\2d x) { result: var(--x); }", []],
    ["@function --f(--x: \\76 ar(--ghost)) { result: var(--x); }", ["--ghost"]]
  ]) {
    assert.deepEqual(
      varUses(source).map((use) => use.name),
      expected,
      `the parameter list was divided wrongly: ${source}`
    );
    assert.deepEqual(scanStylesheet(source).unreadable, [], `an ordinary @function was reported unreadable: ${source}`);
  }

  /*
   * A parameter list this scanner cannot divide into parameters is not guessed at. It goes to the
   * unreadable channel and binds nothing, so the file costs its rules a verdict rather than
   * handing them a suppression: guessing "these are all parameters" is the false clean above, and
   * guessing "none of them is" is a finding against a name the caller really does supply.
   */
  const unparseable = scanStylesheet("@function --f(x: 1) { result: var(--x); }");
  assert.match(
    unparseable.unreadable.join(" | "),
    /the @function parameter list at line 1 carries "x: 1", which this scanner cannot read as a parameter/,
    "a parameter list with no custom-property name was read as if it bound something"
  );
  assert.deepEqual(
    varUses("@function --f(x: 1) { result: var(--x); }").map((use) => use.name),
    ["--x"],
    "an unreadable parameter list still suppressed a reference"
  );

  /*
   * And the at-rule that only shares the name. CSS Functions names a function with a
   * `<custom-property-name>`; Sass has had `@function px-to-rem($n)` for a decade, and this
   * scanner reads source. Five preludes in two real `.scss` files of the sweep corpus were the
   * only `@function` parameter lists it could not read as CSS, and reporting them would have been
   * the false alarm this whole repair exists on the other side of.
   */
  for (const source of [
    "@function px-to-rem($n) {\n  x: $n;\n}\n.probe { color: var(--color-text-body); }",
    "@function fonts($family, $weight: 400) {\n  x: map-get($sizes, $family);\n}\n.probe { color: var(--color-text-body); }"
  ]) {
    assert.deepEqual(
      scanStylesheet(source).unreadable,
      [],
      `a Sass @function was reported unreadable: ${source}`
    );
    assert.deepEqual(varUses(source).map((use) => use.name), ["--color-text-body"]);
  }
  // The two shapes exactly as the corpus writes them: a `@return` body is text this scanner has
  // always reported, and that is not what may change — the parameter list must stay unremarked.
  for (const source of [
    "@function px-to-rem($n) {\n  @return $n / 16 * 1rem;\n}\n.probe { color: var(--color-text-body); }",
    "@function fonts($family, $weight: 400) {\n  @return map-get($sizes, $family);\n}\n.probe { color: var(--color-text-body); }"
  ]) {
    assert.ok(
      !scanStylesheet(source).unreadable.some((reason) => /@function parameter list/.test(reason)),
      `a Sass @function parameter list reached the fail-safe: ${source}`
    );
  }

  /*
   * End to end, on the run that verifies, at `--level L3`. What this fixture must not produce is
   * the clean pass it produced at `82bde7d`: either the finding, or unreadable and UNJUDGEABLE.
   */
  const report = check(mutatedRun(t, [{ file: "probe.css", write: FUNCTION_DEFAULT_REPRODUCER }]), { level: "L3" });
  const undeclared = report["findings-detail"].filter((finding) => finding.rule === "core:token-used-undeclared");
  const unreadable = report.inputs.unreadable.filter((entry) => /probe\.css/.test(entry));
  assert.ok(
    undeclared.length > 0 || unreadable.length > 0,
    `a browser-resolved reference to an undeclared token certified clean: ${JSON.stringify(report["findings-detail"])}`
  );
  assert.ok(
    undeclared.some((finding) => /references --ghost/.test(finding.violation)),
    `the reference the browser resolves was not the one reported: ${JSON.stringify(undeclared)}`
  );
  assert.equal(report.verdict, "VIOLATION");
  assert.notEqual(report.level.verified, "L3", "a run over an undeclared token verified the level it claims");
  assert.notEqual(report.exit, 0, "a run over a browser-resolved undeclared token exited clean");

  // And the two clean controls the repair may not cost: an ordinary `@function` still passes.
  for (const [name, source] of [
    ["a body using only the bound parameter", FUNCTION_BOUND_PARAMETER],
    ["a default referencing a ratified token", FUNCTION_DECLARED_DEFAULT]
  ]) {
    const clean = check(mutatedRun(t, [{ file: "probe.css", write: source }]), { level: "L3" });
    assert.deepEqual(
      clean["findings-detail"].map((finding) => `${finding.rule}: ${finding.violation}`),
      [],
      `${name} raised a finding`
    );
    assert.deepEqual(clean.inputs.unreadable, [], `${name} was reported unreadable`);
    assert.equal(clean.verdict, "PASS", `${name} left the run unclean`);
    assert.equal(clean.level.verified, "L3");
    assert.equal(clean.exit, 0);
  }
});

test("CDO and CDC at the top level of a stylesheet are discarded, as a browser discards them", (t) => {
  /*
   * §5.4.1: where a rule would begin at the top level, `<!--` and `-->` are consumed and dropped —
   * the legacy idiom that hid a stylesheet from an HTML parser that did not know the element.
   * Chromium's CSSOM for each of these is `.probe { color: rgb(255, 0, 0); }` and nothing else.
   * The ident rule read the `--` of a `-->` as an ident of its own and left the `>` as text no
   * rule owned, so the file ended "unreadable" and every rule that read it went UNJUDGEABLE.
   */
  for (const source of [
    ".probe { color: var(--color-text-body); } -->",
    "<!-- .probe { color: var(--color-text-body); } -->",
    "<!--\n.probe { color: var(--color-text-body); }\n-->\n"
  ]) {
    const scan = scanStylesheet(source);
    assert.deepEqual(scan.blocks.map((block) => block.selector), [".probe"], `CDO/CDC broke the rule: ${source}`);
    assert.deepEqual(scan.unreadable, [], `CDO/CDC was reported unreadable: ${source}`);
    const report = check(mutatedRun(t, [{ file: "probe.css", write: source }]), { level: "L3" });
    assert.deepEqual(report.inputs.unreadable, [], `CDO/CDC reached the fail-safe: ${source}`);
    assert.equal(report.verdict, "PASS", `CDO/CDC left the run unclean: ${source}`);
    assert.equal(report.level.verified, "L3");
  }

  /*
   * Only at the top level, and only where a rule would begin. Inside a rule the same code points
   * are ordinary preserved tokens and stay in the value, and part way through a prelude they stay
   * in the prelude — dropping them there would be a scanner reading a file the browser does not.
   */
  const inside = scanStylesheet(".probe { grid-area: a-->b; color: #ff0000; }");
  assert.deepEqual(
    inside.blocks[0].declarations.map((d) => `${d.prop}=${d.value}`),
    ["grid-area=a-->b", "color=#ff0000"],
    "a CDC inside a declaration was discarded rather than kept as a value"
  );
  assert.deepEqual(inside.unreadable, []);
});

test("a contract naming a waiver file that resolves to nothing is reported, not read as no waivers", (t) => {
  /*
   * Naming no file and naming a file that is not there are two states, and only the first is "this
   * run has no waivers". The second was read as the first, silently — so a contract could point at
   * a waiver file nobody had written and every `waived` answer resting on it was resolved against a
   * file that was never opened. The silent path is the one this checker exists to refuse.
   */
  const missing = check(mutatedRun(t, [{ file: "WAIVERS.md", remove: true }]), { level: "L3" });
  const named = missing["findings-detail"].filter(
    (finding) => finding.rule === "pds-check:l2-process-order" && /names the waiver file/.test(finding.violation)
  );
  assert.equal(named.length, 1, `a contract pointing at no readable waiver file was silent: ${missing.findings.join(" | ")}`);
  assert.match(named[0].violation, /WAIVERS\.md/, "the report does not name the path the contract gave");
  assert.match(named[0].path, /FINAL\.md$/, "the report does not name the contract that carries the field");
  assert.notEqual(missing.verdict, "PASS", "a run whose waiver file could not be read certified clean");
  assert.notEqual(missing.exit, 0);

  // The two states that are not this one: a field naming nothing is a run with no waivers, and a
  // field naming a file that is there is read.
  const none = check(mutatedRun(t, [
    { file: "FINAL.md", from: "waivers: WAIVERS.md", to: 'waivers: ""' },
    { file: "WAIVERS.md", remove: true }
  ]), { level: "L3" });
  assert.deepEqual(
    none["findings-detail"].filter((finding) => /names the waiver file/.test(finding.violation)),
    [],
    "a contract naming no waiver file was reported as one naming a missing file"
  );
  assert.equal(check(SOUND_RUN, { level: "L3" }).verdict, "PASS", "the sound run stopped verifying");
});

test("a terminated string beside a token-resolved rule stays clean", () => {
  // The passing-side control kimi-1 asked for: the fix must not turn ordinary quoted content
  // into a parse error, and the rule after it must still resolve through the token layer.
  const report = check(path.join(FIXTURES, "literal-outside-tokens", "pass"));
  assert.deepEqual(
    report["findings-detail"].map((finding) => `${finding.rule}: ${finding.violation}`),
    [],
    "the terminated-string control raised findings"
  );
});

test("a file declaring the spec with a kind PDS does not define fails L1", (t) => {
  // Round-02 AF-1(f). The file was demoted to `not-inspected`, so L1 verified beside a
  // candidate artifact whose type nobody defines.
  const run = mutatedRun(t, [
    { file: "TYPO.md", write: ["---", "spec: PDS/1.0", "kind: TYPO-BRIEF", "---", "", "# Typo", ""].join("\n") }
  ]);
  const report = check(run, { level: "L1" });
  const finding = report["findings-detail"].find((entry) => entry.rule === "pds-check:l1-artifact-kind");
  assert.ok(finding, "a candidate artifact with an undefined kind raised nothing");
  assert.match(finding.violation, /names the kind TYPO-BRIEF, which §2 does not define/);
  assert.ok(unmet(report).includes("pds-check:l1-artifact-kind"));
  assert.equal(report.level.verified, null);
  assert.ok(!report.inputs["not-inspected"].some((entry) => /TYPO\.md/.test(entry)));
});

test("an extension key outside the canonical subset cannot leave L1 met", (t) => {
  // Round-03 codex-1, end to end. §2 rule 2 keeps `x-` keys silent, which is not the same as
  // keeping them unparsed: one added to an otherwise sound DESIGN-BRIEF with an unquoted `#`
  // and a trailing comment left `l1-frontmatter-parses` met and certified the run at L3 with
  // PASS and exit 0. §2 rule 6 reports such a file, and its level goes with it.
  const run = mutatedRun(t, [
    {
      file: "DESIGN-BRIEF.md",
      from: "decider: human:tomas",
      to: "decider: human:tomas\nx-note: unquoted # trailing comments are forbidden"
    }
  ]);
  const report = check(run, { level: "L3" });
  const finding = report["findings-detail"].find((entry) => entry.rule === "pds-check:l1-frontmatter-parses");
  assert.ok(finding, "a brief carrying a trailing comment raised nothing");
  assert.match(finding.violation, /its frontmatter is outside the canonical subset/);
  assert.match(finding.violation, /an unquoted "#"/);
  assert.ok(unmet(report).includes("pds-check:l1-frontmatter-parses"));
  assert.equal(report.level.verified, null);
  assert.notEqual(report.exit, 0);
});

test("a markdown file declaring no spec is still uninspected rather than a finding", (t) => {
  // The other side of the same line: the doctrine's own files declare the spec they define and
  // name no kind, and a checker run over them must not manufacture findings against them.
  const run = mutatedRun(t, [
    { file: "SPEC.md", write: ["---", "spec: PDS/1.0", "status: stable", "---", "", "# A spec, not an artifact", ""].join("\n") },
    { file: "NOTES.md", write: "# Notes\n\nOrdinary markdown, no frontmatter.\n" }
  ]);
  const report = check(run, { level: "L2" });
  assert.deepEqual(report["findings-detail"].filter((entry) => entry.rule === "pds-check:l1-artifact-kind"), []);
  assert.equal(report.level.verified, "L2");
});

/* ------------------------------------- waivers: independence of the counter-signer */

test("the author of the waived work cannot counter-sign the waiver", (t) => {
  // Round-02 AF-2. Grantor and signer were proved distinct and never compared against the
  // ownership of the scoped work, so naming a colleague as grantor let an author approve its
  // own exception: this waiver applied, the finding disappeared and the run exited 0.
  const run = mutatedRun(t, [
    {
      file: path.join("round-01", "claude-1.md"),
      from: 'effects: [{name: rule-line, anchor: "the boundary between two column groups; it disappears when a group has one column"}]',
      to: "effects: [corner-numeral]"
    },
    {
      file: "consensus.md",
      from: "  - {direction: ledger, fires: []}",
      to: '  - {direction: ledger, fires: ["core:decoration-unmotivated=corner-numeral"]}'
    },
    {
      file: "WAIVERS.md",
      write: waiverFile(
        '{rule-id: core:decoration-unmotivated, scope: round-01/claude-1.md, expiry: 2099-01-01, reason: "the numeral ships with the launch surface", granted-by: codex-1, counter-signed-by: claude-1}'
      )
    }
  ]);
  const report = check(run, { level: "L2" });
  assert.equal(report["waivers-applied"].length, 0, "an author counter-signed a waiver on its own work");
  assert.ok(
    report["waiver-errors"].some((entry) => /the counter-signer claude-1 authored the waived work/.test(entry)),
    `waiver errors: ${report["waiver-errors"].join("; ")}`
  );
  assert.ok(
    report["findings-detail"].some((entry) => entry.rule === "core:decoration-unmotivated"),
    "the finding a self-approved waiver claimed to excuse left the ledger"
  );
  assert.notEqual(report.exit, 0);
});

test("a counter-signer no artifact but its own records establishes no independence", (t) => {
  // The identity half of the same rule: a critique author appears nowhere except on the file it
  // wrote, so a proposer filing one extra critique under a fresh id reads exactly like a
  // genuine critic. §8 rule 2: independence that cannot be established suppresses nothing.
  const run = mutatedRun(t, [
    { file: "panel.css", from: "color: var(--color-text-body);", to: "color: #1b1b1b;" },
    {
      file: "WAIVERS.md",
      write: waiverFile(
        '{rule-id: core:literal-outside-token-layer, scope: panel.css, expiry: 2099-01-01, reason: "the legacy panel is replaced this quarter", granted-by: claude-1, counter-signed-by: hermes-1}'
      )
    }
  ]);
  const report = check(run, { level: "L2" });
  assert.equal(report["waivers-applied"].length, 0);
  assert.ok(
    report["waiver-errors"].some((entry) => /counter-signer hermes-1 is recorded only by an artifact it authored itself/.test(entry)),
    `waiver errors: ${report["waiver-errors"].join("; ")}`
  );
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
