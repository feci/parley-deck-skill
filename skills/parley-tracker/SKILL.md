---
name: parley-tracker
description: "Author epics, user stories, and technical subtasks as canonical markdown files that read well for business people, technical people, AND the AI agents that implement them — then mirror them into any tracker (Jira, Linear, GitHub Issues, GitLab, Trello, a kanban board). Use when a Parley Deck idea or any backlog needs vendor-neutral, no-assumption, AI-implementable tickets with hybrid acceptance criteria and a tool-enforced gap-scan before work starts."
---

# parley-tracker

An opt-in Parley Deck addon skill for authoring epics, stories, and technical
subtasks that are simultaneously readable by a **business** reader, a
**technical** reader, and an **AI agent** that implements them.

The skill is vendor-, tracker-, and runtime-agnostic. It defines a neutral
markdown contract and a neutral field schema; mapping to a concrete tracker
(Jira, Linear, GitHub Issues, GitLab, Trello, a plain kanban board) happens at
the edge, with graceful degradation. The skill itself authors text and emits a
payload — it never holds tracker credentials.

## Core Rule

**The tracker is a mirror. The markdown ticket files are canonical.**

A ticket lives as a markdown file in the repo. Its YAML frontmatter is the
machine contract; its body is the human contract. A tracker (Jira, Linear,
GitHub Issues, GitLab, Trello, …) is a downstream *projection* of that file,
never a source of truth.

- Sync is **one-way (file → tracker)** by default.
- A `--pull` reconcile writes tracker-side edits back into the file **only** for
  fields the file flags `mirror-owned` (default `[status, assignee]`). Any field
  not listed is never written back; divergence on a non-mirror-owned field
  surfaces as a conflict, not a silent overwrite.
- **Graceful degradation:** a field the target tracker lacks is dropped from the
  *mirror*, never from the *file*. The file stays whole; only the projection
  loses fidelity.

A tracker comment, status flip, or hand-edited acceptance criterion can never
silently change a requirement. Requirement changes discovered in a tracker
return to Parley through a new round, an inbox escalation, or an
`IMPLEMENTATION.md` update — see "Relationship to Parley Deck core" below.

## When to use this skill

Use it when:

- A Parley Deck idea (`parley-deck/ideas/<slug>/FINAL.md`) must become a backlog
  of work items.
- A backlog must be readable by non-technical stakeholders *and* drive AI
  implementers without hidden assumptions.
- Tickets must survive a tracker migration (the canonical file is the asset; the
  tracker is replaceable).
- Multiple implementers will pick up work in parallel and you need each item's
  scope (its `files` set) to be explicit so work can be split without collisions.

Skip it for throwaway notes, or when the team's tracker is genuinely the system
of record and there is no canonical-file requirement.

## File layout

Tickets live under a `tickets/` tree whose path mirrors the epic hierarchy:

```text
tickets/<epic-slug>/epic.md
tickets/<epic-slug>/<story-slug>/story.md
tickets/<epic-slug>/<story-slug>/<subtask-slug>/subtask.md
```

The canonical design they trace back to stays in Parley:

```text
parley-deck/ideas/<slug>/00-prompt.md       # problem + participants (epic seed)
parley-deck/ideas/<slug>/FINAL.md           # authoritative design / spec
parley-deck/ideas/<slug>/IMPLEMENTATION.md  # implementation state + validation
```

The three canonical skeletons authors copy, and the readiness tooling, live
next to this file:

```text
addons/parley-tracker/templates/epic.md     # filled, self-passing exemplars
addons/parley-tracker/templates/story.md
addons/parley-tracker/templates/subtask.md
addons/parley-tracker/bin/validate.js       # readiness gap-scan / lint
addons/parley-tracker/bin/claim.js          # gap-scan-gated claim
```

Each template is a **filled, self-passing example** (`validate` exits 0 on it):
copy the matching one, then replace every value — `id`, `title`, the
`SLUG`/`REVISION`/`AGENT-ID`/`COMMIT-SHA` markers, and the prose — with your own.
Never delete a required slot — mark it `n/a (reason)` instead. Because `validate`
fails on any leftover `<...>` placeholder, a half-filled copy cannot be marked
ready by mistake.

## One file, three audiences

Every ticket is **one** file with an audience-tagged body and a YAML frontmatter
metadata block. The audience tags are sections of that one file, not separate
documents:

- **`## At a glance`** — MANDATORY 2–4 lines, written for all three audiences:
  one-sentence outcome · one-sentence scope · one-sentence done-when. It must
  surface any constraint that materially alters the outcome, because a
  stakeholder may read only this block. It is the only mandatory cross-audience
  block, and it is what makes a busy reader willing to open the file at all.
- **`## [B] Business`** — value, who benefits, why now, the success indicator.
- **`## [T] Technical`** — systems touched, interfaces, constraints, NFRs.
- **`## [A] Agent directives`** — self-contained scope, explicit `Do` / `Do not`,
  and the assumption policy. Must be non-empty and contain at least one
  `Do not` constraint (it forces explicit negative scope).

A human reader skims their own tag. An AI agent reads **all three sections plus
the frontmatter**. Tooling MAY render a per-reader filtered view by tag, but the
file is never split.

### Frontmatter metadata schema

This is the neutral machine contract. Fields are mapped to a concrete tracker at
the edge (see "Generic field schema → tracker mapping").

```yaml
---
id: E-001 | S-001 | T-001          # immutable, never reused; tracker-stable
type: epic | story | subtask
title: <imperative, <=80 chars>
parent: <id or n/a>                # epic has none; story -> epic; subtask -> story
status: draft | ready | in-progress | review | done | blocked | paused | dropped
assignee: <human | agent:<agent-id> | n/a>
priority: p0 | p1 | p2 | p3
labels: [domain:<x>, nfr:<y>]      # free-form tags; map to tracker labels/components
estimate: <points or n/a>          # optional
files: [<path-or-glob>]            # the parallelism boundary; AI scopes its reads to these
apis: [<openapi/doc ref> | n/a]    # interface contracts the work must honor
arch: [<doc ref> | n/a]            # architecture references
worktree: n/a | { path, branch, base }   # set when this item is built in an isolated worktree
dod: [AC-1, AC-2]                  # Definition of Done = checklist of AC ids (not prose)
mirror-owned: [status, assignee]   # only these fields may be written back on --pull
canonical_source: parley-deck/ideas/<slug>/FINAL.md@<revision>   # design source + revision
tracker: { provider: generic, external_id: <filled-after-create>, url: <filled-after-create> }
---
```

Rules:

- `id` is immutable and never reused, even after a ticket is `dropped`.
- `validate` requires the full canonical frontmatter the templates prescribe —
  `id`, `type`, `title`, `status`, `parent`, `assignee`, `priority`, `labels`,
  `files`, `apis`, `arch`, `worktree`, `dod`, `mirror-owned`, and
  `canonical_source` — each present and either populated or an explicit
  `n/a (reason)`. `canonical_source` must be **populated** (not `n/a`) on a
  story/subtask. Prefer an explicit `n/a (reason)` over silently omitting a slot.
- Do not add fields not in this schema. Tracker-specific extras live in an
  optional projection plugin (see vendor-neutrality), never in the canonical file.
- `parent` must resolve to an existing ticket file (or `n/a` for an epic).

### Body skeleton

```markdown
# <title>

## At a glance            # MANDATORY 2-4 lines, all audiences: outcome · scope · done-when

## [B] Business           # value, who benefits, why now, success indicator
## [T] Technical          # systems, interfaces, constraints, NFRs
## [A] Agent directives   # self-contained scope, explicit Do / Do not, assumption policy

## Acceptance criteria    # AC-1..AC-N, audience-tagged; Gherkin or measurable + Verify
## Definition of Done / Verification  # one checkbox per AC: - [ ] AC-1 (Verify: <cmd>) — <commit-sha>
## Non-goals              # explicit out-of-scope (prevents AI scope creep)
## Dependencies / blocks  # ticket ids and reasons
## Open questions         # each tagged [needs:business|technical|decision]
```

## Acceptance criteria (hybrid, audience-tagged, id'd)

Every criterion is named `AC-N` and carries an audience tag (`[B]`, `[T]`,
`[A]`, or a combination). The format depends on the kind of criterion:

- **Behavioural → Gherkin.** One `Given / When / Then` scenario per `AC-N`. Keep
  the `Given` free of implementation detail a business reader cannot parse; push
  implementation detail into the `[T]` section and reference it.
- **Non-functional (perf, security, availability, reliability) → measurable
  bullet + mandatory `Verify:` command.** Shape:
  `<measurable statement with a number>. Verify: <single command>`. The `Verify:`
  clause is mandatory: it is what makes the AC AI-checkable and reviewer-checkable
  with one paste. **No `Verify:` command ⇒ the AC is not measurable ⇒ rewrite it.**
  Tag a non-functional AC `[NFR]` (in addition to its audience tag). `validate`
  **enforces** the split lightly: an `[NFR]`-tagged AC **must** carry a non-empty
  `Verify:` command, and any AC with a `Verify:` line must supply a real command
  (an empty `Verify:` fails). Behavioural ACs carry the Gherkin
  `Given / When / Then`.

Required categories for any story or subtask:

- At least one **happy-path** behavioural AC.
- At least one **edge / error / offline** AC — or an explicit `n/a (reason)`.
- **NFR ACs are required** where the item touches perf, security, or
  availability, and are **forbidden from being implied** — write them as
  measurable bullets with `Verify:`.

Audience tags let a reviewer spot a story with only `[T]` ACs (a sign the
business value was never stated) or a story with no `[A]` AC (a sign it is not
actually AI-ready).

Example (lifted shape — see the templates for full instances):

```markdown
## Acceptance criteria
- AC-1 [A][T] Given <initial state>, When <action>, Then <observable result>.
- AC-2 [A][T] Given <error/edge state>, When <failure action>, Then <observable fallback>.
- AC-3 [T] Measurable: <statement with a number>. Verify: `<single command>`.
```

## No-assumption gap-scan (tool-enforced)

Before an agent claims any ticket it MUST run the gap-scan. `validate` runs
**every** check and **reports all errors** (it does not stop at the first one),
so a single run shows the whole gap list. The checks it enforces:

1. **Frontmatter present and parseable;** `validate` exits 0 only when all of the
   below hold.
2. **Required fields non-empty** (`id`, `type`, `title`, `status`, `parent`);
   `parent` is non-empty or `n/a` (an epic must be `n/a`); every `dod` entry
   references an existing `AC-N` id.
3. **Full canonical schema present and populated-or-`n/a`:** `assignee`,
   `priority`, `labels`, `worktree`, `mirror-owned`. `canonical_source` is
   **required and populated** for a story/subtask (present-or-`n/a` for an epic).
4. **Enums valid** (`type`, `status`, and `priority` when set).
5. **`files` / `apis` / `arch` each populated or explicitly `n/a`.**
6. **No unreplaced `<...>` placeholder** remains in any required field, in the
   `At a glance` / `[B]` / `[T]` sections, or in any acceptance criterion — a
   slot may instead be an explicit `n/a (reason)`. (This is what makes a
   half-filled copy of a template fail until it is actually filled in.)
7. **`At a glance`, `[B] Business`, `[T] Technical` sections non-empty**
   (`n/a (reason)` accepted — typically a subtask's `[B]`).
8. **`[A] Agent directives` non-empty** with at least one `Do not` constraint.
9. **Every AC has an audience tag** and is either a Gherkin scenario or a
   measurable bullet with a **non-empty** `Verify:` command; an `[NFR]`-tagged AC
   **must** carry a `Verify:` command.
10. **At least one happy-path (non-edge) AC** AND **at least one edge / error /
    offline AC** (or an explicit `n/a (reason)`).

Any failure → the agent returns `BLOCKED: <failing check>` referencing the check,
or opens an `Open questions` entry tagged `[needs:business|technical|decision]`.
**It never proceeds by guessing.**

Enforcement is in the tool, not just the doc:

- The **`claim` command RUNS the gap-scan and refuses to set
  `status: in-progress` on failure** (`bin/claim.js`; on a failed scan it prints
  `BLOCKED:` and exits non-zero without writing the file). A template alone
  cannot guarantee the agent stops; running the scan as part of `claim` does.
  This is the single highest-leverage rule for AI output quality.
- **Parent resolution** is only cross-checked when `validate` can see the sibling
  tickets, i.e. in directory mode: run
  `validate --strict --dir <tickets-dir>` (or `--strict <glob>`) for the
  whole-tree gap-scan that resolves every `parent:` against the other files.
  Single-file mode (`validate <ticket.md>`) checks one file in isolation and
  treats any non-empty, non-`n/a` `parent` as a syntactic reference (it cannot
  confirm the parent file exists). Use `--strict --dir` for the readiness gate
  over a backlog.

`bin/validate.js` and `bin/claim.js` are dependency-free and run on any modern
Node (`node bin/validate.js <ticket>`, `node bin/claim.js --assignee <who>
<ticket>`).

## Definition of Done = AC-id checklist

DoD is a checklist of **AC ids**, never prose, so it is mechanically verifiable.
The `dod` frontmatter field lists the AC ids that must pass. Per ticket type:

- **Epic DoD:** all child stories are `done`; all epic ACs pass their `Verify:`;
  non-goals respected (no scope-creep commits in the diff).
- **Story DoD:** all ACs pass `Verify:`; `validate` exits 0; the claim is
  released (`status: review`); linked subtasks are `done`.
- **Subtask DoD:** all ACs pass `Verify:`; `validate` exits 0; tests are green on
  the integration branch; every `dod` checkbox is ticked with a commit ref.

### The `## Definition of Done / Verification` checklist (recordable completion)

Beyond the `dod` frontmatter ids, every ticket body carries a
`## Definition of Done / Verification` section: one checkbox per AC, each naming
its `Verify:` command and the commit that proved it, e.g.

```markdown
## Definition of Done / Verification
- [ ] AC-1 (Verify: <cmd>) — <commit-sha>
- [ ] AC-2 (Verify: <cmd>) — <commit-sha>
```

Ticking a box with its commit sha is how "this AC passed, here is the proof" is
recorded in the canonical file — the boxes are filled as the work lands, never
up front. All three shipped templates include this section pre-wired to their
ACs; copy it and fill `<cmd>`/`<commit-sha>` as each AC verifies.

## Quality and decomposition

- **INVEST governs stories.** Independent (so they are parallel-safe),
  Negotiable, Valuable, Estimable, Small (so a story fits an agent's context),
  Testable (clear assertions — the ACs).
- **Stories are vertical end-to-end slices; subtasks are technical units.** A
  **story** is split from an epic as a *vertical*, end-to-end slice that delivers
  one observable, independently valuable behaviour (INVEST). A **subtask** is a
  *technical unit* of one story — it is **not** independently end-to-end valuable
  (its parent story is); it exists to make execution and review tractable. Split
  a story into subtasks with **disjoint `files` sets**. Disjoint `files` sets are
  what make parallel implementation safe by construction: two subtasks that never
  touch the same file can be built concurrently with zero merge conflict. The
  `files` field is the boundary; an isolation layer (e.g. a per-subtask worktree)
  enforces it.
- **Readiness lint (`validate`)** rejects vague tickets — anything that only says
  "improve", "support", "handle", or "integrate" with no observable criteria —
  and AI-unready tickets (no `[A]` directives, no `Verify:` on NFR ACs, blank
  required slots). Rewrite, do not mark such a ticket `ready`.

Decomposition discipline:

- One **epic** per coherent business outcome — never one epic per technical layer.
- One **story** per independently valuable, user-visible behaviour — a vertical,
  end-to-end slice (INVEST).
- **Subtasks** are technical units of one story, with disjoint file scope; they
  are not independently end-to-end valuable but make execution and review
  tractable.
- Every AI-assigned ticket carries `canonical_source` (path + revision), `files`,
  `apis`/`arch` (or `n/a`), test expectations, and the assumption policy.

## FINAL.md → tracker mapping

`FINAL.md` is canonical for **design**; tickets are canonical for **work state**.
Two different canonical artifacts, no overlap.

```text
idea 00-prompt problem + non-goals      ->  epic [B] Business + Non-goals
FINAL.md design / value streams         ->  stories (one per observable behaviour)
FINAL.md observable acceptance criteria ->  story acceptance criteria
FINAL.md context / orientation          ->  [T] Technical + AI references (files/apis/arch)
FINAL.md known risks / de-risking       ->  story risks, ask-before rules, NFR ACs
IMPLEMENTATION.md plan / checklist       ->  subtasks
review-consensus deferred follow-ups     ->  follow-up tickets
FINAL.md open questions                  ->  Open questions [needs:...] (promoted to tickets only when a decision unblocks work)
```

Minimum created set for one idea:

```text
1 epic     : the idea's outcome
N stories  : one per observable behaviour / acceptance-criterion cluster
M subtasks : one per implementation boundary, migration, test suite, or docs task
```

## Generic field schema → tracker mapping (with graceful degradation)

The mirror contract — the minimum-viable fields **every** tracker supports — is:

```text
id, type, title, status, assignee, parent, labels, priority
```

Extended fields (`files`, `apis`, `arch`, `nfr`, `dod`, `worktree`,
`canonical_source`) live in the file and are mirrored **only where the tracker
allows**. Map the neutral schema to the target tracker at the edge — for example:

```text
neutral          ->  typical tracker concept
-----------------    ----------------------------------
type             ->  issue type (epic / story / sub-task / task)
status           ->  workflow status / state column
assignee         ->  assignee / owner
parent           ->  epic link / parent issue / parent card
labels           ->  labels / components / tags
priority         ->  priority field
title/body       ->  summary + description (audience sections concatenated)
acceptance crit. ->  description block or a checklist field
dod              ->  checklist (project AC titles, not opaque ids, for tracker UIs)
files/apis/arch  ->  custom field if supported, else folded into description
```

Graceful degradation: if the tracker has no field for `files`/`apis`/`worktree`,
those are appended to the description (or dropped from the mirror) — but they
**stay in the canonical file**. A degraded mirror is acceptable; a corrupted
file is not.

## Vendor-neutrality and the opt-in connector

- The core skill **authors text and emits a payload** (the markdown file plus a
  neutral JSON/YAML representation of the frontmatter). It defines payloads and
  decision rules first.
- Actual create/update against a live tracker (MCP, REST, CLI) is an **opt-in
  connector add-on**. **No authentication or credentials live in the core
  skill** — the connector is a separate, separately-enabled component.
- A per-tracker **projection plugin** MAY add native fields (e.g. sprint or cycle
  fields) to the *mirror* without polluting the canonical file. Tracker-specific
  features stay below the neutral schema, never inside it.

## Relationship to Parley Deck core

This skill stays thin where Parley Deck core is thin. The only seam the core
protocol needs is a thin note (a separate meta-protocol change, not this skill):

> External trackers are mirrors. A tracker ticket cannot override `FINAL.md`.
> Requirement changes discovered in a tracker return through a Parley round, an
> inbox escalation, or a new idea.

This skill carries all the ticketing mechanics: the three-audience template, the
field schema, the hybrid AC rules, the gap-scan, the DoD model, the FINAL.md
mapping, the tracker field mapping, and the connector boundary.

## Pitfalls

- **Tracker becomes a second source of truth.** If comments or status flips drift
  back into the file un-gated, the canonical model is broken. Keep `--pull`
  restricted to `mirror-owned` fields; surface any other divergence as a conflict.
- **Three-audience bloat → everyone skim-reads.** Mitigate with the mandatory
  `At a glance` block that surfaces outcome-altering constraints, and audience
  tags for filtered views.
- **AI fills gaps anyway.** Only enforcement stops this — run the gap-scan inside
  `claim` and refuse `in-progress` on failure.
- **Gherkin-for-NFRs theatre.** Forcing perf/security into Gherkin to feel
  "complete" yields unmeasurable criteria. Keep NFRs as measurable bullets with a
  `Verify:` command; a Gherkin `Then` with no machine-checkable assertion is a
  lint warning.
- **Over-fitting to implementation hints.** Distinguish "allowed / likely files"
  from "must modify exactly these files" in `[A]`, so a ticket does not suppress
  a better design.
- **Lowest-common-denominator genericity.** The right generic layer is a stable
  neutral schema with per-tracker projections below it — not the absence of
  structure.
