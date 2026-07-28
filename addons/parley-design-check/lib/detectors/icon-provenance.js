"use strict";

/*
 * Icons drawn from more than one source, and emoji standing in for icons.
 *
 * Sources are read off imports, sprite references and icon-font class prefixes. An emoji
 * counts only where it is the whole content of an element — an emoji inside a sentence is
 * copy, an emoji alone in a span is a drawing the reader's platform supplies.
 *
 * Each import canonicalises to exactly one source id: the named recognisers are tried
 * against the imported specifier first, and the generic fallback only names a package no
 * recogniser knows. One Heroicons import is one source, not a mixture of two.
 */

const { eachLine } = require("../css.js");

const NAMED = [
  { name: "lucide", test: /\blucide(-react|-vue|-svelte)?\b/ },
  { name: "heroicons", test: /@heroicons\// },
  { name: "phosphor", test: /@phosphor-icons\// },
  { name: "font-awesome", test: /\bfa[srlbd]?-[a-z0-9-]+\b|@fortawesome\// },
  { name: "bootstrap-icons", test: /\bbi-[a-z0-9-]+\b/ },
  { name: "material-icons", test: /\bmaterial-icons\b|@mui\/icons/ }
];

const IMPORT = /from\s+["']([@\w./-]*icons?[\w./-]*)["']/i;
const SPRITE = /<use\s[^>]*(xlink:)?href=["']([^"'#]*#?[\w./-]+)["']/i;

const EMOJI_ALONE = /<(span|i|div|p|em|strong)\b[^>]*>\s*(\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]*)\s*<\/\1>/u;

module.exports = {
  rule: "web:icon-provenance",
  tier: "T1",
  inputs: ["markup"],
  summary: "counts distinct icon sources across markup and reports emoji used as the whole content of an element",
  run(ctx) {
    const found = new Map();
    const results = [];
    for (const source of ctx.markup) {
      eachLine(source.text, (content, line) => {
        const record = (key) => {
          if (!found.has(key)) found.set(key, { path: source.path, line });
        };
        const imported = IMPORT.exec(content);
        // The specifier decides which source it is; only a package no recogniser knows
        // falls through to the generic id, so one import never counts twice.
        const named = NAMED.filter((candidate) => candidate.test.test(imported ? imported[1] : ""));
        if (imported) {
          if (named.length > 0) named.forEach((candidate) => record(candidate.name));
          else record(`imported icon package:${imported[1]}`);
        }
        for (const candidate of NAMED) {
          const rest = imported ? content.replace(imported[0], " ") : content;
          if (candidate.test.test(rest)) record(candidate.name);
        }
        if (SPRITE.test(content)) record("svg sprite");
        const emoji = EMOJI_ALONE.exec(content);
        if (emoji) {
          if (!found.has("emoji")) found.set("emoji", { path: source.path, line });
          results.push({
            verdict: "VIOLATION",
            path: source.path,
            line,
            violation: `uses the emoji ${emoji[2]} as the whole content of a <${emoji[1]}>, so the drawing comes from the reader's platform`,
            remedy: "draw the glyph in the build's icon idiom, or use a word"
          });
        }
      });
    }
    if (found.size > 1) {
      const sorted = [...found.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const first = sorted[0][1];
      results.push({
        verdict: "VIOLATION",
        path: first.path,
        line: first.line,
        violation: `draws icons from ${sorted.map(([name]) => name).join(", ")}`,
        remedy: "declare one source in the contract and draw any missing glyph in that idiom; stroke weight, corner treatment and optical size do not survive mixing"
      });
    }
    return results;
  }
};
