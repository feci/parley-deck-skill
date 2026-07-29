---
spec: PDS/1.0
status: stable
conformance-language: RFC 2119
registry: core-rules/1.0.0
registry-digest: b49ff596451f
---

# PDS/1.0 — the Parley Design Spec

A profile over the Parley Deck cooperation protocol: producing a design system with
several independent participants, binding it, applying it, auditing what shipped.

## §0 Scope, non-goals and normative language

### §0.1 Scope

This spec governs a design run's typed artifacts, the gates at Parley's transitions,
evidence and verdict vocabulary, rule authority, waivers, conformance levels, extension
and versioning. Surface-agnostic: target numbers live in an annex.

### §0.2 Non-goals

No aesthetic, no theme catalogue, no numeric quality score, no second phase cursor, no tool
or implementation code.

### §0.3 Relationship to COOPERATION.md

1. **One cursor.** `COOPERATION.md` owns phases, artifact ownership, quorum, the track
   classifier and terminal states. This spec MUST NOT introduce a second phase state
   machine; its steps name work inside Parley phases (§1).
2. **Conflict resolution.** On *process* `COOPERATION.md` wins; on the *content of a
   design artifact* this spec wins.

### §0.4 Relationship to parley-design-check

This spec owns meanings: artifact shapes, rule authority, thresholds, evidence minimums,
waivers, conformance. The checker owns execution: parsing, detectors, reports, exit codes.
With no checker the doctrine binds and findings are hand-written in the same form:
`rule-id — violation — remedy`.

### §0.5 Normative language

1. **Uppercase is reserved.** MUST, MUST NOT, SHOULD, SHOULD NOT and MAY carry RFC 2119
   meaning and appear only inside normative statements; lowercase binds nothing.
2. **Unlabelled is normative.** A heading marked `(informative)` is advisory; anything not
   so marked binds.
3. **Statements are numbered and named.** Each normative statement carries a number in its
   section and a bold short name; cite as `§4 rule 3`. A table binds through its
   governing rule and carries no keyword of its own.
4. **Counts are derived, never written.** Normative prose MUST NOT state how many rules,
   kinds or gates exist; derive a count from the registry or this file.

## §1 Parley mapping

1. **Design steps are Parley homes, not states.** Each step below MUST be performed in the
   Parley phase named for it and produce the artifact named for it; a run MUST NOT report a
   step contradicting its phase.

| Design step | Parley home | Artifact |
|---|---|---|
| BRIEF | Phase 0, alongside `00-prompt.md` | `DESIGN-BRIEF.md` |
| DIVERGE | round-01 | `round-01/<agent>.md` + `<agent>.tokens.json` |
| DISTINCTNESS gate G1 | facilitator, between rounds | recorded gate outcome |
| CRITIQUE | round-02, exactly one round | `round-02/<agent>.md` |
| DECIDE + GRAFT | `consensus.md` | VERDICT: winner, ≤3 grafts, dissent |
| CONTRACT | `FINAL.md` | CONTRACT |
| APPLY | Phase 5, ordinary implementer | code |
| AUDIT | Phases 6–8 | review artifacts + checker output |
| SYSTEM | after Phase 8 | `DESIGN-SYSTEM.md` |

2. **Gates attach to transitions.** Every gate in §3 MUST be recorded at the transition
   named for it. A transition crossed with its gate unrecorded fails L2 (§9), and so does one
   whose recorded outcome the run's own evidence contradicts: the outcome is its
   conditions, never the word.
3. **One token sidecar per direction.** A DIRECTION's `tokens` path resolves against its own
   directory and MUST name the adjacent `<agent>.tokens.json` above; two DIRECTIONs MUST NOT
   name one file.

## §2 Artifact kinds

1. **Typed and versioned.** Every artifact MUST carry `spec: PDS/1.0` and `kind: <KIND>`
   in its frontmatter from its first commit. A file declaring the spec under a kind §2
   does not define MUST be reported as violating this rule; one declaring the spec
   and no kind is not an artifact instance.
2. **Unknown keys.** A consumer MUST NOT error on an unrecognised frontmatter key; `x-`
   keys are silent by design, others SHOULD warn.
3. **Empty is not absent.** An absent required field MUST be reported as a violation; a
   present but empty field MUST NOT be reported as absent.
4. **One shape, and the table binds.** Every kind below is purpose, rationale, required
   fields, minimal example. Each table is normative: a listed field MUST
   be present and MUST meet the requirement beside it, except where that requirement states
   when it appears. Cite as `§2 DIRECTION, positions`.
5. **Canonical frontmatter.** Frontmatter is the block between a file's first `---` line
   and the next. It is UTF-8 and uses only this subset, which every example below obeys.

   ```text
   key     column zero, [A-Za-z_][A-Za-z0-9_.-]*, unique per mapping, then ": "
   value   one line: a scalar, a flow list [a, b], or a flow map {k: v}
   list    or, under a bare key, indented "- " items, one such value each
   nesting a flow collection may hold flow collections; those hold scalars only
   scalar  quote with " around , [ ] { } # or an edge space, with ' around "; no escapes
   empty   [], {} or ""; a bare key is a list header and needs one item
   comment a whole line whose first non-space character is #; never trailing
   never   block mappings, | and > scalars, anchors, aliases, tags, tabs
   ```

6. **Unparsable is a violation.** A file declaring `spec: PDS/1.0` whose frontmatter leaves
   rule 5 MUST be reported as violating it, never dropped from conformance in silence.

### DESIGN-BRIEF

What is designed, and the axes on which directions must differ.

The axes are G1's input; each declared position is checked against them.

| Field | Requirement |
|---|---|
| `run-id` | The run's identity: its Parley idea slug, fixed at Phase 0, never re-used; §4 rule 2 hashes it. |
| `axes` | Named axes, enumerated positions; never free text. |
| `primary-axis` | The axis §4 rule 2 assigns; one distinct position per proposer. |
| `anti-goals` | What the result must not be; each falsifiable. |
| `targets` / `level` | Target profiles; level claimed (§9). |
| `decider` | Named human, or the delegate §4 rule 7 permits. |

```yaml
spec: PDS/1.0
kind: DESIGN-BRIEF
run-id: parley-design-skills
axes: {density: [sparse, dense], structure: [flat, layered]}
primary-axis: structure
anti-goals: ["reads as a template"]
targets: [web]
level: L2
decider: human:tomas
```

### DIRECTION

One participant's complete, self-consistent proposal for the visual world.

Selection needs whole alternatives: these positions feed G1, and the winner becomes the
contract.

| Field | Requirement |
|---|---|
| `handle` | One word, unique in the run; citations use it. |
| `signature` | One sentence naming the decision that makes this direction itself. |
| `positions` | One declared position per brief axis. |
| `assigned` | The position §4 rule 2 gave this proposer, verbatim. |
| `declined` | Only where the proposer declined: one line saying why (§4 rule 3); `positions` still records the choice. |
| `tokens` | This direction's own token file, in DTCG `2025.10`; named as §1 rule 3 requires. |
| `states` / `effects` | States defined; decorative devices used. |

```yaml
spec: PDS/1.0
kind: DIRECTION
handle: ledger
signature: "Every surface is a table; alignment carries hierarchy."
positions: {density: dense, structure: flat}
assigned: flat
tokens: codex-1.tokens.json
states: [rest, hover, focus, pressed, disabled]
effects: [rule-lines]
```

### CRITIQUE

Typed findings from one participant against directions other than its own.

Taste arguments become citable records: rule, tier obtained, remedy.

| Field | Requirement |
|---|---|
| `targets` | Handles critiqued; never the author's own (§5 rule 2). |
| `findings[].rule-id` | Registry id; an unknown id passes as `UNJUDGEABLE` (§10 rule 3). |
| `findings[].tier` / `.verdict` | Tier obtained; a verdict from §6 rule 4. |
| `findings[].violation` / `.remedy` | Reproducible defect and the fix; both required unless `PASS`. |

```yaml
spec: PDS/1.0
kind: CRITIQUE
agent: hermes-1
targets: [ledger, atrium]
findings:
  - {rule-id: core:interaction-states-incomplete, tier: T0 ARTIFACT, verdict: VIOLATION, violation: "atrium has no disabled state", remedy: "define it or say it never disables"}
```

### VERDICT

The Decider's recorded selection of one direction, with its bounded grafts.

Averaging two visual systems yields a third nobody designed.

| Field | Requirement |
|---|---|
| `outcome` | Exactly one `winner: <handle>` or `abstain: <reason>`; never a ranking. |
| `grafts` | Zero to three, each as §4 rule 6 requires. |
| `tokens-digest` | The winner's token file as ratified: the first twelve hex characters of sha256 over it, compared by §3 G2. |
| `answers` | Every open critique against the winner: accepted, rejected with a reason, or waived against a waiver-file entry. |
| `dissent` | Recorded verbatim, never summarised away. |
| `decided-by` | The Decider of §4 rule 7. |

```yaml
spec: PDS/1.0
kind: VERDICT
outcome: {winner: ledger}
grafts: [{from: atrium, part: "empty-state slot", as: space.gap.lg}]
tokens-digest: 9f2c41ab77de
answers: [{rule-id: core:interaction-states-incomplete, disposition: accepted}]
dissent: ["kimi-1: flat will not survive the settings surface"]
decided-by: human:tomas
```

### CONTRACT

The binding design commitment implementers build against, in `FINAL.md`.

Phase 5 needs something falsifiable to obey, so review can ask whether the build matches.

| Field | Requirement |
|---|---|
| `winner` | The winning handle; matches the VERDICT. |
| `tokens` | Ratified token file, unmodified by any graft. |
| `named-rules` | Durable decisions as `**The <Name> Rule.**` plus one sentence. |
| `states` / `effect-budget` | States every interactive element defines; the per-surface and per-element budget. |
| `waivers` / `level` | The single waiver file (§8 rule 1); level claimed (§9). |

```yaml
spec: PDS/1.0
kind: CONTRACT
winner: ledger
tokens: design/tokens.json
named-rules: ["**The Alignment Rule.** Hierarchy is alignment, never shadow."]
states: [rest, hover, focus, pressed, disabled]
effect-budget: {surface: 3, element: 1}
waivers: design/WAIVERS.md
level: L3
```

### DESIGN-SYSTEM

A description of the system that shipped, written from the built code.

The next contributor needs the truth, not the intention: as description the built system
wins, as authorisation never.

| Field | Requirement |
|---|---|
| `author` | The Phase-6 design reviewer, or §5 rule 7's named author, degradation recorded. |
| `source-commit` | The commit the description was read from. |
| `groups` | Token groups actually present in shipped code. |
| `divergences` | Each commitment classed `match`, `adaptation`, `missing` or `contradicted`, with a reason. |

```yaml
spec: PDS/1.0
kind: DESIGN-SYSTEM
author: hermes-1
source-commit: 4f1c9ab
groups: [color, space, type]
divergences:
  - {rule: "**The Alignment Rule.**", verdict: adaptation, reason: "shadow used once on the overlay"}
```

### AUDIT

The machine-written record of one enforcement run against a target.

A conformance claim must be falsifiable, so the run pins what it read.

| Field | Requirement |
|---|---|
| `implements` / `registry-digest` | `PDS/1.0`; digest of the registry read (§11 rule 3). |
| `tiers` | Requested, executed, unavailable; an unavailable tier is reported, never skipped. |
| `findings[]` | Each as `rule-id — violation — remedy`, one line, stable across runs. |
| `waivers-applied` / `level` | Waivers that suppressed a finding; level verified, maybe below the claim. |

```yaml
spec: PDS/1.0
kind: AUDIT
implements: PDS/1.0
registry-digest: 9f2c41ab77de
tiers: {requested: [T0 ARTIFACT], executed: [T0 ARTIFACT], unavailable: [T2 RENDERED]}
findings: ["core:literal-outside-token-layer — panel.css sets a literal colour — declare a token"]
level: L2
```

### WAIVERS

The single file recording every knowing, time-bounded exception.

A suppression nobody counter-signed is one nobody reviewed.

| Field | Requirement |
|---|---|
| `entries[].rule-id` | Exactly one id; a wildcard is rejected (§8 rule 3). |
| `entries[].scope` | The narrowest scope covering the work (§8 rule 3). |
| `entries[].reason` | Why the rule is wrong here, specifically. |
| `entries[].expiry` | A date; expired means absent (§8 rule 5). |
| `entries[].granted-by` | The granting participant, as an id (§8 rule 2). |
| `entries[].counter-signed-by` | An independent counter-signer (§8 rule 2). |

```yaml
spec: PDS/1.0
kind: WAIVERS
entries:
  - {rule-id: core:effect-budget-exceeded, scope: src/marketing/hero.tsx, expiry: 2026-10-01, reason: "campaign surface, ratified for one launch", granted-by: claude-1, counter-signed-by: codex-1}
```

## §3 Gates G1–G4

A gate is a rule with a recorded outcome, not a phase. The strings below are canonical
message shapes, not literal output: a tool MAY prefix its finding id and fill in values;
with no tool a participant writes it by hand.

1. **G1 DISTINCTNESS.** Between round-01 and round-02; facilitator-computed, no model call.
   MUST fail if any pair of directions differs on fewer than two of the brief's axes, if two
   Signatures are identical, or if two directions share a banned-slop signature — defined,
   with the ban list and the sharing test, in `RULES.md` class `slop`. The G1 outcome MUST
   record each direction's signature, empty or not, and a failed set MUST NOT proceed to
   critique. Remedy: exactly one seeded forced-axis re-diverge. Persistent convergence
   never auto-passes: it proceeds only past the ban list, past `core:category-guessable`'s
   category-plus-avoidance test, and on recorded human ratification with a brief-specific
   reason; short of all three it returns `ABSTAIN`.

   ```text
   G1 DISTINCTNESS — directions '<a>' and '<b>' differ on 1 declared axis; 2 are required. Re-diverge once with the seeded assignment (§4 rule 2). A still-converged set needs the ban list, the category-plus-avoidance test and recorded human ratification with a brief-specific reason, or ABSTAIN.
   ```

2. **G2 COHERENCE.** After the graft, before CONTRACT. MUST fail if the outcome names
   other than one winner, if a graft modifies the winner's token file or cannot be
   re-expressed in the winner's tokens, if grafts exceed three, or if a `VIOLATION` against
   the winner is unanswered. Modification is decided by re-reading the winner's token file
   and comparing it with the VERDICT's `tokens-digest`; any difference fails the gate, and a
   `waived` answer resolving to no valid waiver entry (§8) is unanswered. It fails the
   graft, never the winner.

   ```text
   G2 COHERENCE — graft '<n>' from '<handle>' modifies the winner's token file. Re-express it in an existing winner token, or drop the graft.
   ```

3. **G3 TOKEN INTEGRITY.** At token ratification and on every APPLY. MUST fail on a raw
   literal outside the token layer, an alias that does not resolve to a declared token, an
   alias cycle, an alias against its document's declared direction, a colour token without
   `colorSpace` or not computable to a displayable value, and a token declared-but-unused or
   used-but-undeclared. Direction is declared by group name: where a document names a group
   `primitive`, `semantic` or `component`, a reference points strictly down that order and a
   primitive holds a value, never another primitive. Naming none declares none, and that
   conjunct is vacuous.

   ```text
   G3 TOKEN-INTEGRITY — '<path>' uses a literal value outside the token layer. Declare it as a token and reference the token.
   ```

4. **G4 NO OPEN VIOLATIONS.** At AUDIT, before any terminal state. MUST fail on an
   unresolved `quality` violation with no valid waiver; a finding suppressed by an expired
   waiver is unresolved.

   ```text
   G4 OPEN-VIOLATION — '<rule-id>' at '<path>' is unresolved and unwaived. Fix it, or record a counter-signed waiver with a narrow scope and an expiry (§8).
   ```

## §4 The ritual

1. **Diverge in isolation.** A proposer MUST NOT read another direction before submitting
   its own.
2. **The assignment is deterministic.** Each proposer takes a distinct position on the
   brief's primary axis by
   `assignment = rotate(sorted(primary_positions), uint32(sha256("PDS/1" || run_id)[0:8]))`
   mapped to sorted participant ids. `run_id` is the brief's `run-id` (§2) as UTF-8 bytes;
   `[0:8]` is the digest's first eight hex characters big-endian, and the list rotates by
   that modulo the position count. Ids sort by codepoint, and the rotated list maps to them
   in order. Each DIRECTION MUST record what it was given as `assigned`,
   so the mapping recomputes from the brief and the directions alone. The brief MUST
   enumerate at least as many materially distinct primary positions as there are proposers,
   and MUST NOT list one twice, or the full route MUST NOT start.
3. **The decline valve.** An assigned proposer MAY decline its position by recording a
   one-line reason as `declined` in its DIRECTION. Declining does not relax G1.
4. **Exactly one critique round.** A second round needs an explicit Decider instruction and
   a recorded reason.
5. **Selection, never averaging.** One direction wins whole; synthesising two
   directions' visual systems is a protocol violation.
6. **Bounded graft.** Zero to three grafts MAY be taken from losing directions. Each names
   its source, the exact part and the winner token it is re-expressed in, and MUST NOT
   modify the winner's token file. A graft that cannot be re-expressed is rejected; losing
   directions are archived, never deleted.
7. **Unattended runs stop.** An unattended full run MUST record `ABSTAIN` and stop before
   CONTRACT and Phase 5 until the named human Decider selects a direction. No
   agent-selected winner, even labelled provisional, MAY authorise implementation. A
   pre-registered non-proposer, non-critic agent Decider in the brief stays permitted.
8. **The fast path runs outside Parley.** Work inside a ratified system introducing no new
   token family, foundation or visual direction MAY run the invariants and the checker with
   one agent. That run is not a Parley workflow — `COOPERATION.md` §1 makes multi-agent
   execution mandatory; §0.3 rule 2 gives it the process — so it MUST NOT claim Parley
   verification, nor a level above L1. Greenfield work MUST NOT use the fast path.

## §5 Roles and invariants

1. **Roles.** Proposer, Critic, Facilitator, Decider. One participant MAY hold several
   roles except as forbidden below.
2. **Recusal.** A Proposer MUST NOT critique, rank, score or decide its own direction, nor
   draft the VERDICT. A self-assessment is discarded, never down-weighted.
3. **No score, no ranking at DECIDE.** No numeric aesthetic score is produced;
   the Decider receives a typed findings ledger.
4. **Anonymisation is SHOULD, not MUST.** Recusal is the enforceable mechanism; a
   claimed-but-ineffective blind is worse than an open one.
5. **Length caps.** A DIRECTION's prose MUST NOT exceed 800 words, excluding its token
   file, and neither MUST a CRITIQUE's.
6. **Declared degradation.** A participant that cannot obtain evidence at a rule's minimum
   tier MUST record `UNJUDGEABLE` with the reason.
7. **Design System authorship.** `DESIGN-SYSTEM.md` MUST be written by the Phase-6 design
   reviewer — a participant that neither proposed the winning direction nor implemented it.
   With no such reviewer the Decider MUST name the author and the artifact MUST record
   self-authorship as a declared degradation.

## §6 Evidence tiers and verdicts

| Tier | Evidence |
|---|---|
| `T0 ARTIFACT` | The design artifacts: text, frontmatter, token graphs. |
| `T1 SOURCE` | Parsed implementation source; no computed layout. |
| `T2 RENDERED` | A running interface's computed state. |
| `T3 PIXEL` | Raster evidence. Declared here, not shipped in v1. |

1. **Ordinal, and spelled in full.** Tiers are ordered `T0 < T1 < T2 < T3` and MUST be
   written in prose as number and word together, so "below `T2 RENDERED`" is checkable.
2. **Minimum tier binds.** A finding originated below its rule's minimum tier MUST be
   recorded `UNJUDGEABLE`, never `PASS`, never `VIOLATION`.
3. **Engine names are out of scope.** The mapping from tier to parser, browser or
   raster tool is target-specific and lives in an annex.
4. **Verdicts.** `PASS`, `VIOLATION`, `NEEDS_REVIEW`, `UNJUDGEABLE`. `UNJUDGEABLE` is a
   verdict, not a tier, and MUST NOT be reported as a pass. Provenance is the registry's
   `enforced-by`, not a tier.

## §7 Rule classes and authority

| Class | Meaning | Authority |
|---|---|---|
| `quality` | Objectively wrong: contrast, missing state, occluded text, honesty. | Blocks unilaterally on reproducible evidence (rule 1). |
| `slop` | Taste with a strong prior: guessable aesthetic, idle decoration, budget overrun. | Never blocks alone (rule 2). |
| `system` | Conformance to this project's ratified contract. | Binding only after ratification (rule 3). |

1. **`quality` blocks on evidence.** The evidence MUST be reproducible by another party; an
   unreproducible claim is `NEEDS_REVIEW`.
2. **`slop` needs concurrence.** A `slop` finding becomes an agreed fix on two or more
   independent concurrences from participants who did not author the work.
3. **`system` is meaningless before ratification.** A `system` rule cited against work
   predating the contract MUST be recorded `UNJUDGEABLE`.
4. **System-blind rules.** A rule marked `system-blind` MUST NOT be satisfied by widening
   the ratified system.
5. **Severity.** `0`–`4`. Only `4`, and optionally `3`, MAY block.
6. **Re-classification bumps the spec.** Changing a rule's class or authority requires a
   spec version bump; every review cites the registry version.

## §8 Waivers

1. **One file.** Every waiver MUST live in the single file named by the CONTRACT; a
   suppression recorded anywhere else MUST NOT be honoured.
2. **Required fields.** Rule id, narrowest scope, reason, expiry, the granting participant,
   and a counter-signature by a participant who is neither the grantor nor an author of the
   waived work. An author is read from §1's naming: a round file belongs to the agent id it
   names; work §1 gives no owner has none to exclude. A signer no artifact records but its
   own is not independent. Where independence cannot be established the waiver MUST NOT
   suppress its finding.
3. **No wildcards.** A waiver naming more than one rule id, or a scope broader than the
   work it excuses, MUST be rejected.
4. **No widening.** A `system-blind` rule MUST NOT be waived by widening the ratified
   system; only explicitly, with the same fields as any other waiver.
5. **Expiry is absolute.** An expired waiver MUST be treated as absent and its finding
   returns to the ledger unchanged.

## §9 Conformance levels

| Level | Requires | Runtime |
|---|---|---|
| L1 | The artifacts of §2 exist and lint. | None. |
| L2 | L1, plus §1's process order and a recorded gate for every §3 transition the run crossed. | None. |
| L3 | L2, plus a DTCG `2025.10` token document passing G3. | A JSON validator. |
| L4 | L3, plus applied UI passing the rendered-tier `quality` rules. | A browser. |

1. **Declare, then verify.** A project MUST declare the level it claims in its brief and
   contract; a checker verifies the claim, never infers it.
2. **Levels are cumulative.** A claim at one level asserts every level below it.
3. **An unreachable claim fails.** Claiming a level whose evidence tier was unavailable is
   a conformance failure, not a warning; the AUDIT reports the level verified.

## §10 Extension policy

1. **`core:` is reserved.** Ids prefixed `core:` belong to this spec; a project MUST NOT
   define one.
2. **Project rules are namespaced.** A project rule id MUST be `<project>:<slug>`.
3. **Unknown rule ids MUST NOT error.** A consumer meeting an id it does not know records
   `UNJUDGEABLE` and continues.
4. **Unknown token groups MUST NOT error.** Groups prefixed `x-` are silent by design;
   other unknown groups SHOULD warn and MUST still validate.
5. **Two escape hatches, kept distinct.** `x-` says "mine, not spec"; a waiver says "spec,
   and knowingly violated here". Neither substitutes for the other.

## §11 Versioning and deprecation

1. **Spec version on every artifact.** As §2 rule 1, from the first commit.
2. **The registry versions independently.** `registry: core-rules/<semver>` moves on its own
   cadence; a tool declares `implements: PDS/1.0` separately from its own version.
3. **Digest maintenance.** `registry-digest` is the first twelve hex characters of sha256
   over the registry file. It MUST be recomputed in the same commit as any registry edit,
   and a report whose recomputed digest differs from the declared one MUST report a mismatch,
   never accept it in silence.
4. **Ids are append-only.** A rule id MUST NOT change meaning and MUST NOT be reused after
   retirement.
5. **Deprecation window.** A deprecated rule MUST keep validating for at least one minor
   spec version, and MUST be listed with the versions that deprecated and remove it.

## §12 Changelog

### 1.0.0 — 2026-07-28

- Initial spec, §0–§11 as published; `T3 PIXEL` declared, not shipped, so rules needing
  it report `UNJUDGEABLE`.
- Defines G1's ban list and banned-slop signature, the canonical frontmatter subset, the
  brief's `run-id`, the token sidecar, alias direction, §8's authorship test, and the Phase-6 reviewer as
  `DESIGN-SYSTEM.md`'s author.
