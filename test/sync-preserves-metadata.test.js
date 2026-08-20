"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const CLI = path.join(PACKAGE_ROOT, "bin", "parley-deck-skill.js");

// kimi-1/F2: sync-project rebuilt version.json from a fixed key list and wrote it wholesale, so
// every field the CLI owns was silently deleted -- including protocolRole, which COOPERATION.md
// section 9.0 and `parley preflight` both gate on, while `status` recommends this very command.
test("sync-project preserves metadata fields it does not own", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "pd-sync-preserve-"));
  fs.mkdirSync(path.join(project, "parley-deck", "meta"), { recursive: true });
  fs.copyFileSync(
    path.join(PACKAGE_ROOT, "skills", "parley-deck", "references", "COOPERATION.md"),
    path.join(project, "parley-deck", "COOPERATION.md")
  );
  const metaPath = path.join(project, "parley-deck", "meta", "version.json");
  fs.writeFileSync(
    metaPath,
    JSON.stringify({ protocolRole: "source", created: "2026-01-01", deckVersion: "0.0.1" }, null, 2)
  );

  execFileSync(process.execPath, [CLI, "sync-project", "--project", project, "--yes"], { stdio: "ignore" });

  const after = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  assert.strictEqual(after.protocolRole, "source", "protocolRole must survive sync-project");
  assert.strictEqual(after.created, "2026-01-01", "created must survive sync-project");
  assert.ok(after.updatedBy, "sync-project must still write its own fields");
});
