#!/usr/bin/env node
"use strict";

// Generate or verify an add-on's parley-addon.json.
//
// The manifest is generated, never hand-maintained: a hand-written file list goes stale on the
// first payload change and then certifies the wrong tree. Run with --check in CI so a payload
// edit that forgets to regenerate fails the build instead of shipping a manifest that
// disagrees with the files beside it.
//
// Usage:
//   node scripts/build-addon-manifest.js                      refresh every add-on that has one
//   node scripts/build-addon-manifest.js --check              verify without writing
//   node scripts/build-addon-manifest.js <addon> [<addon>...]  target named add-ons
//   node scripts/build-addon-manifest.js <addon> --runtime-python ">=3.10"
//
// The runtime block is sticky: once written it is preserved on every later regeneration, so
// the interpreter floor is declared once by the add-on rather than re-typed by each caller.

const fs = require("fs");
const path = require("path");

const { MANIFEST_FILE, computeManifest, hasManifest, readManifest, verifyPayload } = require("../lib/addon-manifest");

const REPO_ROOT = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(REPO_ROOT, "skills");
const CORE_SKILL_NAME = "parley-deck";

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
  return entries
    .filter((entry) => entry !== CORE_SKILL_NAME && entry !== ".DS_Store")
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
    // No names: only refresh add-ons that already opted in by carrying a manifest. This keeps
    // the tool generic — it never decides on its own that an add-on ought to have one.
    targets = available.filter((name) => hasManifest(path.join(SKILLS_DIR, name)));
    if (targets.length === 0) {
      process.stdout.write("no add-on carries a manifest yet; name one explicitly to create it\n");
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
