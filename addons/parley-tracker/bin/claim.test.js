"use strict";

/*
 * Tests for the parley-tracker `claim` gate.
 *
 * `claim` runs the readiness gap-scan (validate) and only writes the claim on a
 * pass. On a failing ticket it must exit non-zero and leave the file byte-for-
 * byte unchanged. Node built-ins only.
 */

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const claimBin = path.join(__dirname, "claim.js");
const claim = require("./claim.js");
const validate = require("./validate.js");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "parley-tracker-claim-"));
}

function runCli(args) {
  return spawnSync(process.execPath, [claimBin, ...args], { encoding: "utf8" });
}

const templatesDir = path.join(__dirname, "..", "templates");

function readShipped(name) {
  return fs.readFileSync(path.join(templatesDir, name), "utf8");
}

function reInjectPlaceholder(text) {
  return text.replace(/^title:.*$/m, 'title: "A leftover <placeholder> in the title"');
}

test("claim writes status: in-progress + assignee on a passing ticket", () => {
  const dir = tmpDir();
  const file = path.join(dir, "story.md");
  fs.writeFileSync(file, readShipped("story.md"), "utf8");

  const res = runCli(["--assignee", "author", file]);
  assert.equal(res.status, 0, res.stdout + res.stderr);

  const after = fs.readFileSync(file, "utf8");
  const result = validate.validateTicket(after, {});
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.data.status, "in-progress");
  assert.equal(result.data.assignee, "author");
});

test("claim preserves the body and leaves the ticket still valid", () => {
  const dir = tmpDir();
  const file = path.join(dir, "subtask.md");
  const original = readShipped("subtask.md");
  fs.writeFileSync(file, original, "utf8");

  const res = claim.claim(file, "agent:impl-1", { stdout: { write() {} } });
  assert.equal(res.ok, true);

  const after = fs.readFileSync(file, "utf8");
  // Body after the frontmatter is untouched.
  const bodyMarker = "## Acceptance criteria";
  assert.equal(
    after.slice(after.indexOf(bodyMarker)),
    original.slice(original.indexOf(bodyMarker))
  );
});

test("claim refuses a failing ticket and leaves the file unchanged", () => {
  const dir = tmpDir();
  const file = path.join(dir, "broken.md");
  const broken = reInjectPlaceholder(readShipped("subtask.md"));
  fs.writeFileSync(file, broken, "utf8");

  const res = runCli(["--assignee", "author", file]);
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stdout, /BLOCKED/);

  assert.equal(fs.readFileSync(file, "utf8"), broken, "file must be untouched on a refused claim");
});

test("claim exits 2 on a missing file", () => {
  const res = runCli(["--assignee", "author", path.join(tmpDir(), "nope.md")]);
  assert.equal(res.status, 2);
});

test("claim exits 2 with no ticket argument", () => {
  const res = runCli([]);
  assert.equal(res.status, 2);
});
