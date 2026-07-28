---
spec: PDS/1.0
status: stable
conformance-language: RFC 2119
registry: core-rules/1.0.0
registry-digest: 1fbe071e1222
---

# PDS/1.0 — the Parley Design Spec

A profile over the Parley Deck cooperation protocol: producing a design system with
several independent participants, binding it, applying it, auditing what shipped.

## §0 Scope, non-goals and normative language

### §0.1 Scope

This spec governs the typed artifacts a design run produces, the gates at Parley's
transitions, evidence and verdict vocabulary, rule authority, waivers, conformance levels,
and extension and versioning policy. It is surface-agnostic; target-specific numbers live
in a target annex.

### §0.2 Non-goals

No aesthetic, no theme catalogue, no numeric quality score, no second phase cursor, no
tool implementation, no implementation code.

### §0.3 Relationship to COOPERATION.md

1. **One cursor.** `COOPERATION.md` owns phases, artifact ownership, quorum, the track
   classifier and terminal states. This spec MUST NOT introduce a second phase state
   machine; its step names name work done inside Parley phases (§1).
2. **Conflict resolution.** On *process* `COOPERATION.md` wins; on the *content of a
   design artifact* this spec wins.

### §0.4 Relationship to parley-design-check

This spec owns meanings: artifact shapes, rule authority, thresholds, evidence minimums,
waivers, conformance. The checker owns execution: parsing, detectors, reports, exit codes.
The doctrine is complete without it — with no checker, findings are written by hand in the
same form, `rule-id — violation — remedy`.

### §0.5 Normative language

1. **Uppercase is reserved.** MUST, MUST NOT, SHOULD, SHOULD NOT and MAY carry RFC 2119
   meaning and appear only inside normative statements. Lowercase "must" or "should" is
   prose and binds nothing.
2. **Unlabelled is normative.** A heading marked `(informative)` is advisory; anything not
   so marked binds.
3. **Statements are numbered and named.** Each normative statement carries a number within
   its section and a bold short name. Cite as `§4 rule 3`.
4. **Counts are derived, never written.** Normative prose MUST NOT state how many rules,
   artifact kinds or gates exist; derive a count from the registry or from this file.

## §1 Parley mapping

1. **Design steps are Parley homes, not states.** Each step below MUST be performed in the
   Parley phase named for it and produce the artifact named for it; a run MUST NOT report a
   design step that contradicts its Parley phase.

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
   named for it; a transition crossed with its gate unrecorded is an L2 failure (§9).

## §2 Artifact kinds

1. **Typed and versioned.** Every artifact MUST carry `spec: PDS/1.0` and `kind: <KIND>`
   in its frontmatter from its first commit.
2. **Unknown keys.** A consumer MUST NOT error on an unrecognised frontmatter key; `x-`
   keys are silent by design, others SHOULD warn.
3. **Empty is not absent.** An absent required field MUST be reported as a violation; a
   present but empty field MUST NOT be reported as absent.

Entries share one shape — name, purpose, rationale, required fields, minimal example — and
the shape does not vary.

### DESIGN-BRIEF

What is designed, and the axes on which directions must differ.

Divergence needs a stated dimension: the axes are G1's input, and each direction's declared
position is verified against them.

| Field | Requirement |
|---|---|
| `axes` | Named axes, enumerated positions; never free text. |
| `primary-axis` | Assigned axis; one distinct position per proposer. |
| `anti-goals` | What the result must not be; each falsifiable. |
| `targets` / `level` | Target profiles; level claimed (§9). |
| `decider` | Named human or pre-registered delegate (§4 rule 7). |

```yaml
spec: PDS/1.0
kind: DESIGN-BRIEF
axes: {density: [sparse, dense], structure: [flat, layered]}
primary-axis: structure
anti-goals: ["reads as a template"]
targets: [web]
level: L2
decider: human:tomas
```

### DIRECTION

One participant's complete, self-consistent proposal for the whole visual world.

Selection needs whole alternatives, never fragments: these positions feed G1, and the
winner becomes the contract.

| Field | Requirement |
|---|---|
| `handle` | One word, unique in the run; citations use it. |
| `signature` | One sentence naming the decision that makes this direction itself. |
| `positions` | One declared position per brief axis. |
| `assigned` / `declined` | Assigned position; one-line reason if declined. |
| `tokens` | This direction's token file, in DTCG `2025.10`. |
| `states` / `effects` | States defined; decorative devices used. |

```yaml
spec: PDS/1.0
kind: DIRECTION
handle: ledger
signature: "Every surface is a table; alignment carries hierarchy."
positions: {density: dense, structure: flat}
assigned: flat
tokens: round-01/codex-1.tokens.json
states: [rest, hover, focus, pressed, disabled, loading, empty, error]
effects: [rule-lines]
```

### CRITIQUE

Typed findings from one participant against directions other than its own.

Taste arguments become citable records: rule, tier obtained, remedy.

| Field | Requirement |
|---|---|
| `targets` | Handles critiqued; never the author's own (§5 rule 2). |
| `findings[].rule-id` | Registry id; unknown ids pass as `UNJUDGEABLE` (§10). |
| `findings[].tier` / `.verdict` | Tier obtained; a verdict from §6 rule 4. |
| `findings[].violation` / `.remedy` | Reproducible defect; the fix. Both required unless `PASS`. |

```yaml
spec: PDS/1.0
kind: CRITIQUE
agent: hermes-1
targets: [ledger, atrium]
findings:
  - {rule-id: core:states-incomplete, tier: T0 ARTIFACT, verdict: VIOLATION,
     violation: "atrium has no disabled state", remedy: "define it or say it never disables"}
```

### VERDICT

The Decider's recorded selection of exactly one direction, with its bounded grafts.

Averaging two visual systems yields a third nobody designed, so the outcome is a
discriminated choice that cannot express a blend.

| Field | Requirement |
|---|---|
| `outcome` | Exactly one of `winner: <handle>` or `abstain: <reason>`; never a ranking. |
| `grafts` | Zero to three; each names source, part, winner token it re-expresses. |
| `answers` | Every open critique against the winner: accepted, rejected with a reason, or waived. |
| `dissent` | Recorded verbatim, never summarised away. |
| `decided-by` | Named human Decider or pre-registered delegate. |

```yaml
spec: PDS/1.0
kind: VERDICT
outcome: {winner: ledger}
grafts: [{from: atrium, part: "empty-state slot", as: space.gap.lg}]
answers: [{rule-id: core:states-incomplete, disposition: accepted}]
dissent: ["kimi-1: flat will not survive the settings surface"]
decided-by: human:tomas
```

### CONTRACT

The binding design commitment implementers build against, recorded in `FINAL.md`.

Phase 5 needs something falsifiable to obey, so review asks whether the build matches the
contract, not whether anyone likes it.

| Field | Requirement |
|---|---|
| `winner` | The winning handle; MUST match the VERDICT. |
| `tokens` | Ratified token file; grafts MUST NOT have modified it. |
| `named-rules` | Durable decisions as `**The <Name> Rule.**` plus one sentence. |
| `states` / `effect-budget` | States every interactive element defines; per-surface and per-element budget. |
| `waivers` / `level` | The single waiver file (§8); level claimed (§9). |

```yaml
spec: PDS/1.0
kind: CONTRACT
winner: ledger
tokens: design/tokens.json
named-rules: ["**The Alignment Rule.** Hierarchy is carried by alignment, never shadow."]
states: [rest, hover, focus, pressed, disabled, loading, empty, error]
effect-budget: {surface: 3, element: 1}
waivers: design/WAIVERS.md
level: L3
```

### DESIGN-SYSTEM

A description of the system that actually shipped, written from the built code.

The next contributor needs the truth, not the intention; against the CONTRACT the built
system wins as a description, never as an authorisation.

| Field | Requirement |
|---|---|
| `author` | Phase-6 design reviewer, or a Decider-named author with the degradation recorded (§5 rule 7). |
| `source-commit` | The commit the description was read from. |
| `groups` | Token groups actually present in shipped code. |
| `divergences` | Each commitment classified `match`, `adaptation`, `missing` or `contradicted`, with a reason. |

```yaml
spec: PDS/1.0
kind: DESIGN-SYSTEM
author: hermes-1
source-commit: 4f1c9ab
groups: [color, space, type, radius, motion]
divergences:
  - {rule: "**The Alignment Rule.**", verdict: adaptation,
     reason: "shadow used once on the overlay"}
```

### AUDIT

The machine-written record of one enforcement run against a target.

A conformance claim must be falsifiable, so the run pins the spec, the registry it read
and the tiers it reached.

| Field | Requirement |
|---|---|
| `implements` / `registry-digest` | `PDS/1.0`; digest of the registry used (§11 rule 3). |
| `tiers` | Requested, executed, unavailable; an unavailable tier MUST be reported, never skipped in silence. |
| `findings[]` | Each as `rule-id — violation — remedy`, one line, stable across runs. |
| `waivers-applied` / `level` | Waivers that suppressed a finding; level verified, which MAY be below the claim. |

```yaml
spec: PDS/1.0
kind: AUDIT
implements: PDS/1.0
registry-digest: 9f2c41ab77de
tiers: {requested: [T0 ARTIFACT, T1 SOURCE], executed: [T0 ARTIFACT, T1 SOURCE],
        unavailable: [T2 RENDERED]}
findings: ["core:raw-value-outside-tokens — panel.css sets a literal colour — declare a token"]
level: L2
```

### WAIVERS

The single file recording every knowing, time-bounded exception.

An unrecorded exception is indistinguishable from a defect, and a suppression nobody
counter-signed is a suppression nobody reviewed.

| Field | Requirement |
|---|---|
| `entries[].rule-id` | Exactly one rule id; wildcards MUST be rejected. |
| `entries[].scope` | Narrowest scope covering it — a path, not a tree. |
| `entries[].reason` | Why the rule is wrong here, specifically. |
| `entries[].expiry` | A date; an expired entry MUST be treated as absent. |
| `entries[].counter-signed-by` | A participant who did not author the waived work. |

```yaml
spec: PDS/1.0
kind: WAIVERS
entries:
  - {rule-id: core:effect-budget, scope: src/marketing/hero.tsx, expiry: 2026-10-01,
     reason: "campaign surface, ratified for one launch",
     granted-by: claude-1, counter-signed-by: codex-1}
```

## §3 Gates G1–G4

A gate is a rule with a recorded outcome, not a phase. The strings below are the checker's;
without one, a participant writes them by hand.

1. **G1 DISTINCTNESS.** Between round-01 and round-02; facilitator-computed, no model call.
   MUST fail if any pair of directions differs on fewer than two declared axes, if two
   Signatures are identical, or if two directions share a banned-slop signature. A failed
   set MUST NOT proceed to critique. Remedy: exactly one seeded forced-axis re-diverge;
   persistent convergence proceeds only on recorded human ratification with a
   brief-specific reason, or returns `ABSTAIN`.

   ```text
   G1 DISTINCTNESS — directions '<a>' and '<b>' differ on 1 declared axis; 2 are required. Re-diverge once with the seeded assignment (§4 rule 2), or record human ratification.
   ```

2. **G2 COHERENCE.** After the graft, before CONTRACT. MUST fail if the outcome names
   other than one winner, if a graft modifies the winner's token file, if a graft cannot be
   re-expressed in the winner's tokens, if grafts exceed three, or if a `VIOLATION` against
   the winner is unanswered. It fails the graft, never the winner.

   ```text
   G2 COHERENCE — graft '<n>' from '<handle>' modifies the winner's token file. Re-express it in an existing winner token, or drop the graft.
   ```

3. **G3 TOKEN INTEGRITY.** At token ratification and on every APPLY. MUST fail on a raw
   literal outside the token layer, an alias that does not resolve to a declared token, an
   alias cycle, a colour token without `colorSpace` or not computable to a displayable
   value, and a token declared but unused or used but undeclared.

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
2. **The assignment is deterministic.** Each proposer is assigned a distinct position on
   the brief's primary axis by
   `assignment = rotate(sorted(primary_positions), uint32(sha256("PDS/1" || run_id)[0:8]))`
   mapped to sorted participant ids. The brief MUST enumerate at least as many materially
   distinct primary positions as there are proposers, or the full route MUST NOT start.
3. **The decline valve.** An assigned proposer MAY decline its position by recording a
   one-line reason in its DIRECTION. Declining does not relax G1.
4. **Exactly one critique round.** A second round requires an explicit Decider instruction
   and a recorded reason.
5. **Selection, never averaging.** Exactly one direction wins whole; synthesising two
   directions' visual systems is a protocol violation.
6. **Bounded graft.** Zero to three grafts MAY be taken from losing directions. Each names
   its source, the exact part, and the winner token it is re-expressed in, and MUST NOT
   modify the winner's token file. A graft that cannot be re-expressed is rejected; losing
   directions are archived, never deleted.
7. **Unattended runs stop.** An unattended full run MUST record `ABSTAIN` and stop before
   CONTRACT and Phase 5 until the named human Decider selects a direction. No
   agent-selected winner, even labelled provisional, MAY authorise implementation. A
   pre-registered non-proposer, non-critic agent Decider named in the brief remains
   permitted.
8. **The fast path.** Work inside a ratified system introducing no new token family,
   foundation or visual direction MAY run the invariants and the checker with one agent and
   no deliberation. Greenfield work MUST NOT use the fast path.

## §5 Roles and invariants

1. **Roles.** Proposer, Critic, Facilitator, Decider. One participant MAY hold several
   roles except where forbidden below.
2. **Recusal.** A Proposer MUST NOT critique, rank, score or decide its own direction, and
   MUST NOT draft the VERDICT. A self-assessment is discarded, not down-weighted.
3. **No score, no ranking at DECIDE.** No numeric aesthetic score is produced at any point;
   the Decider receives a typed findings ledger. Judge bias is worst where the quality gap
   is smallest.
4. **Anonymisation is SHOULD, not MUST.** A claimed-but-ineffective blind is worse than an
   acknowledged open one; recusal is the enforceable mechanism.
5. **Length caps.** A DIRECTION's prose MUST NOT exceed 800 words excluding its token file;
   a CRITIQUE MUST NOT exceed 800 words. Judged quality tracks length, so an uncapped
   ledger rewards volume.
6. **Declared degradation.** A participant that cannot obtain evidence at a rule's minimum
   tier MUST record `UNJUDGEABLE` with the reason.
7. **Design System authorship.** `DESIGN-SYSTEM.md` MUST be written by the Phase-6 design
   reviewer — a participant that neither proposed the winning direction nor implemented it
   in Phase 5 — because an author is the worst party to describe what its system became.
   Where a run has no distinct reviewer, the Decider MUST name the author and the artifact
   MUST record self-authorship as a declared degradation.

## §6 Evidence tiers and verdicts

| Tier | Evidence |
|---|---|
| `T0 ARTIFACT` | The design artifacts themselves: text, frontmatter, token graphs. |
| `T1 SOURCE` | Parsed implementation source; no computed layout. |
| `T2 RENDERED` | A running interface's computed state. |
| `T3 PIXEL` | Raster evidence. Declared here, not shipped in v1. |

1. **Ordinal, and spelled in full.** Tiers are ordered `T0 < T1 < T2 < T3` and MUST be
   written as number and word together, so a threshold such as "below `T2 RENDERED`" is
   checkable.
2. **Minimum tier binds.** A finding originated below its rule's minimum tier MUST be
   recorded `UNJUDGEABLE` — never `PASS`, never `VIOLATION`.
3. **Engine names are out of scope here.** The mapping from tier to parser, browser or
   raster tool is target-specific and lives in a target annex.
4. **Verdicts.** `PASS`, `VIOLATION`, `NEEDS_REVIEW`, `UNJUDGEABLE`. `UNJUDGEABLE` is a
   verdict, not a tier, and MUST NOT be reported as a pass. Provenance is expressed by the
   registry's `enforced-by`, not by a tier.

## §7 Rule classes and authority

| Class | Meaning | Authority |
|---|---|---|
| `quality` | Objectively wrong: contrast floor, missing state, occluded text, honesty violation. | One participant MAY BLOCK on reproducible evidence. |
| `slop` | Taste with a strong prior: guessable aesthetic, unmotivated decoration, exceeded effect budget. | Never blocks unilaterally. |
| `system` | Conformance to this project's ratified contract. | Binding only after ratification. |

1. **`quality` blocks on evidence.** The evidence MUST be reproducible by another party; an
   unreproducible claim is `NEEDS_REVIEW`.
2. **`slop` needs concurrence.** A `slop` finding becomes an agreed fix on two or more
   independent concurrences from participants who did not author the work, never before.
3. **`system` is meaningless before ratification.** A `system` rule cited against work
   predating the contract MUST be recorded `UNJUDGEABLE`.
4. **System-blind rules.** A rule marked `system-blind` MUST NOT be satisfied by widening
   the ratified system.
5. **Severity.** Severity is `0`–`4`. Only `4`, and optionally `3`, MAY block.
6. **Re-classification bumps the spec.** Changing a rule's class or authority requires a
   spec version bump, and every review cites the registry version.

## §8 Waivers

1. **One file.** Every waiver MUST live in the single file named by the CONTRACT; a
   suppression recorded anywhere else MUST NOT be honoured.
2. **Required fields.** Rule id, narrowest scope, reason, expiry, counter-signature by a
   participant who did not author the waived work.
3. **No wildcards.** A waiver naming more than one rule id, or a scope broader than the
   work it excuses, MUST be rejected.
4. **No widening.** A `system-blind` rule MUST NOT be waived by widening the ratified
   system; it can only be waived explicitly, with the same fields as any other waiver.
5. **Expiry is absolute.** An expired waiver MUST be treated as absent and its finding
   returns to the ledger unchanged.

## §9 Conformance levels

| Level | Requires | Runtime |
|---|---|---|
| L1 | The artifacts of §2 exist and lint. | None. |
| L2 | L1, plus §1's process order and every gate of §3 recorded. | None. |
| L3 | L2, plus token integrity: DTCG `2025.10`, alias direction, no raw literals outside the token layer. | A JSON validator. |
| L4 | L3, plus applied UI passing the rendered-tier `quality` rules. | A browser or equivalent. |

1. **Declare, then verify.** A project MUST declare the level it claims in its brief and its
   contract; the checker verifies the claim and never infers it.
2. **Levels are cumulative.** A claim at one level asserts every level below it.
3. **An unreachable claim fails.** Claiming a level whose evidence tier was unavailable is a
   conformance failure, not a warning; the AUDIT reports the level actually verified.

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

1. **Spec version on every artifact.** `spec: PDS/1.0` is required from the first commit.
2. **The registry versions independently.** `registry: core-rules/<semver>` moves on its own
   cadence, and a tool declares `implements: PDS/1.0` separately from its own version.
3. **Digest maintenance.** `registry-digest` is the first twelve hex characters of sha256
   over the registry file. It MUST be recomputed in the same commit as any registry edit,
   and a report whose recomputed digest differs from the declared one MUST be reported as a
   registry mismatch, never silently accepted.
4. **Ids are append-only.** A rule id MUST NOT change meaning and MUST NOT be reused after
   retirement.
5. **Deprecation window.** A deprecated rule MUST keep validating for at least one minor
   spec version, and MUST be listed with the version that deprecated it and the version
   that removes it.

## §12 Changelog

### 1.0.0 — 2026-07-28

- Initial spec: §0–§11 as published.
- Adopts the Phase-6 design reviewer as the author of `DESIGN-SYSTEM.md` (§5 rule 7),
  resolving the open question from consensus.
- `T3 PIXEL` is declared and not shipped: rules requiring it report `UNJUDGEABLE`.
