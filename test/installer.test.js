"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const installer = require("../lib/installer");

const root = path.resolve(__dirname, "..");
const bin = path.join(root, "bin", "parley-deck-skill.js");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "parley-deck-skill-test-"));
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
      json: false,
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
  const userTargets = installer.resolveTargets(context(home, { target: "all" }));

  assert.equal(userTargets.length, 3);
  assert.equal(userTargets.find((target) => target.name === "codex").dest, path.join(home, ".codex", "skills", "parley-deck"));
  assert.equal(userTargets.find((target) => target.name === "claude").dest, path.join(home, ".claude", "skills", "parley-deck"));
  assert.equal(userTargets.find((target) => target.name === "gemini").dest, path.join(home, ".gemini", "extensions", "parley-deck"));

  const project = path.join(home, "project");
  const projectTargets = installer.resolveTargets(context(home, { target: "all", scope: "project", project }));
  assert.equal(projectTargets.find((target) => target.name === "codex").dest, path.join(project, ".codex", "skills", "parley-deck"));
  assert.equal(projectTargets.find((target) => target.name === "claude").dest, path.join(project, ".claude", "skills", "parley-deck"));
  assert.equal(projectTargets.find((target) => target.name === "gemini").dest, path.join(project, ".gemini", "extensions", "parley-deck"));
});

test("auto target installs only detected runtimes", () => {
  const home = tmpDir();
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });

  const targets = installer.resolveTargets(context(home, { target: "auto" }));
  assert.deepEqual(targets.map((target) => target.name), ["claude"]);
});

test("project auto target only installs detected project runtimes", () => {
  const home = tmpDir();
  const project = path.join(home, "project");
  fs.mkdirSync(path.join(project, ".gemini"), { recursive: true });

  const targets = installer.resolveTargets(context(home, { target: "auto", scope: "project", project }));
  assert.deepEqual(targets.map((target) => target.name), ["gemini"]);
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
  assert.deepEqual(result.targets[0].missing, ["SKILL.md", "references/COOPERATION.md", "agents/manifest.yaml"]);
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
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
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
