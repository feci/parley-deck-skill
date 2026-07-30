"use strict";

// Coverage for the parley-bidding add-on and the payload-integrity mechanism it required.
//
// Before this existed, `validateInstalledPayload` asked one question of an add-on directory —
// is SKILL.md there? — so a tree gutted down to that single file reported `valid`. Shipping a
// 47-file procurement payload behind that check was the objection that made the manifest part
// of this change rather than a follow-up.

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const installer = require("../lib/installer");
const addonManifest = require("../lib/addon-manifest");

const root = path.resolve(__dirname, "..");
const addonRoot = path.join(root, "skills", "parley-bidding");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "parley-bidding-test-"));
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
      yes: false,
      json: false,
      includeUndetected: false,
      ...options
    },
    env: { HOME: home, PATH: "" },
    cwd: home,
    homeDir: home,
    packageRoot: root
  };
}

// Install once and return the installed add-on directory.
function installed(home, options) {
  const result = installer.installCommand(context(home, { target: "codex", ...options }));
  assert.equal(result.ok, true, `install failed: ${JSON.stringify(result.actions && result.actions[0])}`);
  return path.join(home, ".codex", "skills", "parley-bidding");
}

function doctorStatus(home, skill) {
  const result = installer.doctorCommand(context(home, { command: "doctor", target: "codex" }));
  const target = result.targets[0];
  return target.skills.find((entry) => entry.skill === skill);
}

function readMarker(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, installer.MARKER_FILE), "utf8"));
}

function writeMarker(dir, marker) {
  fs.writeFileSync(path.join(dir, installer.MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
}

// ---------------------------------------------------------------------------
// The payload itself
// ---------------------------------------------------------------------------

test("the add-on ships a manifest describing every payload file but itself", () => {
  const read = addonManifest.readManifest(addonRoot);
  assert.equal(read.ok, true, read.error || "");
  const files = Object.keys(read.manifest.files);
  assert.equal(files.includes(addonManifest.MANIFEST_FILE), false, "the manifest must not list itself");
  assert.equal(files.includes("SKILL.md"), true);
  // The four load-bearing classes the design named as deletion tests.
  assert.equal(files.includes("scripts/adapter_validate.py"), true);
  assert.equal(files.includes("references/hitl-and-recovery.md"), true);
  assert.ok(files.some((f) => f.startsWith("assets/schemas/")), "schemas must be covered");
  assert.ok(files.some((f) => f.startsWith("assets/platform-adapters/")), "adapters must be covered");
  assert.equal(addonManifest.verifyPayload(addonRoot).ok, true);
});

test("the shipped manifest declares an interpreter floor and no second version number", () => {
  const { manifest } = addonManifest.readManifest(addonRoot);
  assert.equal(manifest.runtime.python, ">=3.10");
  // The package version is the only version. A hand-maintained one here would drift.
  assert.equal("version" in manifest, false);
  assert.equal("semver" in manifest, false);
});

test("the add-on carries no nested .gitignore and no generated cache", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__pycache__") offenders.push(path.relative(root, full));
        else walk(full);
        continue;
      }
      if (entry.name === ".gitignore" || entry.name.endsWith(".pyc") || entry.name.endsWith(".pyo")) {
        offenders.push(path.relative(root, full));
      }
    }
  };
  walk(addonRoot);
  assert.deepEqual(offenders, []);
});

test("no shipped file still refers to the add-on by its pre-integration name", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (fs.readFileSync(full, "utf8").includes("software-bidding")) {
        offenders.push(path.relative(root, full));
      }
    }
  };
  walk(addonRoot);
  assert.deepEqual(offenders, []);
});

test("the consent paragraph reaches both documents an agent is guaranteed to load", () => {
  const required =
    "Parley Deck's generic external-backend disclosure default never satisfies E3b. " +
    "Before any tender-derived brief, excerpt, file or data class is sent, obtain " +
    "tender-scoped E3b approval for the exact roster, providers, packet/allowlist, " +
    "redactions and restrictions. No Parley consensus, signoff or default approval " +
    "satisfies E3b, E5, E6, E7 or E8.";
  for (const rel of ["SKILL.md", "references/parley-integration.md"]) {
    const text = fs.readFileSync(path.join(addonRoot, rel), "utf8");
    assert.ok(text.includes(required), `${rel} is missing the ratified E3b consent paragraph`);
  }
});

// ---------------------------------------------------------------------------
// Installation, and the marker that anchors the requirement
// ---------------------------------------------------------------------------

test("installing records the manifest's aggregate and its own hash in the add-on marker", () => {
  const home = tmpDir();
  const dir = installed(home);
  const marker = readMarker(dir);

  assert.equal(marker.markerSchema, 2);
  assert.equal(marker.skill, "parley-bidding");
  assert.equal(marker.addon, true);
  assert.equal(marker.manifest.aggregate, addonManifest.readManifest(addonRoot).manifest.aggregate);
  assert.equal(marker.manifest.sha256, addonManifest.manifestFileHash(addonRoot));
  assert.equal(doctorStatus(home, "parley-bidding").status, "valid");
});

test("an add-on that ships no manifest records manifest:false and stays healthy", () => {
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex" }));
  const dir = path.join(home, ".codex", "skills", "parley-worktrees");
  const marker = readMarker(dir);
  assert.equal(marker.manifest, false);
  assert.equal(doctorStatus(home, "parley-worktrees").status, "valid");
});

test("a legacy marker with no schema keeps validating on required files alone", () => {
  const home = tmpDir();
  const dir = installed(home);
  const marker = readMarker(dir);
  delete marker.markerSchema;
  delete marker.manifest;
  writeMarker(dir, marker);
  // An older installer wrote markers like this. Re-installing upgrades them; until then the
  // install is not reported broken for a field its installer never knew about.
  assert.equal(doctorStatus(home, "parley-bidding").status, "valid");
});

// ---------------------------------------------------------------------------
// The gutted tree, and every way the anchor can be attacked
// ---------------------------------------------------------------------------

test("a tree gutted to SKILL.md is malformed, not valid", () => {
  const home = tmpDir();
  const dir = installed(home);
  for (const entry of fs.readdirSync(dir)) {
    if (entry === "SKILL.md" || entry === installer.MARKER_FILE) continue;
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
  const status = doctorStatus(home, "parley-bidding");
  assert.equal(status.status, "malformed");
  assert.ok(status.problems.length > 0);
});

test("deleting any single load-bearing file is malformed", () => {
  for (const victim of [
    "scripts/adapter_validate.py",
    "assets/schemas/bid-state.schema.json",
    "references/hitl-and-recovery.md",
    "assets/platform-adapters/manual.json"
  ]) {
    const home = tmpDir();
    const dir = installed(home);
    fs.rmSync(path.join(dir, victim));
    const status = doctorStatus(home, "parley-bidding");
    assert.equal(status.status, "malformed", `deleting ${victim} must be detected`);
    assert.ok(
      status.problems.some((p) => p.includes(victim)),
      `the report must name ${victim}, got ${JSON.stringify(status.problems)}`
    );
  }
});

test("mutating a single byte is malformed", () => {
  const home = tmpDir();
  const dir = installed(home);
  const victim = path.join(dir, "references", "evidence-and-state.md");
  const bytes = fs.readFileSync(victim);
  bytes[0] = bytes[0] === 0x41 ? 0x42 : 0x41;
  fs.writeFileSync(victim, bytes);
  const status = doctorStatus(home, "parley-bidding");
  assert.equal(status.status, "malformed");
  assert.ok(status.problems.some((p) => p.startsWith("modified: references/evidence-and-state.md")));
});

test("an added file the manifest does not declare is malformed", () => {
  const home = tmpDir();
  const dir = installed(home);
  fs.mkdirSync(path.join(dir, "scripts", "__pycache__"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts", "__pycache__", "common.pyc"), "junk");
  const status = doctorStatus(home, "parley-bidding");
  assert.equal(status.status, "malformed");
  assert.ok(status.problems.some((p) => p.includes("__pycache__")));
});

test("deleting the manifest after installation is malformed, not a downgrade to SKILL.md-only", () => {
  const home = tmpDir();
  const dir = installed(home);
  fs.rmSync(path.join(dir, addonManifest.MANIFEST_FILE));
  const status = doctorStatus(home, "parley-bidding");
  // This is the case the marker exists for: without it, the add-on would fall back to the
  // SKILL.md-only rule and report healthy.
  assert.equal(status.status, "malformed");
  assert.ok(status.problems.some((p) => p.includes("marker records that one was installed")));
});

test("corrupting the manifest is malformed", () => {
  const home = tmpDir();
  const dir = installed(home);
  fs.writeFileSync(path.join(dir, addonManifest.MANIFEST_FILE), "{ not json");
  assert.equal(doctorStatus(home, "parley-bidding").status, "malformed");
});

test("removing the manifest field from a current-schema marker is malformed, never legacy", () => {
  const home = tmpDir();
  const dir = installed(home);
  const marker = readMarker(dir);
  delete marker.manifest;
  writeMarker(dir, marker); // markerSchema stays 2
  const status = doctorStatus(home, "parley-bidding");
  assert.equal(status.status, "malformed");
  assert.ok(status.problems.some((p) => p.includes('missing its "manifest" field')));
});

test("an internally consistent manifest+payload replacement is still detected", () => {
  const home = tmpDir();
  const dir = installed(home);

  // Rewrite a file AND re-derive the manifest so the two agree with each other. Payload
  // verification alone passes here by construction; only the marker catches it.
  const victim = path.join(dir, "SKILL.md");
  fs.writeFileSync(victim, "# replaced\n");
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, addonManifest.MANIFEST_FILE), "utf8"));
  manifest.files["SKILL.md"] = `sha256:${crypto.createHash("sha256").update(fs.readFileSync(victim)).digest("hex")}`;
  manifest.aggregate = addonManifest.aggregateDigest(manifest.files);
  fs.writeFileSync(path.join(dir, addonManifest.MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  assert.equal(addonManifest.verifyPayload(dir).ok, true, "the swap is self-consistent by construction");
  const status = doctorStatus(home, "parley-bidding");
  assert.equal(status.status, "malformed");
  assert.ok(status.problems.some((p) => p.includes("declares a different payload")));
});

test("a manifest appearing where none was installed is reported, not silently trusted", () => {
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex" }));
  const dir = path.join(home, ".codex", "skills", "parley-worktrees");
  const manifest = addonManifest.computeManifest(dir, {});
  fs.writeFileSync(path.join(dir, addonManifest.MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const status = doctorStatus(home, "parley-worktrees");
  assert.equal(status.status, "malformed");
  assert.ok(status.problems.some((p) => p.includes("marker records that none was installed")));
});

test("a marker from a newer installer is reported rather than guessed at", () => {
  const home = tmpDir();
  const dir = installed(home);
  const marker = readMarker(dir);
  marker.markerSchema = 99;
  writeMarker(dir, marker);
  const status = doctorStatus(home, "parley-bidding");
  assert.equal(status.status, "malformed");
  assert.ok(status.problems.some((p) => p.includes("newer parley-deck-skill")));
});

// ---------------------------------------------------------------------------
// Install-time behaviour
// ---------------------------------------------------------------------------

test("a corrupt source payload fails before any destination is written", () => {
  // Stage a package root whose add-on payload disagrees with its manifest, then install from
  // it. B5: a predictable failure must produce zero writes, not a half-installed fleet.
  const home = tmpDir();
  const stagedRoot = path.join(tmpDir(), "package");
  fs.cpSync(path.join(root, "skills"), path.join(stagedRoot, "skills"), { recursive: true });
  for (const file of ["package.json", "plugin.json", "gemini-extension.json"]) {
    fs.cpSync(path.join(root, file), path.join(stagedRoot, file));
  }
  fs.rmSync(path.join(stagedRoot, "skills", "parley-bidding", "scripts", "adapter_validate.py"));

  const ctx = context(home, { target: "codex" });
  ctx.packageRoot = stagedRoot;
  const result = installer.installCommand(ctx);

  assert.equal(result.ok, false);
  const skillsDir = path.join(home, ".codex", "skills");
  assert.equal(fs.existsSync(skillsDir), false, "a failed preflight must write nothing at all");
  const failed = result.actions[0].skills.find((s) => s.skill === "parley-bidding");
  assert.equal(failed.action, "failed");
  assert.match(failed.message, /Source payload does not match parley-addon\.json/);
});

test("reinstalling over a malformed tree repairs it", () => {
  const home = tmpDir();
  const dir = installed(home);
  fs.rmSync(path.join(dir, "scripts", "adapter_validate.py"));
  assert.equal(doctorStatus(home, "parley-bidding").status, "malformed");

  installer.installCommand(context(home, { target: "codex", force: true }));
  assert.equal(doctorStatus(home, "parley-bidding").status, "valid");
});

test("--only parley-bidding installs the add-on and its manifest", () => {
  const home = tmpDir();
  const result = installer.installCommand(context(home, { target: "codex", only: ["parley-bidding"] }));
  assert.equal(result.ok, true);
  const skillsDir = path.join(home, ".codex", "skills");
  assert.deepEqual(result.actions[0].skills.map((s) => s.skill), ["parley-deck", "parley-bidding"]);
  assert.equal(fs.existsSync(path.join(skillsDir, "parley-bidding", addonManifest.MANIFEST_FILE)), true);
  assert.equal(fs.existsSync(path.join(skillsDir, "parley-design")), false);
  assert.equal(doctorStatus(home, "parley-bidding").status, "valid");
});

test("--no-addons installs no bidding payload at all", () => {
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex", noAddons: true }));
  assert.equal(fs.existsSync(path.join(home, ".codex", "skills", "parley-bidding")), false);
});

test("uninstall removes the add-on tree", () => {
  const home = tmpDir();
  const dir = installed(home);
  assert.equal(fs.existsSync(dir), true);
  const result = installer.uninstallCommand(context(home, { command: "uninstall", target: "codex" }));
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(dir), false);
});

// ---------------------------------------------------------------------------
// Review round 1: the marker is itself part of the payload's health
//
// codex-1 (MAJOR), hermes-1 (CRITICAL) and kimi-1 (CRITICAL) all measured the same hole and
// all three BLOCKed on it. codex-1's ratified amendment condition 1 had already said it: "An
// expected installed unit with a missing or unreadable marker must also be unhealthy." Every
// negative test above preserved the marker, which is exactly why they passed.
// ---------------------------------------------------------------------------

test("an expected unit whose marker was deleted is malformed, not valid", () => {
  const home = tmpDir();
  const dir = installed(home);
  fs.rmSync(path.join(dir, installer.MARKER_FILE));
  const status = doctorStatus(home, "parley-bidding");
  assert.equal(status.status, "malformed");
  assert.ok(status.problems.some((p) => p.includes("no parley-deck-skill install marker")));
});

test("an unreadable marker is distinguished from a missing one", () => {
  const home = tmpDir();
  const dir = installed(home);
  fs.writeFileSync(path.join(dir, installer.MARKER_FILE), "{ not json");
  const status = doctorStatus(home, "parley-bidding");
  assert.equal(status.status, "malformed");
  assert.ok(status.problems.some((p) => p.includes("unreadable or is not valid JSON")));
  // kimi-1 asked for the two to be separately diagnosable, not one code with a cause field.
  assert.equal(status.problems.some((p) => p.includes("no parley-deck-skill install marker")), false);
});

test("a marker written by some other tool is malformed", () => {
  const home = tmpDir();
  const dir = installed(home);
  writeMarker(dir, { name: "some-other-installer", skill: "parley-bidding" });
  const status = doctorStatus(home, "parley-bidding");
  assert.equal(status.status, "malformed");
  assert.ok(status.problems.some((p) => p.includes("not parley-deck-skill")));
});

test("the double deletion — gut the tree and remove the marker with it — is caught", () => {
  const home = tmpDir();
  const dir = installed(home);
  for (const entry of fs.readdirSync(dir)) {
    if (entry === "SKILL.md") continue;
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
  assert.deepEqual(fs.readdirSync(dir), ["SKILL.md"]);
  const result = installer.doctorCommand(context(home, { command: "doctor", target: "codex" }));
  assert.equal(result.ok, false, "doctor must not report ok for a gutted, unmarked tree");
  const status = result.targets[0].skills.find((s) => s.skill === "parley-bidding");
  assert.equal(status.status, "malformed");
});

// ---------------------------------------------------------------------------
// B6: payload-valid and operationally-available are different questions
// ---------------------------------------------------------------------------

// The interpreter probe is cached per process and reads the real environment, so these run in
// a child node with a PATH we control.
function doctorInChildWithPath(pathValue, stubs) {
  const home = tmpDir();
  const binDir = path.join(home, "stub-bin");
  fs.mkdirSync(binDir, { recursive: true });
  fs.symlinkSync(process.execPath, path.join(binDir, "node"));
  for (const [name, body] of Object.entries(stubs || {})) {
    const file = path.join(binDir, name);
    fs.writeFileSync(file, body, "utf8");
    fs.chmodSync(file, 0o755);
  }
  const script = `
    const fs = require("fs"), path = require("path"), os = require("os");
    const installer = require(${JSON.stringify(path.join(root, "lib", "installer"))});
    const ctx = (home, o) => ({
      options: { command: "install", target: "codex", scope: "user", project: null, dest: null,
                 force: false, dryRun: false, yes: false, json: false, includeUndetected: false, ...o },
      env: { HOME: home, PATH: process.env.PATH }, cwd: home, homeDir: home,
      packageRoot: ${JSON.stringify(root)}
    });
    const h = fs.mkdtempSync(path.join(os.tmpdir(), "b6-"));
    installer.installCommand(ctx(h, { target: "codex" }));
    const r = installer.doctorCommand(ctx(h, { command: "doctor", target: "codex" }));
    const bidding = r.targets[0].skills.find((s) => s.skill === "parley-bidding");
    const other = r.targets[0].skills.find((s) => s.skill === "parley-worktrees");
    process.stdout.write(JSON.stringify({ ok: r.ok, bidding, other }));
  `;
  const run = spawnSync(path.join(binDir, "node"), ["-e", script], {
    encoding: "utf8",
    env: { ...process.env, PATH: pathValue === "stub" ? binDir : pathValue }
  });
  assert.equal(run.status, 0, `child failed: ${run.stderr}`);
  return JSON.parse(run.stdout);
}

test("a byte-valid payload whose declared interpreter is absent is valid but unavailable", () => {
  const out = doctorInChildWithPath("stub");
  // Payload validity and operational availability are separate answers, per B6.
  assert.equal(out.bidding.status, "valid");
  assert.equal(out.bidding.runtime.ok, false);
  assert.match(out.bidding.runtime.detail, /python3 is not available/);
  assert.equal(out.bidding.runtime.requirement, ">=3.10");
  // …but health fails, so `doctor` exits non-zero.
  assert.equal(out.ok, false);
});

test("an interpreter below the declared floor fails health", () => {
  const out = doctorInChildWithPath("stub", {
    python3: "#!/bin/sh\necho '3.9'\n"
  });
  assert.equal(out.bidding.status, "valid");
  assert.equal(out.bidding.runtime.ok, false);
  assert.match(out.bidding.runtime.detail, /python3 is 3\.9, but this skill requires >=3\.10/);
  assert.equal(out.ok, false);
});

test("an interpreter at the declared floor passes health", () => {
  const out = doctorInChildWithPath("stub", {
    python3: "#!/bin/sh\necho '3.10'\n"
  });
  assert.equal(out.bidding.runtime.ok, true);
  assert.equal(out.ok, true);
});

test("an add-on that declares no runtime requirement is unaffected", () => {
  const out = doctorInChildWithPath("stub");
  assert.equal(out.other.status, "valid");
  assert.equal(out.other.runtime, null);
});

// ---------------------------------------------------------------------------
// Review round 2: the probe must answer for the environment the caller declared
// ---------------------------------------------------------------------------

test("run() honors the caller's environment rather than the parent process's PATH", () => {
  // The direct regression test for codex-1's round-2 MAJOR. This process has a working
  // python3; the caller declares an empty PATH. Probing the parent environment reported
  // healthy for an environment that cannot run the payload at all.
  assert.equal(probePython3IsAvailableHere(), true, "this test needs a python3 in the parent env");

  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex" }));

  const out = [];
  const err = [];
  const exitCode = installer.run(["doctor", "--target", "codex", "--json"], {
    env: { ...process.env, HOME: home, PATH: "" },
    cwd: home,
    stdout: { write: (chunk) => out.push(chunk) },
    stderr: { write: (chunk) => err.push(chunk) }
  });

  const result = JSON.parse(out.join(""));
  const bidding = result.targets[0].skills.find((s) => s.skill === "parley-bidding");
  assert.equal(bidding.status, "valid", "the payload itself is fine");
  assert.equal(bidding.runtime.ok, false, "…but it is unreachable in the declared environment");
  assert.equal(result.ok, false);
  assert.notEqual(exitCode.exitCode, 0, `expected a non-zero exit, got ${JSON.stringify(exitCode)}`);
});

test("the interpreter probe is memoized per PATH, not once per process", () => {
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex" }));
  const read = (pathValue) => {
    const out = [];
    installer.run(["doctor", "--target", "codex", "--json"], {
      env: { ...process.env, HOME: home, PATH: pathValue },
      cwd: home,
      stdout: { write: (c) => out.push(c) },
      stderr: { write: () => {} }
    });
    const parsed = JSON.parse(out.join(""));
    return parsed.targets[0].skills.find((s) => s.skill === "parley-bidding").runtime;
  };
  // Two different environments in one process must get two different answers. A single
  // process-global cache would hand the second call the first call's verdict.
  //
  // Both arms are stubbed rather than relying on the host's python3: the machine running this
  // may ship 3.9 (macOS does), which would fail the floor for reasons that have nothing to do
  // with memoization. (review round 2, hermes-1 — the same environment-dependence that made
  // the pre-existing doctor test pass here and fail on 3.9.)
  const stubDir = path.join(home, "floor-bin");
  fs.mkdirSync(stubDir, { recursive: true });
  const stub = path.join(stubDir, "python3");
  fs.writeFileSync(stub, "#!/bin/sh\necho '3.12'\n", "utf8");
  fs.chmodSync(stub, 0o755);

  const withPython = read(stubDir);
  const withoutPython = read("");
  assert.equal(withPython.ok, true, `expected the stub to satisfy the floor: ${JSON.stringify(withPython)}`);
  assert.equal(withoutPython.ok, false);
  // …and the first answer must not have been reused for the second environment.
  assert.match(withPython.detail, /python3 3\.12/);
  assert.match(withoutPython.detail, /not available/);
});

test("paths does not launch an interpreter", () => {
  // `paths` answers "where would this go". codex-1 measured it spawning python3 through a
  // stub that wrote a sentinel; a path-discovery command must not execute a PATH-resolved
  // program at all.
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex" }));
  const binDir = path.join(home, "sentinel-bin");
  const sentinel = path.join(home, "python3-was-run");
  fs.mkdirSync(binDir, { recursive: true });
  const stub = path.join(binDir, "python3");
  fs.writeFileSync(stub, `#!/bin/sh\n: > ${JSON.stringify(sentinel)}\necho '3.99'\n`, "utf8");
  fs.chmodSync(stub, 0o755);

  const out = [];
  installer.run(["paths", "--target", "codex", "--json"], {
    env: { ...process.env, HOME: home, PATH: binDir },
    cwd: home,
    stdout: { write: (c) => out.push(c) },
    stderr: { write: () => {} }
  });
  assert.equal(fs.existsSync(sentinel), false, "paths must not spawn the declared interpreter");

  const parsed = JSON.parse(out.join(""));
  const bidding = parsed.targets[0].skills.find((s) => s.skill === "parley-bidding");
  assert.equal(bidding.runtime, null, "paths reports no runtime verdict because it took none");

  // …while doctor, in the same environment, does probe and does report one.
  const doctorOut = [];
  installer.run(["doctor", "--target", "codex", "--json"], {
    env: { ...process.env, HOME: home, PATH: binDir },
    cwd: home,
    stdout: { write: (c) => doctorOut.push(c) },
    stderr: { write: () => {} }
  });
  assert.equal(fs.existsSync(sentinel), true, "doctor is the command that asks");
});

test("status reports an unavailable runtime in text, not only in JSON", () => {
  // codex-1: `status` performed the probe and then discarded the answer, so the two commands
  // disagreed about the same directory.
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex" }));
  const out = [];
  installer.run(["status", "--target", "codex"], {
    env: { ...process.env, HOME: home, PATH: "" },
    cwd: home,
    stdout: { write: (c) => out.push(c) },
    stderr: { write: () => {} }
  });
  const text = out.join("");
  assert.match(text, /addon parley-bidding: valid/);
  assert.match(text, /unavailable: python3 is not available, but this skill requires >=3\.10/);
});

function probePython3IsAvailableHere() {
  const run = spawnSync("python3", ["-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" });
  return !run.error && run.status === 0;
}
