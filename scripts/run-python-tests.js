#!/usr/bin/env node
"use strict";

// Run the parley-bidding add-on's Python suite as part of `npm test`.
//
// The add-on ships seven deterministic Python tools with their own tests. Without this leg
// they would ride into every release untested by this repository: `node --test` never looks
// at them, so a broken script would only surface for whoever ran it against a real tender.
//
// Three deliberate choices, all from the ratified design:
//
//   * Each file runs individually with its own expected assertion count, not through
//     `unittest discover` and not through pytest. A discovery form reports one total, so a
//     file that silently stops being collected still shows a green run.
//   * A missing interpreter FAILS. Skipping would report success for a suite that never ran,
//     which is the same untested-and-green state this leg exists to prevent.
//   * `PYTHONDONTWRITEBYTECODE=1` plus `-B`, then an explicit scan: copyRecursive filters
//     nothing, so a stray .pyc left in the tree would be packaged into every runtime.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const addonManifest = require("../lib/addon-manifest");

const REPO_ROOT = path.resolve(__dirname, "..");
const ADDON_ROOT = path.join(REPO_ROOT, "skills", "parley-bidding");
const TESTS_DIR = path.join(ADDON_ROOT, "scripts", "tests");

// Per-file expected counts. Hardcoded on purpose: adding or removing a Python test is a
// deliberate act that should have to be recorded here, so a quietly-vanishing test fails.
const EXPECTED = [
  ["test_adapter_validate.py", 4],
  ["test_bid_state.py", 20],
  ["test_end_to_end.py", 2],
  ["test_init_workspace.py", 3],
  ["test_linters.py", 15],
  ["test_manifest.py", 3],
  ["test_skill_structure.py", 7]
];
const EXPECTED_TOTAL = EXPECTED.reduce((sum, [, count]) => sum + count, 0);

function fail(message) {
  process.stderr.write(`python tests: ${message}\n`);
  process.exit(1);
}

// The interpreter floor is declared once, by the add-on, in its manifest — and it is read
// through the shared parser, which enforces the regular-file rule. Reading the file directly
// made this a fourth manifest reader outside that rule, and its catch-all turned a symlinked or
// unparseable manifest into "no declared floor", so the suite reported 54/54 against a manifest
// the module itself refuses. (review round 15, codex-1 MINOR.)
function declaredPythonFloor() {
  const read = addonManifest.readManifest(ADDON_ROOT);
  if (!read.ok) {
    fail(`${ADDON_ROOT}: ${read.error}`);
  }
  const spec = read.manifest.runtime && read.manifest.runtime.python;
  const match = typeof spec === "string" ? spec.match(/^>=\s*(\d+)\.(\d+)$/) : null;
  return match ? { major: Number(match[1]), minor: Number(match[2]), spec } : null;
}

function resolveInterpreter() {
  const probe = spawnSync("python3", ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"], {
    encoding: "utf8"
  });
  if (probe.error || probe.status !== 0) {
    fail(
      "python3 is required to test the parley-bidding add-on and was not found.\n" +
        "This is a failure, not a skip: the add-on ships seven Python tools that would\n" +
        "otherwise be released untested. Install Python 3.10 or newer and re-run."
    );
  }
  // Both of these used to fail OPEN: an unparseable `python3 --version` produced NaN, which
  // compares false against every floor, and a malformed `runtime.python` produced a null floor
  // that skipped the comparison entirely. Either way the gate that exists to stop an untested
  // interpreter reported success. (review round 16: codex-1 MINOR, kimi-1 MINOR.)
  const reported = probe.stdout.trim();
  const parsed = /^(\d+)\.(\d+)$/.exec(reported);
  if (!parsed) {
    fail(`python3 reported an unreadable version: ${JSON.stringify(reported)}`);
  }
  const major = Number(parsed[1]);
  const minor = Number(parsed[2]);
  const floor = declaredPythonFloor();
  if (!floor) {
    fail(`the add-on declares no usable runtime.python floor; refusing to test against an unbounded interpreter`);
  }
  if (major < floor.major || (major === floor.major && minor < floor.minor)) {
    fail(`python3 is ${major}.${minor}, but the add-on declares ${floor.spec}`);
  }
  return `${major}.${minor}`;
}

function cacheArtefacts() {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__pycache__") {
          found.push(path.relative(REPO_ROOT, abs));
          continue;
        }
        walk(abs);
      } else if (entry.name.endsWith(".pyc") || entry.name.endsWith(".pyo")) {
        found.push(path.relative(REPO_ROOT, abs));
      }
    }
  };
  walk(ADDON_ROOT);
  return found;
}

function main() {
  if (!fs.existsSync(TESTS_DIR)) {
    fail(`no Python tests directory at ${path.relative(REPO_ROOT, TESTS_DIR)}`);
  }

  const version = resolveInterpreter();

  // A file present on disk but absent from EXPECTED would otherwise never run.
  const onDisk = fs
    .readdirSync(TESTS_DIR)
    .filter((name) => name.startsWith("test_") && name.endsWith(".py"))
    .sort();
  const listed = EXPECTED.map(([name]) => name);
  const unlisted = onDisk.filter((name) => !listed.includes(name));
  if (unlisted.length > 0) {
    fail(`Python test files not listed in this runner: ${unlisted.join(", ")}`);
  }

  let total = 0;
  let failures = 0;
  for (const [name, expected] of EXPECTED) {
    const file = path.join(TESTS_DIR, name);
    if (!fs.existsSync(file)) {
      process.stderr.write(`  ${name}: MISSING\n`);
      failures += 1;
      continue;
    }
    const run = spawnSync("python3", ["-B", file], {
      cwd: ADDON_ROOT,
      encoding: "utf8",
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
    });
    // unittest writes its summary to stderr.
    const output = `${run.stdout || ""}${run.stderr || ""}`;
    const ran = output.match(/^Ran (\d+) tests? in /m);
    const count = ran ? Number(ran[1]) : 0;
    const ok = run.status === 0 && /^OK\b/m.test(output);

    if (!ok) {
      process.stderr.write(`  ${name}: FAILED\n${output}\n`);
      failures += 1;
      continue;
    }
    if (count !== expected) {
      process.stderr.write(`  ${name}: ran ${count} tests, expected ${expected}\n`);
      failures += 1;
      continue;
    }
    total += count;
    process.stdout.write(`  ${name}: ${count} tests OK\n`);
  }

  const stray = cacheArtefacts();
  if (stray.length > 0) {
    process.stderr.write(`  generated cache artefacts left behind: ${stray.join(", ")}\n`);
    failures += 1;
  }

  if (failures > 0) {
    fail(`${failures} Python test file(s) failed`);
  }
  if (total !== EXPECTED_TOTAL) {
    fail(`ran ${total} tests, expected ${EXPECTED_TOTAL}`);
  }
  process.stdout.write(`python ${version}: ${total} tests OK across ${EXPECTED.length} files\n`);
}

main();
