"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const installer = require("../lib/installer");
const packageJson = require("../package.json");

const root = path.resolve(__dirname, "..");
const bin = path.join(root, "bin", "parley-deck-skill.js");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "parley-deck-skill-test-"));
}

function writeRuntimeEvidence(home, runtimeDir) {
  fs.mkdirSync(path.join(home, runtimeDir), { recursive: true });
  fs.writeFileSync(path.join(home, runtimeDir, "config.json"), "{}\n", "utf8");
}

function writeExecutable(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, "#!/bin/sh\nexit 0\n", "utf8");
  fs.chmodSync(file, 0o755);
  return file;
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

test("resolves user and project target paths", () => {
  const home = tmpDir();
  const userTargets = installer.resolveTargets(context(home, { target: "all", includeUndetected: true }));

  assert.equal(userTargets.find((target) => target.name === "codex").dest, path.join(home, ".codex", "skills", "parley-deck"));
  assert.equal(userTargets.find((target) => target.name === "claude").dest, path.join(home, ".claude", "skills", "parley-deck"));
  assert.equal(userTargets.find((target) => target.name === "agy").dest, path.join(home, ".gemini", "config", "plugins", "parley-deck"));
  assert.equal(userTargets.find((target) => target.name === "gemini").dest, path.join(home, ".gemini", "extensions", "parley-deck"));
  assert.equal(userTargets.find((target) => target.name === "hermes").dest, path.join(home, ".hermes", "skills", "parley-deck"));
  assert.equal(userTargets.find((target) => target.name === "qwen").dest, path.join(home, ".qwen", "skills", "parley-deck"));
  assert.equal(userTargets.find((target) => target.name === "droid").dest, path.join(home, ".factory", "skills", "parley-deck"));
  assert.equal(userTargets.find((target) => target.name === "aionrs").dest, path.join(home, ".aionrs", "skills", "parley-deck"));

  const project = path.join(home, "project");
  const projectTargets = installer.resolveTargets(context(home, { target: "all", scope: "project", project, includeUndetected: true }));
  assert.equal(projectTargets.find((target) => target.name === "codex").dest, path.join(project, ".codex", "skills", "parley-deck"));
  assert.equal(projectTargets.find((target) => target.name === "claude").dest, path.join(project, ".claude", "skills", "parley-deck"));
  assert.equal(projectTargets.find((target) => target.name === "agy").dest, path.join(project, ".gemini", "config", "plugins", "parley-deck"));
  assert.equal(projectTargets.find((target) => target.name === "gemini").dest, path.join(project, ".gemini", "extensions", "parley-deck"));
  assert.equal(projectTargets.find((target) => target.name === "hermes").dest, path.join(project, ".hermes", "skills", "parley-deck"));
});

test("auto target installs only detected runtimes", () => {
  const home = tmpDir();
  writeRuntimeEvidence(home, ".claude");

  const targets = installer.resolveTargets(context(home, { target: "auto" }));
  assert.deepEqual(targets.map((target) => target.name), ["claude"]);
});

test("all target installs only detected runtimes by default", () => {
  const home = tmpDir();
  writeRuntimeEvidence(home, ".claude");

  const targets = installer.resolveTargets(context(home, { target: "all" }));
  assert.deepEqual(targets.map((target) => target.name), ["claude"]);
});

test("all target can include undetected runtimes explicitly", () => {
  const home = tmpDir();

  const targets = installer.resolveTargets(context(home, { target: "all", includeUndetected: true }));
  assert.ok(targets.some((target) => target.name === "codex"));
  assert.ok(targets.some((target) => target.name === "qwen"));
});

test("project auto target only installs detected project runtimes", () => {
  const home = tmpDir();
  const project = path.join(home, "project");
  writeRuntimeEvidence(project, ".gemini");

  const targets = installer.resolveTargets(context(home, { target: "auto", scope: "project", project }));
  assert.deepEqual(targets.map((target) => target.name), ["agy", "gemini"]);
});

test("auto target detects Hermes runtime directory", () => {
  const home = tmpDir();
  writeRuntimeEvidence(home, ".hermes");

  const targets = installer.resolveTargets(context(home, { target: "auto" }));
  assert.deepEqual(targets.map((target) => target.name), ["hermes"]);
});

test("auto target ignores marker-only directories created by the installer", () => {
  const home = tmpDir();
  const installResult = installer.installCommand(context(home, { target: "qwen" }));
  assert.equal(installResult.ok, true);

  const targets = installer.resolveTargets(context(home, { target: "auto" }));
  assert.deepEqual(targets.map((target) => target.name), []);
});

test("extended targets are not detected by command alone", () => {
  const home = tmpDir();
  const binDir = path.join(home, "bin");
  writeExecutable(binDir, "vibe-acp");

  const testContext = context(home, { target: "auto" });
  testContext.env.PATH = binDir;
  const targets = installer.resolveTargets(testContext);
  assert.deepEqual(targets.map((target) => target.name), []);
});

test("cursor target requires its CLI command", () => {
  const home = tmpDir();
  writeRuntimeEvidence(home, ".cursor");

  let targets = installer.resolveTargets(context(home, { target: "auto" }));
  assert.deepEqual(targets.map((target) => target.name), []);

  const binDir = path.join(home, "bin");
  writeExecutable(binDir, "agent");
  const testContext = context(home, { target: "auto" });
  testContext.env.PATH = binDir;

  targets = installer.resolveTargets(testContext);
  assert.deepEqual(targets.map((target) => target.name), ["cursor"]);
});

test("core targets can be detected by command alone", () => {
  const home = tmpDir();
  const binDir = path.join(home, "bin");
  writeExecutable(binDir, "claude");
  writeExecutable(binDir, "agy");

  const testContext = context(home, { target: "auto" });
  testContext.env.PATH = binDir;
  const targets = installer.resolveTargets(testContext);
  assert.deepEqual(targets.map((target) => target.name), ["claude", "agy"]);
});

test("installs a codex skill with marker", () => {
  const home = tmpDir();
  const result = installer.installCommand(context(home, { target: "codex" }));
  const dest = path.join(home, ".codex", "skills", "parley-deck");

  assert.equal(result.ok, true);
  assert.equal(result.actions[0].action, "installed");
  assert.equal(fs.existsSync(path.join(dest, "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(dest, "references", "COOPERATION.md")), true);

  const marker = JSON.parse(fs.readFileSync(path.join(dest, installer.MARKER_FILE), "utf8"));
  assert.equal(marker.name, "parley-deck-skill");
  assert.equal(marker.target, "codex");
});

test("installs when optional README and LICENSE payload files are absent", () => {
  const home = tmpDir();
  const packageRoot = tmpDir();
  fs.mkdirSync(path.join(packageRoot, "agents"), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, "references"), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, "SKILL.md"), "skill\n", "utf8");
  fs.writeFileSync(path.join(packageRoot, "agents", "manifest.yaml"), "name: parley-deck\n", "utf8");
  fs.writeFileSync(path.join(packageRoot, "references", "COOPERATION.md"), "protocol\n", "utf8");
  fs.writeFileSync(path.join(packageRoot, "references", "compatibility.json"), "{\"schemaVersion\":1}\n", "utf8");
  fs.writeFileSync(path.join(packageRoot, "plugin.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(packageRoot, "gemini-extension.json"), "{}\n", "utf8");

  const testContext = context(home, { target: "codex" });
  testContext.packageRoot = packageRoot;
  const result = installer.installCommand(testContext);
  const dest = path.join(home, ".codex", "skills", "parley-deck");

  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(dest, "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(dest, "README.md")), false);
  assert.equal(fs.existsSync(path.join(dest, "LICENSE")), false);
});

test("installs an Antigravity plugin with plugin metadata", () => {
  const home = tmpDir();
  const result = installer.installCommand(context(home, { target: "agy" }));
  const dest = path.join(home, ".gemini", "config", "plugins", "parley-deck");

  assert.equal(result.ok, true);
  assert.equal(result.actions[0].action, "installed");
  assert.equal(fs.existsSync(path.join(dest, "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(dest, "skills", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(dest, "plugin.json")), true);
  assert.equal(fs.existsSync(path.join(dest, "agents", "manifest.yaml")), true);

  const marker = JSON.parse(fs.readFileSync(path.join(dest, installer.MARKER_FILE), "utf8"));
  assert.equal(marker.target, "agy");
});

test("refuses to overwrite unmarked destination without force", () => {
  const home = tmpDir();
  const dest = path.join(home, ".codex", "skills", "parley-deck");
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, "README.md"), "existing\n", "utf8");

  const result = installer.installCommand(context(home, { target: "codex" }));
  assert.equal(result.ok, false);
  assert.equal(result.actions[0].action, "blocked");
  assert.equal(fs.readFileSync(path.join(dest, "README.md"), "utf8"), "existing\n");
});

test("replaces a marked destination without force", () => {
  const home = tmpDir();
  const dest = path.join(home, ".codex", "skills", "parley-deck");
  let result = installer.installCommand(context(home, { target: "codex" }));
  assert.equal(result.ok, true);

  fs.writeFileSync(path.join(dest, "STALE"), "stale\n", "utf8");
  result = installer.installCommand(context(home, { target: "codex" }));

  assert.equal(result.ok, true);
  assert.equal(result.actions[0].action, "replaced");
  assert.equal(fs.existsSync(path.join(dest, "STALE")), false);
});

test("uninstall removes only marked installs by default", () => {
  const home = tmpDir();
  const dest = path.join(home, ".codex", "skills", "parley-deck");
  let result = installer.installCommand(context(home, { target: "codex" }));
  assert.equal(result.ok, true);

  result = installer.uninstallCommand(context(home, { command: "uninstall", target: "codex" }));
  assert.equal(result.ok, true);
  assert.equal(result.actions[0].action, "removed");
  assert.equal(fs.existsSync(dest), false);

  fs.mkdirSync(dest, { recursive: true });
  result = installer.uninstallCommand(context(home, { command: "uninstall", target: "codex" }));
  assert.equal(result.ok, false);
  assert.equal(result.actions[0].action, "blocked");
  assert.equal(fs.existsSync(dest), true);
});

test("doctor reports missing and malformed installs", () => {
  const home = tmpDir();
  let result = installer.doctorCommand(context(home, { command: "doctor", target: "codex" }));
  assert.equal(result.ok, false);
  assert.equal(result.targets[0].status, "missing");

  const dest = path.join(home, ".codex", "skills", "parley-deck");
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, installer.MARKER_FILE), "{}\n", "utf8");

  result = installer.doctorCommand(context(home, { command: "doctor", target: "codex" }));
  assert.equal(result.ok, false);
  assert.equal(result.targets[0].status, "malformed");
  assert.deepEqual(result.targets[0].missing, ["SKILL.md", "references/COOPERATION.md", "references/compatibility.json", "agents/manifest.yaml"]);
});

test("status reports installer version, runtime drift, and project metadata state", () => {
  const home = tmpDir();
  const installResult = installer.installCommand(context(home, { target: "codex" }));
  assert.equal(installResult.ok, true);

  const dest = path.join(home, ".codex", "skills", "parley-deck");
  const markerFile = path.join(dest, installer.MARKER_FILE);
  const marker = JSON.parse(fs.readFileSync(markerFile, "utf8"));
  marker.version = "0.0.1";
  fs.writeFileSync(markerFile, `${JSON.stringify(marker, null, 2)}\n`, "utf8");

  const project = path.join(home, "project");
  const protocol = path.join(project, "parley-deck", "COOPERATION.md");
  fs.mkdirSync(path.dirname(protocol), { recursive: true });
  fs.writeFileSync(protocol, "local protocol\n", "utf8");

  const result = installer.statusCommand(context(home, { command: "status", target: "codex", project }));

  assert.equal(result.ok, true);
  assert.equal(result.installer.version, packageJson.version);
  assert.equal(result.runtimeInstalls[0].versionMatchesInstaller, false);
  assert.equal(result.project.exists, true);
  assert.equal(result.project.metadataStatus, "missing");
  assert.equal(result.compatibility.status, "warning");
  assert.ok(result.actions.some((action) => action.includes("sync-project")));
});

test("sync-project is dry-run by default and writes metadata only with --yes", () => {
  const home = tmpDir();
  const project = path.join(home, "project");
  const protocol = path.join(project, "parley-deck", "COOPERATION.md");
  const metadataFile = path.join(project, "parley-deck", "meta", "version.json");
  const protocolText = "project protocol\n";
  fs.mkdirSync(path.dirname(protocol), { recursive: true });
  fs.writeFileSync(protocol, protocolText, "utf8");

  let result = installer.syncProjectCommand(context(home, { command: "sync-project", project }));
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(fs.existsSync(metadataFile), false);
  assert.equal(result.metadata.deckVersion, packageJson.version);
  assert.match(result.metadata.protocolSha256, /^[a-f0-9]{64}$/);

  result = installer.syncProjectCommand(context(home, { command: "sync-project", project, yes: true }));
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, false);
  assert.equal(fs.readFileSync(protocol, "utf8"), protocolText);

  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
  assert.equal(metadata.deckVersion, packageJson.version);
  assert.equal(metadata.protocolSha256, result.metadata.protocolSha256);
});

test("uninstall refuses forged marker contents", () => {
  const home = tmpDir();
  const dest = path.join(home, ".codex", "skills", "parley-deck");
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, installer.MARKER_FILE), "{}\n", "utf8");

  const result = installer.uninstallCommand(context(home, { command: "uninstall", target: "codex" }));
  assert.equal(result.ok, false);
  assert.equal(result.actions[0].action, "blocked");
  assert.equal(fs.existsSync(dest), true);
});

test("default doctor only inspects detected runtimes", () => {
  const home = tmpDir();
  writeRuntimeEvidence(home, ".claude");
  const result = installer.doctorCommand(context(home, { command: "doctor", target: "auto" }));

  assert.equal(result.ok, false);
  assert.deepEqual(result.targets.map((target) => target.target), ["claude"]);
  assert.equal(result.targets[0].status, "missing");
});

test("CLI supports dry-run JSON output", () => {
  const home = tmpDir();
  const result = spawnSync(process.execPath, [
    bin,
    "install",
    "--target",
    "codex",
    "--dry-run",
    "--json"
  ], {
    cwd: root,
    env: { ...process.env, HOME: home, PATH: "" },
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.command, "install");
  assert.equal(output.actions[0].dryRun, true);
});

test("discovers packaged add-on skills", () => {
  const names = installer.discoverAddons(root).map((addon) => addon.name);
  assert.deepEqual(names, ["parley-tracker", "parley-worktrees"]);
  for (const addon of installer.discoverAddons(root)) {
    assert.equal(fs.existsSync(path.join(addon.root, "SKILL.md")), true);
  }
});

test("installs all add-ons by default alongside the core skill", () => {
  const home = tmpDir();
  const result = installer.installCommand(context(home, { target: "codex" }));
  const skillsDir = path.join(home, ".codex", "skills");

  assert.equal(result.ok, true);
  // The first installed skill is the core skill; the rest are add-ons.
  const action = result.actions[0];
  assert.deepEqual(action.skills.map((skill) => skill.skill), ["parley-deck", "parley-tracker", "parley-worktrees"]);
  for (const skill of action.skills) {
    assert.equal(skill.action, "installed");
  }
  assert.equal(fs.existsSync(path.join(skillsDir, "parley-deck", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(skillsDir, "parley-tracker", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(skillsDir, "parley-worktrees", "SKILL.md")), true);

  const addonMarker = JSON.parse(fs.readFileSync(path.join(skillsDir, "parley-tracker", installer.MARKER_FILE), "utf8"));
  assert.equal(addonMarker.name, "parley-deck-skill");
  assert.equal(addonMarker.skill, "parley-tracker");
  assert.equal(addonMarker.addon, true);
});

test("--no-addons installs only the core skill", () => {
  const home = tmpDir();
  const result = installer.installCommand(context(home, { target: "codex", noAddons: true }));
  const skillsDir = path.join(home, ".codex", "skills");

  assert.equal(result.ok, true);
  assert.deepEqual(result.actions[0].skills.map((skill) => skill.skill), ["parley-deck"]);
  assert.equal(fs.existsSync(path.join(skillsDir, "parley-deck", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(skillsDir, "parley-tracker")), false);
  assert.equal(fs.existsSync(path.join(skillsDir, "parley-worktrees")), false);
});

test("--only installs the core skill plus only the named add-on(s)", () => {
  const home = tmpDir();
  const result = installer.installCommand(context(home, { target: "codex", only: ["parley-tracker"] }));
  const skillsDir = path.join(home, ".codex", "skills");

  assert.equal(result.ok, true);
  assert.deepEqual(result.actions[0].skills.map((skill) => skill.skill), ["parley-deck", "parley-tracker"]);
  assert.equal(fs.existsSync(path.join(skillsDir, "parley-tracker", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(skillsDir, "parley-worktrees")), false);
});

test("parseArgs reads --no-addons and --only", () => {
  const noAddons = installer.parseArgs(["install", "--target", "codex", "--no-addons"]);
  assert.equal(noAddons.noAddons, true);
  assert.equal(noAddons.only, null);

  const only = installer.parseArgs(["install", "--target", "codex", "--only", "parley-tracker,parley-worktrees"]);
  assert.deepEqual(only.only, ["parley-tracker", "parley-worktrees"]);

  const onlyEquals = installer.parseArgs(["install", "--only=parley-tracker"]);
  assert.deepEqual(onlyEquals.only, ["parley-tracker"]);
});

test("parseArgs rejects combining --no-addons and --only", () => {
  assert.throws(
    () => installer.parseArgs(["install", "--no-addons", "--only", "parley-tracker"]),
    /cannot be combined/
  );
});

test("run rejects an unknown --only add-on name", () => {
  const home = tmpDir();
  assert.throws(
    () => installer.run(["install", "--target", "codex", "--only", "does-not-exist"], {
      env: { HOME: home, PATH: "" },
      cwd: home,
      stdout: { write() {} },
      stderr: { write() {} }
    }),
    /Unknown add-on/
  );
});

test("uninstall --no-addons removes only the core skill", () => {
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex" }));
  const skillsDir = path.join(home, ".codex", "skills");

  const result = installer.uninstallCommand(context(home, { command: "uninstall", target: "codex", noAddons: true }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.actions[0].skills.map((skill) => skill.skill), ["parley-deck"]);
  assert.equal(fs.existsSync(path.join(skillsDir, "parley-deck")), false);
  assert.equal(fs.existsSync(path.join(skillsDir, "parley-tracker", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(skillsDir, "parley-worktrees", "SKILL.md")), true);
});

test("doctor reports add-on skills per target", () => {
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex" }));

  const result = installer.doctorCommand(context(home, { command: "doctor", target: "codex" }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.targets[0].skills.map((skill) => skill.skill), ["parley-deck", "parley-tracker", "parley-worktrees"]);
  for (const skill of result.targets[0].skills) {
    assert.equal(skill.status, "valid");
  }
});

test("auto target ignores add-on skill dirs created by the installer", () => {
  const home = tmpDir();
  // A default install lays down the core skill plus add-on dirs, each marked.
  const installResult = installer.installCommand(context(home, { target: "qwen" }));
  assert.equal(installResult.ok, true);

  // None of those marked dirs count as runtime evidence.
  const targets = installer.resolveTargets(context(home, { target: "auto" }));
  assert.deepEqual(targets.map((target) => target.name), []);
});

test("a default install records the selected add-ons in the core marker", () => {
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex" }));
  const dest = path.join(home, ".codex", "skills", "parley-deck");
  const marker = JSON.parse(fs.readFileSync(path.join(dest, installer.MARKER_FILE), "utf8"));
  assert.deepEqual(marker.addons, ["parley-tracker", "parley-worktrees"]);
});

test("a --no-addons install records addons:false in the core marker", () => {
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex", noAddons: true }));
  const dest = path.join(home, ".codex", "skills", "parley-deck");
  const marker = JSON.parse(fs.readFileSync(path.join(dest, installer.MARKER_FILE), "utf8"));
  assert.equal(marker.addons, false);
});

test("a --only install records the chosen add-ons in the core marker", () => {
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex", only: ["parley-tracker"] }));
  const dest = path.join(home, ".codex", "skills", "parley-deck");
  const marker = JSON.parse(fs.readFileSync(path.join(dest, installer.MARKER_FILE), "utf8"));
  assert.deepEqual(marker.addons, ["parley-tracker"]);
});

test("doctor after --no-addons install is healthy and reports only the core skill", () => {
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex", noAddons: true }));

  // A plain doctor (no flags) must derive the expected set from the marker, not the
  // package default, so the intentionally-omitted add-ons are not flagged as missing.
  const result = installer.doctorCommand(context(home, { command: "doctor", target: "codex" }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.targets[0].skills.map((skill) => skill.skill), ["parley-deck"]);
  assert.equal(result.targets[0].skills[0].status, "valid");
});

test("status after --no-addons install reports a valid core-only runtime install", () => {
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex", noAddons: true }));

  const result = installer.statusCommand(context(home, { command: "status", target: "codex" }));
  // The intentionally core-only install must read as a valid runtime install and
  // must not contribute an install-status reason to the compatibility summary.
  assert.equal(result.runtimeInstalls[0].status, "valid");
  assert.deepEqual(result.runtimeInstalls[0].skills.map((skill) => skill.skill), ["parley-deck"]);
  assert.ok(!result.compatibility.reasons.some((reason) => reason.startsWith("codex-install-")));
});

test("paths after --no-addons install lists only the core skill", () => {
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex", noAddons: true }));

  const result = installer.pathsCommand(context(home, { command: "paths", target: "codex" }));
  assert.deepEqual(result.targets[0].skills.map((skill) => skill.skill), ["parley-deck"]);
});

test("doctor after --only install reports only the chosen add-on, never ok:false", () => {
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex", only: ["parley-tracker"] }));

  const result = installer.doctorCommand(context(home, { command: "doctor", target: "codex" }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.targets[0].skills.map((skill) => skill.skill), ["parley-deck", "parley-tracker"]);
  for (const skill of result.targets[0].skills) {
    assert.equal(skill.status, "valid");
  }
});

test("a legacy core-only marker without an addons field stays healthy", () => {
  const home = tmpDir();
  // Simulate a marker written by a release that predates the addons field.
  installer.installCommand(context(home, { target: "codex", noAddons: true }));
  const dest = path.join(home, ".codex", "skills", "parley-deck");
  const markerFile = path.join(dest, installer.MARKER_FILE);
  const marker = JSON.parse(fs.readFileSync(markerFile, "utf8"));
  delete marker.addons;
  fs.writeFileSync(markerFile, `${JSON.stringify(marker, null, 2)}\n`, "utf8");

  const result = installer.doctorCommand(context(home, { command: "doctor", target: "codex" }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.targets[0].skills.map((skill) => skill.skill), ["parley-deck"]);
});

test("doctor honors an explicit flag over the marker selection", () => {
  const home = tmpDir();
  // Installed core-only, but the operator explicitly asks doctor to expect an add-on.
  installer.installCommand(context(home, { target: "codex", noAddons: true }));

  const result = installer.doctorCommand(context(home, { command: "doctor", target: "codex", only: ["parley-tracker"] }));
  assert.equal(result.ok, false);
  const trackerSkill = result.targets[0].skills.find((skill) => skill.skill === "parley-tracker");
  assert.equal(trackerSkill.status, "missing");
});

test("uninstall after --no-addons install removes only the core skill", () => {
  const home = tmpDir();
  installer.installCommand(context(home, { target: "codex", noAddons: true }));
  const skillsDir = path.join(home, ".codex", "skills");

  const result = installer.uninstallCommand(context(home, { command: "uninstall", target: "codex" }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.actions[0].skills.map((skill) => skill.skill), ["parley-deck"]);
  assert.equal(fs.existsSync(path.join(skillsDir, "parley-deck")), false);
});
