# Third-party notices

`parley-deck-skill` is licensed under Apache-2.0. It contains no third-party code.

## Prior art studied for `parley-design` and `parley-design-check`

The two design add-on skills were designed after a detailed study of two existing
open-source projects. **No text, rule wording, threshold table, or code was copied from
either.** Both are permissively licensed and copying with attribution would have been
allowed; independent authorship was chosen deliberately, so that every rule this project
ships is one it can defend on its own terms.

- **[Nutlope/hallmark](https://github.com/Nutlope/hallmark)** — MIT. An anti-AI-slop design
  skill for coding assistants. Studied for its extensional definition of slop as a set of
  named tells, its numbered pass/fail gate list, and its argument that structural sameness,
  not visual sameness, is the recognisable machine fingerprint.
- **[pbakaus/impeccable](https://github.com/pbakaus/impeccable)** — Apache-2.0. A design
  quality system for coding agents. Studied for the separation of a rule registry (data)
  from detection logic (code), its evidence-tier discipline, its refusal to emit a numeric
  design score, and its measured finding that a single model cannot diversify its own
  output without an external source of randomness.

Ideas are not copyrightable and none of the above is a derivative work. The list is recorded
because the intellectual debt is real and worth stating.

## Standards referenced

- [W3C Design Tokens Community Group format](https://tr.designtokens.org/format/) — the
  token interchange format the design add-on adopts.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) — the accessibility thresholds treated as
  blocking in the web annex.
- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) / [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)
  — the normative-keyword conventions used by the protocol specification.
