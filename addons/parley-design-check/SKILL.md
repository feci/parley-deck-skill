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
| 0 | clean: no VIOLATION and no NEEDS_REVIEW |
| 1 | findings: at least one VIOLATION or NEEDS_REVIEW |
| 2 | the run itself failed: bad usage, an unreadable input, a broken registry, a detector that threw |
| 3 | rule checks refused: no registry was found |

Findings are not errors. A finding is a result the run produced successfully, which is why
it has its own code, and why a failed run does not hide behind an empty ledger.

## What it reads

| input | tier | recognised by |
|---|---|---|
| PDS artifacts | `T0 ARTIFACT` | `.md` with frontmatter carrying a `kind` PDS defines |
| token documents | `T0 ARTIFACT` | `.json` in the DTCG format, with `$value` leaves |
| stylesheets | `T1 SOURCE` | `.css` |
| markup | `T1 SOURCE` | `.html`, `.htm`, `.jsx`, `.tsx`, `.vue`, `.svelte`, `.astro` |

Anything else is listed in the report under `not-inspected` with the reason. A file the
checker did not read is never counted as a file that passed.

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
- the inputs a detector needs were not among the paths.

Rules belonging to another surface are listed as out of scope, which is not a pass either.

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
  carrying an `id` and an `outcome`.
- **One stylesheet is one surface** for the effect budget. It is an approximation, and it is
  the one place this checker trades precision for something it can compute.

## Waivers

Waivers are read from the file the contract names, or from `--waivers`. Each entry needs a
rule id, a scope, a reason, an expiry and a counter-signature; a scope is a path, read
relative to the waiver file or to the working directory. An entry is rejected, and its
finding stays in the ledger, when it names more than one rule through a wildcard, scopes
wider than a path, has expired, or carries no counter-signature. A rule the registry marks
`system-blind` MUST NOT be waived by scoping the waiver at the ratified system: that is the
widening the flag exists to forbid, and the checker rejects it.

## Conformance levels

| level | what this checker verifies |
|---|---|
| L1 | every artifact carries the spec version and the fields its kind requires |
| L2 | L1, plus the artifact set of the mapping, recusal, the distinctness and coherence gates recomputed where the artifacts allow it, and a recorded outcome for each |
| L3 | L2, plus token integrity: aliases resolve, no cycles, colour tokens declare a space and compute to a displayable value |
| L4 | not verifiable here; reported `UNJUDGEABLE`, because it needs rendered evidence |

A level whose evidence was unavailable is reported as not verified. Conformance results
carry ids in this tool's own namespace, `pds-check:<slug>`, so they are never confused with
registry rules.

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
