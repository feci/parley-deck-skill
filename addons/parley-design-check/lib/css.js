"use strict";

/*
 * parley-design-check — the T1 SOURCE scanner.
 *
 * A small stack machine over stylesheet text: at-rule contexts, rule blocks, declarations,
 * every one carrying the line it starts on. It parses no layout and computes no cascade,
 * which is exactly the limit of `T1 SOURCE`: it can read what a file declares, never what
 * a browser resolves. A detector that wants more than this must report UNJUDGEABLE.
 *
 * It reports what it could not read as well as what it read. Seven constructs of one family
 * have now been found by probe — a brace inside a quoted string, an unterminated string, a
 * brace inside an unquoted url token, a comment delimiter inside one, an escaped brace in an
 * ident, an escaped spelling of the `url` ident, and a brace inside any `(…)` or `[…]` — and
 * every one of them hid a declaration the browser applies from every detector, so the file came
 * back clean. The last two got past the fail-safe as well: what they left behind balanced its
 * parentheses and braces, so no reason was recorded and the run certified L3 with PASS and exit
 * 0. A hand-rolled scanner has no upper bound on that family, and patching it one probe at a
 * time converges on nothing. So `scanStylesheet` returns, beside the blocks it read, the reasons
 * it could not confidently tokenise the file: a comment, string or url token still open at end
 * of input, a brace that closes no block or a block never closed, a declaration whose
 * parentheses do not balance, an escape it will not decode, and any text inside a rule it had to
 * discard. The engine turns any of them into UNJUDGEABLE for every rule that would have read the
 * file, so the construct nobody has found yet costs those rules their verdict instead of passing
 * them in silence.
 */

/*
 * The block model (§5.4). `(`, `[` and `{` each open a matched simple block that ends only at
 * its own closing code point; every other code point inside one — braces included — is content.
 * A scanner that reads `{` and `}` as rule structure wherever they appear closes a rule the
 * stylesheet never closed at the first brace inside any function, drops every declaration
 * between there and the next `{` as top-level text, and opens a phantom block at that `{`. One
 * re-balancing brace is enough to leave every residue check quiet — each flushed fragment
 * balances its own parentheses while the structure between the flushes is wrong — so
 * `.a { background: x) fn(}y); color: #ff0000; dummy: z) fn({w: (1); }` certified L3 with PASS
 * and exit 0 while a browser applied the raw colour. No malformed input is needed: any ordinary
 * function with a brace in its arguments has this shape.
 *
 * So the open blocks are one stack. `(`, `[` and `{` push; a closer pops only when it matches
 * the innermost open block, because §5.4.7 returns a mismatched closer as an ordinary preserved
 * token, which is what a browser does with it. `{` opens a rule, `}` closes one, and `;` ends a
 * declaration only when the innermost open block is a rule — inside `(…)` or `[…]` all three are
 * content. A block still open at end of input is reported through the unreadable channel.
 */

/*
 * The decoding decision (§4.3.7, §4.3.11), recorded because it is this file's contract with
 * every detector. A browser decides what a declaration means from what its tokens *spell*, not
 * from how they are written, so `col\6fr` is `color`, `#\66 f0000` is `#ff0000`, `\72 ed` is
 * `red` and `11p\78` is `11px`. Every detector matches text with a regular expression, so
 * every one of them was reading the spelling and missing the meaning: four probes, each a
 * `.probe` rule beside the sound run at `--level L3`, produced PASS, exit 0, verified L3, an
 * empty unreadable list and no finding while Chromium computed the value. That is generic to
 * all eighteen detectors, not to one rule.
 *
 * So each declaration carries both: `prop` and `value` are what the declaration spells, and
 * `rawProp` and `rawValue` are how the file writes it. Detectors match the spelled form —
 * which is the safe default, because a detector that forgets which field to read still reads
 * the one a browser agrees with — and report the written form, which is what a reader has to
 * find in the file (`asWritten`).
 *
 * What is decoded, and what is not:
 *   - Ident sequences, and any escape outside a string or a url token, are decoded. This is the
 *     ident, function name, custom ident, hash body and dimension unit — every token whose
 *     spelled value a detector reads.
 *   - A url token's contents are kept verbatim. They are an opaque locator: no detector reads a
 *     name, a length or a colour out of one, so decoding buys nothing, while a decoded `\29`
 *     would put a `)` in the middle of a value and change what every later reader counts.
 *   - A string's contents are decoded only where the escape spells an ident code point or a
 *     space. `font-family: "\49 nter"` is `Inter` to a browser and has to be `Inter` here, or
 *     the face rules read a spelling no allowlist and no annex will ever match. But an escape
 *     spelling a quote, a backslash, a comma or a brace would corrupt the value for the
 *     consumers that split it on those code points, so it is not decoded: the string is kept
 *     verbatim and the file is reported unreadable, which costs the rules their verdict rather
 *     than handing them a value nobody can trust.
 *   - An escape this scanner cannot classify at all (§4.3.8: a backslash before a newline or at
 *     end of input) is reported the same way.
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
  return ch !== undefined && (/[A-Za-z0-9_-]/.test(ch) || ch.charCodeAt(0) > 127);
}

/** An ident-start code point (§4.2): letters, `_`, and everything non-ASCII. Digits are not. */
function isIdentStartChar(ch) {
  return ch !== undefined && (/[A-Za-z_]/.test(ch) || ch.charCodeAt(0) > 127);
}

/** A whitespace code point (§4.2): newline, tab, space. */
function isWhitespace(ch) {
  return ch === "\n" || ch === "\r" || ch === "\f" || ch === "\t" || ch === " ";
}

/*
 * §4.3.8: `\` and the code point after it are a valid escape unless that code point is a
 * newline. A backslash at end of input escapes nothing either. Both forms are parse errors,
 * and this scanner refuses to guess at either: an escape it cannot classify is reported as
 * unreadable rather than read as inert text, because inert text is what let the sixth
 * construct through.
 */
function validEscape(text, index) {
  return text[index] === "\\" && index + 1 < text.length && !isNewline(text[index + 1]);
}

const HEX = /[0-9A-Fa-f]/;

/*
 * §4.3.7: consume an escaped code point. A backslash followed by hex digits takes up to six of
 * them and one trailing whitespace with them, and those digits are the code point; a backslash
 * followed by anything else spells the code point after it. Zero, a surrogate and a value above
 * the maximum code point all spell U+FFFD, which is what a browser substitutes for them.
 *
 * `end` is the first code point after the escape and `value` is what the escape spells. The
 * value is the load-bearing half: a token's class is decided by what its ident spells and not
 * by how it is written (§4.3.4), so `u\72l(` and `\75 rl(` are both the `url` ident and both
 * open a url token, while a scanner reading only a literal `url(` sees neither.
 */
function consumeEscape(text, index) {
  const next = text[index + 1];
  if (!HEX.test(next)) return { end: index + 2, value: next };
  let cursor = index + 1;
  let hex = "";
  while (cursor < text.length && hex.length < 6 && HEX.test(text[cursor])) {
    hex += text[cursor];
    cursor += 1;
  }
  if (cursor < text.length && isWhitespace(text[cursor])) {
    cursor += text[cursor] === "\r" && text[cursor + 1] === "\n" ? 2 : 1;
  }
  const code = Number.parseInt(hex, 16);
  const replaced = code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff);
  return { end: cursor, value: replaced ? "�" : String.fromCodePoint(code) };
}

/** §4.3.9: whether the code points at `index` would start an ident sequence. */
function startsIdentSequence(text, index) {
  const ch = text[index];
  if (ch === undefined) return false;
  if (ch === "-") {
    const next = text[index + 1];
    return next === "-" || isIdentStartChar(next) || validEscape(text, index + 1);
  }
  if (ch === "\\") return validEscape(text, index);
  return isIdentStartChar(ch);
}

/**
 * §4.3.11: consume an ident sequence, decoding its escapes. `end` is just past the ident and
 * `value` is what it spells.
 */
function consumeIdentSequence(text, index) {
  let cursor = index;
  let value = "";
  while (cursor < text.length) {
    if (isIdentChar(text[cursor])) {
      value += text[cursor];
      cursor += 1;
      continue;
    }
    if (validEscape(text, cursor)) {
      const escape = consumeEscape(text, cursor);
      value += escape.value;
      cursor = escape.end;
      continue;
    }
    break;
  }
  return { end: cursor, value };
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
 * If `parenIndex` holds the `(` that follows a `url` ident, return where the unquoted token
 * ends and whether it was closed: `end` is just past the closing `)`, or the end of the text
 * when the token is unterminated. Return null for the quoted `url("…")` form, whose argument
 * is a string the callers already read as one.
 */
function unquotedUrl(text, parenIndex) {
  let cursor = parenIndex + 1;
  while (cursor < text.length && isWhitespace(text[cursor])) cursor += 1;
  if (text[cursor] === '"' || text[cursor] === "'") return null;
  while (cursor < text.length && text[cursor] !== ")") {
    cursor = validEscape(text, cursor) ? consumeEscape(text, cursor).end : cursor + 1;
  }
  return { end: Math.min(cursor + 1, text.length), terminated: cursor < text.length };
}

/**
 * §4.3.4: the ident-like token at `index`, or null where no ident sequence starts there.
 * `end` is just past the ident, `value` is what the ident spells, and `url` is the unquoted url
 * token it opens when that value is `url` and a `(` follows it immediately — the check the spec
 * makes on the decoded value, so an escaped spelling opens the same token an unescaped one does.
 *
 * A position whose previous code point is an ident code point is inside a token that began
 * earlier, and the ident there is not one of its own: `myurl(` is a function and `1url(` a
 * dimension followed by a paren, and neither is a url token however the `url` is spelled.
 */
function identLikeToken(text, index) {
  if (index > 0 && isIdentChar(text[index - 1])) return null;
  if (!startsIdentSequence(text, index)) return null;
  const ident = consumeIdentSequence(text, index);
  const opensUrl = ident.value.toLowerCase() === "url" && text[ident.end] === "(";
  return { end: ident.end, value: ident.value, url: opensUrl ? unquotedUrl(text, ident.end) : null };
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
    /*
     * The ident sequence goes first, before any comment can be recognised inside it, because
     * what an ident spells decides the class of the token that follows it (§4.3.4). Reading
     * only a literal `url(` made `background: u\72l(a/*) ; color: #ff0000;` followed by a
     * closing delimiter and `b)` look like a comment opener: the browser closed the url token
     * at its `)` and applied the colour, this pass blanked from the delimiter it thought it had
     * found to the closing one and deleted the colour, and the text left behind balanced its
     * parentheses and braces — so nothing was recorded as unreadable and the run certified.
     */
    const token = identLikeToken(text, index);
    if (token) {
      // Verbatim: an ident carries its own escapes (§4.3.7), and everything between `url(` and
      // `)` is ordinary text, comment delimiters included (§4.3.6). Blanking any of it would
      // hand the stack machine a different file.
      const stop = token.url ? token.url.end : token.end;
      emit(text.slice(index, stop), false);
      index = stop;
      continue;
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
    if (validEscape(text, index)) {
      // §4.3.7: the escaped code point is text, so `\/` never opens a comment and `\"` never
      // opens a string. An escape reached here sits where no ident starts — inside a number's
      // unit, say — and is consumed whole all the same, so its trailing whitespace cannot be
      // mistaken for the start of anything.
      const escape = consumeEscape(text, index);
      emit(text.slice(index, escape.end), false);
      index = escape.end;
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

/**
 * §4.3.5: the string token at `index`. `end` is just past the closing quote, or at the newline
 * that ended it as a bad-string, or at end of input.
 */
function stringToken(text, index) {
  const quote = text[index];
  let cursor = index + 1;
  while (cursor < text.length && text[cursor] !== quote && !isNewline(text[cursor])) {
    cursor = validEscape(text, cursor) ? consumeEscape(text, cursor).end : cursor + 1;
  }
  return { end: Math.min(text[cursor] === quote ? cursor + 1 : cursor, text.length) };
}

/**
 * What a string token spells, where every escape in it spells an ident code point or a space.
 * Anything else — a quote, a backslash, a comma, a brace — would change how the consumers that
 * split a value on those code points read it, so the token is returned as written and the
 * caller is told, which costs the file's rules their verdict rather than their honesty.
 */
function decodeStringToken(token, note) {
  if (!token.includes("\\")) return token;
  let out = "";
  let index = 0;
  while (index < token.length) {
    if (token[index] !== "\\") {
      out += token[index];
      index += 1;
      continue;
    }
    if (!validEscape(token, index)) {
      note("carries a backslash that escapes nothing this scanner can read");
      out += token[index];
      index += 1;
      continue;
    }
    const escape = consumeEscape(token, index);
    if (escape.value !== " " && !isIdentChar(escape.value)) {
      note(`carries a string escape spelling ${JSON.stringify(escape.value)}, which this scanner will not decode`);
      return token;
    }
    out += escape.value;
    index = escape.end;
  }
  return out;
}

/**
 * What a declaration's property or value spells, which is what a browser reads it as and so
 * what every detector has to match. Ident sequences and loose escapes are decoded; a url
 * token's contents are kept verbatim; a string's contents are decoded only as far as
 * `decodeStringToken` will go. `note` receives every escape this scanner will not decode.
 */
function decodeDeclarationText(text, note) {
  if (!text.includes("\\")) return text;
  let out = "";
  let index = 0;
  while (index < text.length) {
    const ch = text[index];
    if (ch === '"' || ch === "'") {
      const string_ = stringToken(text, index);
      out += decodeStringToken(text.slice(index, string_.end), note);
      index = string_.end;
      continue;
    }
    const token = identLikeToken(text, index);
    if (token) {
      out += token.value;
      // §4.3.6: everything between `url(` and `)` is one token's contents, and stays as written.
      if (token.url) out += text.slice(token.end, token.url.end);
      index = token.url ? token.url.end : token.end;
      continue;
    }
    if (ch === "\\") {
      // §4.3.8: a backslash before a newline or at end of input escapes nothing. Guessing at it
      // is what the fail-safe exists to prevent, so it is reported and left as written.
      if (!validEscape(text, index)) {
        note("carries a backslash that escapes nothing this scanner can read");
        out += ch;
        index += 1;
        continue;
      }
      const escape = consumeEscape(text, index);
      out += escape.value;
      index = escape.end;
      continue;
    }
    out += ch;
    index += 1;
  }
  return out;
}

/**
 * How a declaration is written, where the file writes it differently from what it spells. A
 * detector reports what a browser applies; a reader has to find what the file says.
 */
function asWritten(declaration) {
  if (declaration.rawProp.toLowerCase() === declaration.prop && declaration.rawValue === declaration.value) {
    return "";
  }
  return ` (written \`${declaration.rawProp}: ${declaration.rawValue}\`)`;
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
  // The innermost open block, whose kind decides whether `{`, `}` and `;` are structure or
  // content (§5.4). Inside a `(…)` or a `[…]` all three are content.
  const inValueBlock = () => {
    const top = stack[stack.length - 1];
    return top !== undefined && (top.type === "paren" || top.type === "bracket");
  };
  const flushDeclaration = () => {
    const rule = currentRule();
    const text_ = buffer.trim();
    const at = bufferLine || line;
    if (rule && text_ !== "") {
      const split = splitDeclaration(text_);
      if (split && split.prop !== "") {
        const note = (reason) => log.note(`the declaration at line ${at} ${reason}`);
        const prop = decodeDeclarationText(split.prop, note);
        rule.declarations.push({
          prop: prop.toLowerCase(),
          value: decodeDeclarationText(split.value, note),
          rawProp: split.prop,
          rawValue: split.value,
          line: at
        });
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
    /*
     * The ident sequence, escapes and all, and the token it opens (§4.3.4, §4.3.11).
     *
     * §4.3.7 makes the escaped code point part of the ident that carries it, so `A\}B` is one
     * value and `.a\} { … }` one selector, and a scanner reading either brace as structure
     * closes a block the stylesheet never closed. §4.3.6 ends an unquoted url token at `)` and
     * reads its `{`, `}`, `;` and `:` as ordinary code points. Both tests are made on what the
     * ident spells rather than on how it is written, because that is the test the tokenizer
     * makes: `u\72l(` and `\75 rl(` are the `url` ident, and a browser applies everything after
     * the `)` they close whether or not this scanner recognised the spelling.
     */
    const token = identLikeToken(src, index);
    if (token) {
      if (token.url && !token.url.terminated) {
        log.note(`an unquoted url() token opened at line ${line} is still open at end of file`);
      }
      const stop = token.url ? token.url.end : token.end;
      for (let cursor = index; cursor < stop; cursor += 1) {
        const inner = src[cursor];
        if (isNewline(inner)) {
          if (inner === "\n") line += 1;
          push(" ");
          continue;
        }
        push(inner);
      }
      index = stop - 1;
      continue;
    }
    /*
     * An escape where no ident starts — inside a number's unit, say — is still one token's
     * worth of text and never structure. A backslash before a newline or at end of input
     * escapes nothing (both are parse errors), and that is the one escape this scanner cannot
     * classify: it is reported rather than guessed at, because guessing is what the fail-safe
     * exists to prevent.
     */
    if (ch === "\\") {
      if (validEscape(src, index)) {
        const escape = consumeEscape(src, index);
        for (let cursor = index; cursor < escape.end; cursor += 1) {
          const inner = src[cursor];
          if (isNewline(inner)) {
            if (inner === "\n") line += 1;
            push(" ");
            continue;
          }
          push(inner);
        }
        index = escape.end - 1;
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
    /*
     * §5.4.7: `(` and `[` open matched simple blocks of their own, and a closer that does not
     * match the innermost open block is returned as an ordinary preserved token — which is what
     * a browser does with a stray `)` or `]`, so this scanner keeps it in the value too.
     */
    if (ch === "(" || ch === "[") {
      stack.push({ type: ch === "(" ? "paren" : "bracket", line });
      push(ch);
      continue;
    }
    if (ch === ")" || ch === "]") {
      const top = stack[stack.length - 1];
      if (top !== undefined && top.type === (ch === ")" ? "paren" : "bracket")) stack.pop();
      push(ch);
      continue;
    }
    if (ch === "{") {
      if (inValueBlock()) {
        push(ch);
        continue;
      }
      const prelude = buffer.trim();
      const startLine = bufferLine || line;
      resetBuffer();
      if (prelude.startsWith("@")) {
        const name = (/^@([a-zA-Z-]+)/.exec(prelude) || [null, ""])[1].toLowerCase();
        stack.push({ type: "at", line: startLine, at: { name, prelude, line: startLine } });
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
        stack.push({ type: "rule", line: startLine, block });
      }
      continue;
    }
    if (ch === "}") {
      if (inValueBlock()) {
        push(ch);
        continue;
      }
      flushDeclaration();
      if (stack.length === 0) {
        log.note(`the closing brace at line ${line} closes no block this scanner had open`);
      }
      stack.pop();
      continue;
    }
    if (ch === ";") {
      if (inValueBlock()) {
        push(ch);
        continue;
      }
      flushDeclaration();
      continue;
    }
    push(ch);
  }

  if (quote !== null) {
    log.note(`the string opened at line ${quoteLine} is still open at end of file`);
  }
  if (stack.length > 0) {
    log.note(
      `${stack.length} block${stack.length === 1 ? "" : "s"} opened and never closed, the outermost at line ${stack[0].line}`
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

/**
 * Every `var(--name)` reference in a text, with its line.
 *
 * The same rule as the declarations, one layer out: a browser resolves a reference by what its
 * tokens spell, so `\76 ar(--brand)` and `var(\2d\2d brand)` are both `var(--brand)` and both
 * invisible to a regular expression over the raw line. Chromium resolves either — the fallback
 * in `.probe { grid-area: \76 ar(--nope, #ff0000) }` computes — while the reference to an
 * undeclared token went unreported and the run certified L3 with PASS and exit 0. Decoding is a
 * no-op on a line carrying no backslash, which is every line of an ordinary stylesheet.
 */
function varUses(text) {
  const uses = [];
  const lines = text.split(/\r?\n/);
  const silent = () => {};
  lines.forEach((content, index) => {
    for (const match of decodeDeclarationText(content, silent).matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
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
  asWritten,
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
