---
name: parley-design-check
description: "Run the checkable part of the PDS/1.0 design doctrine against files on disk: design artifacts, DTCG token documents, stylesheets and markup. Use when a design run needs its rules enforced reproducibly rather than argued, when a conformance level claim has to be verified, or when a review wants findings that are stable and diffable across runs. Separable enforcement companion to the parley-design add-on: it reads that skill's rule registry, refuses to check rules when the registry is absent, reports what it cannot judge instead of passing it, and has no runtime dependencies and no network access."
---

# parley-design-check

The enforcement layer for `parley-design`. It reads the rule registry that skill ships,
runs the detectors it has against files on disk, and emits findings in one shape:

```text
rule-id — violation — remedy
```

It is standalone: Node built-ins only, no dependencies, no framework, no agent runtime, and
no network access at check time or any other time. It validates against no vendored schema
either — the token checks are structural — so there is nothing to fetch and nothing that can
fall out of step with a copy upstream. It is also optional: the doctrine is complete without
it, and a participant writes the same findings by hand in the same form.

## When to use it

- Before opening a review, so the mechanical findings are already in the ledger and the
  round argues about the rest.
- On the fast path, where a single agent checks a change inside a ratified system.
- To verify a conformance level a project claims, rather than accepting the claim.
- In a pre-commit or CI step, where the exit code is the gate.

Do not use it as a substitute for judgement. Most of what makes work read as machine-made
is not decidable from source, and this tool says so rather than passing it.

## Commands

```text
check <paths...>                      run the registry's rules over files on disk
check --level L1|L2|L3|L4 <paths...>  verify a conformance claim as well
check --json <paths...>               emit the report as JSON
```

```text
--registry <path>   the RULES.md to read; default is the installed parley-design
--contract <path>   the CONTRACT artifact system rules are judged against
--waivers <path>    the single waiver file; default is the one the contract names
--surface <name>    core or web; default is inferred from the inputs
--json              machine-readable report on stdout
--help --version
```

Run it as `node addons/parley-design-check/bin/check.js check <paths...>` from a checkout,
or from wherever the add-on was installed. Paths may be files or directories; directories
are walked, and hidden directories, `node_modules` and build output are skipped.

### Exit codes

| code | meaning |
|---|---|
| 0 | `PASS`, and nothing else |
| 1 | findings: at least one VIOLATION or NEEDS_REVIEW |
| 2 | the run itself failed: bad usage, an unreadable input, a broken registry, a detector that threw |
| 3 | rule checks refused: no registry was found |
| 4 | `UNJUDGEABLE`: the run judged nothing it could report on, or a level claim went unverified |

Findings are not errors. A finding is a result the run produced successfully, which is why
it has its own code, and why a failed run does not hide behind an empty ledger.

Exit 0 is reserved for `PASS`. A run over files this checker cannot read judges nothing, a
source it could not tokenise is a file it did not read (see below), and a level claim whose
evidence the run did not carry is a conformance failure rather than a warning (PDS §9 rule 3)
— all three exit 4. CI gates on the process code, never on a later reading of the JSON, so
"the checker checked nothing" must not leave a green tick behind.

## What it reads

| input | tier | recognised by |
|---|---|---|
| PDS artifacts | `T0 ARTIFACT` | `.md` with frontmatter carrying a `kind` PDS defines |
| token documents | `T0 ARTIFACT` | `.json` in the DTCG format, with `$value` leaves |
| stylesheets | `T1 SOURCE` | `.css` |
| markup | `T1 SOURCE` | `.html`, `.htm`, `.jsx`, `.tsx`, `.vue`, `.svelte`, `.astro` |

Anything else is listed in the report under `not-inspected` with the reason. A file the
checker did not read is never counted as a file that passed.

### The stylesheet scanner, and the file it could not read

One requirement runs through the scanner: the file the browser applies and the file the
checker reads have to be one file, or a declaration below the defect ships unjudged. Five
constructs have broken it so far, each found by a probe and each read as text now rather than
as structure — a brace inside a quoted string (`content: "}"`), an unterminated string (ended
at the newline, as CSS Syntax §4.3.5 ends it), a brace inside an unquoted `url()` token
(§4.3.6), a comment delimiter inside one (§4.3.2 consumes no comment inside a url token), and
an escaped brace in an ident (`font-family: A\}B`, `.a\}`, §4.3.7).

A hand-rolled scanner has no upper bound on that family, so the scanner also reports what it
could not read. A comment, string or url token still open at end of input; a brace that closes
no block, or a block never closed; a declaration whose parentheses do not balance; text inside
a rule it had to discard — any of these makes the file **unreadable**, and then:

- the file is listed in the report under `inputs.unreadable`, with the reason and the line;
- every rule whose detector reads stylesheets is `UNJUDGEABLE` against that file, so none of
  them can report a pass over it, and a `system` rule among them leaves an L3 claim unverified;
- the run does not roll up to `PASS`: exit 4, whatever the detectors found elsewhere.

The detectors still run, because what the scanner did read is still evidence and a violation
in the readable part is a real one. What it cannot do is come back clean. That is the part
that does not need the next construct to be found first.

A markdown file that declares `spec: PDS/1.0` and whose frontmatter is outside the canonical
subset (PDS §2 rule 5) is a candidate artifact that did not parse. It is reported as
`pds-check:l1-frontmatter-parses`, with or without a level claim, and never demoted to
`not-inspected` while the artifacts beside it carry one. One that parses and names a kind PDS
§2 does not define is the same shape of defect and is reported as `pds-check:l1-artifact-kind`.
A file declaring the spec and no kind at all is not an artifact instance — that is how PDS.md
and RULES.md declare the spec they define — and stays under `not-inspected`. The parser implements that subset
exactly: one-line values, flow lists and flow maps, block lists of those, a flow collection
holding flow collections holding scalars and no deeper, no tabs, no block mappings. The
scalar lexer is held to the same line: an unquoted `,` `[` `]` `{` `}` or `#`, a trailing
comment, an escape, a quote that opens without closing or closes without opening, and
whitespace around a value are each refused with the reason. L1 claims the canonical subset,
so a key the subset does not admit — an `x-` extension key included — is a violation of it
rather than a construct the checker privately tolerates.

## The registry contract

The registry is `parley-design/references/RULES.md` and the surface annexes beside it. The
checker resolves it from an explicit `--registry`, then `PDS_REGISTRY`, then the
`parley-design` skill installed beside this one, then a bounded walk up from the working
directory.

- **No bundled copy.** This add-on carries no registry of its own, and a test enforces that.
  A checker with its own copy eventually enforces rules nobody ratified.
- **Absent registry means refusal.** With no registry the checker refuses rule checks,
  says so on stderr, exits 3, and still runs the registry-independent structural and token
  checks. A named `--registry` that does not exist is a refusal too; it is never silently
  replaced by another registry.
- **Every report is stamped** with `implements: PDS/1.0`, the registry version and the
  registry digest (the first twelve hex characters of sha256 over the registry file), so a
  clean report cannot survive an edit to the rules it ran against unnoticed.
- **A duplicate rule id is fatal** and both sites are named. Unknown keys warn unless they
  are `x-` prefixed. A rule id the checker does not know is reported `UNJUDGEABLE`.

## Capability, and what it will not pretend

The capability declaration is generated by scanning `lib/detectors`; nothing about it is
hand-maintained, so it cannot drift from what is implemented. This version obtains
`T0 ARTIFACT` and `T1 SOURCE` evidence.

Every rule in scope that this checker cannot decide appears in the report as `UNJUDGEABLE`
with the reason:

- the rule needs `T2 RENDERED` or `T3 PIXEL` evidence, which needs a running interface;
- the registry enforces it by agent judgement, so no detector may decide it;
- no detector implements it here — including two thresholds this checker deliberately
  leaves alone, because their numbers live in surface-annex prose and extracting a
  calibration from prose would put a second, rotting copy of it in a tool;
- it is a `system` rule and no `CONTRACT` was given, since a system rule is meaningless
  before ratification;
- the inputs a detector needs were not among the paths;
- a source it reads could not be tokenised, so the rule was decided on a partial reading of
  the file.

Rules belonging to another surface are listed as out of scope, which is not a pass either.

### What it will not take on trust, and what it still cannot bind

A conformance certificate issued on a run's own say-so is worse than none, so where a gate
condition rests on something the run declares about itself, the checker recomputes it:

| condition | what it is decided from, rather than the claim |
|---|---|
| recusal (§5 rule 2) | the critique's **artifact path**, not its `agent` field; a declared agent that disagrees with the file it is written in fails on its own, and an id minted from a proposer's own fails where it critiques that proposer's direction |
| G1's sharing test | the recorded `g1-signatures` **and** this run's own ban-list findings, read before waivers |
| G2's "modifies the winner's token file" | the file re-read and digested, against the VERDICT's `tokens-digest` |
| a `waived` answer to a winner VIOLATION | a valid, unexpired, independently counter-signed entry whose scope resolves to the winner's DIRECTION or the token file it names |
| a waiver's independence | both ids present in the roster the run's artifacts name; no roster, no suppression |

Three bindings this version does not claim to have, stated here rather than left implied:

- **A self-chosen path defeats the identity anchor, and nothing beneath the file name is
  checked.** Binding a critique to its path is stronger than believing its `agent` field,
  because the protocol names a round's files by agent id. It is not a signature, and
  impersonation is not the only way past it — it is the harder way. A process that writes
  `round-02/hermes-1.md` while being `claude-1` is indistinguishable from `hermes-1` writing
  it; a process that writes `round-02/wren-4.md` while being `claude-1` needs no collision
  with anyone at all, and recusal, which compares that author against the DIRECTION authors,
  then finds nothing to fire on. Two things narrow it. An id **minted** from a proposer's
  own — the proposer id with a suffix across a non-alphanumeric boundary, `claude-1.critique`
  from `claude-1` — fails recusal where it critiques that proposer's direction, since one
  identity written two ways is still one identity. And every critique author no other
  artifact of the run records is listed on the level as `recusal-not-anchored`, so a claim is
  never read without the ids whose recusal rests on a name only they chose. What remains open
  is the unrelated fresh id, which reads exactly like a genuine critic who proposed nothing:
  PDS/1.0 defines no roster, so the artifacts cannot separate them. A facilitator-held roster
  mapping ids to keys, or cryptographic authorship, is what would close it, and neither is in
  scope here.
- **A waiver's independence is roster membership, not disinterest.** Two participants a run
  records, differing from each other and from the grantor, is what §8 rule 2 can be checked
  to. That two agents were separately motivated is a judgement the ledger records and no
  parser decides.
- **`tokens-digest` detects drift from what the VERDICT ratified, not a re-ratification.** A
  verdict that records the digest of an already-grafted file has re-ratified it, and the gate
  then rests on the re-expression test alone. The digest is what makes a *later* edit
  visible — including one made between DECIDE and CONTRACT, which is the window §3 puts G2
  in. Pinning the file at round-01 instead, before any graft is proposed, would close the
  remaining window and needs a field on DIRECTION that PDS/1.0 does not define.

## Conventions this checker needs

These are the checker's, stated here because it has to look somewhere. They use extension
points the formats already define, and none of them changes the doctrine.

- **Text-bearing pairings** are declared in the token document under
  `$extensions["org.parley.pds"].pairings`, as entries of `{text, on, kind}` where `kind` is
  `text`, `large-text` or `non-text`. Without them the declared contrast floor is
  `UNJUDGEABLE`: a checker cannot know which pairings are meant to carry reading.
- **A reserved token** carries `$extensions["org.parley.pds"].reserved: true`, which is the
  difference between a decision held on purpose and one abandoned.
- **Token names map to custom properties** by joining the path with hyphens, splitting camel
  boundaries and lowercasing: `color.text.muted` is `--color-text-muted`.
- **Optional contract keys** the checker reads: `states`, `effect-budget`, `tokens`,
  `waivers`, and `faces` (each entry a name, or `{name, why}` where the reason is recorded).
- **Gate outcomes** are read from a `gates` list on any artifact of the run, each entry
  carrying an `id` and an `outcome`, where the outcome is `pass`, `fail` or `abstain`.
- **G1's banned-slop signatures** are read from a `g1-signatures` list on any artifact of the
  run: one entry per direction, `{direction: <handle>, fires: [...]}`, each fired id written
  `rule-id=the declared value that evidenced it`. It is a flat list rather than a map inside
  the gate entry because the canonical frontmatter subset stops one level above that. The
  ban list is not configured here: it is derived from the registry, as `RULES.md` derives it.
  The ledger is a self-report, so it is never taken alone: where this run's own detectors
  raised ban-list findings against the direction artifacts, the sharing test is recomputed
  from those findings too, and a recorded signature that omits an id the same run watched fire
  fails the gate. Those findings are read before waivers are applied — G1 is a gate on what
  two directions share, and a waiver scoped at one file is not an answer to that.
- **A waiver's identities** are `granted-by` and `counter-signed-by`, both machine-readable
  participant ids, and both are checked against the roster the run's own artifacts name — the
  agents that filed a DIRECTION or a CRITIQUE, the Decider, the Design System's author. With
  no participant-bearing artifact among the inputs there is no roster, so independence cannot
  be established and the waiver does not suppress its finding (PDS §8 rule 2). Two ids
  differing is distinctness, and distinctness is not independence. The rejection is printed as
  a `waiver rejected:` line naming both ids, so no waiver is ever dropped silently: to waive a
  finding, pass the run's design artifacts alongside the source.
- **One stylesheet is one surface** for the effect budget. It is an approximation, and it is
  the one place this checker trades precision for something it can compute.

## Waivers

Waivers are read from the file the contract names, or from `--waivers`. Each entry needs a
rule id, a scope, a reason, an expiry, a granting participant and a counter-signature; a
scope is a path, read relative to the waiver file or to the working directory. The scope has
to reach the work: a detector finding is suppressed only where the scope resolves to the file
the finding is at, and a VERDICT's `waived` answer holds only where the scope resolves to the
winner's DIRECTION or the token file that DIRECTION names. One path test decides both, so an
entry cannot mean the narrowest scope in one place and any scope at all in the other. An
entry is rejected, and its finding stays in the ledger, when it names more than one rule through a
wildcard, scopes wider than a path, has expired, names no grantor, or carries a
counter-signature whose independence the checker cannot establish — including the grantor's
own signature, which is not a counter-signature; a signature by an author of the waived work,
resolved from §1's naming, since a round file belongs to the agent id it names; a signer the
run records only through an artifact that signer wrote itself; and any pair of ids in a run
that names no participants to check them against. A rule the registry marks `system-blind`
MUST NOT be waived by scoping the waiver at the ratified system: that is the widening the
flag exists to forbid, and the checker rejects it.

## Conformance levels

A level is an obligation set. Each obligation is declared before it is tested, and the report
carries the whole set with what each one owed and whether it was met — so a level cannot be
verified by an obligation nobody declared. An obligation whose evidence the run did not carry
is `unverified`, never met: the level then reports `not verified`, and the run does not exit
clean.

| level | the obligations this checker holds a claim to |
|---|---|
| L1 | every candidate artifact parses, declares the spec version, names a kind PDS §2 defines, and carries the fields that kind requires |
| L2 | L1, plus the mapping's artifact set and each artifact at the location §1 maps its step to, each DIRECTION resolving its `tokens` against its own directory to the adjacent `<agent>.tokens.json` §1 rule 3 names and no two DIRECTIONs to one file, recusal decided from the artifact path, the §4 rule 2 assignment recomputed from the brief's `run-id` over its deduplicated primary positions, G1 (distinctness counted on the brief's declared axes with every position checked against the brief's enumeration, duplicate Signature, the banned-slop signatures and their sharing test, recorded and observed), G2 (one winner, bounded grafts that name tokens the winner already declares, the winner's token file digesting to the `tokens-digest` the VERDICT ratified, every violation against the winner answered and every `waived` answer resolving to a valid waiver entry scoped at the winner's work), a recorded outcome for every §3 transition the run crossed — recomputed for G3 and G4, so a `pass` beside an open finding the gate names sinks the obligation — and rule ids that resolve in the loaded registry |
| L3 | L2, plus a DTCG token document with every token typed, aliases that resolve without a cycle and point strictly down the tiers a document names, never sideways (PDS §3 G3), a declared `colorSpace` on every colour, values that compute, and the registry's `system` rules decided against real source and clean |
| L4 | not verifiable here; reported `UNJUDGEABLE`, because it needs rendered evidence |

Two honesty notes about L3. The `system` rules the registry marks checkable and this checker
has no detector for are listed on the level itself as `system-rules-not-decided`, so
"verified L3" is never read without what was not decided. And a level's obligations are
computed after waivers, so a finding a valid waiver suppressed is not an open one.

One about L2. Every critique author no other artifact of the run records is listed on the
level as `recusal-not-anchored` and printed as a `recusal` line, because that author's
recusal rests on a file name the author chose. It is not a finding: a critic who proposed
nothing is a legitimate participant, and the run carries nothing that separates it from a
proposer filing under a fresh id.

Conformance results carry ids in this tool's own namespace, `pds-check:<slug>`, so they are
never confused with registry rules. A gate message spells its own clause with a colon where
PDS §3 prints an em dash: the em dash is this tool's finding separator, and §3's strings are
canonical message shapes rather than literal output.

## Adding a detector

One module per detector in `lib/detectors`, named for what it detects:

```js
module.exports = {
  rule: "core:example",          // an id the registry declares
  tier: "T0",                    // the tier the registry gives that rule
  inputs: ["artifacts"],         // artifacts | tokens | styles | markup
  summary: "what it decides, in one clause",
  run(ctx) {
    return [{ verdict: "VIOLATION", path, line, violation, remedy }];
  }
};
```

Return an empty array for a clean pass, and `{verdict: "UNJUDGEABLE", violation, remedy}`
where the evidence is not there. Every result carries both a violation and a remedy, and
neither may contain the finding separator; the engine treats a breach of either as a failed
run rather than emitting a line nobody can parse.

A detector must ship a fixture that fails and a fixture that passes, under
`test/fixtures/<detector-name>/{fail,pass}`. The test suite discovers detectors from the
directory, so one without fixtures fails the suite rather than shipping unexercised, and a
passing fixture is also checked to have actually been judged.

## Tests

```text
node --test "addons/parley-design-check/test/*.test.js"
```

Offline, no fixtures over the network, and well under five seconds. They cover the registry
grammar and its fatal cases, the generated capability, every detector's fixture pair, the
refusal path, the exit codes, the finding format's stability, waiver validity, and the
conformance levels.

## Files

```text
addons/parley-design-check/SKILL.md            this file
addons/parley-design-check/bin/check.js        the CLI: arguments, report rendering, exit codes
addons/parley-design-check/lib/registry.js     the literate-registry reader and its strict YAML subset
addons/parley-design-check/lib/artifacts.js    PDS artifact and DTCG token readers, and colour maths
addons/parley-design-check/lib/css.js          the T1 SOURCE scanner
addons/parley-design-check/lib/engine.js       capability, tier gating, waivers, conformance, verdicts
addons/parley-design-check/lib/detectors/      one module per detector
addons/parley-design-check/test/               the suite and its fixtures
```
