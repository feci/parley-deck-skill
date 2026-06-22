"use strict";

/*
 * Tests for the parley-tracker `validate` readiness/lint tool.
 *
 * Uses only Node built-ins (node:test, node:assert, node:child_process, fs).
 * Exercises both the in-process validator and the CLI (exit codes + messages),
 * with a clean PASS fixture and several targeted FAIL fixtures covering each
 * gap-scan rule from FINAL.md S B.4, plus a --strict glob mode pass.
 */

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const validate = require("./validate.js");

const bin = path.join(__dirname, "validate.js");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "parley-tracker-validate-"));
}

function writeTicket(dir, name, body) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, body, "utf8");
  return file;
}

function runCli(args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
}

/* ----------------------------------------------------------- PASS fixture */

// A fully-valid story ticket: frontmatter complete, enums valid, every AC
// tagged with a Gherkin scenario or Verify line, an edge AC present, an
// [A] section with a "Do not", and files/apis/arch each populated or n/a.
const VALID_STORY = `---
id: S-001
type: story
title: "As an author I claim a subtask so no implementer duplicates it"
parent: E-001
status: ready
assignee: agent:impl-1
priority: p1
labels: [domain:tracker, coord:claim]
files: [addons/parley-tracker/bin/claim.js]
apis: [n/a]
arch: [n/a]
worktree: n/a
dod: [AC-1, AC-2, AC-3]
mirror-owned: [status, assignee]
canonical_source: parley-deck/ideas/example/FINAL.md@abc1234
---

# As an author I claim a subtask so no implementer duplicates it

## At a glance
Prevent two implementers building the same subtask · scope = one claim op ·
done when a second claim on an in-progress subtask is refused.

## [B] Business
Outcome: no wasted parallel work; cost tracks unique subtasks, not attempts.

## [T] Technical
Claim = set status + assignee + worktree in frontmatter, committed atomically.

## [A] Agent directives
Read the subtask fully before claiming. Run the gap-scan first. Do not edit a
subtask you have not claimed. Do not re-claim an in-progress subtask.

## Acceptance criteria
- AC-1 [A][T] Given an unclaimed subtask, When the agent commits a claim, Then
  the file shows status in-progress and an assignee.
- AC-2 [A][T] Given a subtask already in-progress with another assignee, When a
  second claim is attempted, Then the operation is refused (error path).
- AC-3 [T] Measurable: a claim is exactly one commit. Verify: \`git show --stat\`

## Non-goals
- No locking server.

## Dependencies / blocks
- blocked-by T-001.
`;

/* ----------------------------------------------------------- FAIL fixtures */

const NO_FRONTMATTER = `# A ticket with no frontmatter

## [A] Agent directives
Do not guess.

## Acceptance criteria
- AC-1 [T] Verify: \`true\`
`;

const MISSING_REQUIRED = `---
id: S-002
type: story
title: ""
parent: E-001
status: ready
files: [n/a]
apis: [n/a]
arch: [n/a]
dod: [AC-1]
---

# Missing title

## [A] Agent directives
Do not assume.

## Acceptance criteria
- AC-1 [T] Verify: \`true\`
- AC-2 [T] Given x When y Then error fallback path.
`;

const BAD_ENUMS = `---
id: S-003
type: bogus
title: "Bad enums"
parent: E-001
status: not-a-status
priority: p9
files: [n/a]
apis: [n/a]
arch: [n/a]
dod: [AC-1]
---

# Bad enums

## [A] Agent directives
Do not proceed.

## Acceptance criteria
- AC-1 [T] Verify: \`true\`
- AC-2 [T] Given x When y Then error.
`;

const AC_MISSING_TAG_AND_VERIFY = `---
id: S-004
type: story
title: "AC without tag or verifiable form"
parent: E-001
status: ready
files: [n/a]
apis: [n/a]
arch: [n/a]
dod: [AC-1]
---

# AC without tag or verifiable form

## [A] Agent directives
Do not guess.

## Acceptance criteria
- AC-1 The system should work nicely.
`;

const NO_EDGE_AC = `---
id: S-005
type: story
title: "Only a happy path AC"
parent: E-001
status: ready
files: [n/a]
apis: [n/a]
arch: [n/a]
dod: [AC-1]
---

# Only a happy path AC

## [A] Agent directives
Do not guess.

## Acceptance criteria
- AC-1 [T] Given a normal input, When processed, Then the expected output is produced.
`;

const AGENT_SECTION_NO_DONOT = `---
id: S-006
type: story
title: "Agent directives with no Do not"
parent: E-001
status: ready
files: [n/a]
apis: [n/a]
arch: [n/a]
dod: [AC-1]
---

# Agent directives with no Do not

## [A] Agent directives
Read the spec and implement it carefully.

## Acceptance criteria
- AC-1 [T] Verify: \`true\`
- AC-2 [T] Given x When y Then an error is surfaced.
`;

const FILES_MISSING = `---
id: S-007
type: story
title: "files not populated and not n/a"
parent: E-001
status: ready
apis: [n/a]
arch: [n/a]
dod: [AC-1]
---

# files not populated and not n/a

## [A] Agent directives
Do not guess.

## Acceptance criteria
- AC-1 [T] Verify: \`true\`
- AC-2 [T] Given x When y Then an error path runs.
`;

const DOD_DANGLING = `---
id: S-008
type: story
title: "dod references a non-existent AC"
parent: E-001
status: ready
files: [n/a]
apis: [n/a]
arch: [n/a]
dod: [AC-1, AC-99]
---

# dod references a non-existent AC

## [A] Agent directives
Do not guess.

## Acceptance criteria
- AC-1 [T] Verify: \`true\`
- AC-2 [T] Given x When y Then an error path runs.
`;

const EDGE_WAIVER = `---
id: S-009
type: story
title: "Happy path only but with an explicit edge waiver"
parent: E-001
status: ready
assignee: n/a
priority: p1
labels: [domain:tracker]
files: [n/a]
apis: [n/a]
arch: [n/a]
worktree: n/a
mirror-owned: [status, assignee]
dod: [AC-1]
canonical_source: parley-deck/ideas/example/FINAL.md@abc1234
---

# Happy path only but with an explicit edge waiver

## At a glance
A pure read with one deterministic path · scope = one read op · done when output appears.

## [B] Business
Outcome: readers get the value with no failure mode to handle.

## [T] Technical
A single deterministic read; no error branch exists.

## [A] Agent directives
Do not guess.

## Acceptance criteria
Edge/error: n/a (this command is a pure read with one deterministic path)
- AC-1 [T] Given a normal input, When processed, Then the expected output appears.
`;

/* ----------------------------------------------------------------- in-proc */

test("valid story passes the validator", () => {
  const result = validate.validateTicket(VALID_STORY, {});
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
});

test("missing frontmatter fails on the frontmatter check", () => {
  const result = validate.validateTicket(NO_FRONTMATTER, {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "frontmatter"));
});

test("empty required field (title) fails", () => {
  const result = validate.validateTicket(MISSING_REQUIRED, {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "title"));
});

test("invalid enums fail for type, status, priority", () => {
  const result = validate.validateTicket(BAD_ENUMS, {});
  assert.equal(result.ok, false);
  for (const f of ["type", "status", "priority"]) {
    assert.ok(result.errors.some((e) => e.field === f), `expected error for ${f}`);
  }
});

test("AC without an audience tag and without Gherkin/Verify fails", () => {
  const result = validate.validateTicket(AC_MISSING_TAG_AND_VERIFY, {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "AC-1"));
});

test("no edge/error AC and no waiver fails", () => {
  const result = validate.validateTicket(NO_EDGE_AC, {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /edge\/error\/offline/.test(e.message)));
});

test("agent directives without a Do not fails", () => {
  const result = validate.validateTicket(AGENT_SECTION_NO_DONOT, {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "[A] Agent directives"));
});

test("files neither populated nor n/a fails", () => {
  const result = validate.validateTicket(FILES_MISSING, {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "files"));
});

test("dod referencing a missing AC fails", () => {
  const result = validate.validateTicket(DOD_DANGLING, {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "dod" && /AC-99/.test(e.message)));
});

test("explicit edge waiver satisfies the edge/error rule", () => {
  const result = validate.validateTicket(EDGE_WAIVER, {});
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
});

test("epic with a non-n/a parent fails", () => {
  const epic = VALID_STORY.replace("type: story", "type: epic");
  const result = validate.validateTicket(epic, {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "parent"));
});

/* -------------------------------------------------------------------- CLI */

test("CLI exits 0 on a passing ticket", () => {
  const dir = tmpDir();
  const file = writeTicket(dir, "ok.md", VALID_STORY);
  const res = runCli([file]);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /PASS/);
});

test("CLI exits 1 with field-level messages on a failing ticket", () => {
  const dir = tmpDir();
  const file = writeTicket(dir, "bad.md", BAD_ENUMS);
  const res = runCli([file]);
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stdout, /FAIL/);
  assert.match(res.stdout, /type:/);
  assert.match(res.stdout, /status:/);
});

test("CLI --strict glob mode validates a tree and resolves parents", () => {
  const dir = tmpDir();
  // An epic plus a story that points at it; both valid -> exit 0.
  const epic = VALID_STORY
    .replace("id: S-001", "id: E-001")
    .replace("type: story", "type: epic")
    .replace("parent: E-001", "parent: n/a");
  writeTicket(dir, "epic.md", epic);
  writeTicket(dir, "story.md", VALID_STORY);
  const res = runCli(["--strict", "--dir", dir]);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /All 2 ticket\(s\) passed/);
});

test("CLI --strict flags an unresolved parent across the tree", () => {
  const dir = tmpDir();
  // Story whose parent E-404 exists nowhere in the tree.
  const orphan = VALID_STORY.replace("parent: E-001", "parent: E-404");
  writeTicket(dir, "orphan.md", orphan);
  const res = runCli(["--strict", "--dir", dir]);
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stdout, /parent.*E-404/);
});

test("CLI exits 2 on usage error (no args)", () => {
  const res = runCli([]);
  assert.equal(res.status, 2);
});

/* ----------------------------------------- shipped templates + new rules */

const templatesDir = path.join(__dirname, "..", "templates");
const TEMPLATES = ["epic.md", "story.md", "subtask.md"];

// Re-inject a placeholder into a filled template so it must FAIL again — proves
// a half-filled copy of a shipped template cannot pass. We target the `title`
// frontmatter field, which validate scans for placeholder leaks.
function reInjectPlaceholder(text) {
  return text.replace(/^title:.*$/m, 'title: "A leftover <placeholder> in the title"');
}

for (const name of TEMPLATES) {
  test(`shipped template ${name} passes validate as filled`, () => {
    const file = path.join(templatesDir, name);
    const text = fs.readFileSync(file, "utf8");
    const result = validate.validateTicket(text, {});
    assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  });

  test(`shipped template ${name} fails once a placeholder is re-injected`, () => {
    const file = path.join(templatesDir, name);
    const broken = reInjectPlaceholder(fs.readFileSync(file, "utf8"));
    const result = validate.validateTicket(broken, {});
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) => /placeholder/.test(e.message)),
      JSON.stringify(result.errors, null, 2)
    );
  });

  test(`CLI validates shipped template ${name} with exit 0`, () => {
    const res = runCli([path.join(templatesDir, name)]);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /PASS/);
  });
}

const EMPTY_VERIFY = `---
id: T-010
type: subtask
title: "An AC with an empty Verify"
parent: S-001
status: ready
assignee: n/a
priority: p1
labels: [domain:tracker]
files: [n/a]
apis: [n/a]
arch: [n/a]
worktree: n/a
mirror-owned: [status, assignee]
dod: [AC-1]
canonical_source: parley-deck/ideas/example/FINAL.md@abc1234
---

# An AC with an empty Verify

## At a glance
One read op · scope = one op · done when output appears.

## [B] Business
n/a (technical slice)

## [T] Technical
A single read.

## [A] Agent directives
Do not guess.

## Acceptance criteria
- AC-1 [T] Given a normal input, When processed, Then output appears.
- AC-2 [T] Measurable: the command succeeds. Verify:
`;

const EDGE_ONLY = `---
id: T-011
type: subtask
title: "Only an edge AC, no happy path"
parent: S-001
status: ready
assignee: n/a
priority: p1
labels: [domain:tracker]
files: [n/a]
apis: [n/a]
arch: [n/a]
worktree: n/a
mirror-owned: [status, assignee]
dod: [AC-1]
canonical_source: parley-deck/ideas/example/FINAL.md@abc1234
---

# Only an edge AC, no happy path

## At a glance
Handle a failure · scope = error path · done when the error is surfaced.

## [B] Business
n/a (technical slice)

## [T] Technical
Only the error branch.

## [A] Agent directives
Do not guess.

## Acceptance criteria
- AC-1 [T] Given an invalid input, When processed, Then an error is surfaced (failure path).
`;

const NFR_NO_VERIFY = `---
id: T-012
type: subtask
title: "An NFR-tagged AC without a Verify"
parent: S-001
status: ready
assignee: n/a
priority: p1
labels: [domain:tracker]
files: [n/a]
apis: [n/a]
arch: [n/a]
worktree: n/a
mirror-owned: [status, assignee]
dod: [AC-1]
canonical_source: parley-deck/ideas/example/FINAL.md@abc1234
---

# An NFR-tagged AC without a Verify

## At a glance
Fast read · scope = one op · done when output appears.

## [B] Business
n/a (technical slice)

## [T] Technical
A read that must be fast.

## [A] Agent directives
Do not guess.

## Acceptance criteria
- AC-1 [T] Given a normal input, When processed, Then output appears.
- AC-2 [T] Given an empty input, When processed, Then an error is surfaced.
- AC-3 [T][NFR] Measurable: the read returns in under 50ms.
`;

const MISSING_CANONICAL_FIELD = `---
id: S-020
type: story
title: "A story missing assignee and canonical_source"
parent: E-001
status: ready
priority: p1
labels: [domain:tracker]
files: [n/a]
apis: [n/a]
arch: [n/a]
worktree: n/a
mirror-owned: [status, assignee]
dod: [AC-1]
---

# A story missing assignee and canonical_source

## At a glance
A demo · scope = a demo · done when it works.

## [B] Business
Some value.

## [T] Technical
Some systems.

## [A] Agent directives
Do not guess.

## Acceptance criteria
- AC-1 [T] Given a normal input, When processed, Then output appears.
- AC-2 [T] Given an invalid input, When processed, Then an error is surfaced.
`;

test("an empty Verify: command fails", () => {
  const result = validate.validateTicket(EMPTY_VERIFY, {});
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.field === "AC-2" && /no command/.test(e.message)),
    JSON.stringify(result.errors, null, 2)
  );
});

test("edge-only (no happy-path) AC fails", () => {
  const result = validate.validateTicket(EDGE_ONLY, {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /happy-path/.test(e.message)));
});

test("an [NFR]-tagged AC without a Verify command fails", () => {
  const result = validate.validateTicket(NFR_NO_VERIFY, {});
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.field === "AC-3" && /NFR/.test(e.message)),
    JSON.stringify(result.errors, null, 2)
  );
});

test("missing canonical schema fields (assignee, canonical_source) fail", () => {
  const result = validate.validateTicket(MISSING_CANONICAL_FIELD, {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === "assignee"));
  assert.ok(result.errors.some((e) => e.field === "canonical_source"));
});

test("subtask [B] may be an explicit n/a (reason)", () => {
  // Lift the shipped subtask, whose [B] is "n/a (reason)" — it must still pass.
  const file = path.join(templatesDir, "subtask.md");
  const result = validate.validateTicket(fs.readFileSync(file, "utf8"), {});
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
});
