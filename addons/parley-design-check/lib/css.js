"use strict";

/*
 * parley-design-check — the T1 SOURCE scanner.
 *
 * A small stack machine over stylesheet text: at-rule contexts, rule blocks, declarations,
 * every one carrying the line it starts on. It parses no layout and computes no cascade,
 * which is exactly the limit of `T1 SOURCE`: it can read what a file declares, never what
 * a browser resolves. A detector that wants more than this must report UNJUDGEABLE.
 *
 * It reports what it could not read as well as what it read. Five constructs of one family
 * have now been found by probe — a brace inside a quoted string, an unterminated string, a
 * brace inside an unquoted url token, a comment delimiter inside one, an escaped brace in an
 * ident — and every one of them hid a declaration the browser applies from every detector,
 * so the file came back clean. A hand-rolled scanner has no upper bound on that family, and
 * patching it one probe at a time converges on nothing. So `scanStylesheet` returns, beside
 * the blocks it read, the reasons it could not confidently tokenise the file: a comment,
 * string or url token still open at end of input, a brace that closes no block or a block
 * never closed, a declaration whose parentheses do not balance, and any text inside a rule it
 * had to discard. The engine turns any of them into UNJUDGEABLE for every rule that would
 * have read the file, so the construct nobody has found yet costs those rules their verdict
 * instead of passing them in silence.
 */

/*
 * CSS Syntax §4.3.5: a string ends at an unescaped newline. The token is a bad-string, the
 * construct holding it is a parse error, and the parser recovers at that newline — it does not
 * read the rest of the file as string content. A scanner that runs the quote to end of file
 * loses every rule after it, which is the `content: "}"` hole reached from the other side: the
 * stylesheet the browser applies and the stylesheet the checker reads stop being one file, and
 * a literal in an ordinary rule below goes unjudged while it ships. An escaped newline is a
 * line continuation and stays inside the string.
 *
 * The recovery belongs to strings alone, because CSS ends the other two runaway constructs
 * elsewhere: a comment ends at its closing delimiter or, unterminated, at end of file (§4.3.2,
 * a parse error that still consumes the rest of the input), and a url() token ends at `)` or at
 * end of file with a newline inside it read as whitespace — bad-url recovery runs to `)` or end
 * of file too (§4.3.6, §4.3.14). Neither ends at a newline, so neither is recovered at one here.
 */
function isNewline(ch) {
  return ch === "\n" || ch === "\r" || ch === "\f";
}

/** An ident code point (§4.2): letters, digits, `_`, `-`, and everything non-ASCII. */
function isIdentChar(ch) {
  return /[A-Za-z0-9_-]/.test(ch) || ch.charCodeAt(0) > 127;
}

/*
 * The reasons one file could not be tokenised. Bounded, because a single truncated stylesheet
 * would otherwise write a report line nobody reads; the count of what was left out is kept, so
 * the bound never turns into a silence of its own.
 */
const UNREADABLE_LIMIT = 8;

function unreadableLog() {
  const listed = [];
  let suppressed = 0;
  return {
    note(reason) {
      if (listed.includes(reason)) return;
      if (listed.length < UNREADABLE_LIMIT) listed.push(reason);
      else suppressed += 1;
    },
    reasons() {
      if (suppressed === 0) return listed;
      return [...listed, `${suppressed} further tokenisation problems in this file were not listed`];
    }
  };
}

/*
 * CSS Syntax §4.3.6: after `url(` the first non-whitespace code point decides the form. A quote
 * opens a string, which the quote handling below already reads; anything else opens a url token
 * whose `{`, `}`, `;`, `:` and `/*` are ordinary code points and which ends only at `)` — or, as
 * a bad url, at that same `)` or end of input (§4.3.14). A scanner that reads the brace in
 * `url(a}b)` as structure closes a block the stylesheet never closed, so every declaration after
 * it falls outside any rule and no detector ever sees it while the browser goes on applying it.
 * The comment delimiter is the same hole one layer up: comments are consumed by the top-level
 * tokenizer and never inside a url token, so `url(a/*b)` is a url whose value carries `/*`, and
 * a comment stripper that blanks from there to the end of the file deletes the rest of the
 * stylesheet before the stack machine ever runs.
 */

/**
 * If `index` opens an unquoted `url(` token, return where it ends and whether it was closed:
 * `end` is just past the closing `)`, or the end of the text when the token is unterminated.
 * Return null otherwise — the quoted `url("…")` form included, whose argument is a string the
 * callers already read as one.
 */
function unquotedUrl(text, index) {
  if (!/^url\($/i.test(text.slice(index, index + 4))) return null;
  // `myurl(` and an escaped `\75 rl(` are other tokens; only a bare `url` ident opens this one.
  const before = index > 0 ? text[index - 1] : "";
  if (before === "\\" || isIdentChar(before)) return null;
  let cursor = index + 4;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  if (text[cursor] === '"' || text[cursor] === "'") return null;
  while (cursor < text.length && text[cursor] !== ")") {
    if (text[cursor] === "\\" && cursor + 1 < text.length) cursor += 1;
    cursor += 1;
  }
  return { end: Math.min(cursor + 1, text.length), terminated: cursor < text.length };
}

/**
 * Replace comment bodies with spaces so every later offset keeps its line number, reading the
 * three constructs a comment delimiter can be inside of — a url token, a string, an escape —
 * in the same left-to-right pass the tokenizer uses, so whichever opened first wins.
 */
function scanComments(text, log) {
  let out = "";
  let index = 0;
  let line = 1;
  const emit = (chunk, blank) => {
    for (const ch of chunk) {
      out += blank && ch !== "\n" ? " " : ch;
      if (ch === "\n") line += 1;
    }
  };
  while (index < text.length) {
    const ch = text[index];
    if (ch === "u" || ch === "U") {
      const url = unquotedUrl(text, index);
      if (url) {
        // Verbatim: everything between `url(` and `)` is ordinary text, comment delimiters
        // included, and blanking any of it would hand the stack machine a different file.
        emit(text.slice(index, url.end), false);
        index = url.end;
        continue;
      }
    }
    if (ch === "/" && text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2);
      const stop = end === -1 ? text.length : end + 2;
      if (end === -1) {
        log.note(`a comment opened at line ${line} is never closed, so the rest of the file was discarded`);
      }
      emit(text.slice(index, stop), true);
      index = stop;
      continue;
    }
    if (ch === "\\" && index + 1 < text.length && !isNewline(text[index + 1])) {
      // §4.3.7: the escaped code point is text, so `\/` never opens a comment and `\"` never
      // opens a string.
      emit(text.slice(index, index + 2), false);
      index += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let cursor = index + 1;
      while (cursor < text.length && text[cursor] !== quote && !isNewline(text[cursor])) {
        if (text[cursor] === "\\") cursor += 1;
        cursor += 1;
      }
      // The closing quote belongs to the string; a newline does not. Leaving the newline to
      // the outer loop keeps the line count and puts everything after it back in scope.
      const stop = Math.min(text[cursor] === quote ? cursor + 1 : cursor, text.length);
      emit(text.slice(index, stop), false);
      index = stop;
      continue;
    }
    emit(ch, false);
    index += 1;
  }
  return out;
}

/** Replace comment bodies with spaces so every later offset keeps its line number. */
function stripComments(text) {
  return scanComments(text, unreadableLog());
}

/**
 * The parenthesis balance of a declaration, reading quoted strings and escapes as text. A
 * value that does not balance is a value whose end the scanner guessed, which is the shape
 * every hole in this family has had.
 */
function parenBalance(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
  }
  return depth;
}

function splitDeclaration(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    // §4.3.7 again: an escaped colon is part of the ident, so it never divides a declaration,
    // and an escaped quote opens no string.
    if (ch === "\\") {
      i += 1;
      continue;
    }
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
 * Parse a stylesheet into rule blocks and the reasons it could not be tokenised. Each block
 * records its selector list, the at-rule contexts it sits inside, and its declarations with
 * line numbers; `unreadable` is empty for a file the scanner read with confidence and holds
 * one line per problem otherwise.
 */
function scanStylesheet(text) {
  const log = unreadableLog();
  const src = scanComments(text, log);
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
    const at = bufferLine || line;
    if (rule && text_ !== "") {
      const split = splitDeclaration(text_);
      if (split && split.prop !== "") {
        rule.declarations.push({ prop: split.prop.toLowerCase(), raw: split.prop, value: split.value, line: at });
      } else {
        // Text inside a rule that is not a declaration is text the scanner threw away. It is
        // the residue every hole in this family leaves behind, so it is reported rather than
        // dropped: whatever it was, no detector saw it.
        log.note(`the text at line ${at} is inside a rule and is not a declaration this scanner can read`);
      }
      if (parenBalance(text_) !== 0) {
        log.note(`the declaration at line ${at} does not balance its parentheses, so its value ends where the scanner guessed`);
      }
    }
    resetBuffer();
  };

  // A quoted string is text, never structure. `content: "}"` is one declaration, and a
  // scanner that reads the brace inside it closes a block the stylesheet never closed —
  // every declaration after it then falls outside the rule and no detector ever sees it.
  let quote = null;
  let quoteLine = 0;

  for (let index = 0; index < src.length; index += 1) {
    const ch = src[index];
    if (quote) {
      if (ch === "\\" && index + 1 < src.length) {
        const next = src[index + 1];
        if (next === "\n") line += 1;
        push(ch);
        push(next === "\n" ? " " : next);
        index += 1;
        continue;
      }
      if (!isNewline(ch)) {
        if (ch === quote) quote = null;
        push(ch);
        continue;
      }
      // The bad-string rule: the string ends here and scanning resumes at this character, so
      // the newline below is whitespace again and everything after it parses as stylesheet.
      quote = null;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      quoteLine = line;
      push(ch);
      continue;
    }
    if (ch === "u" || ch === "U") {
      // An unquoted url token is one run of ordinary code points, ending at `)` (§4.3.6).
      const url = unquotedUrl(src, index);
      if (url) {
        if (!url.terminated) {
          log.note(`an unquoted url() token opened at line ${line} is still open at end of file`);
        }
        for (let cursor = index; cursor < url.end; cursor += 1) {
          const inner = src[cursor];
          if (isNewline(inner)) {
            if (inner === "\n") line += 1;
            push(" ");
            continue;
          }
          push(inner);
        }
        index = url.end - 1;
        continue;
      }
    }
    /*
     * §4.3.7: a backslash escapes the code point after it, and the pair is part of the ident it
     * sits in. `font-family: A\}B` is one declaration and `.a\} { … }` is one selector, so a
     * scanner that reads either brace as structure closes a block the stylesheet never closed —
     * the same false-clean hole as the quoted brace and the url brace, reached from a third
     * side. A backslash before a newline escapes nothing (it is a parse error), so it is left
     * to the newline handling below and reported rather than guessed at.
     */
    if (ch === "\\") {
      const next = index + 1 < src.length ? src[index + 1] : "";
      if (next !== "" && !isNewline(next)) {
        push(ch);
        push(next);
        index += 1;
        continue;
      }
      log.note(`the backslash at line ${line} escapes nothing this scanner can read`);
      push(ch);
      continue;
    }
    if (isNewline(ch)) {
      if (ch === "\n") line += 1;
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
      if (stack.length === 0) {
        log.note(`the closing brace at line ${line} closes no block this scanner had open`);
      }
      stack.pop();
      continue;
    }
    if (ch === ";") {
      flushDeclaration();
      continue;
    }
    push(ch);
  }

  if (quote !== null) {
    log.note(`the string opened at line ${quoteLine} is still open at end of file`);
  }
  if (stack.length > 0) {
    const outermost = stack[0];
    const openedAt = outermost.type === "rule" ? outermost.block.line : outermost.at.line;
    log.note(
      `${stack.length} block${stack.length === 1 ? "" : "s"} opened and never closed, the outermost at line ${openedAt}`
    );
  }
  if (buffer.trim() !== "") {
    log.note(`the text at line ${bufferLine || line} runs to end of file without closing`);
  }

  return { blocks, unreadable: log.reasons() };
}

/**
 * Parse a stylesheet into rule blocks. Each block records its selector list, the at-rule
 * contexts it sits inside, and its declarations with line numbers. Callers that must not
 * report a clean result on a file the scanner could not read use `scanStylesheet`.
 */
function parseStylesheet(text) {
  return scanStylesheet(text).blocks;
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
  scanStylesheet,
  selectorBase,
  selectorState,
  splitDeclaration,
  stripComments,
  varUses
};
