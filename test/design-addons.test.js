const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const designRoot = path.join(root, "skills", "parley-design");
const checkRoot = path.join(root, "skills", "parley-design-check");

// Consensus C3: four doctrine files, hard ceiling 64 KiB, enforced by a test rather than by a
// comment. A doctrine that quietly grows costs every participant on every run.
//
// The 64 KiB TOTAL is the binding constraint (C3, as resolved in review AF-10). The per-file
// numbers below are early-warning thresholds, not a partition: they sum above the total on
// purpose, so one file may take room another gave up without a test change, while the total
// still catches the aggregate. Round-01 review AF-7/AF-8/AF-9 added ~3 KiB of ratified
// normative text to PDS.md — G1's ban list and its two restored conjuncts, the canonical
// frontmatter subset, the brief's run-id — against 139 bytes of slack, and paid for it by
// cutting prose from all four files. PDS.md keeps every artifact kind in the identical
// four-part shape, which is the property the spec exists to have. See IMPLEMENTATION.md
// deviation D-1.
const BUDGETS = [
  ["SKILL.md", 7 * 1024],
  [path.join("references", "PDS.md"), 25 * 1024],
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

test("each doctrine file is within its early-warning threshold", () => {
  for (const [rel, budget] of BUDGETS) {
    const size = fs.statSync(path.join(designRoot, rel)).size;
    assert.ok(
      size <= budget,
      `${rel} is ${size} bytes, over its ${budget}-byte threshold by ${size - budget}`
    );
  }
});

test("the doctrine total is within its binding 64 KiB ceiling", () => {
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

test("every rule id the doctrine cites is one the registry declares", () => {
  // PDS §10 rule 3 turns an unknown id into UNJUDGEABLE, so a doctrine that cites an id the
  // registry never declared teaches citations its own extension policy launders into
  // non-findings. Round-01 found four of those in the spec's own examples (kimi-1).
  const { loadRegistry } = require("../skills/parley-design-check/lib/registry.js");
  const registry = loadRegistry(path.join(designRoot, "references", "RULES.md"));
  const files = [
    path.join(designRoot, "SKILL.md"),
    path.join(designRoot, "references", "PDS.md"),
    path.join(designRoot, "references", "RULES.md"),
    path.join(designRoot, "references", "WEB-ANNEX.md"),
  ];
  const unknown = new Set();
  for (const file of files) {
    for (const match of fs.readFileSync(file, "utf8").matchAll(/\b(core|web):[a-z0-9][a-z0-9-]*/g)) {
      if (!registry.rules.has(match[0])) unknown.add(`${path.basename(file)}: ${match[0]}`);
    }
  }
  assert.deepEqual([...unknown].sort(), [], "the doctrine cites rule ids the registry does not declare");
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

// A directory rename is not finished when the tests pass — it is finished when the
// instructions the skills give their readers still resolve. The addons/ -> skills/ move left
// 34 live `addons/…` paths in shipped content, including a documented test command that
// exited 0 while running zero tests. npm test could not see it, because the moved files
// themselves were valid. This guard is the thing that would have seen it.
// (idea skills-cli-install-path, review round 01 MAJOR-1 / round 02 MAJOR.)
test("no shipped skill instruction points at the removed addons/ tree", () => {
  const skillsRoot = path.join(root, "skills");
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(md|js|json|ya?ml)$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, "utf8");
      text.split("\n").forEach((line, i) => {
        if (line.includes("addons/")) {
          offenders.push(`${path.relative(root, full)}:${i + 1}`);
        }
      });
    }
  };
  walk(skillsRoot);
  assert.deepEqual(
    offenders,
    [],
    `shipped skill content references the removed addons/ tree at:\n  ${offenders.join("\n  ")}`
  );
});

test("the package ships no addons/ directory", () => {
  assert.equal(fs.existsSync(path.join(root, "addons")), false);
});

// A published verification command that exits 0 while running zero tests is worse than a
// broken one: it certifies nothing while looking green, and an implementer ticks the box in
// good faith. The addons/ text guard cannot see this class — the path can be perfectly
// correct and the command still verify nothing. So run every command the shipped content
// publishes and assert it both succeeds and actually executes tests.
// (idea skills-cli-install-path, review round 03 MAJOR.)
// Pull every published `node --test …` command out of one markdown document.
//
// This deliberately does NOT parse markdown structure. Four review rounds were spent
// enumerating the places a command can hide — inline spans, then backtick fences, then tilde
// fences — and each enumeration was narrower than the claim made for it. Fence syntax is an
// open set (backtick, tilde, longer runs, indented blocks, HTML), so enumerating it can only
// ever be incomplete. Scanning every line for the command itself closes the class by
// construction: there is no container to miss, because containers are never consulted.
//
// A false positive here is harmless and arguably correct — if a shipped file prints a
// `node --test` command anywhere, in any context, that command should work.
// (idea skills-cli-install-path, review rounds 03-05.)
function publishedTestCommands(markdown) {
  const found = new Set();
  // One global match over the whole document. Not line-by-line, because a line may publish
  // more than one command; not container-aware, because containers are an open set. A command
  // runs to the first backtick (an inline span's close) or end of line, whichever comes first.
  for (const m of markdown.matchAll(/node --test ([^`\n]*)/g)) {
    const command = `node --test ${m[1]}`
      .replace(/[)\].,;:]+\s*$/, "")   // trailing markdown/prose punctuation
      .trim()
      .replace(/\s+/g, " ");
    if (command.length > "node --test".length + 1) found.add(command);
  }
  return found;
}

test("the published-command extractor is not fooled by any container", () => {
  const fixture = [
    "Inline valid: `node --test \"a/*.test.js\"`",
    "Inline broken: `node --test a/dir`",
    "",
    "```bash",
    "node --test \"b/*.test.js\"",
    "$ node --test b/dir",
    "```",
    "",
    "~~~bash",
    "node --test tilde/valid.test.js",
    "~~~",
    "",
    "    node --test indented/block.test.js",
    "",
    "Prose mentioning `node --test prose/one.test.js` mid-sentence.",
    "",
    "Two on one line: first `node --test pair/first.test.js`; then `node --test pair/second.test.js`.",
    "",
    "```",
    "echo not-a-test-command",
    "```"
  ].join("\n");
  const found = publishedTestCommands(fixture);
  for (const expected of [
    'node --test "a/*.test.js"',
    "node --test a/dir",
    'node --test "b/*.test.js"',
    "node --test b/dir",
    "node --test tilde/valid.test.js",
    "node --test indented/block.test.js",
    "node --test prose/one.test.js",
    "node --test pair/first.test.js",
    "node --test pair/second.test.js"
  ]) {
    assert.ok(found.has(expected), `extractor missed: ${expected}`);
  }
  assert.equal([...found].some((c) => c.includes("echo")), false);
});

test("every `node --test` command a shipped file publishes runs tests and passes", () => {
  const { execFileSync } = require("node:child_process");
  const published = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".md")) continue;
      for (const command of publishedTestCommands(fs.readFileSync(full, "utf8"))) {
        published.add(command);
      }
    }
  };
  walk(path.join(root, "skills"));
  assert.ok(published.size >= 2, `expected both published commands, saw ${published.size}`);

  for (const command of published) {
    const target = command.slice("node --test ".length).replace(/^"|"$/g, "");
    // A test runner spawned from inside a test runner inherits NODE_TEST_CONTEXT and reports
    // through the parent instead of to stdout, leaving nothing to read. Strip it so the child
    // behaves exactly as it does for a person typing the published command.
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith("NODE_TEST")) delete env[key];
    }
    const out = execFileSync(process.execPath, ["--test", target], {
      cwd: root,
      encoding: "utf8",
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    // Node's default reporter prints "\u2139 pass N"; the TAP reporter prints "# pass N".
    // Accept either, and treat an unparseable summary as a failure rather than as zero.
    const read = (label) => {
      const m = out.match(new RegExp(`^(?:\u2139|#)\\s*${label}\\s+(\\d+)\\s*$`, "m"));
      assert.ok(m, `could not read "${label}" from the output of: ${command}`);
      return Number(m[1]);
    };
    const pass = read("pass");
    const fail = read("fail");
    assert.equal(fail, 0, `published command failed: ${command}`);
    assert.ok(pass > 0, `published command ran zero tests, so it verifies nothing: ${command}`);
  }
});
