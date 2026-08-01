"use strict";

// Regressions for idea `addon-manifest-coverage`.
//
// Two defects, pointing in opposite directions, both reachable on 2.1.0:
//
//   false RED   — a foreign installer (the universal `skills` CLI the README recommends first)
//                 copies the payload verbatim and leaves no marker of ours. Five of six units
//                 reported `malformed` and `doctor` exited 1, although every byte was correct.
//
//   false GREEN — our own installer, marker retained, add-on reduced to a single `SKILL.md`.
//                 `doctor` reported `valid`, `managed: true`, and exited 0, because an add-on's
//                 required-file list was `["SKILL.md"]` and nothing else was checked.
//
// The tests below are split the way the review consensus split them, and the distinction is
// load-bearing: FIX-PROVING tests must fail at 23a9856, SURVIVAL GUARDS must pass before and
// after. Writing a survival guard to fail at 23a9856 would be an error — it guards an invariant
// this change must not break, and it already holds.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const installer = require("../lib/installer");
const addonManifest = require("../lib/addon-manifest");

const root = path.resolve(__dirname, "..");
const SKILLS = ["parley-deck", "parley-bidding", "parley-design", "parley-design-check", "parley-tracker", "parley-worktrees"];

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "parley-coverage-"));
}

function context(home, options) {
  return {
    options: {
      command: "install",
      target: "codex",
      scope: "user",
      project: null,
      dest: null,
      force: false,
      dryRun: false,
      yes: true,
      json: false,
      includeUndetected: false,
      ...options
    },
    // A real PATH, not an empty one: `doctor`'s exit code folds in runtime availability, and
    // `parley-bidding` declares a python3 floor. With PATH="" the interpreter is unfindable and
    // `ok` is false for a reason that has nothing to do with what these tests measure.
    env: { HOME: home, PATH: process.env.PATH || "" },
    cwd: home,
    homeDir: home,
    packageRoot: root
  };
}

// What a foreign installer leaves: every packaged skill directory copied verbatim, no marker.
function foreignInstall(home) {
  const dir = path.join(home, ".codex", "skills");
  fs.mkdirSync(dir, { recursive: true });
  for (const skill of fs.readdirSync(path.join(root, "skills"))) {
    fs.cpSync(path.join(root, "skills", skill), path.join(dir, skill), { recursive: true });
  }
  return dir;
}

function doctor(home) {
  return installer.doctorCommand(context(home, { command: "doctor", target: "codex" }));
}

function statusOf(result, skill) {
  return result.targets[0].skills.find((entry) => entry.skill === skill);
}

function gutTo(dir, keep) {
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      const rel = path.relative(dir, abs);
      if (entry.isDirectory()) {
        walk(abs);
        if (fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
      } else if (!keep.includes(rel)) {
        fs.rmSync(abs);
      }
    }
  };
  walk(dir);
}

// ---------------------------------------------------------------------------
// FIX-PROVING — each of these must fail at 23a9856
// ---------------------------------------------------------------------------

test("a verbatim foreign copy of every packaged skill is valid-unmanaged, not malformed", () => {
  const home = tmpDir();
  foreignInstall(home);
  const result = doctor(home);
  assert.equal(result.ok, true, "doctor must exit 0 over a byte-correct foreign install");
  for (const skill of SKILLS) {
    const status = statusOf(result, skill);
    assert.equal(status.status, "valid-unmanaged", `${skill} must be provable from its packaged manifest`);
    assert.equal(status.managed, false, `${skill} was not installed by this tool and must not claim to be`);
    assert.equal(status.marker, null);
  }
});

test("every packaged skill directory ships a manifest", () => {
  // The coverage guarantee. `--check` enforces it in CI; this states it as a property so a new
  // skill added without one fails here too, not only in a script someone must remember to run.
  for (const skill of fs.readdirSync(path.join(root, "skills"))) {
    assert.ok(
      addonManifest.hasManifest(path.join(root, "skills", skill)),
      `${skill} ships no ${addonManifest.MANIFEST_FILE}; coverage is mandatory, not opt-in`
    );
  }
});

test("a natively installed add-on gutted to SKILL.md is malformed even with its marker intact", () => {
  const home = tmpDir();
  assert.equal(installer.installCommand(context(home)).ok, true);
  for (const skill of ["parley-design", "parley-design-check", "parley-tracker", "parley-worktrees"]) {
    gutTo(path.join(home, ".codex", "skills", skill), ["SKILL.md", installer.MARKER_FILE]);
  }
  const result = doctor(home);
  assert.equal(result.ok, false, "doctor must not exit 0 over gutted installs");
  for (const skill of ["parley-design", "parley-design-check", "parley-tracker", "parley-worktrees"]) {
    assert.equal(statusOf(result, skill).status, "malformed", `${skill} gutted to one file must be malformed`);
  }
});

test("the core's required files come from the copy plan, not a hand-written list", () => {
  // Each of these three was installed by the copy plan and absent from the hand-written
  // per-target list, so deleting it left `doctor` at `valid` with zero problems.
  for (const missing of ["plugin.json", "agents/openai.yaml", "references/WORKED_EXAMPLES.md"]) {
    const home = tmpDir();
    assert.equal(installer.installCommand(context(home)).ok, true);
    const target = path.join(home, ".codex", "skills", "parley-deck", ...missing.split("/"));
    assert.ok(fs.existsSync(target), `${missing} should have been installed`);
    fs.rmSync(target);
    const status = statusOf(doctor(home), "parley-deck");
    assert.equal(status.status, "malformed", `deleting ${missing} must be reported`);
    assert.ok(status.missing.includes(missing), `${missing} must be named as missing`);
  }
});

// ---------------------------------------------------------------------------
// SURVIVAL GUARDS — each of these must pass before AND after
// ---------------------------------------------------------------------------

test("an unmarked tree gutted to SKILL.md stays malformed, manifest kept or deleted", () => {
  // `parley-worktrees` is a single-file payload, so "gutted to SKILL.md" removes nothing from
  // it and it stays legitimately healthy. Asserting `malformed` for it would be asserting a
  // property of that skill's size rather than of the check. Which skills are gutted is derived,
  // not listed, so a skill that grows a second file joins this test automatically.
  const guttable = SKILLS.filter(
    (skill) => addonManifest.listPayloadFiles(path.join(root, "skills", skill)).length > 1
  );
  assert.ok(guttable.length >= 4, "expected several multi-file payloads to gut");

  for (const keepManifest of [true, false]) {
    const home = tmpDir();
    const dir = foreignInstall(home);
    for (const skill of guttable) {
      const keep = keepManifest ? ["SKILL.md", addonManifest.MANIFEST_FILE] : ["SKILL.md"];
      gutTo(path.join(dir, skill), keep);
    }
    const result = doctor(home);
    assert.equal(result.ok, false);
    for (const skill of guttable) {
      assert.equal(
        statusOf(result, skill).status,
        "malformed",
        `${skill} gutted with manifest ${keepManifest ? "kept" : "deleted"} must stay malformed`
      );
    }
  }
});

test("health does not confer ownership: a healthy fleet is still unowned", () => {
  // FIX-PROVING, and it was mis-filed as a survival guard in FINAL.md — caught by running it
  // at 23a9856, where it failed. Its subject is a fleet that is simultaneously healthy and
  // unowned, and before this change that state existed for one unit out of six, so the test
  // cannot establish its own precondition on the old commit. The ownership invariant it guards
  // is separated out below, where it belongs and where it does pass at 23a9856.
  const home = tmpDir();
  foreignInstall(home);
  const result = doctor(home);
  assert.equal(result.ok, true, "the fleet is healthy");
  for (const skill of SKILLS) {
    assert.equal(statusOf(result, skill).managed, false, `${skill} is healthy yet unowned`);
  }
});

test("an unmarked tree refuses both mutations and is not stamped with ownership", () => {
  const home = tmpDir();
  foreignInstall(home);

  const install = installer.installCommand(context(home));
  assert.equal(install.ok, false, "install must not silently replace a tree it does not own");

  const uninstall = installer.uninstallCommand(context(home, { command: "uninstall" }));
  assert.equal(uninstall.ok, false, "uninstall must not remove a tree it does not own");

  const markers = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else if (entry.name === installer.MARKER_FILE) markers.push(path.join(dir, entry.name));
    }
  };
  walk(path.join(home, ".codex", "skills"));
  assert.deepEqual(markers, [], "a refused mutation must not stamp ownership onto the tree");
  for (const skill of SKILLS) {
    assert.ok(fs.existsSync(path.join(home, ".codex", "skills", skill, "SKILL.md")), `${skill} must be untouched`);
  }
});

test("the natively installed core does not carry parley-addon.json", () => {
  // Adding it to PAYLOAD_ENTRIES would make the native core a superset of its own source
  // manifest, which `verifyPayload` would then flag as `unexpected`. The manifest is source-side
  // proof for a foreign copy; it is deliberately not part of what we install.
  for (const target of ["codex", "gemini"]) {
    const home = tmpDir();
    const result = installer.installCommand(context(home, { target }));
    assert.equal(result.ok, true, `${target} install failed`);
    const dest = result.actions
      .flatMap((action) => action.skills || [])
      .find((entry) => entry.skill === "parley-deck").dest;
    assert.equal(
      fs.existsSync(path.join(dest, addonManifest.MANIFEST_FILE)),
      false,
      `${target}: the installed core must not carry ${addonManifest.MANIFEST_FILE}`
    );
  }
});
