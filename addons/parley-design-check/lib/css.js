"use strict";

/*
 * parley-design-check — the T1 SOURCE scanner.
 *
 * A small stack machine over stylesheet text: at-rule contexts, rule blocks, declarations,
 * every one carrying the line it starts on. It parses no layout and computes no cascade,
 * which is exactly the limit of `T1 SOURCE`: it can read what a file declares, never what
 * a browser resolves. A detector that wants more than this must report UNJUDGEABLE.
 */

/** Replace comment bodies with spaces so every later offset keeps its line number. */
function stripComments(text) {
  let out = "";
  let index = 0;
  while (index < text.length) {
    if (text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2);
      const stop = end === -1 ? text.length : end + 2;
      for (const ch of text.slice(index, stop)) out += ch === "\n" ? "\n" : " ";
      index = stop;
      continue;
    }
    const ch = text[index];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let cursor = index + 1;
      while (cursor < text.length && text[cursor] !== quote) {
        if (text[cursor] === "\\") cursor += 1;
        cursor += 1;
      }
      out += text.slice(index, Math.min(cursor + 1, text.length));
      index = cursor + 1;
      continue;
    }
    out += ch;
    index += 1;
  }
  return out;
}

function splitDeclaration(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === ":" && depth === 0) {
      return { prop: text.slice(0, i).trim(), value: text.slice(i + 1).trim() };
    }
  }
  return null;
}

/**
 * Parse a stylesheet into rule blocks. Each block records its selector list, the at-rule
 * contexts it sits inside, and its declarations with line numbers.
 */
function parseStylesheet(text) {
  const src = stripComments(text);
  const blocks = [];
  const stack = [];
  let buffer = "";
  let bufferLine = 0;
  let line = 1;

  const resetBuffer = () => {
    buffer = "";
    bufferLine = 0;
  };
  const push = (ch) => {
    if (buffer.trim() === "" && ch.trim() !== "") bufferLine = line;
    buffer += ch;
  };
  const currentRule = () => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].type === "rule") return stack[i].block;
    }
    return null;
  };
  const flushDeclaration = () => {
    const rule = currentRule();
    const text_ = buffer.trim();
    if (rule && text_ !== "") {
      const split = splitDeclaration(text_);
      if (split && split.prop !== "") {
        rule.declarations.push({ prop: split.prop.toLowerCase(), raw: split.prop, value: split.value, line: bufferLine || line });
      }
    }
    resetBuffer();
  };

  for (let index = 0; index < src.length; index += 1) {
    const ch = src[index];
    if (ch === "\n") {
      line += 1;
      push(" ");
      continue;
    }
    if (ch === "{") {
      const prelude = buffer.trim();
      const startLine = bufferLine || line;
      resetBuffer();
      if (prelude.startsWith("@")) {
        const name = (/^@([a-zA-Z-]+)/.exec(prelude) || [null, ""])[1].toLowerCase();
        stack.push({ type: "at", at: { name, prelude, line: startLine } });
      } else {
        const block = {
          selector: prelude,
          selectors: prelude
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean),
          line: startLine,
          atRules: stack.filter((entry) => entry.type === "at").map((entry) => entry.at),
          declarations: []
        };
        blocks.push(block);
        stack.push({ type: "rule", block });
      }
      continue;
    }
    if (ch === "}") {
      flushDeclaration();
      stack.pop();
      continue;
    }
    if (ch === ";") {
      flushDeclaration();
      continue;
    }
    push(ch);
  }
  return blocks;
}

/** Every `var(--name)` reference in a text, with its line. */
function varUses(text) {
  const uses = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((content, index) => {
    for (const match of content.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
      uses.push({ name: match[1], line: index + 1 });
    }
  });
  return uses;
}

/** Every `class`/`className` attribute value in markup, with its line. */
function classAttributes(text) {
  const found = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((content, index) => {
    for (const match of content.matchAll(/class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*[`"']([^`"']*)[`"']\s*\})/g)) {
      found.push({ value: match[1] ?? match[2] ?? match[3] ?? "", line: index + 1 });
    }
  });
  return found;
}

/** Iterate lines with 1-based numbers, skipping fenced code blocks when asked. */
function eachLine(text, callback, { skipFences = false } = {}) {
  let inFence = false;
  text.split(/\r?\n/).forEach((content, index) => {
    if (skipFences && /^\s*```/.test(content)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    callback(content, index + 1);
  });
}

const STATE_FORMS = [
  { state: "hover", test: /:hover\b/ },
  { state: "focus", test: /:focus(-visible|-within)?\b/ },
  { state: "pressed", test: /:active\b|\[aria-pressed[^\]]*\]|\[data-pressed[^\]]*\]/ },
  { state: "disabled", test: /:disabled\b|\[disabled\]|\[aria-disabled[^\]]*\]/ },
  { state: "loading", test: /\[aria-busy[^\]]*\]|\[data-loading[^\]]*\]/ },
  { state: "error", test: /\[aria-invalid[^\]]*\]|\[data-error[^\]]*\]/ },
  { state: "empty", test: /:empty\b|\[data-empty[^\]]*\]/ }
];

/** The state a selector expresses, or "rest" when it expresses none. */
function selectorState(selector) {
  for (const form of STATE_FORMS) {
    if (form.test.test(selector)) return form.state;
  }
  return "rest";
}

/** Strip state pseudo-classes and state attributes to get the element a selector targets. */
function selectorBase(selector) {
  return selector
    .replace(/:(focus-visible|focus-within|focus|hover|active|disabled|empty|target|checked)\b/g, "")
    .replace(/\[(aria-pressed|aria-disabled|aria-busy|aria-invalid|data-pressed|data-loading|data-error|data-empty|disabled)[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  STATE_FORMS,
  classAttributes,
  eachLine,
  parseStylesheet,
  selectorBase,
  selectorState,
  splitDeclaration,
  stripComments,
  varUses
};
