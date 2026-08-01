#!/usr/bin/env node
"use strict";

// Generate or verify a packaged skill's parley-addon.json.
//
// The manifest is generated, never hand-maintained: a hand-written file list goes stale on the
// first payload change and then certifies the wrong tree. Run with --check in CI so a payload
// edit that forgets to regenerate fails the build instead of shipping a manifest that
// disagrees with the files beside it.
//
// Every directory under skills/ is covered, the core skill included. Coverage is mandatory:
// with no names given, a skill that carries no manifest is a --check FAILURE, not a skip.
//
// Usage:
//   node scripts/build-addon-manifest.js                      refresh every packaged skill
//   node scripts/build-addon-manifest.js --check              verify without writing
//   node scripts/build-addon-manifest.js <skill> [<skill>...]  target named skills
//   node scripts/build-addon-manifest.js <skill> --runtime-python ">=3.10"
//
// The runtime block is sticky: once written it is preserved on every later regeneration, so
// the interpreter floor is declared once by the add-on rather than re-typed by each caller.

const fs = require("fs");
const path = require("path");

const { MANIFEST_FILE, computeManifest, hasManifest, readManifest, verifyPayload } = require("../lib/addon-manifest");

const REPO_ROOT = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(REPO_ROOT, "skills");

function fail(message) {
  process.stderr.write(`build-addon-manifest: ${message}\n`);
  process.exit(1);
}

function listAddons() {
  let entries;
  try {
    entries = fs.readdirSync(SKILLS_DIR);
  } catch (_error) {
    fail(`no skills directory at ${SKILLS_DIR}`);
  }
  // The core skill is included. It is a packaged skill directory like any other, and a foreign
  // installer copies it the same way; excluding it meant a verbatim core copy could never be
  // proven intact and was reported `malformed` however correct its bytes were.
  return entries
    .filter((entry) => entry !== ".DS_Store")
    .filter((entry) => {
      try {
        return fs.statSync(path.join(SKILLS_DIR, entry)).isDirectory();
      } catch (_error) {
        return false;
      }
    })
    .sort();
}

function parseArgs(argv) {
  const names = [];
  let check = false;
  let runtimePython = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") {
      check = true;
    } else if (arg === "--runtime-python") {
      runtimePython = argv[i + 1];
      if (!runtimePython) fail("--runtime-python needs a value, e.g. \">=3.10\"");
      i += 1;
    } else if (arg.startsWith("-")) {
      fail(`unknown option ${arg}`);
    } else {
      names.push(arg);
    }
  }
  return { names, check, runtimePython };
}

function main() {
  const { names, check, runtimePython } = parseArgs(process.argv.slice(2));
  const available = listAddons();

  let targets;
  if (names.length > 0) {
    for (const name of names) {
      if (!available.includes(name)) {
        fail(`unknown add-on ${JSON.stringify(name)} (available: ${available.join(", ") || "none"})`);
      }
    }
    targets = names;
  } else {
    // No names: every packaged skill, whether or not it already carries a manifest.
    //
    // This used to refresh only the directories that had opted in by already having one, which
    // read as generic restraint and was in fact the hole. A skill without a manifest cannot be
    // proven intact when a foreign installer put it there, and `--check` could not notice,
    // because the very absence being checked for removed the directory from the check. Five of
    // six skills sat in that blind spot through a release. Coverage is now mandatory: a
    // packaged skill with no manifest is a `--check` failure, so a seventh skill cannot repeat
    // it silently.
    targets = available;
    if (targets.length === 0) {
      process.stdout.write("no packaged skill directories found\n");
      return;
    }
  }

  let failures = 0;
  for (const name of targets) {
    const root = path.join(SKILLS_DIR, name);

    // Preserve an existing runtime declaration unless this run overrides it.
    let runtime = {};
    if (hasManifest(root)) {
      const existing = readManifest(root);
      if (existing.ok && existing.manifest.runtime) {
        runtime = { ...existing.manifest.runtime };
      } else if (!existing.ok && !runtimePython && !check) {
        fail(`${name}: refusing to regenerate over an unreadable manifest (${existing.error})`);
      }
    }
    if (runtimePython) {
      runtime.python = runtimePython;
    }

    const manifest = computeManifest(root, { runtime });
    const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
    const fileCount = Object.keys(manifest.files).length;

    if (check) {
      const current = hasManifest(root) ? fs.readFileSync(path.join(root, MANIFEST_FILE), "utf8") : null;
      if (current === null) {
        process.stdout.write(`${name}: MISSING ${MANIFEST_FILE}\n`);
        failures += 1;
        continue;
      }
      if (current !== serialized) {
        process.stdout.write(`${name}: STALE ${MANIFEST_FILE} — regenerate it\n`);
        failures += 1;
        continue;
      }
      const verified = verifyPayload(root);
      if (!verified.ok) {
        process.stdout.write(`${name}: INVALID payload\n${verified.problems.map((p) => `  - ${p}`).join("\n")}\n`);
        failures += 1;
        continue;
      }
      process.stdout.write(`${name}: ok (${fileCount} files, ${manifest.aggregate})\n`);
      continue;
    }

    fs.writeFileSync(path.join(root, MANIFEST_FILE), serialized, "utf8");
    process.stdout.write(`${name}: wrote ${MANIFEST_FILE} (${fileCount} files, ${manifest.aggregate})\n`);
  }

  if (failures > 0) {
    process.exit(1);
  }
}

main();
