"use strict";

/*
 * parley-design-check — readers for the two artifact kinds a T0 ARTIFACT detector sees:
 * PDS artifacts (markdown with a frontmatter block) and DTCG token files (JSON).
 *
 * Nothing here decides anything. It turns bytes into a shape detectors can read, and it
 * refuses to guess: an unreadable token file is an error the run reports, not an empty
 * token set that every later check quietly passes.
 */

const fs = require("node:fs");
const { CheckError, readFrontmatterBlock } = require("./registry.js");

const ARTIFACT_KINDS = [
  "DESIGN-BRIEF",
  "DIRECTION",
  "CRITIQUE",
  "VERDICT",
  "CONTRACT",
  "DESIGN-SYSTEM",
  "AUDIT",
  "WAIVERS"
];

/** Read a markdown file as a PDS artifact. Returns null when it carries no frontmatter. */
function readArtifact(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  let data;
  try {
    data = readFrontmatterBlock(text, filePath);
  } catch (error) {
    throw new CheckError(`${filePath}: ${error.message}`);
  }
  if (!data) return null;
  const lines = text.split(/\r?\n/);
  let bodyStart = 1;
  while (bodyStart < lines.length && lines[bodyStart].trim() !== "---") bodyStart += 1;
  return {
    path: filePath,
    kind: data.kind ? String(data.kind) : null,
    spec: data.spec ? String(data.spec) : null,
    data,
    body: lines.slice(bodyStart + 1).join("\n"),
    bodyOffset: bodyStart + 1
  };
}

/* ------------------------------------------------------------ token files */

// `color.text.muted` becomes `--color-text-muted`: segments joined with a hyphen, camel
// boundaries split, lowercased. One mapping, stated once, so the token checks and the
// source checks agree on what a token is called.
function toCssVar(tokenPath) {
  const flat = tokenPath
    .split(".")
    .map((segment) => segment.replace(/([a-z0-9])([A-Z])/g, "$1-$2"))
    .join("-")
    .toLowerCase();
  return `--${flat}`;
}

function isLeaf(node) {
  return node !== null && typeof node === "object" && !Array.isArray(node) && "$value" in node;
}

/**
 * Read a DTCG token document into a flat index keyed by dotted token path. Group-level
 * `$type` is inherited, as the format requires, so a leaf that omits it is still typed.
 */
function readTokens(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  let root;
  try {
    root = JSON.parse(text);
  } catch (error) {
    throw new CheckError(`${filePath}: not valid JSON — ${error.message}`);
  }
  if (root === null || typeof root !== "object" || Array.isArray(root)) {
    throw new CheckError(`${filePath}: a token document must be a JSON object`);
  }
  const tokens = new Map();
  const groups = [];
  const lineOf = lineFinder(text);
  const walk = (node, trail, inheritedType) => {
    const type = typeof node.$type === "string" ? node.$type : inheritedType;
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith("$")) continue;
      if (child === null || typeof child !== "object" || Array.isArray(child)) {
        throw new CheckError(`${filePath}: "${[...trail, key].join(".")}" is neither a group nor a token`);
      }
      const trailNext = [...trail, key];
      const dotted = trailNext.join(".");
      if (isLeaf(child)) {
        tokens.set(dotted, {
          path: dotted,
          cssVar: toCssVar(dotted),
          value: child.$value,
          type: typeof child.$type === "string" ? child.$type : type,
          description: typeof child.$description === "string" ? child.$description : null,
          extensions: child.$extensions && typeof child.$extensions === "object" ? child.$extensions : {},
          file: filePath,
          line: lineOf(key)
        });
      } else {
        groups.push(dotted);
        walk(child, trailNext, type);
      }
    }
  };
  walk(root, [], undefined);
  return { path: filePath, raw: root, tokens, groups, extensions: root.$extensions || {} };
}

// Token files are generated as often as they are written by hand, so line numbers are
// found by walking the key order rather than by re-parsing: good enough to point a reader
// at the right place, and honest about being approximate (0 when not found).
function lineFinder(text) {
  const lines = text.split(/\r?\n/);
  return (key) => {
    const needle = `"${key}"`;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].includes(needle)) return i + 1;
    }
    return 0;
  };
}

const ALIAS = /^\{([^}]+)\}$/;

/** Resolve a token value through aliases. Returns {value, token, chain} or an error string. */
function resolveValue(index, startPath, seen = new Set()) {
  const token = index.get(startPath);
  if (!token) return { error: `no token declared at ${startPath}` };
  if (seen.has(startPath)) return { error: `alias cycle through ${[...seen, startPath].join(" -> ")}` };
  seen.add(startPath);
  if (typeof token.value === "string") {
    const alias = ALIAS.exec(token.value.trim());
    if (alias) return resolveValue(index, alias[1].trim(), seen);
  }
  return { value: token.value, token, chain: [...seen] };
}

function aliasTarget(value) {
  if (typeof value !== "string") return null;
  const alias = ALIAS.exec(value.trim());
  return alias ? alias[1].trim() : null;
}

/* --------------------------------------------------------------- colour */

const HEX = /^#([0-9a-fA-F]{3,8})$/;

/**
 * Reduce a token value to sRGB channels in 0..1, or say why it cannot be reduced. A value
 * this checker cannot compute is never treated as passing: the caller reports NEEDS_REVIEW.
 */
function toSrgb(value) {
  if (typeof value === "string") return hexToSrgb(value.trim());
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    if (typeof value.hex === "string") {
      const fromHex = hexToSrgb(value.hex.trim());
      if (fromHex.channels) return fromHex;
    }
    const space = typeof value.colorSpace === "string" ? value.colorSpace.toLowerCase() : null;
    if (!space) return { error: "the colour value declares no colorSpace" };
    if (space !== "srgb") {
      return { error: `colorSpace "${value.colorSpace}" is not computable to sRGB by this checker` };
    }
    if (!Array.isArray(value.components) || value.components.length < 3) {
      return { error: "the sRGB value declares no components" };
    }
    const channels = value.components.slice(0, 3).map((component) => Number(component));
    if (channels.some((component) => !Number.isFinite(component))) {
      return { error: "the sRGB components are not numbers" };
    }
    return { channels: channels.map((component) => Math.min(1, Math.max(0, component))) };
  }
  return { error: "the value is not a colour this checker can read" };
}

function hexToSrgb(text) {
  const match = HEX.exec(text);
  if (!match) return { error: `"${text}" is not a hex colour` };
  let hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (hex.length !== 6 && hex.length !== 8) return { error: `"${text}" is not a hex colour` };
  const channel = (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return { channels: [channel(0), channel(2), channel(4)] };
}

// WCAG 2.2 relative luminance and contrast ratio, as published.
function relativeLuminance(channels) {
  const [r, g, b] = channels.map((component) =>
    component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

module.exports = {
  ARTIFACT_KINDS,
  aliasTarget,
  contrastRatio,
  readArtifact,
  readTokens,
  resolveValue,
  toCssVar,
  toSrgb
};
