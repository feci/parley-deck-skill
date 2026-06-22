#!/usr/bin/env node

"use strict";

/*
 * parley-tracker `validate` — readiness / lint tool for ticket markdown files.
 *
 * Dependency-free (Node built-ins only). Enforces the no-assumption gap-scan
 * from FINAL.md S B.4 plus the acceptance-criteria rules from S B.3 and the
 * three-audience template schema from S B.2:
 *
 *   1. frontmatter present + parseable
 *   2. required fields non-empty (id, type, title, status, parent
 *      resolves-or-n/a, dod refs exist); the full canonical schema
 *      (assignee, priority, labels, worktree, mirror-owned) present +
 *      populated-or-n/a; canonical_source populated for story/subtask
 *   3. type/status/priority enums valid
 *   4. every AC has an audience tag AND (a Given/When/Then scenario OR a
 *      non-empty "Verify:" command); [NFR]-tagged ACs must carry Verify:
 *   5. at least one happy-path (non-edge) AC AND at least one edge/error/
 *      offline AC OR an explicit "n/a (reason)"
 *   6. "[A] Agent directives" section non-empty with >= 1 "Do not"; the
 *      "At a glance", "[B] Business", "[T] Technical" sections non-empty
 *      (n/a (reason) accepted)
 *   7. files/apis/arch each populated or "n/a"
 *   8. no unreplaced <...> placeholder leaks in any required field, section,
 *      or acceptance criterion (n/a (reason) waives a slot)
 *
 * Usage:
 *   node validate.js <ticketfile.md>
 *   node validate.js --strict "<glob>" ["<glob>" ...]
 *   node validate.js --strict --dir <tickets-dir>
 *
 * Exit 0 on pass; non-zero with field-level messages on fail.
 *
 * Vendor / tracker / runtime AGNOSTIC: no tracker-specific fields, no model
 * ids, no personal paths. IDs, parents, file globs are all placeholders the
 * ticket author fills in.
 */

const fs = require("node:fs");
const path = require("node:path");

/* ------------------------------------------------------------------ enums */

const ENUMS = {
  type: ["epic", "story", "subtask"],
  status: [
    "draft",
    "ready",
    "in-progress",
    "review",
    "done",
    "blocked",
    "paused",
    "dropped"
  ],
  priority: ["p0", "p1", "p2", "p3"]
};

// Required scalar frontmatter fields that must be present and non-empty.
const REQUIRED_FIELDS = ["id", "type", "title", "status", "parent"];

// The full canonical frontmatter the templates prescribe. Each must be present
// and either populated or an explicit n/a (these may legitimately be n/a):
//   assignee, priority, labels, worktree, mirror-owned. canonical_source is
//   additionally required (populated, not n/a) for story/subtask.
const CANONICAL_OR_NA_FIELDS = [
  "assignee",
  "priority",
  "labels",
  "worktree",
  "mirror-owned"
];

// Fields that must be either populated or an explicit n/a.
const POPULATED_OR_NA_FIELDS = ["files", "apis", "arch"];

// Body sections that must be present and non-empty (n/a (reason) accepted).
const REQUIRED_SECTIONS = [
  { field: "## At a glance", names: ["at a glance"] },
  { field: "## [B] Business", names: ["b business", "business"] },
  { field: "## [T] Technical", names: ["t technical", "technical"] }
];

// Audience tags an acceptance criterion may carry.
const AUDIENCE_TAGS = ["B", "T", "A"];

// Words that suggest an edge/error/offline acceptance criterion.
const EDGE_KEYWORDS = [
  "edge",
  "error",
  "offline",
  "failure",
  "fail",
  "invalid",
  "empty",
  "missing",
  "timeout",
  "denied",
  "permission",
  "fallback",
  "boundary",
  "conflict",
  "stale",
  "retry",
  "unauthor",
  "not found",
  "404",
  "500"
];

/* ------------------------------------------------- hand-rolled YAML parser */

// A deliberately small YAML reader: enough for the flat ticket frontmatter
// (scalars, inline `[a, b]` lists, block lists, and inline `{ k: v }` maps or
// the literal `n/a`). It is NOT a general YAML implementation.

function stripInlineComment(value) {
  // Remove a trailing ` # comment` that is not inside quotes/brackets.
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble && (ch === "[" || ch === "{")) depth += 1;
    else if (!inSingle && !inDouble && (ch === "]" || ch === "}")) depth -= 1;
    else if (
      ch === "#" &&
      !inSingle &&
      !inDouble &&
      depth === 0 &&
      i > 0 &&
      /\s/.test(value[i - 1])
    ) {
      return value.slice(0, i);
    }
  }
  return value;
}

function unquote(token) {
  const t = token.trim();
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    return t.slice(1, -1);
  }
  if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") {
    return t.slice(1, -1);
  }
  return t;
}

function splitTopLevel(inner) {
  // Split on commas that are not nested inside brackets/braces/quotes.
  const parts = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble && (ch === "[" || ch === "{")) depth += 1;
    else if (!inSingle && !inDouble && (ch === "]" || ch === "}")) depth -= 1;
    if (ch === "," && !inSingle && !inDouble && depth === 0) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim() !== "" || parts.length > 0) parts.push(buf);
  return parts.map((p) => p.trim()).filter((p) => p !== "");
}

function parseScalar(raw) {
  const value = unquote(raw);
  if (value === "") return "";
  const inline = value.trim();
  if (inline.startsWith("[") && inline.endsWith("]")) {
    return splitTopLevel(inline.slice(1, -1)).map(unquote);
  }
  if (inline.startsWith("{") && inline.endsWith("}")) {
    const obj = {};
    for (const pair of splitTopLevel(inline.slice(1, -1))) {
      const idx = pair.indexOf(":");
      if (idx === -1) continue;
      obj[unquote(pair.slice(0, idx))] = unquote(pair.slice(idx + 1));
    }
    return obj;
  }
  return value;
}

// Parse a flat YAML frontmatter block into a plain object.
// Returns { data, error }. On a structural problem error is a string.
function parseFrontmatter(block) {
  const data = {};
  const lines = block.split(/\r?\n/);
  let i = 0;
  let lastKey = null;

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = stripInlineComment(rawLine).replace(/\s+$/, "");
    i += 1;

    if (line.trim() === "") continue;

    // Block-list item belonging to the previous key.
    const listMatch = /^(\s*)-\s?(.*)$/.exec(line);
    if (listMatch && lastKey !== null) {
      if (!Array.isArray(data[lastKey])) {
        // Convert an empty-valued key into a list.
        if (data[lastKey] === "" || data[lastKey] === undefined) {
          data[lastKey] = [];
        } else {
          data[lastKey] = [data[lastKey]];
        }
      }
      data[lastKey].push(parseScalar(listMatch[2]));
      continue;
    }

    const kvMatch = /^([A-Za-z0-9_.-]+)\s*:\s?(.*)$/.exec(line);
    if (!kvMatch) {
      return {
        data: null,
        error: `frontmatter: cannot parse line: "${rawLine.trim()}"`
      };
    }
    const key = kvMatch[1];
    const rawValue = kvMatch[2];
    lastKey = key;
    if (rawValue.trim() === "") {
      // Either an empty scalar or the header of a block list (next lines).
      data[key] = "";
    } else {
      data[key] = parseScalar(rawValue);
    }
  }

  return { data, error: null };
}

/* ------------------------------------------------------- document parsing */

// Split a ticket file into { frontmatterBlock, body }.
// frontmatterBlock is null when no `---` fenced block is present.
function splitDocument(text) {
  const normalized = text.replace(/^﻿/, "");
  const fence = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;
  const m = fence.exec(normalized);
  if (!m || normalized.indexOf("---") !== 0) {
    // Frontmatter must be the very first thing in the file.
    if (m && normalized.trimStart().indexOf("---") === 0) {
      // leading whitespace before fence — still accept
    } else {
      return { frontmatterBlock: null, body: normalized };
    }
  }
  if (!m) return { frontmatterBlock: null, body: normalized };
  return {
    frontmatterBlock: m[1],
    body: normalized.slice(m[0].length)
  };
}

// Extract markdown sections keyed by heading text (## level).
// Returns a Map of normalized-heading -> { heading, content }.
function extractSections(body) {
  const sections = new Map();
  const lines = body.split(/\r?\n/);
  let current = null;
  let buf = [];
  const flush = () => {
    if (current !== null) {
      sections.set(normalizeHeading(current), {
        heading: current,
        content: buf.join("\n").trim()
      });
    }
  };
  for (const line of lines) {
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h && /^##\s/.test(line)) {
      flush();
      current = h[1].trim();
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

function normalizeHeading(heading) {
  return heading
    .toLowerCase()
    .replace(/[[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ----------------------------------------------------- AC block extraction */

// An acceptance criterion is a bullet (or paragraph) beginning with an id like
// `AC-1` or `AC-E1`. We collect the text from one AC marker to the next.
function extractAcceptanceCriteria(content) {
  if (!content) return [];
  const acs = [];
  const lines = content.split(/\r?\n/);
  let current = null;
  const idRe = /\b(AC-[A-Za-z]*\d+)\b/;
  const startRe = /^\s*(?:[-*]\s+)?(AC-[A-Za-z]*\d+)\b/;

  for (const line of lines) {
    const start = startRe.exec(line);
    if (start) {
      if (current) acs.push(current);
      current = { id: start[1], text: line };
    } else if (current) {
      // continuation line (e.g. wrapped Gherkin) — but a blank line followed by
      // a non-AC heading-ish line still belongs to the same AC block.
      current.text += "\n" + line;
    } else {
      // Text before the first AC id: ignore unless it carries an id mid-line.
      const mid = idRe.exec(line);
      if (mid) {
        current = { id: mid[1], text: line };
      }
    }
  }
  if (current) acs.push(current);
  return acs;
}

function acHasAudienceTag(text) {
  // Look for [B], [T], [A], or combinations like [A][T] / [B,T].
  const tagRe = /\[([BTA](?:\s*[,/]?\s*[BTA])*)\]/g;
  let m;
  while ((m = tagRe.exec(text)) !== null) {
    const letters = m[1].replace(/[^BTA]/g, "").split("");
    if (letters.every((l) => AUDIENCE_TAGS.includes(l)) && letters.length > 0) {
      return true;
    }
  }
  return false;
}

function acHasGherkin(text) {
  const lower = text.toLowerCase();
  return (
    /\bgiven\b/.test(lower) && /\bwhen\b/.test(lower) && /\bthen\b/.test(lower)
  );
}

function acHasVerify(text) {
  return /(^|\n)\s*verify\s*:/i.test(text) || /\bverify\s*:/i.test(text);
}

function acLooksEdge(text) {
  const lower = text.toLowerCase();
  return EDGE_KEYWORDS.some((k) => lower.includes(k));
}

function acIsNfr(text) {
  // An AC explicitly tagged [NFR] is a non-functional criterion.
  return /\[nfr\]/i.test(text);
}

function acVerifyCommand(text) {
  // Return the command following the first "Verify:" on its line, trimmed of
  // surrounding backticks/whitespace. Returns null when there is no Verify:.
  const m = /verify\s*:\s*(.*)$/im.exec(text);
  if (!m) return null;
  return m[1].replace(/`/g, "").trim();
}

/* ----------------------------------------------- placeholder-leak detection */

// An unreplaced template placeholder is an angle-bracketed token like
// `<slug>` / `<single command>` / `<doc ref>`. We deliberately match only a
// balanced `<...>` pair so comparison operators ("<200ms", "<=80 chars") — which
// have no closing `>` — are never flagged. HTML comments are stripped first so
// guidance like `<!-- ... -->` is not treated as a leak.
const PLACEHOLDER_RE = /<[^<>\n]+>/;

function stripHtmlComments(text) {
  if (typeof text !== "string") return text;
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

function hasPlaceholder(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") {
    return PLACEHOLDER_RE.test(stripHtmlComments(value));
  }
  if (Array.isArray(value)) return value.some((v) => hasPlaceholder(v));
  if (typeof value === "object") {
    return Object.values(value).some((v) => hasPlaceholder(v));
  }
  return false;
}

/* ---------------------------------------------------------- value helpers */

function isEmptyValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) {
    return value.length === 0 || value.every((v) => isEmptyValue(v));
  }
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function isNa(value) {
  if (typeof value === "string") return /^n\/a\b/i.test(value.trim());
  if (Array.isArray(value)) {
    return (
      value.length === 1 &&
      typeof value[0] === "string" &&
      /^n\/a\b/i.test(value[0].trim())
    );
  }
  return false;
}

function hasNaReason(value) {
  // "n/a (reason)" — an explicit waiver. Accepts either string or 1-item list.
  const str = Array.isArray(value) ? value[0] : value;
  return typeof str === "string" && /^n\/a\s*\(.+\)/i.test(str.trim());
}

function toArray(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

/* ----------------------------------------------------- the core validator */

// Validate a single parsed ticket. `resolveParent` is an optional callback
// (parentId) => boolean used to confirm the parent ticket exists; when omitted
// any non-empty, non-n/a parent value is accepted as a syntactic reference.
function validateTicket(text, options) {
  const opts = options || {};
  const errors = [];
  const add = (field, message) => errors.push({ field, message });

  // --- 1. frontmatter present + parseable ---
  const { frontmatterBlock, body } = splitDocument(text);
  if (frontmatterBlock === null) {
    add("frontmatter", "no YAML frontmatter block (expected a leading --- ... --- fence)");
    return { ok: false, errors, data: null };
  }
  const { data, error: parseError } = parseFrontmatter(frontmatterBlock);
  if (parseError) {
    add("frontmatter", parseError);
    return { ok: false, errors, data: null };
  }

  // --- 2. required fields non-empty ---
  for (const field of REQUIRED_FIELDS) {
    if (isEmptyValue(data[field])) {
      add(field, `required field "${field}" is missing or empty`);
    }
  }

  // canonical schema fields: present and either populated or explicit n/a.
  for (const field of CANONICAL_OR_NA_FIELDS) {
    const value = data[field];
    if (isEmptyValue(value) && !isNa(value)) {
      add(field, `canonical field "${field}" must be present and populated or explicitly "n/a"`);
    }
  }

  // canonical_source: required and populated (not n/a) for story/subtask;
  // for an epic it must still be present (populated or n/a).
  const csType = String(data.type || "").trim();
  if (csType === "story" || csType === "subtask") {
    if (isEmptyValue(data.canonical_source) || isNa(data.canonical_source)) {
      add(
        "canonical_source",
        `"canonical_source" is required and must be populated for a ${csType} (the design source + revision)`
      );
    }
  } else if (isEmptyValue(data.canonical_source) && !isNa(data.canonical_source)) {
    add("canonical_source", '"canonical_source" must be present and populated or explicitly "n/a"');
  }

  // parent resolves-or-n/a
  if (!isEmptyValue(data.parent) && !isNa(data.parent)) {
    if (typeof opts.resolveParent === "function") {
      const parentId = Array.isArray(data.parent) ? data.parent[0] : data.parent;
      if (!opts.resolveParent(String(parentId))) {
        add("parent", `parent "${parentId}" does not resolve to a known ticket id`);
      }
    }
  }
  // epics must not have a parent (must be n/a)
  if (data.type === "epic" && !isEmptyValue(data.parent) && !isNa(data.parent)) {
    add("parent", `type "epic" must have parent: n/a (found "${data.parent}")`);
  }

  // --- 3. enums valid ---
  for (const field of Object.keys(ENUMS)) {
    const value = data[field];
    if (field === "priority" && isEmptyValue(value)) {
      // priority is optional in the schema; only validate if present.
      continue;
    }
    if (isEmptyValue(value)) {
      // missing required enum already reported above for type/status.
      continue;
    }
    const v = String(value).trim();
    if (!ENUMS[field].includes(v)) {
      add(field, `"${field}" value "${v}" is not one of: ${ENUMS[field].join(", ")}`);
    }
  }

  // --- 7. files / apis / arch populated or n/a ---
  for (const field of POPULATED_OR_NA_FIELDS) {
    const value = data[field];
    if (isEmptyValue(value) && !isNa(value)) {
      add(field, `"${field}" must be populated or explicitly "n/a"`);
    }
  }

  // --- 8. placeholder-leak detection on frontmatter fields ---
  // Any required / canonical / populated-or-n/a field still carrying an
  // unreplaced <...> token FAILS, unless the slot is an explicit "n/a (reason)".
  const PLACEHOLDER_SCAN_FIELDS = [
    ...REQUIRED_FIELDS,
    ...CANONICAL_OR_NA_FIELDS,
    ...POPULATED_OR_NA_FIELDS,
    "canonical_source",
    "dod"
  ];
  for (const field of PLACEHOLDER_SCAN_FIELDS) {
    const value = data[field];
    if (hasNaReason(value)) continue; // explicit waiver
    if (hasPlaceholder(value)) {
      add(field, `field "${field}" still contains an unreplaced <...> placeholder`);
    }
  }

  // --- sections ---
  const sections = extractSections(body);

  // --- 6 (part). At a glance / [B] Business / [T] Technical non-empty ---
  // n/a (reason) is accepted (especially for a subtask's [B]).
  for (const req of REQUIRED_SECTIONS) {
    const section = findSection(sections, req.names);
    const content = section ? section.content : "";
    if (isEmptyValue(content)) {
      add(req.field, `the "${req.field}" section is missing or empty`);
    } else if (hasNaReason(content)) {
      // explicit waiver — accept
    } else if (hasPlaceholder(content)) {
      add(req.field, `the "${req.field}" section still contains an unreplaced <...> placeholder`);
    }
  }

  // --- 6. [A] Agent directives non-empty with >= 1 "Do not" ---
  const agentSection = findSection(sections, ["a agent directives", "agent directives"]);
  if (!agentSection || isEmptyValue(agentSection.content)) {
    add("[A] Agent directives", 'the "[A] Agent directives" section is missing or empty');
  } else if (!/\bdo not\b/i.test(agentSection.content) && !/\bdon't\b/i.test(agentSection.content)) {
    add(
      "[A] Agent directives",
      'the "[A] Agent directives" section must contain at least one "Do not" constraint'
    );
  }

  // --- acceptance criteria (checks 4 + 5) ---
  const acSection = findSection(sections, ["acceptance criteria"]);
  const acs = acSection ? extractAcceptanceCriteria(acSection.content) : [];

  if (acs.length === 0) {
    add("Acceptance criteria", "no acceptance criteria found (expected at least one AC-N entry)");
  }

  // 4. every AC has an audience tag AND (Gherkin OR a non-empty Verify: command)
  for (const ac of acs) {
    if (!acHasAudienceTag(ac.text)) {
      add(ac.id, `acceptance criterion "${ac.id}" is missing an audience tag ([B], [T], or [A])`);
    }
    const verifyCmd = acVerifyCommand(ac.text);
    const hasVerifyCmd = verifyCmd !== null && verifyCmd !== "" && !hasPlaceholder(verifyCmd);
    if (acHasVerify(ac.text) && !hasVerifyCmd) {
      // A "Verify:" line with no command (or only a <placeholder>) is not measurable.
      add(
        ac.id,
        `acceptance criterion "${ac.id}" has a "Verify:" with no command — supply a single runnable command`
      );
    } else if (!acHasGherkin(ac.text) && !hasVerifyCmd) {
      add(
        ac.id,
        `acceptance criterion "${ac.id}" needs either a Given/When/Then scenario or a non-empty "Verify:" command`
      );
    }
    // 9. behavioural/NFR split: an [NFR]-tagged AC must carry a Verify: command.
    if (acIsNfr(ac.text) && !hasVerifyCmd) {
      add(
        ac.id,
        `acceptance criterion "${ac.id}" is tagged [NFR] and must carry a non-empty "Verify:" command`
      );
    }
    // 8. no unreplaced placeholder left in an AC (other than an n/a waiver).
    if (!hasNaReason(ac.text) && hasPlaceholder(ac.text)) {
      add(ac.id, `acceptance criterion "${ac.id}" still contains an unreplaced <...> placeholder`);
    }
  }

  // 5. at least one happy-path (non-edge) AC ...
  const hasHappyAc = acs.some((ac) => !acLooksEdge(ac.text));
  if (acs.length > 0 && !hasHappyAc) {
    add(
      "Acceptance criteria",
      "no happy-path acceptance criterion found; at least one non-edge AC is required"
    );
  }

  // ... AND at least one edge/error/offline AC OR explicit "n/a (reason)"
  const hasEdgeAc = acs.some((ac) => acLooksEdge(ac.text));
  const edgeWaiver = sectionDeclaresEdgeNa(acSection ? acSection.content : "");
  if (acs.length > 0 && !hasEdgeAc && !edgeWaiver) {
    add(
      "Acceptance criteria",
      'no edge/error/offline acceptance criterion found; add one or declare an explicit "n/a (reason)"'
    );
  }

  // --- dod refs exist (part of check 2) ---
  const dodRefs = toArray(data.dod).filter(
    (d) => typeof d === "string" && /^AC-/i.test(d.trim())
  );
  if (isEmptyValue(data.dod) && !isNa(data.dod)) {
    add("dod", '"dod" must list the acceptance-criterion ids it gates (or "n/a")');
  } else if (dodRefs.length > 0) {
    const knownIds = new Set(acs.map((ac) => ac.id));
    for (const ref of dodRefs) {
      const id = ref.trim();
      if (!knownIds.has(id)) {
        add("dod", `"dod" references "${id}" which has no matching acceptance criterion`);
      }
    }
  }

  return { ok: errors.length === 0, errors, data };
}

function findSection(sections, candidates) {
  for (const c of candidates) {
    const norm = normalizeHeading(c);
    for (const [key, value] of sections) {
      if (key === norm || key.startsWith(norm) || norm.startsWith(key)) {
        return value;
      }
    }
  }
  return null;
}

function sectionDeclaresEdgeNa(content) {
  if (!content) return false;
  // Accept an explicit waiver line, e.g.:
  //   Edge/error: n/a (single deterministic happy path)
  const lines = content.split(/\r?\n/);
  return lines.some((line) => {
    const lower = line.toLowerCase();
    return (
      /(edge|error|offline)/.test(lower) && /n\/a\s*\(.+\)/.test(lower)
    );
  });
}

/* ----------------------------------------------------------- file walking */

function expandTargets(args, baseDir) {
  // Accepts file paths, directory paths, and simple `**`/`*.md` style globs.
  // Dependency-free recursive globbing limited to *.md by default.
  const out = new Set();
  for (const arg of args) {
    const target = path.isAbsolute(arg) ? arg : path.join(baseDir, arg);
    if (containsGlob(arg)) {
      for (const f of globMd(arg, baseDir)) out.add(f);
      continue;
    }
    let stat;
    try {
      stat = fs.statSync(target);
    } catch {
      // Treat an unmatched literal as a glob attempt against baseDir.
      for (const f of globMd(arg, baseDir)) out.add(f);
      continue;
    }
    if (stat.isDirectory()) {
      for (const f of walkMd(target)) out.add(f);
    } else {
      out.add(target);
    }
  }
  return [...out].sort();
}

function containsGlob(s) {
  return /[*?[\]]/.test(s);
}

function walkMd(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walkMd(full));
    } else if (e.isFile() && full.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function globMd(pattern, baseDir) {
  // Compile a minimal glob (supporting **, *, ?) to a RegExp and walk baseDir.
  const abs = path.isAbsolute(pattern) ? pattern : path.join(baseDir, pattern);
  const root = globRoot(abs);
  let candidates = [];
  try {
    if (fs.statSync(root).isDirectory()) {
      candidates = walkAll(root);
    }
  } catch {
    return [];
  }
  const re = globToRegExp(abs);
  return candidates.filter((f) => re.test(f) && f.endsWith(".md"));
}

function globRoot(pattern) {
  const idx = pattern.search(/[*?[\]]/);
  const head = idx === -1 ? pattern : pattern.slice(0, idx);
  const dir = head.endsWith(path.sep) ? head : path.dirname(head);
  return dir || ".";
}

function walkAll(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkAll(full));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function globToRegExp(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        re += "[\\s\\S]*";
        i += 1;
        if (pattern[i + 1] === path.sep) i += 1;
      } else {
        re += "[^" + (path.sep === "\\" ? "\\\\" : path.sep) + "]*";
      }
    } else if (ch === "?") {
      re += ".";
    } else if (".+^${}()|[]\\".includes(ch)) {
      re += "\\" + ch;
    } else {
      re += ch;
    }
  }
  return new RegExp("^" + re + "$");
}

/* -------------------------------------------------- multi-file resolution */

// Build a resolver that knows every ticket id present across a set of files, so
// `parent:` references can be checked in --strict mode.
function buildIdResolver(files) {
  const ids = new Set();
  for (const file of files) {
    try {
      const text = fs.readFileSync(file, "utf8");
      const { frontmatterBlock } = splitDocument(text);
      if (!frontmatterBlock) continue;
      const { data } = parseFrontmatter(frontmatterBlock);
      if (data && !isEmptyValue(data.id)) {
        ids.add(String(Array.isArray(data.id) ? data.id[0] : data.id).trim());
      }
    } catch {
      /* ignore unreadable files at index time */
    }
  }
  return (parentId) => ids.has(String(parentId).trim());
}

/* --------------------------------------------------------------------- CLI */

function formatReport(file, result) {
  const rel = file;
  if (result.ok) {
    return `PASS  ${rel}`;
  }
  const lines = [`FAIL  ${rel}`];
  for (const e of result.errors) {
    lines.push(`  - ${e.field}: ${e.message}`);
  }
  return lines.join("\n");
}

function run(argv, io) {
  const out = (io && io.stdout) || process.stdout;
  const err = (io && io.stderr) || process.stderr;
  const cwd = (io && io.cwd) || process.cwd();

  const args = argv.slice();
  let strict = false;
  let dir = null;
  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--strict") strict = true;
    else if (a === "--dir") {
      dir = args[i + 1];
      i += 1;
    } else if (a === "-h" || a === "--help") {
      out.write(usage() + "\n");
      return 0;
    } else if (a.startsWith("--")) {
      err.write(`validate: unknown option "${a}"\n`);
      return 2;
    } else {
      positionals.push(a);
    }
  }

  let targets = positionals.slice();
  if (dir) targets.push(dir);

  if (targets.length === 0) {
    err.write("validate: no ticket file, glob, or --dir given\n\n" + usage() + "\n");
    return 2;
  }

  let files;
  if (strict) {
    files = expandTargets(targets, cwd);
    if (files.length === 0) {
      err.write("validate: --strict matched no .md files\n");
      return 2;
    }
  } else {
    // Single-file mode: validate exactly the given files (no recursion).
    files = targets.map((t) => (path.isAbsolute(t) ? t : path.join(cwd, t)));
  }

  const resolveParent = strict ? buildIdResolver(files) : undefined;

  let failed = 0;
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (e) {
      out.write(`FAIL  ${file}\n  - file: cannot read (${e.code || e.message})\n`);
      failed += 1;
      continue;
    }
    const result = validateTicket(text, { resolveParent });
    out.write(formatReport(file, result) + "\n");
    if (!result.ok) failed += 1;
  }

  if (failed > 0) {
    out.write(`\n${failed} of ${files.length} ticket(s) failed validation.\n`);
    return 1;
  }
  out.write(`\nAll ${files.length} ticket(s) passed validation.\n`);
  return 0;
}

function usage() {
  return [
    "Usage:",
    "  node validate.js <ticketfile.md>            validate one ticket file",
    "  node validate.js --strict <glob> [<glob>..] validate every matched .md (parents must resolve)",
    "  node validate.js --strict --dir <tickets>   validate every .md under a directory",
    "",
    "Exit 0 on pass; 1 on validation failure; 2 on usage error."
  ].join("\n");
}

/* ------------------------------------------------------------------ export */

module.exports = {
  validateTicket,
  parseFrontmatter,
  splitDocument,
  extractSections,
  extractAcceptanceCriteria,
  run,
  ENUMS
};

if (require.main === module) {
  process.exitCode = run(process.argv.slice(2), {
    stdout: process.stdout,
    stderr: process.stderr,
    cwd: process.cwd()
  });
}
