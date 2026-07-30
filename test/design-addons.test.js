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
// PUBLICATION CONTRACT — and why this stopped being a hand-written scanner.
//
// Seventeen cycles reconstructed markdown-plus-shell with regexes, and every one of them was
// beaten by a shape the previous one had not imagined: fences, tilde fences, fake closes,
// blockquotes, continuations at four different token boundaries, node flags between `node`
// and `--test`, and finally markdown RENDERING itself — `node \--test x`, `node --**test** x`
// and `node&#32;--test x` all render as a runnable command that no source-text scanner sees.
// Round 16 had four independent reviewers and all four reached the same conclusion: the set
// of ways markdown can spell a command is open, so no scanner over source text can close it.
//
// So the guard no longer approximates what a reader copies. It asks a real CommonMark parser,
// and the contract it enforces is narrow enough to be checkable:
//
//   A published verification command MUST be the whole text of a single code node — one
//   inline code span, or one line of one code block — in the canonical `node --test <targets>`
//   form. Anything else that renders as such a command is REFUSED by name.
//
// What the parser buys that no line heuristic could: a `>` is a blockquote marker or literal
// content depending only on the container, and the parser is the thing that knows. A fence
// INSIDE a blockquote yields the bare command (correct to run); a `>` INSIDE a fence stays in
// the literal (correctly refused). Cycle 16 stripped both and executed the mutated text —
// certifying a line that, copied out, redirects into a file named `node`.
// (idea skills-cli-install-path, review round 16: codex-1, agy-1, hermes-1, kimi-1.)
const { Parser } = require("commonmark");

// Detection stays deliberately BROADER than acceptance. Every false green in seventeen rounds
// came from the two being the same pattern: whatever the grammar would refuse, detection also
// failed to see, so the command was skipped — and skipping reads as success.
// DETECTION READS THE SHELL'S WORDS, NOT THE PAGE'S CHARACTERS.
//
// The page shows characters; the shell builds words out of them. `node --\test x`,
// `nod\e --test x` and `node --te''st x` contain no literal `--test` or no literal `node`, and
// each runs exactly as `node --test x` when copied. Detection that matched the characters
// skipped all three — and skipping reads as success, which is the same failure this guard has
// had at every layer. (round 18, kimi-1.)
//
// Removing the shell's quoting characters is a cheap, fail-closed view of that word list: it
// can only reveal a command, never conceal one. A substitution can produce ANY word, so a unit
// naming `node` that also carries a backtick or `$` is treated as a candidate on that ground
// alone — those characters are already excluded by the grammar, so the refusal path exists;
// only detection had to reach them.
//
// Case-insensitive on both tokens: macOS mounts a case-insensitive filesystem, so `Node` runs;
// and `--TEST` reaches node itself, which rejects it. SUPPORTED_COMMAND stays exact, so every
// one of these is detected and then REFUSED rather than skipped. (round 17, hermes-1.)
const shellWordView = (s) => s.replace(/[\\'"]/g, "");
// Word-building constructs, in ONE place. Cycle 26 first added brace expansion to the code
// pass only and left the prose pass with its own hard-coded copy of the older test — the exact
// asymmetry round 19 had already been raised for. A predicate used by both passes cannot drift
// between them. (round 20, codex-1.)
const buildsWords = (s) => /[`$]/.test(s) || /\{[^{}]*(?:,|\.\.)[^{}]*\}/.test(s);
const mentionsATestCommand = (s) => {
  const words = shellWordView(s);
  const named = /\bnode\b/i.test(s) || /\bnode\b/i.test(words);
  const flagged = /--test\b/i.test(s) || /--test\b/i.test(words);
  if (named && flagged) return true;
  // A substitution or expansion can produce ANY word — including the BINARY NAME, which cycle
  // 23 assumed would always be spelled out somewhere. It is not: `n$(printf '')ode --test x`
  // and `n${PATH#"$PATH"}ode --test x` contain no `node` at all and run as exactly that.
  // So one recognisable half plus a word-building construct is enough to look; the grammar,
  // which excludes those characters outright, then refuses. (round 19, codex-1.)
  //
  // Brace expansion is a word-building construct that needs NONE of those characters:
  // `n{o..o}de --test x` and `node --{test..test} x` build the missing word out of plain
  // letters, and both ran for a reader while the guard stayed green. Cycle 24's rationale was
  // that a construct can produce either word; its implementation only knew two constructs.
  // (round 20, codex-1.)
  //
  // A canonical command whose TARGET uses braces — `node --test "test/{a,b}/*.test.js"` — is
  // unaffected: both command words are literal there, so it is already a candidate on the line
  // above, and the executor decides whether the target works.
  return buildsWords(s) && (named || flagged);
};

// Inside a code node there is no container left to interpret, so splicing a backslash
// continuation is exactly what a shell does. A unit assembled from more than one physical
// line is emitted WITH its backslash so the grammar refuses it: the contract requires one
// line, and a reader who copies two is outside it.
function codeNodeUnits(literal) {
  const out = [];
  let parts = [];
  for (const line of String(literal).split("\n")) {
    const continues = /\\$/.test(line);
    parts.push(continues ? line.slice(0, -1) : line);
    if (continues) continue;
    out.push({ text: parts.join(""), spliced: parts.length > 1 });
    parts = [];
  }
  if (parts.length > 0) out.push({ text: parts.join(""), spliced: true });
  return out;
}

// Remove raw-HTML markup, keeping the text a reader actually sees. A regex cannot do this:
// `<span title="1 > 0">` ends at the SECOND `>`, and `<!-- a > b -->` at `-->`. Getting that
// wrong left debris inside a word and made a rendered command invisible (round 18, codex-1).
//
// An unterminated `<` is kept as literal text rather than swallowing the rest of the block:
// keeping it can only produce an extra refusal, dropping it could hide a command.
function visibleTextOfHtml(html) {
  const skipTo = (from, close) => {
    const at = html.indexOf(close, from);
    return at === -1 ? -1 : at + close.length;
  };
  let out = "";
  let i = 0;
  while (i < html.length) {
    if (html[i] !== "<") {
      out += html[i];
      i += 1;
      continue;
    }
    let next = -1;
    // A script, style or template BODY is never shown either, wherever it sits. Skipping only
    // blocks that START with one left a script nested in a <div> policed as page text.
    // (round 18, kimi-1.)
    const opens = /^<\s*(script|style|template)\b/i.exec(html.slice(i));
    if (opens) {
      const close = new RegExp(`</\\s*${opens[1]}\\s*>`, "i").exec(html.slice(i));
      next = close ? i + close.index + close[0].length : -1;
      if (next !== -1) {
        i = next;
        continue;
      }
    }
    if (html.startsWith("<!--", i)) next = skipTo(i + 4, "-->");
    else if (html.startsWith("<![CDATA[", i)) next = skipTo(i + 9, "]]>");
    else if (html.startsWith("<?", i)) next = skipTo(i + 2, "?>");
    else {
      let j = i + 1;
      let quote = null;
      while (j < html.length) {
        const c = html[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === ">") {
          break;
        }
        j += 1;
      }
      next = j < html.length ? j + 1 : -1;
    }
    if (next === -1) {
      out += html[i];
      i += 1;
      continue;
    }
    i = next;
  }
  return out;
}

// Returns an ARRAY of { command, origin } occurrences, origin being "code" or "prose".
//
// An array, not a map keyed by text: the same command string can be published twice with
// different provenance, and a map kept only one of them — a valid code occurrence masked an
// invalid prose one, and the contract went unenforced (round 17, codex-1).
//
// Two passes, because a reader has two ways to acquire a command:
//
//  1. COPY A CODE ELEMENT. A code node's literal is exactly what they get.
//  2. READ THE RENDERED PAGE. What they see is the block's VISIBLE text — escapes, entities
//     and emphasis resolved, HTML TAGS REMOVED (a tag is markup; it is not on the page), and
//     inline code spans included, because a span is visible text too.
//
// The second pass is where a command can be synthesized from parts belonging to no single code
// node: `node ` from prose plus `--test` from a span, or `no<span></span>de`, whose tag
// vanishes on render. Neither piece is a command; the visible line is. So the question is not
// which bucket a fragment landed in, but: DO BOTH TOKENS OF THE OCCURRENCE COME FROM ONE AND
// THE SAME CODE NODE? If they do, a single copyable element holds the whole command and the
// code pass already has it. If they do not, no such element exists, and it is refused.
//
// Occurrence-level on purpose. Requiring the command to be the whole visible LINE would have
// been simpler and would have broken two shipped documents that legitimately write `Verify: `
// before a span, and a checklist item with the span in parentheses. In both, the command is
// wholly inside one span — which is the property that actually matters.
// (idea skills-cli-install-path, review round 17, codex-1.)
function publishedTestCommands(markdown) {
  const occurrences = [];
  const seen = new Set();
  const record = (command, origin) => {
    const key = origin + " " + command;
    if (seen.has(key)) return;
    seen.add(key);
    occurrences.push({ command, origin });
  };
  const addCode = ({ text, spliced }) => {
    if (!mentionsATestCommand(text)) return;
    record(spliced ? text.trim() + " \\" : text.trim(), "code");
  };

  // Visible text of the current block, plus — per character — which code node it came from
  // (-1 for anything not inside one).
  let visible = "";
  let owners = [];
  const emit = (str, owner) => {
    visible += str;
    for (let i = 0; i < str.length; i += 1) owners.push(owner);
  };
  const flushVisible = () => {
    let lineStart = 0;
    for (const line of visible.split("\n")) {
      const from = lineStart;
      lineStart += line.length + 1;

      // The rendered page is read with the SHELL'S WORDS here too. Cycle 23 taught the code
      // pass to do that and left this one matching raw characters, so the prose arm of the very
      // same finding stayed invisible: `Run node --\test x now.` renders with the backslash
      // intact, the reader copies it, and the shell drops it. (round 19, kimi-1.)
      //
      // The word view is built with an index map back into the raw line, so an occurrence found
      // in it can still be attributed to the code node — or to no code node — that produced it.
      let view = "";
      const toRaw = [];
      for (let i = 0; i < line.length; i += 1) {
        if (line[i] === "\\" || line[i] === "'" || line[i] === '"') continue;
        view += line[i];
        toRaw.push(i);
      }

      // Which code nodes contribute to this line, and does any ONE of them hold a whole command
      // on its own? Such a node publishes its command properly and the code pass already has
      // it, so the synthesis rule must not fire on it a second time.
      //
      // But it must be EXCLUDED, not used to silence the line. Cycle 25 suppressed the rule
      // line-wide, so one correct span made a second, substitution-built command in the same
      // sentence invisible — and a soft-wrapped paragraph is one line, so ordinary prose
      // wrapping was enough to trigger it. What remains after removing those spans is what the
      // rule looks at. (round 20, kimi-1.)
      const segments = new Map();
      for (let i = 0; i < line.length; i += 1) {
        const owner = owners[from + i];
        if (owner === -1) continue;
        segments.set(owner, (segments.get(owner) || "") + line[i]);
      }
      const publishing = new Set(
        [...segments.entries()].filter(([, text]) => mentionsATestCommand(text)).map(([id]) => id)
      );
      let residue = "";
      for (let i = 0; i < line.length; i += 1) {
        if (!publishing.has(owners[from + i])) residue += line[i];
      }

      for (const m of view.matchAll(/\bnode\b/gi)) {
        const rest = view.slice(m.index);
        const flag = rest.match(/--test\b/i);
        if (!flag) continue;
        const nodeOwner = owners[from + toRaw[m.index]];
        const flagOwner = owners[from + toRaw[m.index + flag.index]];
        if (nodeOwner !== -1 && nodeOwner === flagOwner) continue;
        record(line.slice(toRaw[m.index]).trim(), "prose");
      }

      // A substitution can produce either word, so neither may be spelled out anywhere. One
      // recognisable half plus a word-building construct is enough — unless a single code node
      // already holds the whole command, which is the supported way to publish one.
      if (buildsWords(residue) && mentionsATestCommand(residue)) {
        record(residue.trim(), "prose");
      }
    }
    visible = "";
    owners = [];
  };

  const walker = new Parser().parse(markdown).walker();
  let ev;
  let codeNodeId = 0;
  // Alt text renders as a picture, not as text. A command there is published to nobody, so it
  // is neither run nor policed — an earlier revision EXECUTED one, which is the opposite of
  // what a guard built to distrust invisible text should do. (round 17, kimi-1.)
  let insideImage = 0;
  while ((ev = walker.next())) {
    const { node, entering } = ev;
    if (node.type === "image") {
      insideImage += entering ? 1 : -1;
      continue;
    }
    if (!entering) {
      if (node.type === "paragraph" || node.type === "heading") flushVisible();
      continue;
    }
    if (insideImage > 0) continue;
    switch (node.type) {
      case "code": {
        // An inline span is BOTH a copyable element and visible text, so it joins both passes.
        const id = codeNodeId++;
        for (const unit of codeNodeUnits(node.literal)) addCode(unit);
        emit(node.literal, id);
        break;
      }
      case "code_block":
        // A block is its own container; its literal is not part of a paragraph's visible text.
        for (const unit of codeNodeUnits(node.literal)) addCode(unit);
        break;
      case "text":
        // GFM strikethrough is not in CommonMark, so `node --t~~e~~st x` stays one literal
        // here while GitHub, npm and editor previews render — and copy — `node --test x`.
        // Dropping every `~~` run cannot hide a command, only reveal one, so the gap is closed
        // in the fail-closed direction rather than by adopting a second dialect.
        // (round 17, kimi-1.)
        emit(node.literal.replace(/~~/g, ""), -1);
        break;
      case "softbreak":
        // CommonMark 6.7: a soft break renders as a SPACE. Emitting a newline split one
        // copyable line into two the scanner judged separately, so a command spanning a soft
        // break was neither run nor refused — it was invisible. (round 17, hermes-1.)
        emit(" ", -1);
        break;
      case "linebreak":
        // A hard break is a real <br>: the reader sees two lines and copies two lines, which
        // is not a published one-line command. It stays a break.
        emit("\n", -1);
        break;
      case "html_inline":
        // An inline raw-HTML node is ONE complete piece of markup — a tag, a comment, a
        // declaration — so the whole literal is dropped. It is never page text.
        //
        // It used to be tag-stripped with /<[^>]*>/, which cannot tell a tag terminator from a
        // `>` inside a quoted attribute: `no<span title="1 > 0"></span>de` left attribute
        // debris between `no` and `de`, the word `node` never formed, and the command went
        // undetected. Dropping the node needs no such judgement. (round 18, codex-1.)
        emit("", -1);
        break;
      case "html_block": {
        // A block carries markup AND the text between it, so the markup has to be removed
        // rather than the node dropped — with a scanner that understands quoted attributes and
        // comments, for the same reason.
        //
        // Script and style bodies are the exception in the other direction: their CONTENT is
        // never shown either, so policing it fails the build over text no reader can reach.
        // (round 17, kimi-1.)
        emit(visibleTextOfHtml(node.literal), -1);
        flushVisible();
        break;
      }
      default:
        break;
    }
  }
  flushVisible();
  return occurrences;
}

// The only shape this guard will execute: the command, its targets, and nothing else. Every
// other published form — an environment prefix, a `cd … &&`, a command substitution, a pipe,
// a trailing shell operator — is REFUSED by name rather than guessed at or silently skipped.
// Narrow and fail-closed beats broad and approximate: six revisions of a hand-written shell
// parser were wrong in both directions at once.
// (idea skills-cli-install-path, review rounds 03-09.)
const SUPPORTED_COMMAND = /^node\s+--test\s+[^`;|&<>$\\]+$/;

test("the published-command extractor captures whole commands, never fragments", () => {
  // A WELL-FORMED document. The previous fixture was authored for a line scanner, so its
  // structure was accidental: a fence that never closed swallowed the blockquote cases below
  // it, and the assertions still passed because the scanner did not model containers either.
  // A real parser exposed that immediately. Every block here is closed where it looks closed.
  const fixture = [
    'Inline valid: `node --test "a/*.test.js"`',
    "Inline broken: `node --test a/dir`",
    "",
    "```bash",
    'node --test "b/*.test.js"',
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
    "node --no-warnings --test flags/before-test.test.js",
    "node -r ./setup.js --test flags/require-hook.test.js",
    "> node --test gt-is-content.test.js",
    "```",
    "",
    "```bash",
    "node --test \\",
    "cont/split-args.test.js",
    "```",
    "",
    "```bash",
    "node \\",
    "  --test cont/split-before-flag.test.js",
    "```",
    "",
    "```bash",
    "node --te\\",
    "st cont/split-inside-flag.test.js",
    "```",
    "",
    "```bash",
    "no\\",
    "de --test cont/split-word.test.js",
    "```",
    "",
    "```bash",
    "node --test cont/valid-half.test.js \\",
    "--test-reporter=does-not-exist",
    "```",
    "",
    "```bash",
    "node\\",
    "  --test cont/no-space-before-backslash.test.js",
    "```",
    "",
    "```bash",
    "node\\",
    "--test cont/zero-width.test.js",
    "```",
    "",
    "> ```bash",
    "> node --test blockquoted/fence.test.js",
    "> ```",
    "",
    "> ```bash",
    "> node \\",
    ">   --test cont/blockquote.test.js",
    "> ```",
    "",
    "> > ```bash",
    "> > nod\\",
    "> > e --te\\",
    "> > st cont/blockquote-tokens.test.js",
    "> > ```",
    "",
    "Double-backtick span: ``node --test double/span.test.js``.",
    "",
    "node \\--test rendered/escape.test.js",
    "",
    "node --**test** rendered/emphasis.test.js",
    "",
    "Run node --\\test prose/escape-flag.test.js now.",
    "",
    "Run nod\\e --test prose/escape-binary.test.js now.",
    "",
    "Run node --te''st prose/quote-splice.test.js now.",
    "",
    "Run node --TEST prose/upper-flag.test.js now.",
    "",
    "Run $(echo n)ode --test prose/subst-binary.test.js now.",
    "",
    "Run n{o..o}de --test prose/brace-binary.test.js now.",
    "",
    "Run node --{test..test} prose/brace-flag.test.js now.",
    "",
    'Verify: `node --test "fixture/shared-span.test.js"` — or run n$(printf \'\')ode --test shared/line.test.js instead.',
    "",
    "Run `node --test \"fixture/with-dollar.test.js\"` with `$FOO` set.",
    "",
    "node `--test` mixed/span.test.js",
    "",
    "no<span></span>de --test html/inline-node.test.js",
    "",
    "node --te<span></span>st html/inline-flag.test.js",
    "",
    "<div>no<span></span>de --test html/block.test.js</div>",
    "",
    "node \\--test dup/same.test.js",
    "",
    "`node --test dup/same.test.js`",
    "",
    "node --t~~e~~st gfm/strike-word.test.js",
    "",
    "node ~~--~~test gfm/strike-flag.test.js",
    "",
    "<!-- note: node --test invisible/comment.test.js -->",
    "",
    "<script>",
    'var command = "node --test invisible/script.test.js";',
    "</script>",
    "",
    "![`node --test invisible/alt.test.js`](picture.png)",
    "",
    "Run node",
    "--test softbreak/one.test.js",
    "",
    "Hard break keeps two lines: node  ",
    "--test hardbreak/one.test.js",
    "",
    "`Node --test case/upper.test.js`",
    "",
    "Escaped flag: `node --\\test escape/flag.test.js`",
    "",
    "Escaped binary: `nod\\e --test escape/binary.test.js`",
    "",
    "Quote splice: `node --te''st quote/splice.test.js`",
    "",
    "Uppercase flag: `node --TEST case/flag.test.js`",
    "",
    "```bash",
    "node --t`echo e`st subst/flag.test.js",
    "n$(printf '')ode --test subst/binary.test.js",
    'n${PATH#"$PATH"}ode --test expansion/binary.test.js',
    "n{o..o}de --test brace/binary.test.js",
    "node --{test..test} brace/flag.test.js",
    "```",
    "",
    "<div>",
    '<script> var c = "node --test invisible/nested-script.test.js"; </script>',
    "</div>",
    "",
    'no<span title="1 > 0"></span>de --test quoted/gt-inline.test.js',
    "",
    "node --t<!-- a > b -->est quoted/gt-comment.test.js",
    "",
    '<div title="a > b">no<span></span>de --test quoted/gt-block.test.js</div>',
    "",
    "```",
    "echo not-a-test-command",
    "```",
  ].join("\n");
  const occurrences = publishedTestCommands(fixture);
  const found = new Set(occurrences.map((o) => o.command));
  const originOf = (command) =>
    occurrences.filter((o) => o.command === command).map((o) => o.origin).sort().join("+");

  // Every command is captured WHOLE — including the forms that must later be refused.
  for (const expected of [
    'node --test "a/*.test.js"',
    "node --test a/dir",
    'node --test "b/*.test.js"',
    // The prompt is CONTENT of the code node, so it is part of what the reader copies. The
    // guard no longer strips it into something runnable — it refuses the line as published.
    "$ node --test b/dir",
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
    // round 16 (agy-1): a node flag between the two tokens matched no detection pattern, so
    // the command was skipped entirely — and skipping reads as success
    "node --no-warnings --test flags/before-test.test.js",
    "node -r ./setup.js --test flags/require-hook.test.js",
    // round 16 (kimi-1): inside a fence the ">" is CONTENT, and the reader copies it. Cycle 16
    // stripped it and ran the remainder, certifying a line that redirects into a file named
    // "node". The parser keeps it, and the grammar refuses it.
    "> node --test gt-is-content.test.js",
    // A continuation is emitted with its backslash restored, so the grammar refuses it: the
    // contract is one code node, one line. The split can fall at any token boundary, and the
    // last of these has NO separator at all — the shape that defeated every prior detector.
    "node --test cont/split-args.test.js \\",
    "node   --test cont/split-before-flag.test.js \\",
    "node --test cont/split-inside-flag.test.js \\",
    "node --test cont/split-word.test.js \\",
    "node --test cont/valid-half.test.js --test-reporter=does-not-exist \\",
    "node  --test cont/no-space-before-backslash.test.js \\",
    "node--test cont/zero-width.test.js \\",
    // a blockquote CONTAINER is consumed by the parser, so the reader copies the bare command
    "node --test blockquoted/fence.test.js",
    "node   --test cont/blockquote.test.js \\",
    "node --test cont/blockquote-tokens.test.js \\",
    // outside a fence, ``…`` is ONE CommonMark span, not two delimiters
    "node --test double/span.test.js",
    // round 16 (codex-1): markdown RENDERING synthesizes these. No scanner over source text
    // sees them; the reader copies a runnable command off the page.
    "node --test rendered/escape.test.js",
    "node --test rendered/emphasis.test.js",
    // round 19 (kimi-1): cycle 23 taught the CODE pass to read the shell's words and left the
    // PROSE pass matching raw characters, so the prose arm of the same finding stayed invisible.
    // The backslash survives rendering into the copy; the shell drops it.
    "node --\\test prose/escape-flag.test.js now.",
    "nod\\e --test prose/escape-binary.test.js now.",
    "node --te''st prose/quote-splice.test.js now.",
    "node --TEST prose/upper-flag.test.js now.",
    // and a substitution can build the binary in prose too, where no half is spelled out
    "Run $(echo n)ode --test prose/subst-binary.test.js now.",
    // round 17 (codex-1): the command belongs to no single code node — half of it is prose and
    // half a span, or a tag splits a token and vanishes on render. Each piece is harmless; the
    // visible line is a runnable, broken command.
    "node --test mixed/span.test.js",
    "node --test html/inline-node.test.js",
    "node --test html/inline-flag.test.js",
    "node --test html/block.test.js",
    // round 17 (kimi-1): GFM strikethrough is not CommonMark, so this parser leaves the run
    // literal while GitHub, npm and editor previews render — and copy — a clean command.
    "node --test gfm/strike-word.test.js",
    "node --test gfm/strike-flag.test.js",
    // round 17 (hermes-1): a soft break renders as a space, so this is ONE copyable line to a
    // reader. Emitting a newline had split it into two the scanner judged separately, and the
    // command was neither run nor refused.
    "node --test softbreak/one.test.js",
    // round 18 (codex-1): /<[^>]*>/ cannot tell a tag terminator from a `>` inside a quoted
    // attribute, nor from one inside a comment. The debris it left inside the word kept the
    // command invisible. An inline node is dropped whole; a block is scanned with quote and
    // comment awareness.
    "node --test quoted/gt-inline.test.js",
    "node --test quoted/gt-comment.test.js",
    "node --test quoted/gt-block.test.js",
    // detection is case-insensitive so the grammar gets to refuse this rather than skip it —
    // macOS is case-insensitive, so `Node` really runs there
    "Node --test case/upper.test.js",
    // round 18 (kimi-1): the page shows characters, the shell builds words. None of these
    // contains a literal `node --test`, and every one of them runs as exactly that when
    // copied. Detection now reads the shell's word view, so each is seen and then refused.
    "node --\\test escape/flag.test.js",
    "nod\\e --test escape/binary.test.js",
    "node --te''st quote/splice.test.js",
    "node --TEST case/flag.test.js",
    "node --t`echo e`st subst/flag.test.js",
    // round 19 (codex-1): the substitution builds the BINARY NAME, so `node` is not spelled
    // anywhere. Cycle 23 had gated the substitution rule behind seeing it.
    "n$(printf '')ode --test subst/binary.test.js",
    'n${PATH#"$PATH"}ode --test expansion/binary.test.js',
    // round 20 (codex-1): brace expansion builds either word out of plain letters — no
    // backslash, quote, backtick or dollar anywhere. Cycle 24's rationale was that a construct
    // can produce either word; its implementation knew only two constructs.
    "n{o..o}de --test brace/binary.test.js",
    "node --{test..test} brace/flag.test.js",
    "Run n{o..o}de --test prose/brace-binary.test.js now.",
    "Run node --{test..test} prose/brace-flag.test.js now.",
  ]) {
    assert.ok(found.has(expected), `extractor missed or fragmented: ${JSON.stringify(expected)}`);
  }

  // Provenance is recorded, because the contract turns on it: the same text is runnable when
  // published in a code node and refused when it merely renders out of prose.
  assert.equal(originOf('node --test "a/*.test.js"'), "code");
  assert.equal(originOf("node --test rendered/escape.test.js"), "prose");
  assert.equal(originOf("node --\\test prose/escape-flag.test.js now."), "prose");
  assert.equal(originOf("Run $(echo n)ode --test prose/subst-binary.test.js now."), "prose");

  // round 20 (kimi-1): a correctly published span on the same line must NOT silence the
  // synthesis rule for the rest of it. Cycle 25 suppressed the whole line, and since a
  // soft-wrapped paragraph is one line, ordinary prose wrapping was enough to hide a second,
  // substitution-built command. The span is excluded; what remains is still judged.
  const shared = occurrences.filter((o) => o.command.includes("shared/line.test.js"));
  assert.ok(shared.length > 0, "a substitution-built command sharing a line with a valid span must still be seen");
  assert.ok(shared.every((o) => o.origin === "prose"), "…and it is not a published code node");
  assert.equal(originOf('node --test "fixture/shared-span.test.js"'), "code");
  // …while a line that merely mentions an unrelated `$FOO` beside a properly published command
  // stays untouched: the residue names neither half.
  assert.equal(originOf('node --test "fixture/with-dollar.test.js"'), "code");
  assert.equal(originOf("node --test rendered/emphasis.test.js"), "prose");
  // A command wholly inside one span keeps its code provenance even mid-sentence — that is
  // what two shipped documents rely on, and the reason this rule is occurrence-level.
  assert.equal(originOf("node --test prose/one.test.js"), "code");
  // …and a valid code occurrence must not mask an invalid prose one with identical text: both
  // are recorded, so the contract is enforced on the prose one (round 17, codex-1).
  assert.equal(originOf("node --test dup/same.test.js"), "code+prose");
  // a tag is markup, not page text: stripping it is what exposes the split token
  assert.equal(originOf("node --test html/inline-node.test.js"), "prose");
  assert.equal(originOf("node --test html/block.test.js"), "prose");
  assert.equal(SUPPORTED_COMMAND.test("Node --test case/upper.test.js"), false);
  // the shell builds these words; the grammar refuses every one of them on sight
  assert.equal(SUPPORTED_COMMAND.test("node --\\test escape/flag.test.js"), false);
  assert.equal(SUPPORTED_COMMAND.test("nod\\e --test escape/binary.test.js"), false);
  assert.equal(SUPPORTED_COMMAND.test("node --te''st quote/splice.test.js"), false);
  assert.equal(SUPPORTED_COMMAND.test("node --TEST case/flag.test.js"), false);
  assert.equal(SUPPORTED_COMMAND.test("node --t`echo e`st subst/flag.test.js"), false);
  assert.equal(SUPPORTED_COMMAND.test("n$(printf '')ode --test subst/binary.test.js"), false);
  assert.equal(SUPPORTED_COMMAND.test('n${PATH#"$PATH"}ode --test expansion/binary.test.js'), false);
  // A HARD break is a real line break: the reader sees and copies two lines, which is not a
  // published one-line command. It must not be spliced into one. (round 17, hermes-1.)
  assert.equal(found.has("node --test hardbreak/one.test.js"), false);
  // The fenced line that is not a command at all is not captured. (Checked by identity, not by
  // searching for "echo": a command CAN legitimately contain the word, as the substitution
  // probe above does.)
  assert.equal(found.has("echo not-a-test-command"), false);

  // Text no reader can reach is neither run nor policed. Failing the build over a maintenance
  // comment is noise; EXECUTING a command out of image alt text is the opposite of what a
  // guard built to distrust invisible text should do. (round 17, kimi-1.)
  for (const invisible of [
    "node --test invisible/comment.test.js",
    "node --test invisible/script.test.js",
    "node --test invisible/alt.test.js",
    "node --test invisible/nested-script.test.js",
  ]) {
    assert.equal(
      found.has(invisible),
      false,
      `invisible text must not be treated as a published command: ${invisible}`
    );
  }

  // …and the surrounding-context forms are refused rather than executed as fragments.
  assert.equal(SUPPORTED_COMMAND.test("NODE_OPTIONS='--require ./x.cjs' node --test prefixed/one.test.js"), false);
  assert.equal(SUPPORTED_COMMAND.test("cd some/dir && node --test suffixed/one.test.js"), false);
  assert.equal(SUPPORTED_COMMAND.test("$ node --test b/dir"), false);
  assert.equal(SUPPORTED_COMMAND.test("> node --test gt-is-content.test.js"), false);
  assert.equal(SUPPORTED_COMMAND.test("node --test `printf x.test.js`"), false);
  assert.equal(SUPPORTED_COMMAND.test("node --test `printf %s --test-reporter=x` fenced/subst.test.js"), false);
  assert.equal(SUPPORTED_COMMAND.test("node --test double/span.test.js"), true);
  // a shell continuation is not a self-contained command
  assert.equal(SUPPORTED_COMMAND.test('node --test "a/*.test.js" \\'), false);
  assert.equal(SUPPORTED_COMMAND.test('node --test "a/*.test.js"'), true);
  // a node flag before --test is detected, then refused — never silently skipped
  assert.equal(SUPPORTED_COMMAND.test("node --no-warnings --test flags/before-test.test.js"), false);
  assert.equal(SUPPORTED_COMMAND.test("node -r ./setup.js --test flags/require-hook.test.js"), false);
});

test("every `node --test` command a shipped file publishes runs tests and passes", () => {
  const { execFileSync } = require("node:child_process");
  const published = [];
  const withFile = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".md")) continue;
      for (const occurrence of publishedTestCommands(fs.readFileSync(full, "utf8"))) {
        published.push(occurrence);
        withFile.set(`${occurrence.origin} ${occurrence.command}`, path.relative(root, full));
      }
    }
  };
  walk(path.join(root, "skills"));
  const distinct = new Set(published.map((o) => o.command));
  assert.ok(distinct.size >= 2, `expected both published commands, saw ${distinct.size}`);

  const ran = new Set();
  for (const { command, origin } of published) {
    const where = withFile.get(`${origin} ${command}`) || "a shipped file";
    // The publication contract first: a command must BE a code node, not merely render like
    // one. A canonical command that reaches the reader out of prose would run green here and
    // teach that the form is supported, so it is refused on provenance before form.
    assert.equal(
      origin,
      "code",
      `a verification command must be published as its own code span or code block, so that ` +
        `one copyable element holds all of it. This one is synthesized by rendering — from ` +
        `escapes, entities, emphasis, stripped HTML tags, or prose spliced onto a span — and ` +
        `no reader can tell it from documentation text. In ${where}: ${command}`
    );
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
    if (ran.has(command)) continue;
    ran.add(command);
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
