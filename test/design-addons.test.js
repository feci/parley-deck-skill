const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const designRoot = path.join(root, "addons", "parley-design");
const checkRoot = path.join(root, "addons", "parley-design-check");

// Consensus C3: four doctrine files, hard ceiling 64 KiB, enforced by a test rather than by a
// comment. A doctrine that quietly grows costs every participant on every run.
//
// The per-file split is rebalanced from the one FINAL.md sketches (8/20/24/12): PDS.md does
// not fit 20 KiB while carrying every section with the identical four-part artifact shape
// intact, and breaking that shape would damage the thing the spec exists to be. C3 makes the
// 64 KiB TOTAL binding, so the total is what is held. See IMPLEMENTATION.md deviation D-1.
const BUDGETS = [
  ["SKILL.md", 8 * 1024],
  [path.join("references", "PDS.md"), 22 * 1024],
  [path.join("references", "RULES.md"), 24 * 1024],
  [path.join("references", "WEB-ANNEX.md"), 11 * 1024],
];
const TOTAL_BUDGET = 64 * 1024;

test("parley-design ships exactly the four doctrine files", () => {
  const found = [];
  const walk = (dir, prefix = "") => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? path.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else found.push(rel);
    }
  };
  walk(designRoot);
  assert.deepEqual(
    found.sort(),
    BUDGETS.map(([rel]) => rel).sort(),
    "the doctrine skill must contain exactly four files — file count only ever grows"
  );
});

test("each doctrine file is within its byte budget", () => {
  for (const [rel, budget] of BUDGETS) {
    const size = fs.statSync(path.join(designRoot, rel)).size;
    assert.ok(
      size <= budget,
      `${rel} is ${size} bytes, over its ${budget}-byte budget by ${size - budget}`
    );
  }
});

test("the doctrine total is within 64 KiB", () => {
  const total = BUDGETS.reduce((sum, [rel]) => sum + fs.statSync(path.join(designRoot, rel)).size, 0);
  assert.ok(total <= TOTAL_BUDGET, `doctrine total is ${total} bytes, over the ${TOTAL_BUDGET}-byte ceiling`);
});

test("no shipped design file contains a placeholder", () => {
  // FINAL.md: a design doctrine that ships placeholders has no credibility.
  const forbidden = [/<TODO>/i, /\bTBD\b/, /\bFIXME\b/, /XXX+/, /lorem ipsum/i, /goes here/i];
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(md|js)$/.test(entry.name) && !full.includes(`${path.sep}fixtures${path.sep}`)) files.push(full);
    }
  };
  walk(designRoot);
  walk(checkRoot);
  assert.ok(files.length > 0, "expected shipped design files to scan");
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(text), `${path.relative(root, file)} contains a placeholder matching ${pattern}`);
    }
  }
});

test("the checker declares no runtime dependencies", () => {
  // FINAL.md: standalone, node built-ins only, no network at check time.
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) files.push(full);
    }
  };
  walk(path.join(checkRoot, "bin"));
  walk(path.join(checkRoot, "lib"));
  assert.ok(files.length > 0, "expected checker source files");

  const builtins = new Set(require("node:module").builtinModules);
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
      const spec = match[1];
      const isRelative = spec.startsWith(".") || spec.startsWith("/");
      const bare = spec.startsWith("node:") ? spec.slice(5) : spec;
      assert.ok(
        isRelative || builtins.has(bare),
        `${path.relative(root, file)} requires "${spec}" — the checker must use node built-ins only`
      );
    }
  }
});

test("the spec's declared registry-digest matches the registry it points at", () => {
  // C4/§11: a signature must not silently survive a registry edit. The spec's frontmatter
  // carries the digest, so it is a second representation of a computed value — the only
  // thing that keeps it honest is this guard.
  const crypto = require("node:crypto");
  const rules = fs.readFileSync(path.join(designRoot, "references", "RULES.md"));
  const computed = crypto.createHash("sha256").update(rules).digest("hex").slice(0, 12);

  const pds = fs.readFileSync(path.join(designRoot, "references", "PDS.md"), "utf8");
  const frontmatter = pds.split("---")[1] || "";
  const declared = (frontmatter.match(/^registry-digest:\s*(\S+)/m) || [])[1];

  assert.ok(declared, "PDS.md frontmatter must declare a registry-digest");
  assert.equal(
    declared,
    computed,
    `PDS.md declares registry-digest ${declared} but RULES.md computes ${computed} — regenerate it`
  );
});

test("the checker never bundles a copy of the rule registry", () => {
  // C2/C4: one literate RULES.md is the single source of truth. A vendored fallback is the
  // exact drift this project rejected.
  const offenders = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^RULES\.md$/i.test(entry.name)) offenders.push(path.relative(root, full));
    }
  };
  walk(checkRoot);
  assert.deepEqual(offenders, [], "parley-design-check must not carry its own RULES.md");
});
