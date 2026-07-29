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
 * The block model (§5.4.4, §5.4.7), and why it is a model rather than a list of constructs.
 *
 * `(`, `[` and `{` each open a matched simple block that ends only at its own closing code
 * point; every other code point inside one — braces, semicolons and mismatched closers included
 * — is content. Eight fix-up cycles closed members of one family one at a time, and each time a
 * probe found the next, because each fix knew about the constructs already filed and nothing
 * about the rule they are instances of. Two of those fixes read `{` and `}` as rule structure
 * wherever they appeared; the third tracked `(` and `[` but let a `{` inside one of them stay
 * mere content, so the stack no longer described the file. In
 * `.a { background: fn({) }x); color: #ff0000; dummy: fn({) {y: (1); }` a browser keeps the `)`
 * inside the `{…}`, closes that block at the `}`, and closes the function at the last `)`; a
 * scanner that never pushed the `{` pops the function at that `)` instead, reads the `}` as the
 * end of the rule, drops `color: #ff0000` as top-level text no rule owns, and opens a phantom
 * rule at the later `{`. Every stack entry and every buffer then ends balanced, so no residue
 * check fires: the run certified L3 with PASS and exit 0 while Chromium applied the raw colour.
 *
 * So the open blocks are one stack, and it is the only thing that decides what a brace means:
 *
 *   - `(`, `[` and `{` push. A `{` pushes a *rule* when the innermost open block is a rule or
 *     there is none — the only place a stylesheet may open one — and a component-value block
 *     otherwise, because a `{` inside `(…)`, `[…]` or another such block is part of a value.
 *   - A closer pops only when it matches the innermost open block. §5.4.7 returns a mismatched
 *     closer as an ordinary preserved token, which is what a browser does with it, so it stays
 *     in the value here too and closes nothing.
 *   - `}` closes a rule, and `;` ends a declaration, only when the innermost open block is a
 *     rule or there is none. Inside any component-value block both are content.
 *
 * That is the whole rule; `url()`, strings, comments and escapes are tokens consumed before it
 * runs, never special cases inside it. A block still open at end of input, a `}` that closes
 * nothing, and a declaration whose parentheses do not balance are reported through the
 * unreadable channel, so what the model cannot resolve costs a verdict instead of passing.
 */

/*
 * The token layer under the block model: what consumes each §4 token, and why the record is
 * per consumer rather than per token type.
 *
 * A correct stack over the wrong token stream is not a correct scanner. Cycle 9 built the block
 * model and the next probe went one level down: `#url(` and `@url(` reached the url branch of
 * the ident-like token, consumed through the first `)`, and the parentheses that decide what the
 * later braces mean never reached the stack — the applied colour fell out as top-level text, a
 * phantom rule opened, everything balanced, and the run certified L3 with PASS and exit 0.
 *
 * So cycle 10 stopped waiting for the next member and walked the §4 token list instead. That
 * enumeration was right about every token type and still missed a member, because it asked a
 * question with one answer per type — "is this token consumed whole before any structural
 * decision?" — of a file that had more than one consumer. `scanComments` read the string token
 * with a loop of its own, one code point after each backslash where §4.3.7 takes up to six
 * hexadecimal digits and the whitespace after them. So the pre-pass and the stack machine
 * disagreed about where `content: "x\41` + newline + `"` ends, a real comment fell inside a
 * string one of them had invented, and the run again certified L3 with PASS and exit 0 while
 * Chromium applied the colour. The verdict "the string is consumed above, before the stack" was
 * true of the consumer it was checked against and false of the other one.
 *
 * A token type therefore gets a verdict only together with the function that consumes it, and
 * that function has to be the *only* one — two implementations that agree today drift tomorrow,
 * which is exactly what these two did. The passes are `scanComments` (blank comment bodies),
 * `scanStylesheet` (the block model and the declarations), `decodeDeclarationText` with
 * `decodeStringToken` (what a declaration spells), `maskOpaqueTokens` (what a literal matcher may
 * read), and `splitDeclaration` with `parenBalance` (where a declaration divides, and whether its
 * parentheses close). Every one of them reaches a token only through the column below.
 *
 *   §4 token type                    the one consumer            read by
 *   ------------------------------   -------------------------   ------------------------------
 *   ident, function (§4.3.4)         identLikeToken              comments, stylesheet, decode,
 *                                     (consumeIdentSequence)      mask
 *   url, bad-url (§4.3.6, §4.3.14)   unquotedUrl, via             comments, stylesheet, decode,
 *                                     identLikeToken              mask
 *   hash, at-keyword (§4.3.1)        hashOrAtToken               comments, stylesheet, decode,
 *                                                                 mask
 *   string, bad-string (§4.3.5)      stringToken                 comments, stylesheet, decode,
 *                                                                 mask, split, balance
 *   escape, in any token (§4.3.7)    validEscape, consumeEscape  all six
 *   comment (§4.3.2)                 scanComments                comments only — the pass whose
 *                                                                 whole job it is; every later
 *                                                                 pass reads its output
 *   {} () [] blocks (§5.4.4)         the stack in scanStylesheet stylesheet only; balance counts
 *                                                                 parentheses over one value
 *   CDO, CDC (§5.4.1)                scanStylesheet              stylesheet only; discarded where
 *                                                                 a rule would begin at the top
 *                                                                 level, content anywhere else
 *   number, percentage, dimension,   no consumer of their own    none: none of them can carry a
 *   delim, comma, colon, semicolon,                               `{`, `}`, `;` or `:` that this
 *   whitespace (§4.3.3, §4.3.1)                                   scanner would read as structure,
 *                                                                 and a `url` ident inside a
 *                                                                 unit is bound by the
 *                                                                 ident-code-point test in
 *                                                                 identLikeToken
 *
 * The rule the table encodes, and the one a later change has to keep: a pass may decide what a
 * token *means* for its own purpose, and may never decide where that token ends.
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
 * §4.3.1: the hash-token or at-keyword-token at `index`, or null where neither starts there.
 * `end` is just past the token and `value` is what it spells, the `#` or `@` included.
 *
 * `#` and `@` bind the ident sequence after them into one token, so the ident inside one is
 * never a token of its own and can never open a url token of its own. A browser reads `#url(`
 * as a hash-token followed by a `(` that opens a matched block, and `@url(` as an at-keyword
 * followed by the same `(`; a scanner that lets the ident start a url token instead consumes
 * through the first `)` and hands the block model a token stream no browser agrees with — the
 * parentheses that decide what the later braces mean never reach the stack. That is the shape
 * of every construct in this family, one layer below the model that was built to end it, so
 * these two tokens are consumed before ident-like tokens rather than patched afterwards.
 */
function hashOrAtToken(text, index) {
  const ch = text[index];
  if (ch !== "#" && ch !== "@") return null;
  // The asymmetry is the spec's: a hash-token needs only one ident code point or a valid escape
  // after the `#`, so `#0f0` is one, while an at-keyword needs a whole ident *sequence* to start
  // after the `@`, so `@0` is a delim and a number.
  const starts = ch === "#"
    ? isIdentChar(text[index + 1]) || validEscape(text, index + 1)
    : startsIdentSequence(text, index + 1);
  if (!starts) return null;
  const ident = consumeIdentSequence(text, index + 1);
  return { end: ident.end, value: ch + ident.value };
}

/**
 * §4.3.5: the string token at `index` — the one string consumer in this file, called by the
 * comment pre-pass, by the stack machine and by the decoder alike.
 *
 * `end` is just past the closing quote, and `terminated` says the quote was found. A string that
 * ended at a newline is a bad-string (§4.3.14) and `end` is *at* that newline, which belongs to
 * the stylesheet again rather than to the token; a string that ran out of input ends at end of
 * input, which is a parse error of its own. `end === text.length` with `terminated` false
 * separates the second from the first.
 *
 * The escape here is `consumeEscape` and never one code point. §4.3.7 takes up to six hexadecimal
 * digits and one trailing whitespace code point with them, and that whitespace may be the newline
 * that would otherwise end the string: `"x\41` + newline + `"` is the one string `"xA"` to a
 * browser. A second reading of this token that skipped only one code point after the backslash
 * ended that string at the newline, so a later real comment fell inside a string it had invented,
 * was left in the source, and reached the stack machine as declarations and blocks — balanced, so
 * nothing was recorded as unreadable and the run certified L3 with PASS and exit 0 while Chromium
 * applied the raw colour. Two readings of one token are two chances to disagree about where it
 * ends, which is why there is one.
 */
function stringToken(text, index) {
  const quote = text[index];
  let cursor = index + 1;
  while (cursor < text.length) {
    const ch = text[cursor];
    if (ch === quote) return { end: cursor + 1, terminated: true };
    if (isNewline(ch)) return { end: cursor, terminated: false };
    if (validEscape(text, cursor)) {
      cursor = consumeEscape(text, cursor).end;
      continue;
    }
    // §4.3.5: a backslash before a newline is a line continuation and stays inside the string.
    // A backslash at end of input escapes nothing, and the loop ends on it below.
    if (ch === "\\" && isNewline(text[cursor + 1])) {
      cursor += text[cursor + 1] === "\r" && text[cursor + 2] === "\n" ? 3 : 2;
      continue;
    }
    cursor += 1;
  }
  return { end: text.length, terminated: false };
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
    /*
     * The hash-token and the at-keyword, before the ident inside either can be read as a token
     * of its own (§4.3.1). `#url(a/*b)` is a hash-token, a matched block and a comment that runs
     * to end of file; reading the `url(` as a url token kept the delimiter as ordinary text and
     * left this pass reading a different file from the one the browser parsed.
     */
    const bound = hashOrAtToken(text, index);
    if (bound) {
      emit(text.slice(index, bound.end), false);
      index = bound.end;
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
      /*
       * The string token, through the same `stringToken` the stack machine uses (§4.3.5). This
       * pass once read the string itself, one code point after each backslash, and that second
       * reading was the last member of this family: a hexadecimal escape swallowing the newline
       * after it (§4.3.7) ended the string here and not there, so the two passes disagreed about
       * which spans were strings and the pre-pass decided whether a later `/*` was a comment from
       * a token stream no browser and no other pass agrees with.
       *
       * Nothing is blanked either way — a comment delimiter inside a string is text (§4.3.2), and
       * the closing quote belongs to the token while the newline that ends a bad-string does not,
       * so leaving that newline to the outer loop keeps the line count and puts everything after
       * it back in scope.
       */
      const string_ = stringToken(text, index);
      emit(text.slice(index, string_.end), false);
      index = string_.end;
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
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    // The shared consumers, for the same reason the two passes above share them: a private
    // reading of a string or an escape is a reading that can disagree with the tokenizer.
    if (ch === '"' || ch === "'") {
      i = stringToken(text, i).end - 1;
      continue;
    }
    if (ch === "\\") {
      i = validEscape(text, i) ? consumeEscape(text, i).end - 1 : i + 1;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
  }
  return depth;
}

/*
 * The code points a consumer of a *decoded* value reads as structure: the comma a font-family
 * list is split on, the parentheses and brackets a value's blocks are counted with, the braces
 * and the semicolon and colon a declaration is divided at, and the `#` and `/` a literal matcher
 * reads as the start of a colour or a ratio. An escape spelling one of these cannot be decoded
 * without changing what a later reader counts, so the token is kept as written and the file is
 * reported unreadable — which costs those rules their verdict rather than handing them a value
 * nobody can trust.
 *
 * A quote and a backslash are deliberately not in this set. Nothing downstream splits a decoded
 * value on either, and `content: "say \"hi\""` is ordinary CSS: reporting it cost every rule that
 * read the file its verdict over a string a browser reads without difficulty, which is the false
 * alarm that gets a gate switched off. That escape keeps the token as written — which is what the
 * detectors match and what a reader finds in the file — and says nothing.
 */
const VALUE_STRUCTURE = /[,(){}[\];:#/]/;

/**
 * What a string token spells, where every escape in it spells an ident code point or a space.
 * An escape spelling anything else leaves the token exactly as the file writes it; where that
 * code point is one a later reader counts, the caller is told as well.
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
      if (VALUE_STRUCTURE.test(escape.value)) {
        note(`carries a string escape spelling ${JSON.stringify(escape.value)}, which this scanner will not decode`);
      }
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
    // §4.3.1: a hash-token or an at-keyword spells its `#` or `@` and its decoded ident, and the
    // ident inside it opens nothing — `#\75 rl(a)` is the hash `#url` and a function, not a url.
    const bound = hashOrAtToken(text, index);
    if (bound) {
      out += bound.value;
      index = bound.end;
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
      /*
       * §4.3.3: reaching a loose escape with a digit immediately before it means the number
       * ended at that digit and this escape starts a dimension's unit — an ident sequence begun
       * anywhere else is consumed whole above. A unit whose first code point is not an ident
       * start is a unit no CSS length has, and flattening it into the number changes the number:
       * `1\31 px` is `1` with the unit `1px`, which Chromium discards, while the decoded text
       * reads `11px` and a size rule reports a literal nothing ships. The value is left as
       * written and the file goes to the fail-safe rather than to a detector that would misread
       * it. (Bounded on purpose: an escaped exponent such as `1\65 5` spells the ident-start
       * `e5`, so it is not caught here — see the enumeration.)
       */
      if (/[0-9]/.test(text[index - 1] ?? "") && !isIdentStartChar(escape.value)) {
        note(`carries the escape ${JSON.stringify(text.slice(index, escape.end))} directly after a digit, which this scanner cannot spell without changing the number before it`);
        out += text.slice(index, escape.end);
        index = escape.end;
        continue;
      }
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
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    // §4.3.5 and §4.3.7, through the shared consumers: a colon inside a string never divides a
    // declaration, an escaped colon is part of the ident that carries it, and an escaped quote
    // opens no string.
    if (ch === '"' || ch === "'") {
      i = stringToken(text, i).end - 1;
      continue;
    }
    if (ch === "\\") {
      i = validEscape(text, i) ? consumeEscape(text, i).end - 1 : i + 1;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === ":" && depth === 0) {
      return { prop: text.slice(0, i).trim(), value: text.slice(i + 1).trim() };
    }
  }
  return null;
}

/*
 * What an at-rule's body holds. The block model says where a block begins and ends; it says
 * nothing about whether the things inside one are rules or declarations, and that second
 * question has its own arm of this family. A declaration directly inside an at-rule had no rule
 * to be attributed to, so it was dropped — and dropped in silence, because dropping it is
 * correct for `@media` at the top level, where a browser discards it too. It is not correct for
 * `@scope`: Chromium applies `@scope (.probe) { color: #ff0000 }` to the scope root, and the
 * checker read no such declaration, recorded no reason, and returned PASS with exit 0.
 *
 * So the two shapes are named. A body of declarations becomes a block of its own, so its
 * declarations reach every detector exactly as a rule's do; a body of rules keeps the at-rule
 * as context for the rules inside it, and a bare declaration there is discarded by the browser
 * as well, so the silence is the two readings agreeing. What is in neither list is the shape
 * the model cannot resolve — and there the scanner says so rather than guessing, which is the
 * whole point of the fail-safe. Widening that to every discard is not available: it would
 * report `@font-face` in nearly every real stylesheet, and a rule that fires everywhere is a
 * rule that gets switched off.
 *
 * Why these are lists of names rather than a shape test, chosen deliberately because the guard
 * kept firing on shipped CSS (`@position-fallback`, `@try`, `@function` were all false
 * unreadables until they were named below). CSS Syntax does not decide an at-rule's body from
 * its shape: §5.4.2 hands the block to the at-rule's *own* grammar, so nothing in the token
 * stream distinguishes a declaration body from a rule body. A shape test would therefore be a
 * guess, and its two ways of being wrong are the two failures this scanner exists to avoid — read
 * a bare declaration an unknown at-rule's grammar discards and the run reports a literal no
 * browser applies; drop one it applies, as `@scope` does, and the run certifies clean over it.
 * So an at-rule this scanner does not know is an at-rule it says it cannot classify, and the cost
 * of that choice is an entry here whenever CSS adds one. The alternative costs a verdict's
 * honesty, which is not a trade this checker makes; the maintenance is the cheaper half.
 */
const DECLARATION_AT_RULES = new Set([
  "font-face", "page", "property", "counter-style", "scope", "viewport",
  "font-palette-values", "view-transition", "position-try",
  // Anchor positioning's earlier spelling of `@position-try`, and CSS Functions' `@function`,
  // whose body is the list of declarations that computes the function's `result`. Both shipped
  // and both reached the guard below, so both were false unreadables against ordinary CSS.
  "try", "function",
  // The margin boxes of `@page`.
  "top-left-corner", "top-left", "top-center", "top-right", "top-right-corner",
  "bottom-left-corner", "bottom-left", "bottom-center", "bottom-right", "bottom-right-corner",
  "left-top", "left-middle", "left-bottom", "right-top", "right-middle", "right-bottom",
  // The feature blocks of `@font-feature-values`.
  "swash", "annotation", "ornaments", "stylistic", "styleset", "character-variant",
  "historical-forms",
  /*
   * Build-time directives whose body is a list of declarations. A browser never sees these —
   * the build turns them into ordinary rules — but this checker reads source, and a source
   * stylesheet is where they live. `@theme` is the token layer of a Tailwind v4 project: over a
   * corpus of 278 real stylesheets it was the one at-rule that reached the fail-safe below, in
   * 32 files. Reporting those files unreadable would be the false alarm in every file that
   * makes a gate get switched off, and reading them is what the token rules want anyway.
   */
  "theme", "utility", "variant", "custom-variant"
]);

const RULE_AT_RULES = new Set([
  "media", "supports", "container", "layer", "document", "keyframes", "starting-style",
  "font-feature-values",
  // `@position-fallback` holds `@try` rules, so a bare declaration in its body is one a browser
  // discards too — the two readings agree and there is nothing to report.
  "position-fallback"
]);

/**
 * An at-rule's name without its vendor prefix, which is the name that decides its shape.
 *
 * The name is what the at-keyword's ident *spells*, not how it is written (§4.3.11): a browser
 * reads `@\73 cope` as `@scope` and applies its declarations to the scope root, so a scanner
 * matching the written form reads the same at-rule as one it cannot classify.
 */
function atRuleName(prelude) {
  if (prelude[0] !== "@") return "";
  return consumeIdentSequence(prelude, 1).value.toLowerCase().replace(/^-[a-z]+-/, "");
}

/** The closer each block-opening code point of §5.4.7 is matched by. */
const BLOCK_CLOSERS = { "(": ")", "[": "]", "{": "}" };

/**
 * What an `@function` prelude binds, and what it uses: `formals` are the custom property names
 * its parameter list declares, and `uses` are the `var()` references its parameter defaults
 * make. Reasons the list could not be read go to the caller's unreadable log.
 *
 * `@function --double(--x) { result: calc(var(--x) * 2) }` resolves `var(--x)` in its own body
 * from the argument its caller passes, never from the token layer, so a reference to a formal
 * parameter is not a reference to a token any contract could declare — reported as one it is a
 * finding against ordinary CSS.
 *
 * A parameter is `<custom-property-name> <css-type>? [ : <declaration-value> ]?`, so only the
 * *leading* ident of each top-level comma-separated segment is bound. Collecting every `--name`
 * after the opening parenthesis instead bound the names a parameter's default value references
 * as well, which turned a real use into a false clean — the worse direction of the same bug.
 * Chromium parses `@function --pick(--x: var(--ghost)) { result: var(--ghost) }` as a real
 * `CSSFunctionRule` and computes `color: --pick()` from `--ghost`; the checker bound `--ghost`
 * as a parameter, suppressed the body's reference to it, never collected the one in the default,
 * and certified PASS at verified L3 with no unreadable input and exit 0 over a token no ratified
 * document declares. A default value is a value: what it references is used, and only what the
 * segment leads with is bound.
 *
 * A parameter list this scanner cannot divide into parameters is not guessed at. It goes to the
 * unreadable channel and binds nothing, so the rules that read the file lose their verdict rather
 * than being handed a suppression nobody can trust.
 */
function functionBinding(prelude, line, log) {
  const nothing = { formals: new Set(), uses: [] };
  const note = (reason) => log.note(`the @function parameter list at line ${line} ${reason}`);

  /*
   * §4.3.4: a function token is an ident *immediately* followed by `(`, so the parameter list
   * opens at the code point after the function's own name and nowhere else. Taking the first `(`
   * in the text instead reads an escaped one inside that name — `@function --pi\(ck(--x)` — as
   * the opener. A prelude with no `(` there declares no parameter list a browser accepts, so
   * nothing is bound and nothing is suppressed, which is the safe half of that disagreement.
   *
   * CSS Functions names a function with a `<custom-property-name>`, so a prelude whose name is a
   * plain ident is not this at-rule however it is spelled. Sass has had `@function px-to-rem($n)`
   * for a decade, and this scanner reads source: across 639 real stylesheets, five preludes in two
   * `.scss` files were the only `@function` parameter lists this parser could not read as CSS, and
   * reporting them would have been the false alarm that gets a gate switched off. A name a browser
   * would not accept binds nothing here and says nothing about it.
   */
  let cursor = consumeIdentSequence(prelude, 1).end;
  while (isWhitespace(prelude[cursor])) cursor += 1;
  if (!startsIdentSequence(prelude, cursor)) return nothing;
  const functionName = consumeIdentSequence(prelude, cursor);
  if (!functionName.value.startsWith("--")) return nothing;
  const open = functionName.end;
  if (prelude[open] !== "(") return nothing;

  // The matching `)`, and the commas that divide the list at its own level. Strings, escapes and
  // nested blocks are read through the shared consumers, so a comma inside `"a,b"`, `\,`,
  // `type(<length>)` or `[a, b]` divides nothing — and a closer that matches no open block is an
  // ordinary preserved token (§5.4.7), exactly as the stack machine treats one.
  const stack = [")"];
  const commas = [];
  let close = -1;
  let index = open + 1;
  while (index < prelude.length) {
    const ch = prelude[index];
    if (ch === '"' || ch === "'") {
      index = stringToken(prelude, index).end;
      continue;
    }
    if (ch === "\\") {
      index = validEscape(prelude, index) ? consumeEscape(prelude, index).end : index + 1;
      continue;
    }
    if (BLOCK_CLOSERS[ch] !== undefined) {
      stack.push(BLOCK_CLOSERS[ch]);
      index += 1;
      continue;
    }
    if (ch === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) {
        close = index;
        break;
      }
      index += 1;
      continue;
    }
    if (ch === "," && stack.length === 1) commas.push(index);
    index += 1;
  }
  if (close === -1) {
    note("is still open at the end of the prelude, so this scanner cannot tell a parameter from a value");
    return nothing;
  }
  // `@function --now()` takes no parameters, which is a parameter list and not a defect.
  if (commas.length === 0 && prelude.slice(open + 1, close).trim() === "") return nothing;

  const formals = new Set();
  const uses = [];
  const bounds = [open, ...commas, close];
  for (let i = 0; i + 1 < bounds.length; i += 1) {
    const from = bounds[i] + 1;
    const to = bounds[i + 1];
    let at = from;
    while (at < to && isWhitespace(prelude[at])) at += 1;
    const name = startsIdentSequence(prelude, at) ? consumeIdentSequence(prelude, at) : null;
    if (!name || !name.value.startsWith("--")) {
      note(
        `carries ${JSON.stringify(prelude.slice(from, to).trim())}, which this scanner cannot read as a parameter`
      );
      return nothing;
    }
    formals.add(name.value);
    /*
     * Everything after the name is the parameter's optional type and its optional default value.
     * A default is read as the declaration value it is — decoded first, because `\76 ar(--ghost)`
     * is `var(--ghost)` to a browser — and every reference in it is collected as a use, through
     * the same `valueVarUses` an ordinary declaration goes through, so a `var()` written inside a
     * string or a url token here is the text it is there. No `<css-type>` can carry a `var()`, so
     * reading the type with the default costs nothing and spares this parser one more place to be
     * wrong about where a default begins.
     */
    const rest = decodeDeclarationText(prelude.slice(name.end, to), (reason) =>
      note(`carries a parameter that ${reason}`)
    );
    for (const used of valueVarUses(rest)) uses.push({ name: used, line });
  }
  return { formals, uses };
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
  /*
   * A token consumed whole: its code points go into the buffer as written, and none of them is
   * ever asked what it means for the structure. A newline inside one — an escape may swallow
   * one (§4.3.7), and a url token may contain one (§4.3.6) — still advances the line count, so
   * a finding after it names the line the file has.
   */
  const pushToken = (from, to) => {
    for (let cursor = from; cursor < to; cursor += 1) {
      const inner = src[cursor];
      if (isNewline(inner)) {
        if (inner === "\n") line += 1;
        push(" ");
        continue;
      }
      push(inner);
    }
    return to - 1;
  };
  const currentRule = () => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].type === "rule") return stack[i].block;
    }
    return null;
  };
  /*
   * The one question the block model answers, asked of the innermost open block (§5.4.4).
   * `paren`, `bracket` and `curly` are component-value blocks: inside any of them `{`, `}` and
   * `;` are content, and a `{` opens another component-value block rather than a rule. `rule`
   * and `at` are rule bodies, and so is the top level of the stylesheet, where all three are
   * structure. Nothing else may distinguish them, or the next construct in this family is a
   * construct the stack does not describe.
   */
  const openBlock = () => stack[stack.length - 1];
  const inComponentValue = () => {
    const top = openBlock();
    return top !== undefined && (top.type === "paren" || top.type === "bracket" || top.type === "curly");
  };
  /** The at-rule whose body is open, or null at the top level of the stylesheet. */
  const enclosingAt = () => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].at) return stack[i].at;
      if (stack[i].type === "rule") return null;
    }
    return null;
  };
  const flushDeclaration = () => {
    const rule = currentRule();
    const text_ = buffer.trim();
    const at = bufferLine || line;
    if (!rule && text_ !== "") {
      /*
       * A declaration with no rule to hold it. At the top level, and inside an at-rule whose
       * body is a list of rules, a browser discards it too, so the two readings agree and there
       * is nothing to report. Inside an at-rule this scanner cannot classify they may not
       * agree — `@scope` was exactly that, and Chromium applied what the scanner dropped — so
       * that shape, and only that shape, goes to the fail-safe.
       */
      const enclosing = enclosingAt();
      if (enclosing && !RULE_AT_RULES.has(enclosing.name) && splitDeclaration(text_)) {
        log.note(
          `the declaration at line ${at} sits directly inside @${enclosing.name}, whose body this scanner can read neither as rules nor as declarations`
        );
      }
    }
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

  /*
   * §5.4.4 and §5.4.6: a bad-string is a parse error, and the construct holding it is thrown
   * away — the parser consumes the remnants of the bad declaration, blocks and all, up to the
   * `;` or the `}` that ends it. Recovering at the newline and then reading what follows as
   * ordinary stylesheet is only half of that: the enumeration's own probe
   * `.a::before { content: "x` — newline — `.probe { color: #ff0000; } }` gave Chromium
   * `.a::before { }` and this scanner a phantom `.probe` rule carrying a colour no browser
   * paints, with `unreadable: []`. So the poison is carried: while it is set, `{` opens a
   * component-value block rather than a rule, and the text is discarded rather than read.
   */
  let badString = false;
  const discardBadDeclaration = () => {
    badString = false;
    resetBuffer();
  };

  for (let index = 0; index < src.length; index += 1) {
    const ch = src[index];
    /*
     * A quoted string is text, never structure. `content: "}"` is one declaration, and a scanner
     * that reads the brace inside it closes a block the stylesheet never closed — every
     * declaration after it then falls outside the rule and no detector ever sees it.
     *
     * The token is consumed by the same `stringToken` the comment pre-pass calls, so the two
     * passes cannot disagree about where it ends. Its three endings are three different things:
     * the closing quote is an ordinary string; end of input is a construct this scanner could not
     * close, and it says so; and a newline is a bad-string, whose newline is left to the loop —
     * scanning resumes at it as whitespace, so everything after it parses as stylesheet again,
     * while the construct holding it is a parse error whose remnants are consumed rather than
     * read.
     */
    if (ch === '"' || ch === "'") {
      const openedAt = line;
      const string_ = stringToken(src, index);
      index = pushToken(index, string_.end);
      if (!string_.terminated) {
        if (string_.end === src.length) log.note(`the string opened at line ${openedAt} is still open at end of file`);
        else badString = true;
      }
      continue;
    }
    /*
     * §4.3.1 and §5.4.1: `<!--` and `-->` are the CDO and CDC tokens, the legacy idiom that hid a
     * stylesheet from an HTML parser that did not know the element. Where a rule would begin at
     * the top level of a stylesheet a browser discards them; anywhere else — inside a rule, or
     * part way through a prelude — they are ordinary preserved tokens and stay in the value.
     *
     * Consumed here rather than left to the ident rule, which reads the `--` of a `-->` as an
     * ident of its own and leaves the `>` behind as text no rule owns: `.a { color: #ff0000; }`
     * followed by `-->` then ended with the file reported unreadable and every rule that read it
     * UNJUDGEABLE, while Chromium applies the rule and drops the CDC.
     */
    if (src.startsWith("<!--", index) || src.startsWith("-->", index)) {
      const end = index + (src[index] === "<" ? 4 : 3);
      if (stack.length === 0 && buffer.trim() === "") {
        index = end - 1;
        continue;
      }
      index = pushToken(index, end);
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
      index = pushToken(index, token.url ? token.url.end : token.end);
      continue;
    }
    /*
     * The hash-token and the at-keyword (§4.3.1). `#` and `@` bind the ident after them, so the
     * ident is not a token of its own and cannot open a url token: in `background: x) #url((y)}
     * z);` a browser reads a hash, a `(` that opens a matched block and a `}` that is content
     * inside it, while consuming a url token from the `u` swallowed the first `)`, desynchronised
     * every later brace, dropped the applied colour as top-level text and opened a phantom rule
     * — balanced, so nothing reached the fail-safe and the run certified L3 with PASS and exit 0.
     */
    const bound = hashOrAtToken(src, index);
    if (bound) {
      index = pushToken(index, bound.end);
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
        index = pushToken(index, consumeEscape(src, index).end);
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
      const top = openBlock();
      if (top !== undefined && top.type === (ch === ")" ? "paren" : "bracket")) stack.pop();
      push(ch);
      continue;
    }
    if (ch === "{") {
      /*
       * A `{` inside a component-value block opens another one, and its contents stay in the
       * value. Only the `{` this test lets through may open a rule, so the `)` in `fn({)` can
       * no longer pop the function while a browser holds it inside the brace block.
       */
      // A `{` reached while a bad-string is being recovered from belongs to the construct being
      // thrown away, so it opens a value block the discard will take with it — never a rule.
      if (inComponentValue() || badString) {
        stack.push({ type: "curly", line, bad: badString });
        push(ch);
        continue;
      }
      const prelude = buffer.trim();
      /*
       * A custom property's value may be a `{…}` block, and it is a value: Chromium's CSSOM for
       * `.a { --x: { color: #ff0000 }; }` is that one declaration, and it applies the colour to
       * nothing. Reading the brace as a nested rule put `color: #ff0000` in a phantom block and
       * reported a raw colour no browser ever paints — a false finding, which costs a rule
       * system its readers as surely as a false clean does. Only a custom property qualifies;
       * `&:hover {` and `.b {` carry a colon and a name too, and both really do open a rule.
       */
      const started = splitDeclaration(prelude);
      if (started && decodeDeclarationText(started.prop, () => {}).startsWith("--")) {
        stack.push({ type: "curly", line });
        push(ch);
        continue;
      }
      const startLine = bufferLine || line;
      resetBuffer();
      // Every at-rule this block sits inside, whether that at-rule holds rules or declarations.
      const context = stack.filter((entry) => entry.at).map((entry) => entry.at);
      const at = prelude.startsWith("@") ? { name: atRuleName(prelude), prelude, line: startLine } : null;
      // The binding is read here, where the unreadable log is, because a parameter list this
      // scanner cannot divide is a file it cannot read rather than a suppression it may guess.
      if (at && at.name === "function") at.binding = functionBinding(prelude, startLine, log);
      if (at && !DECLARATION_AT_RULES.has(at.name)) {
        stack.push({ type: "at", line: startLine, at });
        continue;
      }
      const block = {
        selector: prelude,
        selectors: prelude
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
        line: startLine,
        atRules: context,
        // The at-rule this block *is* the body of, where it is one. A `@font-face` names a face
        // it defines rather than one it uses, and the face rules have to be able to tell.
        atBlock: at,
        declarations: []
      };
      blocks.push(block);
      stack.push({ type: "rule", line: startLine, at, block });
      continue;
    }
    if (ch === "}") {
      const top = openBlock();
      // A mismatched closer: `(` and `[` end at their own code point, so this one is content.
      if (top !== undefined && (top.type === "paren" || top.type === "bracket")) {
        push(ch);
        continue;
      }
      // The matching closer of a component-value `{`: it ends a value block, not a rule, so
      // the declaration carrying it goes on accumulating — unless that block was the remnant of
      // a bad declaration, which ends here and is thrown away exactly as a browser throws it.
      if (top !== undefined && top.type === "curly") {
        stack.pop();
        if (top.bad) {
          discardBadDeclaration();
          continue;
        }
        push(ch);
        continue;
      }
      if (badString) discardBadDeclaration();
      else flushDeclaration();
      if (stack.length === 0) {
        log.note(`the closing brace at line ${line} closes no block this scanner had open`);
      }
      stack.pop();
      continue;
    }
    if (ch === ";") {
      if (inComponentValue()) {
        push(ch);
        continue;
      }
      // The `;` a browser recovers a bad declaration at: what came before it is thrown away
      // rather than read, and the declaration after it is ordinary CSS again.
      if (badString) discardBadDeclaration();
      else flushDeclaration();
      continue;
    }
    push(ch);
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

/*
 * §4.3.4 and §3.3: a function name is an ident, and an ident is ASCII case-insensitive, so
 * `VAR(--brand)` is the same reference `var(--brand)` is and a browser substitutes for both.
 * Matched case-sensitively, `VAR(` was invisible: a reference to an undeclared token went
 * unreported and the run certified clean. The *name* is not folded with it — a custom property
 * name is case-sensitive (§2 of Custom Properties), so `--Brand` and `--brand` are two different
 * tokens and the capture below keeps whichever the file wrote.
 */
const VAR_REFERENCE = /var\(\s*(--[A-Za-z0-9_-]+)/gi;

/**
 * A declaration value with the contents of its opaque tokens blanked to spaces, keeping every
 * offset and every delimiter. Those contents are a url token's locator (§4.3.6) and a string
 * token's text (§4.3.5): neither is a value, and a matcher reading either is reading something
 * the browser never resolves as one. `fill: url(#fade)` is a fragment reference to an SVG
 * gradient, not the colour `#fade`, and reporting it was a false VIOLATION against shipped CSS.
 *
 * The spans come from the same tokenisers the scanner uses, so what counts as a url token here is
 * what counted as one when the file was parsed — including the escaped spellings, since `\75 rl(`
 * opens the token `url(` opens.
 */
function maskOpaqueTokens(text) {
  const out = [...text];
  const blank = (from, to) => {
    for (let cursor = from; cursor < to && cursor < out.length; cursor += 1) out[cursor] = " ";
  };
  let index = 0;
  while (index < text.length) {
    const ch = text[index];
    if (ch === '"' || ch === "'") {
      const string_ = stringToken(text, index);
      blank(index + 1, string_.terminated ? string_.end - 1 : string_.end);
      index = string_.end;
      continue;
    }
    const token = identLikeToken(text, index);
    if (token) {
      // The `(` and the `)` stay: they are the token's own delimiters, and a reader counting
      // parentheses over the masked value has to count the same ones the file has.
      if (token.url) blank(token.end + 1, token.url.terminated ? token.url.end - 1 : token.url.end);
      index = token.url ? token.url.end : token.end;
      continue;
    }
    // §4.3.1: a hash-token is not masked — `#ff0000` is exactly the literal these matchers exist
    // to find — but it is consumed here so the ident inside it opens no url token of its own.
    const bound = hashOrAtToken(text, index);
    if (bound) {
      index = bound.end;
      continue;
    }
    index = validEscape(text, index) ? consumeEscape(text, index).end : index + 1;
  }
  return out.join("");
}

/**
 * Every `var(--name)` a value really references — the one collector for the declarations a block
 * holds and for the defaults an `@function` prelude gives its parameters alike.
 *
 * A `var()` inside a string or inside a url token is text, not a reference. §4.3.5 and §4.3.6
 * make each of them one opaque token, and substitution replaces a `var()` *function* token in the
 * token stream — inside either of those there is none to replace. Chromium 150 parses
 * `@function --quoted(--x: "var(--ghost)") returns <string>` as a real `CSSFunctionRule`, answers
 * true to `CSS.supports("content", "--quoted()")`, and computes the pseudo-element content as the
 * literal text `var(--ghost)`; the checker ran the expression over that text, reported `--ghost`
 * as a reference to a token no ratified document declares, refused the L3 certificate and exited
 * 1 over CSS a browser resolves without difficulty. `.a { content: "var(--nope)" }` and
 * `background: url(var(--ghost))` were the same false finding in an ordinary declaration, where it
 * had sat since the block model was built. A false finding is as damaging as a false clean — it
 * is how a gate gets switched off.
 *
 * So the search reads a value through `maskOpaqueTokens`, the one masker `literal-outside-tokens`
 * already reads one through, and the two callers share this collector instead of each running the
 * expression over text of its own. Two readings of where a string ends are two chances to
 * disagree, which is the whole reason the token table names one consumer per token; a collector
 * that scans raw text re-decides that question by omission, and this file has now been repaired
 * twice on exactly that surface.
 *
 * The masking runs *after* the decoding each caller does, never instead of it: `\76 ar(--ghost)`
 * spells `var(--ghost)`, a browser resolves it, and it is still collected here.
 */
function valueVarUses(value) {
  return [...maskOpaqueTokens(value).matchAll(VAR_REFERENCE)].map((match) => match[1]);
}

/** A `<style>` element, and the markup comment — the two markup spans that are not markup. */
const STYLE_ELEMENT = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
const MARKUP_COMMENT = /<!--[\s\S]*?-->/g;

/** Blank a span to spaces, keeping every newline so later offsets keep their line number. */
function blankSpans(text, pattern) {
  return text.replace(pattern, (match) => match.replace(/[^\n]/g, " "));
}

/**
 * Every `var(--name)` reference in a parsed stylesheet's declarations, with the line of the
 * declaration that carries it.
 *
 * A browser resolves a reference by what its tokens spell, so `\76 ar(--brand)` and
 * `var(\2d\2d brand)` are both `var(--brand)` and both invisible to a regular expression over
 * the raw text. Chromium resolves either — the fallback in
 * `.probe { grid-area: \76 ar(--nope, #ff0000) }` computes — while the reference to an
 * undeclared token went unreported and the run certified L3 with PASS and exit 0.
 *
 * The decoding has to happen where the scanner already knows which bytes are a declaration
 * value. Decoding whole lines instead made ordinary escaped selector text into references: a
 * utility class such as `.supports-\[var\(--ghost\)\]` spells `.supports-[var(--ghost)]`, and
 * `--ghost` was then reported as a reference to an undeclared token although the browser
 * resolves nothing there and the rule's only value used a declared one. A false finding is as
 * damaging as a false clean — it is what makes a gate get switched off — so the search runs
 * over `declarations[].value` and never over selector, prelude or comment text, and it runs
 * through `valueVarUses`, which is where the value's opaque tokens stop being read as values.
 */
function declarationVarUses(blocks) {
  const uses = [];
  for (const block of blocks) {
    // The parameters this block's `@function` prelude binds, and the references its parameter
    // defaults make. Both are read once, at scan time, by `functionBinding`.
    const binding = block.atBlock ? block.atBlock.binding : null;
    if (binding) uses.push(...binding.uses);
    for (const declaration of block.declarations) {
      for (const name of valueVarUses(declaration.value)) {
        if (binding && binding.formals.has(name)) continue;
        uses.push({ name, line: declaration.line });
      }
    }
  }
  return uses;
}

/** Every `var(--name)` reference in a stylesheet text, with its line. */
function varUses(text) {
  return declarationVarUses(scanStylesheet(text).blocks);
}

/** Every `style="…"` attribute value in markup, with its line. */
function styleAttributes(text) {
  const found = [];
  text.split(/\r?\n/).forEach((content, index) => {
    for (const match of content.matchAll(/(?:^|[\s{;])style\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      found.push({ value: match[1] ?? match[2] ?? "", line: index + 1 });
    }
  });
  return found;
}

/**
 * Every `var(--name)` reference in markup, with its line.
 *
 * The spans that are CSS go through the CSS path, and only their declarations count. A `<style>`
 * element is a stylesheet and a `style` attribute is a declaration list, so both are read as they
 * *spell* — an escaped `\76 ar(--x)` resolves in a browser and has to be found here — and neither
 * contributes its selector, prelude or comment text. Searching every raw line first and then
 * parsing `<style>` again read those contents twice, once as text and once as CSS: `var(--ghost)`
 * written inside the attribute selector `[data-value="var(--ghost)"]` became a reference to an
 * undeclared token, so a page whose only declaration used a ratified token failed L3 and exited 1
 * while Chromium kept that text in `selectorText` and resolved nothing. A false finding is as
 * damaging as a false clean — it is how a rule system gets switched off.
 *
 * Everything outside those spans is markup, and markup is read as written. That is not laziness
 * about escapes: it is where the references actually are. Over 2,113 markup files in the corpus,
 * 4,416 raw references sit outside any `<style>` element — `cn("h-[var(--radix-select-trigger-height)]")`,
 * `stopColor="hsl(var(--primary))"`, `const COLORS = ['hsl(var(--chart-2))']` — and a browser
 * resolves every one of them. Restricting markup discovery to `style` attributes and the one
 * supported utility bracket was tried against that corpus and lost 1,799 of them across 203 files,
 * which is the false clean this rule exists to prevent. The markup comment is the one span that
 * resolves nothing wherever it appears, so it is blanked with the `<style>` bodies.
 *
 * That last sweep is therefore the one `var()` search in this file that does not go through
 * `valueVarUses`, and deliberately: outside those spans the text is not CSS, so a quote in it is
 * not a CSS string token and `stringToken` has no jurisdiction over it. `className="text-[var(--x)]"`
 * and `const cl = "color:var(--error)"` are quoted in the *host* language and a browser resolves
 * every one of them; masking them as if they were CSS strings loses 2,410 of the references this
 * path finds, across 306 of the sweep corpus's 2,236 markup files. The spans that really are CSS — a
 * `<style>` body and a `style` attribute — are parsed as CSS above and collected through
 * `valueVarUses` with every other declaration, so the opaque-token rule reaches them there.
 */
function markupVarUses(text) {
  const uses = [];
  const seen = new Set();
  const add = (name, line) => {
    const key = `${name}@${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    uses.push({ name, line });
  };
  for (const match of text.matchAll(STYLE_ELEMENT)) {
    const before = text.slice(0, match.index + match[0].indexOf(match[1]));
    const offset = before.split(/\r?\n/).length - 1;
    for (const use of declarationVarUses(scanStylesheet(match[1]).blocks)) {
      add(use.name, use.line + offset);
    }
  }
  // A `style` attribute is a declaration list with no selector, so it is read as the body of one.
  for (const attribute of styleAttributes(text)) {
    for (const use of declarationVarUses(scanStylesheet(`x{${attribute.value}}`).blocks)) {
      add(use.name, attribute.line);
    }
  }
  blankSpans(blankSpans(text, STYLE_ELEMENT), MARKUP_COMMENT)
    .split(/\r?\n/)
    .forEach((content, index) => {
      for (const match of content.matchAll(VAR_REFERENCE)) add(match[1], index + 1);
    });
  return uses.sort((a, b) => a.line - b.line || a.name.localeCompare(b.name));
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
  declarationVarUses,
  eachLine,
  markupVarUses,
  maskOpaqueTokens,
  parseStylesheet,
  scanStylesheet,
  selectorBase,
  selectorState,
  splitDeclaration,
  stripComments,
  varUses
};
