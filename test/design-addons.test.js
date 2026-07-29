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
// Join backslash-continued physical lines into logical shell lines FIRST, before anything
// looks for a command. A continuation can split the command anywhere — `node \` + `--test x`,
// or even `no\` + `de --test x` — so any detection that runs per physical line can be stepped
// around by choosing where to break. A shell removes backslash-newline with no substitution,
// so the splice does the same.
function logicalLines(markdown) {
  const out = [];
  let parts = [];
  for (const line of markdown.split("\n")) {
    const continues = /\\\s*$/.test(line);
    parts.push(continues ? line.replace(/\\\s*$/, "") : line);
    if (continues) continue;
    out.push({ text: parts.join(""), spliced: parts.length > 1 });
    parts = [];
  }
  if (parts.length > 0) out.push({ text: parts.join(""), spliced: parts.length > 1 });
  return out;
}

function publishedTestCommands(markdown) {
  const units = new Set();
  for (const { text, spliced } of logicalLines(markdown)) {
    if (!/node\s+--test/.test(text)) continue;
    // Strip only leading container/prompt noise. A command never begins with ">" or "$ ".
    const line = text.replace(/^[\s>]*/, "").replace(/^\$\s+/, "").trim();

    // A command assembled across physical lines is not a self-contained published command.
    // Emit it with the backslash restored so the grammar, which forbids one, refuses it.
    if (spliced) {
      units.add(`${line} \\`);
      continue;
    }

    // The discriminator is NOT "am I inside a fence" — tracking fences meant reimplementing
    // CommonMark. It is: does a backtick span contain the WHOLE command?
    //   • Inline publication wraps the whole command:  `node --test "x"`  ->  the span is it.
    //   • A fenced shell line wraps only a substitution: node --test `printf …` "x"
    //     — no span contains "node --test", so the unit is the whole line, backticks and all,
    //     and the strict grammar refuses it.
    const spans = [...line.matchAll(/(`+)([\s\S]*?)\1/g)];
    const outside = line.replace(/(`+)[\s\S]*?\1/g, " ");
    if (/node\s+--test/.test(outside)) {
      // Either a bare command, or a line that mixes span-quoted text with shell that also runs
      // the command. Both are judged as the whole line; the grammar sorts them out.
      units.add(line);
      continue;
    }
    for (const m of spans) if (/node\s+--test/.test(m[2])) units.add(m[2].trim());
  }
  return units;
}

// The only shape this guard will execute: the command, its targets, and nothing else. Every
// other published form — an environment prefix, a `cd … &&`, a command substitution, a pipe,
// a trailing shell operator — is REFUSED by name rather than guessed at or silently skipped.
// Narrow and fail-closed beats broad and approximate: six revisions of a hand-written shell
// parser were wrong in both directions at once.
// (idea skills-cli-install-path, review rounds 03-09.)
const SUPPORTED_COMMAND = /^node\s+--test\s+[^`;|&<>$\\]+$/;

test("the published-command extractor captures whole commands, never fragments", () => {
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
    "```bash",
    "node --test\ttab/separated.test.js",
    "node --test multi/one.test.js multi/two.test.js",
    "NODE_OPTIONS='--require ./x.cjs' node --test prefixed/one.test.js",
    "cd some/dir && node --test suffixed/one.test.js",
    "node --test `printf %s --test-reporter=x` fenced/subst.test.js",
    "node --test \\",
    "cont/split-args.test.js",
    "no\\",
    "de --test cont/split-word.test.js",
    "node --test cont/valid-half.test.js \\",
    "--test-reporter=does-not-exist",
    "```not-a-closing-fence",
    "```",
    "",
    "> ```bash",
    "> node --test blockquoted/fence.test.js",
    "> ```",
    "",
    "Double-backtick span: ``node --test double/span.test.js``.",
    "",
    "```",
    "echo not-a-test-command",
    "```"
  ].join("\n");
  const found = publishedTestCommands(fixture);

  // Every command is captured WHOLE — including the forms that must later be refused.
  for (const expected of [
    'node --test "a/*.test.js"',
    "node --test a/dir",
    'node --test "b/*.test.js"',
    "node --test b/dir",
    "node --test tilde/valid.test.js",
    "node --test indented/block.test.js",
    "node --test prose/one.test.js",
    "node --test pair/first.test.js",
    "node --test pair/second.test.js",
    "node --test\ttab/separated.test.js",
    "node --test multi/one.test.js multi/two.test.js",
    "NODE_OPTIONS='--require ./x.cjs' node --test prefixed/one.test.js",
    "cd some/dir && node --test suffixed/one.test.js",
    // inside a fence a backtick is shell syntax, so the substitution stays in the unit
    "node --test `printf %s --test-reporter=x` fenced/subst.test.js",
    // outside a fence, ``…`` is ONE CommonMark span, not two delimiters
    "node --test double/span.test.js",
    // a blockquote prefix is container noise, never shell text
    "node --test blockquoted/fence.test.js",
    // A continuation can split the command anywhere, so detection must run on logical lines,
    // not physical ones. Each is emitted whole WITH the backslash restored, so the grammar
    // refuses it: a command assembled across lines is not a self-contained published command.
    // The third is the dangerous shape — its first half alone is valid and green, so a
    // per-physical-line guard would have executed it and certified a command that exits 1.
    // (idea skills-cli-install-path, review round 13.)
    "node --test cont/split-args.test.js \\",
    "node --test cont/split-word.test.js \\",
    "node --test cont/valid-half.test.js --test-reporter=does-not-exist \\"
  ]) {
    assert.ok(found.has(expected), `extractor missed or fragmented: ${JSON.stringify(expected)}`);
  }
  assert.equal([...found].some((c) => c.includes("echo")), false);

  // …and the surrounding-context forms are refused rather than executed as fragments.
  assert.equal(SUPPORTED_COMMAND.test("NODE_OPTIONS='--require ./x.cjs' node --test prefixed/one.test.js"), false);
  assert.equal(SUPPORTED_COMMAND.test("cd some/dir && node --test suffixed/one.test.js"), false);
  assert.equal(SUPPORTED_COMMAND.test("node --test `printf x.test.js`"), false);
  assert.equal(SUPPORTED_COMMAND.test("node --test `printf %s --test-reporter=x` fenced/subst.test.js"), false);
  assert.equal(SUPPORTED_COMMAND.test("node --test double/span.test.js"), true);
  // a shell continuation is not a self-contained command
  assert.equal(SUPPORTED_COMMAND.test('node --test "a/*.test.js" \\'), false);
  assert.equal(SUPPORTED_COMMAND.test('node --test "a/*.test.js"'), true);
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
    assert.ok(
      SUPPORTED_COMMAND.test(command),
      `published command is not a bare \`node --test <targets>\` form, so this guard refuses ` +
        `to interpret it rather than execute a fragment of it: ${command}`
    );
    // A test runner spawned from inside a test runner inherits NODE_TEST_CONTEXT and reports
    // through the parent instead of to stdout, leaving nothing to read. Strip it so the child
    // behaves exactly as it does for a person typing the published command.
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith("NODE_TEST")) delete env[key];
    }
    // Run it through a real shell so quoting, whitespace and any trailing character are
    // interpreted exactly as they are for a person who copies the line and presses enter.
    let out;
    try {
      out = execFileSync("/bin/sh", ["-c", command], {
        cwd: root,
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      out = `${error.stdout || ""}${error.stderr || ""}`;
      assert.fail(`published command failed: ${command}\n${out.slice(-400)}`);
    }
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
