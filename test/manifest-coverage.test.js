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

function doctor(home, target) {
  return installer.doctorCommand(context(home, { command: "doctor", target: target || "codex" }));
}

// `doctor.ok` folds in runtime availability, and `parley-bidding` declares a python3 >=3.10
// floor. Asserting `result.ok` therefore also asserts what interpreter the host happens to have
// on PATH: measured, these tests passed with python 3.14 first on PATH and failed on a stock
// macOS PATH where python3 is 3.9.6. That made the suite's result a property of the machine.
// This asserts the integrity verdict — which is what these tests are about — and reports the
// runtime separately so a red here can never be an interpreter's fault. (hermes-1 MINOR, r1.)
function integrityOk(result) {
  return result.targets.every((target) =>
    target.skills.every((skill) => skill.status === "valid" || skill.status === "valid-unmanaged")
  );
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
  assert.equal(integrityOk(result), true, "every unit must pass integrity over a byte-correct foreign install");
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
  // Subjects are derived, not listed: `parley-worktrees` is a single-file payload, so "gutted
  // to SKILL.md" removes no payload from it and asserting `malformed` there would assert that
  // skill's size rather than the check. A skill that grows a second file joins automatically.
  // (kimi-1 NIT, review round 1.)
  const guttable = ["parley-design", "parley-design-check", "parley-tracker", "parley-worktrees"].filter(
    (skill) => addonManifest.listPayloadFiles(path.join(root, "skills", skill)).length > 1
  );
  assert.ok(guttable.length >= 3, "expected several multi-file add-on payloads");

  const home = tmpDir();
  assert.equal(installer.installCommand(context(home)).ok, true);
  for (const skill of guttable) {
    gutTo(path.join(home, ".codex", "skills", skill), ["SKILL.md", installer.MARKER_FILE]);
  }
  const result = doctor(home);
  assert.equal(result.ok, false, "doctor must not exit 0 over gutted installs");
  for (const skill of guttable) {
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

test("health does not confer ownership: a healthy fleet is still unowned", () => {
  // FIX-PROVING, and it was mis-filed as a survival guard in FINAL.md — caught by running it
  // at 23a9856, where it failed. Its subject is a fleet that is simultaneously healthy and
  // unowned, and before this change that state existed for one unit out of six, so the test
  // cannot establish its own precondition on the old commit. The ownership invariant it guards
  // is separated out below, where it belongs and where it does pass at 23a9856.
  const home = tmpDir();
  foreignInstall(home);
  const result = doctor(home);
  assert.equal(integrityOk(result), true, "the fleet is healthy");
  for (const skill of SKILLS) {
    assert.equal(statusOf(result, skill).managed, false, `${skill} is healthy yet unowned`);
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
  // EVERY target, derived from the installer rather than a hand-picked pair — the staging
  // shapes differ per kind (antigravity gets a second `skills/SKILL.md`, gemini rewrites
  // `gemini-extension.json`) and a two-target check cannot see a shape it never builds.
  // (codex-1 MINOR / kimi-1 NIT, review round 1.)
  const home = tmpDir();
  const result = installer.installCommand(context(home, { target: "all", includeUndetected: true }));
  assert.equal(result.ok, true, "install into every target failed");
  const cores = result.actions
    .flatMap((action) => action.skills || [])
    .filter((entry) => entry.skill === "parley-deck");
  assert.equal(cores.length, 14, "expected one core destination per known target");
  for (const core of cores) {
    assert.equal(
      fs.existsSync(path.join(core.dest, addonManifest.MANIFEST_FILE)),
      false,
      `${core.dest}: the installed core must not carry ${addonManifest.MANIFEST_FILE}`
    );
  }
});

// ---------------------------------------------------------------------------
// FIX-PROVING, review round 1 — each must fail at 205416d (the first implementation)
// ---------------------------------------------------------------------------

test("a damaged package source is a problem, never a shorter requirement list", () => {
  // The first implementation derived the core's required files by walking the package and
  // swallowing every read error, so the list shrank to whatever was still readable. Measured:
  // deleting `plugin.json` from BOTH the installed core and the packaged source made the
  // damaged install report valid/managed with no missing files and no problems at all — the
  // more broken the package, the healthier every install looked. Found independently by
  // codex-1, hermes-1 and kimi-1.
  const pkg = fs.mkdtempSync(path.join(os.tmpdir(), "parley-pkg-"));
  for (const entry of ["skills", "plugin.json", "gemini-extension.json", "README.md", "LICENSE", "package.json", "lib", "bin"]) {
    const src = path.join(root, entry);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(pkg, entry), { recursive: true });
  }
  const home = tmpDir();
  const withPkg = (options) => {
    const ctx = context(home, options);
    ctx.packageRoot = pkg;
    return ctx;
  };
  assert.equal(installer.installCommand(withPkg({})).ok, true);

  // Damage the install AND the packaged source it would be checked against.
  fs.rmSync(path.join(home, ".codex", "skills", "parley-deck", "plugin.json"));
  fs.rmSync(path.join(pkg, "plugin.json"));

  const status = installer
    .doctorCommand(withPkg({ command: "doctor" }))
    .targets[0].skills.find((entry) => entry.skill === "parley-deck");
  assert.equal(status.status, "malformed", "an unreadable source must not certify a damaged install");
  assert.match(status.problems.join(" "), /packaged source for plugin\.json cannot be read/);
});

test("source drift in the core blocks install before anything is written", () => {
  // The source-integrity preflight gated on `unit.addon`, which the core does not have, so a
  // stale core manifest failed `--check` while `install` wrote all six units and copied the
  // drifted bytes. Verification item 5 failing on the one unit whose drift nothing downstream
  // would catch. (codex-1 MAJOR, review round 1.)
  const pkg = fs.mkdtempSync(path.join(os.tmpdir(), "parley-pkg-"));
  for (const entry of ["skills", "plugin.json", "gemini-extension.json", "README.md", "LICENSE", "package.json", "lib", "bin"]) {
    const src = path.join(root, entry);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(pkg, entry), { recursive: true });
  }
  fs.appendFileSync(path.join(pkg, "skills", "parley-deck", "SKILL.md"), "\ndrifted\n");

  const home = tmpDir();
  const ctx = context(home, {});
  ctx.packageRoot = pkg;
  const result = installer.installCommand(ctx);
  assert.equal(result.ok, false, "a drifted core source must not install");
  assert.match(JSON.stringify(result), /Source payload does not match/);
  assert.equal(fs.existsSync(path.join(home, ".codex", "skills", "parley-deck", "SKILL.md")), false,
    "nothing may be written when the source fails preflight");
});

test("a foreign copy of the core is valid-unmanaged on every target shape, not only codex", () => {
  // The unmarked floor used the per-kind lists, which demand files staged in from the
  // repository root — `gemini-extension.json` for gemini, `skills/SKILL.md` and `plugin.json`
  // for antigravity. A verbatim foreign copy cannot contain them, so the core stayed
  // `malformed` on those targets while the identical copy passed on codex. (kimi-1 MINOR, r1.)
  for (const [target, sub] of [["codex", [".codex", "skills"]], ["gemini", [".gemini", "extensions"]]]) {
    const home = tmpDir();
    const dir = path.join(home, ...sub);
    fs.mkdirSync(dir, { recursive: true });
    for (const skill of fs.readdirSync(path.join(root, "skills"))) {
      fs.cpSync(path.join(root, "skills", skill), path.join(dir, skill), { recursive: true });
    }
    const result = doctor(home, target);
    assert.equal(integrityOk(result), true, `${target}: a byte-correct foreign copy must pass integrity`);
    assert.equal(
      result.targets[0].skills.find((entry) => entry.skill === "parley-deck").status,
      "valid-unmanaged",
      `${target}: the foreign core must be provable, not malformed`
    );
  }
});
