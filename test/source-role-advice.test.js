"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const CLI = path.join(PACKAGE_ROOT, "bin", "parley-deck-skill.js");
const PACKAGED = path.join(PACKAGE_ROOT, "skills", "parley-deck", "references", "COOPERATION.md");

// Build a project whose COOPERATION.md deliberately DIFFERS from the packaged copy, with the given
// protocolRole recorded in meta/version.json.
function projectWithRole(role) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "pd-role-advice-"));
  fs.mkdirSync(path.join(project, "parley-deck", "meta"), { recursive: true });
  const live = path.join(project, "parley-deck", "COOPERATION.md");
  fs.copyFileSync(PACKAGED, live);
  fs.appendFileSync(live, "\nDELIBERATE DIVERGENCE FOR THIS TEST\n");
  const meta = { deckVersion: "1.0.0" };
  if (role) meta.protocolRole = role;
  fs.writeFileSync(path.join(project, "parley-deck", "meta", "version.json"), JSON.stringify(meta, null, 2));
  return project;
}

function actionsFor(project) {
  const out = execFileSync(process.execPath, [CLI, "status", "--project", project, "--json"], { encoding: "utf8" });
  return JSON.parse(out).actions || [];
}

// kimi-1/F4 (MINOR, confirmed by zcode-1, dropped from the fix list by a mis-recorded verdict):
// nothing in the skill package read protocolRole, so on a `source` deck -- the one place where the
// packaged copy is by definition the OLDER one (COOPERATION.md:839-840) -- `status` recommended
// adopting it. A message that misstates its own effect.
test("a source-role deck is never told to adopt the packaged protocol", () => {
  const actions = actionsFor(projectWithRole("source"));
  const joined = actions.join("\n");
  assert.ok(
    !/adopting packaged protocol updates/.test(joined),
    `source deck was told to adopt the packaged protocol:\n${joined}`
  );
  assert.ok(
    /protocolRole: source/.test(joined) && /do NOT adopt/.test(joined),
    `source deck did not get the source-specific advice:\n${joined}`
  );
});

// The consumer advice must be unchanged -- the fix is a branch, not a removal.
test("a consumer-role deck still gets the adopt-after-review advice", () => {
  const joined = actionsFor(projectWithRole("consumer")).join("\n");
  assert.ok(
    /adopting packaged protocol updates/.test(joined),
    `consumer deck lost its advice:\n${joined}`
  );
});

// With no role recorded, the tool does not know which direction is upstream. It must keep the
// conservative "review before adopting" wording rather than guess.
test("a deck with no protocolRole keeps the conservative advice", () => {
  const joined = actionsFor(projectWithRole(null)).join("\n");
  assert.ok(
    /adopting packaged protocol updates/.test(joined),
    `unknown-role deck lost its advice:\n${joined}`
  );
});
