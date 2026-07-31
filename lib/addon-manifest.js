"use strict";

// Full-payload integrity manifest for an add-on skill directory.
//
// An add-on is an inert instruction tree: the installer copies it verbatim and, before this
// module existed, called it valid as long as `SKILL.md` was present. A tree gutted down to
// that one file therefore reported healthy. This module gives an add-on a way to declare its
// complete payload so that a missing script, a deleted schema, or a single flipped byte is
// detectable after installation.
//
// Scope, stated plainly: this is **defect detection, not tamper resistance**. Anyone who can
// rewrite the payload can rewrite the manifest beside it. What it catches is partial copies,
// truncated extractions, interrupted installs, stray generated files, and accidental edits.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MANIFEST_FILE = "parley-addon.json";
const MANIFEST_SCHEMA = "parley-addon/1";

// Written *into* the installed tree by the installer, so it can never be part of the payload
// the manifest describes. `.DS_Store` is noise the installer already treats as absent.
const INSTALL_MARKER_FILE = ".parley-deck-skill-install.json";
const IGNORED_BASENAMES = new Set([".DS_Store"]);

function isIgnored(relPath) {
  if (relPath === MANIFEST_FILE || relPath === INSTALL_MARKER_FILE) return true;
  return IGNORED_BASENAMES.has(path.posix.basename(relPath));
}

// Every payload file below `root`, as POSIX-relative paths in byte order. Byte order rather
// than locale order: the aggregate digest must not depend on the machine's collation.
function listPayloadFiles(root) {
  const found = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir)) {
      const abs = path.join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (isIgnored(rel)) continue;
      const stat = fs.lstatSync(abs);
      if (stat.isSymbolicLink()) {
        // copyRecursive refuses these too; refusing here keeps the manifest honest about
        // what a payload may contain rather than hashing a link's target.
        throw new Error(`Refusing to hash symlink in add-on payload: ${rel}`);
      }
      if (stat.isDirectory()) {
        walk(abs, rel);
        continue;
      }
      found.push(rel);
    }
  };
  walk(root, "");
  return found.sort();
}

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// One digest over the whole payload. Defined as SHA-256 of "<path>\n<hash>\n" per file, in
// path byte order, so it is reproducible from the file list alone and changes if a path is
// renamed, added, or removed — not only if a byte inside a file changes.
function aggregateDigest(files) {
  const hash = crypto.createHash("sha256");
  for (const rel of Object.keys(files).sort()) {
    hash.update(`${rel}\n${stripPrefix(files[rel])}\n`);
  }
  return `sha256:${hash.digest("hex")}`;
}

function stripPrefix(value) {
  return typeof value === "string" && value.startsWith("sha256:") ? value.slice(7) : value;
}

// Build a manifest object from a payload directory on disk.
function computeManifest(root, options) {
  const files = {};
  for (const rel of listPayloadFiles(root)) {
    files[rel] = `sha256:${hashFile(path.join(root, rel))}`;
  }
  const manifest = { schema: MANIFEST_SCHEMA };
  const runtime = options && options.runtime;
  if (runtime && Object.keys(runtime).length > 0) {
    manifest.runtime = runtime;
  }
  manifest.files = files;
  manifest.aggregate = aggregateDigest(files);
  return manifest;
}

function manifestPath(root) {
  return path.join(root, MANIFEST_FILE);
}

// `lstat`, not `stat`: a symlink here is not a manifest, it is a manifest-shaped defect. Using
// the following variant is what let an external file supply this module's authority.
// (review round 13.)
function hasManifest(root) {
  try {
    return fs.lstatSync(manifestPath(root)).isFile();
  } catch (_error) {
    return false;
  }
}

// The raw SHA-256 of parley-addon.json itself. The aggregate digest covers the payload; this
// covers the manifest's own bytes, including its declared runtime floor. Recorded in the
// install marker so a self-consistent manifest+payload replacement is still detectable.
function manifestFileHash(root) {
  if (manifestEntryProblem(root)) return null;
  try {
    return `sha256:${hashFile(manifestPath(root))}`;
  } catch (_error) {
    return null;
  }
}

// Parse and structurally validate the manifest. Returns { ok, manifest, error }. A manifest
// that exists but is unreadable, wrongly-typed, or of an unknown schema is an error, never a
// silent fallback to "no manifest" — that fallback is exactly the downgrade path this exists
// to close.
function readManifest(root) {
  let raw;
  try {
    raw = fs.readFileSync(manifestPath(root), "utf8");
  } catch (_error) {
    return { ok: false, manifest: null, error: `${MANIFEST_FILE} is missing or unreadable` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    return { ok: false, manifest: null, error: `${MANIFEST_FILE} is not valid JSON` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, manifest: null, error: `${MANIFEST_FILE} must contain a JSON object` };
  }
  if (parsed.schema !== MANIFEST_SCHEMA) {
    return {
      ok: false,
      manifest: null,
      error: `${MANIFEST_FILE} declares unsupported schema ${JSON.stringify(parsed.schema)} (expected ${MANIFEST_SCHEMA})`
    };
  }
  if (!parsed.files || typeof parsed.files !== "object" || Array.isArray(parsed.files)) {
    return { ok: false, manifest: null, error: `${MANIFEST_FILE} has no valid "files" object` };
  }
  for (const [rel, value] of Object.entries(parsed.files)) {
    if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
      return { ok: false, manifest: null, error: `${MANIFEST_FILE} has a malformed hash for ${rel}` };
    }
  }
  if (typeof parsed.aggregate !== "string" || !/^sha256:[0-9a-f]{64}$/.test(parsed.aggregate)) {
    return { ok: false, manifest: null, error: `${MANIFEST_FILE} has a malformed "aggregate" digest` };
  }
  if (parsed.aggregate !== aggregateDigest(parsed.files)) {
    return {
      ok: false,
      manifest: null,
      error: `${MANIFEST_FILE} aggregate digest does not match its own file list`
    };
  }
  return { ok: true, manifest: parsed, error: null };
}

// Verify a payload directory against the manifest it carries.
//
// Returns { ok, problems, manifest }. Problems are reported as a list rather than the first
// failure, so `doctor` can tell a user which files are missing instead of one at a time.
// A manifest key becomes a filesystem path, so the manifest is untrusted input like any other
// file in a destination directory. The aggregate digest proves only that the manifest agrees
// with its own key/value map — it says nothing about where those keys point. Measured before
// this: a key of `../outside-sentinel` carrying the external file's correct digest made
// `verifyPayload` return ok:true, and a key of `../parley-deck/SKILL.md` made an add-on's
// health depend on a sibling skill's bytes. (review round 12, codex-1 MAJOR.)
function unusableManifestKey(rel) {
  if (typeof rel !== "string" || rel === "") return "not a non-empty string";
  if (rel.includes("\\")) return "uses a backslash separator";
  if (rel.startsWith("/")) return "is an absolute path";
  if (/^[A-Za-z]:/.test(rel)) return "carries a drive letter";
  const segments = rel.split("/");
  for (const segment of segments) {
    if (segment === "") return "has an empty path segment";
    if (segment === "." || segment === "..") return "has a relative path segment";
  }
  return null;
}

// Is `abs` strictly inside `root`? Belt to the key grammar's braces: whatever a key looks like,
// what it resolves to must be under the payload.
function insidePayload(root, abs) {
  const base = path.resolve(root);
  const target = path.resolve(abs);
  return target !== base && target.startsWith(base + path.sep);
}

// The manifest is the file that supplies the keys, hashes and runtime policy the rest of this
// module trusts, so it belongs inside the trust boundary it defines. `hasManifest` used `stat`,
// which follows a link, and the payload walker deliberately skips the manifest — so replacing
// the installed manifest with a symlink to a byte-identical file outside the destination left
// `verifyPayload` ok, `doctor` `valid`, and even `managed: true`, because the marker hash
// followed the link too. Health then depended on bytes outside the installed tree.
// (review round 13: codex-1 MAJOR, hermes-1 MINOR — both asked for this rule.)
function manifestEntryProblem(root) {
  const file = path.join(root, MANIFEST_FILE);
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    return error && error.code === "ENOENT" ? null : `${MANIFEST_FILE} cannot be inspected (${error.code})`;
  }
  if (stat.isSymbolicLink()) return `${MANIFEST_FILE} is a symbolic link, not a regular file`;
  if (!stat.isFile()) return `${MANIFEST_FILE} is not a regular file`;
  return null;
}

function verifyPayload(root) {
  const entryProblem = manifestEntryProblem(root);
  if (entryProblem) {
    return { ok: false, problems: [entryProblem], manifest: null };
  }
  const read = readManifest(root);
  if (!read.ok) {
    return { ok: false, problems: [read.error], manifest: null };
  }
  const manifest = read.manifest;
  const problems = [];
  const declared = new Set(Object.keys(manifest.files));

  for (const rel of declared) {
    const unusable = unusableManifestKey(rel);
    if (unusable) {
      problems.push(`unusable manifest entry (${unusable}): ${JSON.stringify(rel)}`);
      continue;
    }
    const abs = path.join(root, rel);
    if (!insidePayload(root, abs)) {
      problems.push(`manifest entry escapes the payload: ${JSON.stringify(rel)}`);
      continue;
    }
    let stat;
    try {
      stat = fs.lstatSync(abs);
    } catch (_error) {
      problems.push(`missing: ${rel}`);
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      problems.push(`not a regular file: ${rel}`);
      continue;
    }
    // `lstat` succeeding says the entry is there, not that it can be read. This call sat
    // outside the try, so one mode-000 declared file threw EACCES out of `doctorCommand`
    // instead of being reported — and a JSON consumer got no health document at all, for a
    // condition this function's list-returning contract exists to describe.
    // (review round 11, codex-1 MINOR.)
    let digest;
    try {
      digest = hashFile(abs);
    } catch (error) {
      problems.push(`unreadable (${error.code}): ${rel}`);
      continue;
    }
    if (`sha256:${digest}` !== manifest.files[rel]) {
      problems.push(`modified: ${rel}`);
    }
  }

  // Undeclared files matter as much as missing ones: a stray __pycache__ or .pyc reaching a
  // runtime is one of the carried blockers this manifest is meant to catch.
  let present;
  try {
    present = listPayloadFiles(root);
  } catch (error) {
    problems.push(error.message);
    present = [];
  }
  for (const rel of present) {
    if (!declared.has(rel)) {
      problems.push(`unexpected: ${rel}`);
    }
  }

  return { ok: problems.length === 0, problems, manifest };
}

module.exports = {
  MANIFEST_FILE,
  MANIFEST_SCHEMA,
  INSTALL_MARKER_FILE,
  aggregateDigest,
  computeManifest,
  hasManifest,
  listPayloadFiles,
  manifestFileHash,
  manifestPath,
  readManifest,
  verifyPayload
};
