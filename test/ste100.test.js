"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const refs = path.join(root, "skills", "parley-deck", "references");
const summary = fs.readFileSync(path.join(refs, "STE100.md"), "utf8");
const protocol = fs.readFileSync(path.join(refs, "COOPERATION.md"), "utf8");

test("the portable STE reference and binding appendix have one exact rule body", () => {
  const marker = "## Appendix B — ASD-STE100 output text\n\n";
  assert.equal(protocol.split(marker).length, 2, "one binding appendix");
  assert.equal(summary.slice(summary.indexOf("\n\n") + 2), protocol.split(marker)[1]);
  for (const required of [
    "For protocol decisions, this summary is binding.",
    "Limit each procedural sentence to 20 words.",
    "Limit each descriptive sentence to 25 words.",
    "Use at most six sentences per paragraph.",
    "including quotations in another language",
    "all frontmatter",
    "required headings, verdict tokens, and signoff syntax",
    "Agent-authored prose is not exempt",
    "`ste_output: false`",
    "the CLI does not parse the field or use it as a phase gate",
    "does not override an older live authority",
    "A rule-modifying consumer sync needs user confirmation.",
    "Do not rewrite existing text",
    "outside the fixed-severity findings list",
    "It cannot block a phase or a strict-gate close.",
    "Do not copy or redistribute the dictionary",
  ]) assert.ok(summary.includes(required), `missing policy boundary: ${required}`);
});

test("the artifact template preserves source quotes under the adopted authority", () => {
  const templates = fs.readFileSync(path.join(refs, "ARTIFACT_TEMPLATES.md"), "utf8");
  assert.ok(templates.includes("Preserve verbatim source quotes, including non-English quotes."));
  assert.ok(templates.includes("An older live authority keeps its own policy."));
  assert.ok(!templates.includes("translate non-English user text into English"));
});

test("the real generic install carries the on-demand STE reference", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "parley-ste100-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dest = path.join(dir, "parley-deck");
  const result = spawnSync(process.execPath, [path.join(root, "bin", "parley-deck-skill.js"),
    "install", "--target", "generic", "--dest", dest, "--no-addons"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(path.join(dest, "references", "STE100.md"), "utf8"), summary);
  assert.ok(fs.readFileSync(path.join(dest, "SKILL.md"), "utf8").includes("references/STE100.md"));
});
