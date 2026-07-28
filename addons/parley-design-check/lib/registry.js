"use strict";

/*
 * parley-design-check — the literate-registry reader.
 *
 * The registry is `parley-design/references/RULES.md` plus any surface annex beside it.
 * This module reads those files with the extraction grammar the registry itself freezes,
 * and it carries no copy of their content: nothing here knows a rule id, a threshold or a
 * face name. If the registry is absent, this module reports that; it never substitutes.
 *
 * The YAML subset below is deliberately tiny. A `pds-rule` block is flat key/value, and a
 * PDS artifact's frontmatter adds inline lists, inline maps and block lists of those. Any
 * construct outside that subset raises — a parser that guesses at YAML it does not
 * implement is how a registry silently loses a rule.
 *
 * Node built-ins only. No network, at read time or any other time.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

class CheckError extends Error {
  constructor(message) {
    super(message);
    this.name = "CheckError";
  }
}

/* ------------------------------------------------------------ YAML subset */

const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_.-]*):(?:[ \t]+(.*))?$/;
const MAX_INLINE_DEPTH = 3;

// Split on commas that are not inside quotes or brackets. Used for both inline
// lists and inline maps, so an unbalanced bracket fails here rather than later.
function splitTopLevel(text, where) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (const ch of text) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "[" || ch === "{") depth += 1;
    if (ch === "]" || ch === "}") {
      depth -= 1;
      if (depth < 0) throw new CheckError(`${where}: unbalanced bracket in ${JSON.stringify(text)}`);
    }
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (quote) throw new CheckError(`${where}: unterminated quote in ${JSON.stringify(text)}`);
  if (depth !== 0) throw new CheckError(`${where}: unbalanced bracket in ${JSON.stringify(text)}`);
  parts.push(current);
  return parts.map((part) => part.trim());
}

function parseScalar(raw, where) {
  const text = raw.trim();
  if (text === "") throw new CheckError(`${where}: empty value`);
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    if (text.length < 2) throw new CheckError(`${where}: unterminated quote in ${JSON.stringify(text)}`);
    return text.slice(1, -1);
  }
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  if (/^-?\d*\.\d+$/.test(text)) return Number.parseFloat(text);
  return text;
}

function parseInline(raw, where, depth = 0) {
  const text = raw.trim();
  if (depth > MAX_INLINE_DEPTH) throw new CheckError(`${where}: nesting deeper than this parser accepts`);
  if (text.startsWith("[")) {
    if (!text.endsWith("]")) throw new CheckError(`${where}: list is not closed: ${JSON.stringify(text)}`);
    const inner = text.slice(1, -1).trim();
    if (inner === "") return [];
    return splitTopLevel(inner, where).map((item) => parseInline(item, where, depth + 1));
  }
  if (text.startsWith("{")) {
    if (!text.endsWith("}")) throw new CheckError(`${where}: map is not closed: ${JSON.stringify(text)}`);
    const inner = text.slice(1, -1).trim();
    const out = {};
    if (inner === "") return out;
    for (const pair of splitTopLevel(inner, where)) {
      const colon = findKeySeparator(pair);
      if (colon < 0) throw new CheckError(`${where}: map entry without a key: ${JSON.stringify(pair)}`);
      const key = pair.slice(0, colon).trim().replace(/^["']|["']$/g, "");
      if (key === "") throw new CheckError(`${where}: map entry with an empty key`);
      if (Object.prototype.hasOwnProperty.call(out, key)) {
        throw new CheckError(`${where}: duplicate key ${JSON.stringify(key)} in one map`);
      }
      out[key] = parseInline(pair.slice(colon + 1), where, depth + 1);
    }
    return out;
  }
  if (text.includes("[") || text.includes("]") || text.includes("{") || text.includes("}")) {
    throw new CheckError(`${where}: value mixes flow syntax with plain text: ${JSON.stringify(text)}`);
  }
  return parseScalar(text, where);
}

// The first colon that is not inside quotes or brackets.
function findKeySeparator(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "[" || ch === "{") depth += 1;
    else if (ch === "]" || ch === "}") depth -= 1;
    else if (ch === ":" && depth === 0) return i;
  }
  return -1;
}

/**
 * Parse the flat block subset: `key: value` at column zero, optionally followed by an
 * indented `- ` list. `flatOnly` forbids block lists and flow maps, which is what a
 * `pds-rule` record is allowed to be.
 */
function parseYamlSubset(text, where, { flatOnly = false } = {}) {
  const lines = text.split(/\r?\n/);
  const out = {};
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const at = `${where} line ${index + 1}`;
    if (line.trim() === "" || /^\s*#/.test(line)) {
      index += 1;
      continue;
    }
    if (/^\s/.test(line)) throw new CheckError(`${at}: unexpected indentation`);
    const match = KEY_LINE.exec(line);
    if (!match) throw new CheckError(`${at}: not a key/value line: ${JSON.stringify(line)}`);
    const key = match[1];
    const inlineValue = match[2] === undefined ? "" : match[2].trim();
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      throw new CheckError(`${at}: duplicate key ${JSON.stringify(key)}`);
    }
    if (inlineValue !== "") {
      const value = parseInline(inlineValue, at);
      if (flatOnly && value !== null && typeof value === "object" && !Array.isArray(value)) {
        throw new CheckError(`${at}: this block accepts scalars and flat lists only`);
      }
      if (flatOnly && Array.isArray(value) && value.some((item) => typeof item === "object")) {
        throw new CheckError(`${at}: this block accepts scalars and flat lists only`);
      }
      out[key] = value;
      index += 1;
      continue;
    }
    // A bare `key:` must be followed by an indented block list.
    if (flatOnly) throw new CheckError(`${at}: key ${JSON.stringify(key)} has no value`);
    const items = [];
    index += 1;
    while (index < lines.length) {
      const itemLine = lines[index];
      if (itemLine.trim() === "" || /^\s*#/.test(itemLine)) {
        index += 1;
        continue;
      }
      if (!/^\s/.test(itemLine)) break;
      const itemMatch = /^\s+-\s+(.*)$/.exec(itemLine);
      if (!itemMatch) {
        throw new CheckError(`${where} line ${index + 1}: expected an indented "- " item under ${JSON.stringify(key)}`);
      }
      items.push(parseInline(itemMatch[1], `${where} line ${index + 1}`));
      index += 1;
    }
    if (items.length === 0) throw new CheckError(`${at}: key ${JSON.stringify(key)} has no value`);
    out[key] = items;
  }
  return out;
}

/* --------------------------------------------------------------- registry */

const RULE_KEYS_REQUIRED = ["id", "class", "tier", "surface", "enforced-by", "severity", "added", "status"];
const RULE_KEYS_OPTIONAL = ["system-blind", "sources"];
const CLASSES = ["quality", "slop", "system"];
const ENFORCED_BY = ["check", "agent-judgement", "both"];
const STATUSES = ["stable", "draft", "deprecated"];
const TIER_WORDS = { T0: "T0 ARTIFACT", T1: "T1 SOURCE", T2: "T2 RENDERED", T3: "T3 PIXEL" };

function tierWord(tier) {
  return TIER_WORDS[tier];
}

function tierRank(tier) {
  return ["T0", "T1", "T2", "T3"].indexOf(tier);
}

function normaliseTier(raw, where) {
  const text = String(raw).trim();
  const key = text.split(/\s+/)[0];
  if (!TIER_WORDS[key]) throw new CheckError(`${where}: unknown tier ${JSON.stringify(text)}`);
  if (text !== key && text !== TIER_WORDS[key]) {
    throw new CheckError(`${where}: tier ${JSON.stringify(text)} is neither "${key}" nor "${TIER_WORDS[key]}"`);
  }
  return key;
}

/**
 * Read one registry file with the frozen grammar: a rule is an H3, the record is the
 * `pds-rule` fence directly beneath it. A fence anywhere else is not part of the registry.
 */
function parseRegistryFile(text, filePath) {
  const lines = text.split(/\r?\n/);
  const rules = [];
  const warnings = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const heading = /^###\s+(.*\S)\s*$/.exec(line);
    if (!heading) {
      index += 1;
      continue;
    }
    const headingLine = index + 1;
    const name = heading[1];
    let cursor = index + 1;
    while (cursor < lines.length && lines[cursor].trim() === "") cursor += 1;
    const fence = /^```pds-rule\s*$/.exec(lines[cursor] || "");
    if (!fence) {
      throw new CheckError(
        `${filePath}:${headingLine}: rule heading "${name}" is not followed by a pds-rule block`
      );
    }
    const bodyStart = cursor + 1;
    let bodyEnd = bodyStart;
    while (bodyEnd < lines.length && !/^```\s*$/.test(lines[bodyEnd])) bodyEnd += 1;
    if (bodyEnd >= lines.length) {
      throw new CheckError(`${filePath}:${cursor + 1}: pds-rule block is never closed`);
    }
    const block = lines.slice(bodyStart, bodyEnd).join("\n");
    const record = parseYamlSubset(block, `${filePath}:${bodyStart + 1}`, { flatOnly: true });
    const where = `${filePath}:${bodyStart + 1}`;
    for (const key of RULE_KEYS_REQUIRED) {
      if (record[key] === undefined) throw new CheckError(`${where}: rule "${name}" is missing ${key}`);
    }
    for (const key of Object.keys(record)) {
      if (key.startsWith("x-")) continue;
      if (!RULE_KEYS_REQUIRED.includes(key) && !RULE_KEYS_OPTIONAL.includes(key)) {
        warnings.push(`${where}: unknown key ${JSON.stringify(key)} on ${record.id}`);
      }
    }
    const id = String(record.id);
    if (!/^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new CheckError(`${where}: rule id ${JSON.stringify(id)} is not <surface>:<slug>`);
    }
    if (!CLASSES.includes(record.class)) throw new CheckError(`${where}: ${id} has unknown class ${record.class}`);
    if (!ENFORCED_BY.includes(record["enforced-by"])) {
      throw new CheckError(`${where}: ${id} has unknown enforced-by ${record["enforced-by"]}`);
    }
    if (!STATUSES.includes(record.status)) throw new CheckError(`${where}: ${id} has unknown status ${record.status}`);
    if (!Number.isInteger(record.severity) || record.severity < 0 || record.severity > 4) {
      throw new CheckError(`${where}: ${id} has severity ${record.severity}, outside 0-4`);
    }
    rules.push({
      id,
      name,
      class: record.class,
      tier: normaliseTier(record.tier, where),
      surface: String(record.surface),
      enforcedBy: record["enforced-by"],
      severity: record.severity,
      added: String(record.added),
      status: record.status,
      systemBlind: record["system-blind"] === true,
      sources: Array.isArray(record.sources) ? record.sources.map(String) : [],
      file: filePath,
      line: headingLine
    });
    index = bodyEnd + 1;
  }
  return { rules, warnings };
}

// The registry names its surface-annex ids in a table, so a missing annex is visible
// rather than silent. Reads the ids out of the first column of any markdown table row.
function parseDeclaredIds(text) {
  const ids = new Set();
  for (const match of text.matchAll(/^\|\s*`([a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]*)`\s*\|/gm)) {
    ids.add(match[1]);
  }
  return ids;
}

function digestOf(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 12);
}

/**
 * Resolve the registry path. Order: explicit path, environment, the parley-design skill
 * beside this add-on, then a bounded walk up from the working directory. There is no
 * bundled fallback: when every candidate misses, the caller refuses rule checks.
 */
function resolveRegistryPath({ explicit, env, addonRoot, cwd }) {
  const tried = [];
  const consider = (candidate) => {
    if (!candidate) return null;
    const resolved = path.resolve(candidate);
    tried.push(resolved);
    return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null;
  };
  const suffix = path.join("references", "RULES.md");
  // A path someone typed is never quietly replaced by a different registry: a run that
  // checked against a registry the caller did not name is worse than one that refused.
  for (const named of [explicit, env]) {
    if (!named) continue;
    const hit = consider(named);
    return hit ? { path: hit, tried } : { path: null, tried, named };
  }
  const roots = [path.dirname(addonRoot)];
  let dir = path.resolve(cwd);
  for (let depth = 0; depth < 8; depth += 1) {
    roots.push(dir, path.join(dir, "addons"), path.join(dir, ".claude", "skills"), path.join(dir, "skills"));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const root of roots) {
    const hit = consider(path.join(root, "parley-design", suffix));
    if (hit) return { path: hit, tried };
  }
  return { path: null, tried };
}

/**
 * Load the registry: RULES.md plus every `*-ANNEX.md` beside it. Duplicate ids are fatal
 * and both sites are named, as the grammar requires.
 */
function loadRegistry(registryPath) {
  const bytes = fs.readFileSync(registryPath);
  const text = bytes.toString("utf8");
  const digest = digestOf(bytes);
  const dir = path.dirname(registryPath);
  const files = [{ path: registryPath, digest }];
  const parsed = parseRegistryFile(text, registryPath);
  const rules = new Map();
  const warnings = [...parsed.warnings];
  const add = (rule) => {
    const seen = rules.get(rule.id);
    if (seen) {
      throw new CheckError(
        `duplicate rule id ${rule.id}: ${seen.file}:${seen.line} and ${rule.file}:${rule.line}`
      );
    }
    rules.set(rule.id, rule);
  };
  for (const rule of parsed.rules) add(rule);

  const annexes = fs
    .readdirSync(dir)
    .filter((entry) => /-ANNEX\.md$/i.test(entry))
    .sort();
  for (const entry of annexes) {
    const annexPath = path.join(dir, entry);
    const annexBytes = fs.readFileSync(annexPath);
    files.push({ path: annexPath, digest: digestOf(annexBytes) });
    const annexParsed = parseRegistryFile(annexBytes.toString("utf8"), annexPath);
    for (const rule of annexParsed.rules) add(rule);
    warnings.push(...annexParsed.warnings);
  }

  const frontmatter = readFrontmatterBlock(text, registryPath);
  const declaredIds = parseDeclaredIds(text);
  const missingRecords = [...declaredIds].filter((id) => !rules.has(id)).sort();

  return {
    path: registryPath,
    dir,
    version: frontmatter && frontmatter.registry ? String(frontmatter.registry) : "unversioned",
    spec: frontmatter && frontmatter.spec ? String(frontmatter.spec) : null,
    digest,
    files,
    rules,
    declaredIds,
    missingRecords,
    warnings
  };
}

// Frontmatter is a `---` fenced block at the head of a markdown file, in the same subset.
function readFrontmatterBlock(text, where) {
  if (!text.startsWith("---")) return null;
  const lines = text.split(/\r?\n/);
  if (lines[0].trim() !== "---") return null;
  let end = 1;
  while (end < lines.length && lines[end].trim() !== "---") end += 1;
  if (end >= lines.length) return null;
  return parseYamlSubset(lines.slice(1, end).join("\n"), `${where} frontmatter`);
}

module.exports = {
  CheckError,
  digestOf,
  loadRegistry,
  parseInline,
  parseRegistryFile,
  parseYamlSubset,
  readFrontmatterBlock,
  resolveRegistryPath,
  tierRank,
  tierWord,
  TIER_WORDS
};
