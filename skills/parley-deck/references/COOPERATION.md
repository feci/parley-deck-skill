# COOPERATION.md — Multi-Agent Cooperation Protocol

**Workspace:** `<workspace-name>`
**Parley deck:** `./parley-deck/`
**Transport:** `<transport-choice>` (pick one of local-dir | github-pr | gitlab-mr at deck bootstrap — see §0)
**Created:** `<YYYY-MM-DD>` (set at deck bootstrap)
**Status:** Living document — any agent may propose changes via a dedicated idea (see §7).

---

## Quickstart — start here (developers & first-timers)

**New here? You do not need to read all of this.** Read this Quickstart, §4.0 (track
selection), and §4 (the phases). Everything else is reference you open only when a task needs it.

**Start an idea in 5 minutes:**

1. Create `ideas/<slug>/00-prompt.md`; set `track:` (see §4.0 — default `standard`).
2. Each participant writes `round-01/<agent-id>.md` **independently** — write yours before reading the others'.
3. Follow your track (§4.0): `fast` = round-1 + a collapsed `FINAL.md` signoff + one refutation-default reviewer (≤1 fix-up cycle); `standard` = the normal flow with 2 reviewers; `deliberation` = the full lifecycle for risky or protocol work.

**Trivial, reversible work — a typo, a doc line, a one-file rename, a dependency bump with
green tests — does NOT need Parley at all.** Just do it; don't open an idea and don't claim
Parley verification. Parley is for work where independent verification earns its cost.

**Who are you? → read this:**

| If you are…               | Read                                          | You do                                                    |
| ------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| Developer / implementer   | Quickstart, §4.0, §4 phases, §6               | pick the track, write the plan/implementation, run checks |
| Reviewer                  | §4 Phase 6–8 (refutation-default)             | try to break the acceptance criteria, file findings       |
| PM / designer             | Quickstart, §1                                | state the outcome, constraints, non-goals, risk tolerance |
| Facilitator               | Quickstart, §4, §5, §9, your §11 transport    | open ideas, drive consensus, keep the roster              |

**Core vs reference (progressive disclosure).** The **core** every participant needs is
§0–§8. The rest are **reference appendices** — skip them until a task needs them: **§9**
session-start checklist, **§11** transport mechanics, **§12** pipelines & action stages,
**§13** retrospective optimization, **§14** automated outer loop.

---

## 0. Choose the transport

At project bootstrap, pick **exactly one** of three transports. The choice determines how phase transitions, cross-review, and signoffs are mechanically performed. The _what_ (artifacts, frontmatter, signoff rules) is identical across all three; only the _how_ differs.

| Transport                    | When to choose                                               | Day-to-day surface                |
| ---------------------------- | ------------------------------------------------------------ | --------------------------------- |
| **A. Local directory**       | Filesystem-only. No git host required. Simplest setup.       | Direct commits to `parley-deck/`. |
| **B. GitHub Pull Requests**  | Project already on GitHub. Want native review UI for humans. | One long-lived PR per idea.       |
| **C. GitLab Merge Requests** | Project on GitLab. Want native review UI for humans.         | One long-lived MR per idea.       |

Once chosen, replace the `Transport:` line in the header with the active value. The rest of the document is read with that choice in mind. The detailed mechanics for each transport live in §11.

**The choice is sticky for the project.** Switching transports later is possible but requires a meta-protocol-change idea (§7), because in-flight ideas span multiple PRs/branches.

**Deck bootstrap (one-time).** When `parley-deck/` is first created in a project (`parley init`), in addition to the transport the facilitator MUST confirm the **active roster, each agent's model, and each agent's reasoning/effort level** with the user as a required one-time setup step, and record the persistent per-agent choices in the deck's roster authority `parley-deck/agents.toml` via `parley roster set` (then regenerate the §2 view with `parley roster render`). The **default reasoning/effort is the strongest (highest) level the agent supports**; fall back to `cli-default` only when the level cannot be discovered. This fires **only at deck creation** — not per idea, not per later session; an already-bootstrapped deck reuses the saved selection (and the user may re-run the confirmation on request). The protocol stays **model- and reasoning-agnostic** — it mandates the confirmation and a highest-by-default, not any specific model or level. Per-agent defaults are seeded from the **user-global central config `~/.parley/agents.toml`** (lists each agent's model + reasoning), which `parley init` creates and any deck overrides per-project via `parley-deck/agents.toml`. Its `[defaults]` block also carries project-wide policy defaults — `ping_tier` (§9.0 liveness ping), `preferred_transport` (used by `parley init`), `roster_change_policy`, and `speed`/`timeouts`. See the skill for the interactive list-roster → confirm → list-models-and-effort → pick flow. (The §9.0 readiness check only pings agent *liveness* per idea; it does not re-select models or effort.)

**Universal invariants** that hold for every transport:

- The `parley-deck/` directory layout (§3) is identical.
- Files are **canonical** (the audit trail). PR/MR conversations are _ergonomic_ — easier for humans to read — but never the source of truth.
- Signoff blocks in `consensus.md` are canonical. In B and C they are mirrored by a native PR/MR review; if they diverge, the file wins.
- Multi-agent execution is mandatory (§1). A transport MAY change how agents publish artifacts, but it MUST NOT collapse Parley Deck into a solo facilitator process.
- English-only rule (§6.6) applies to every file _and_ every PR/MR description, comment, review summary, and commit message.

## 1. Scope and purpose

This document defines how multiple AI agents collaborate on a shared idea, design, or specification. The goal is:

1. **Parallelism without collisions** — every agent works in its own file; no one edits another agent's file.
2. **Explicit rounds** — disagreements surface early and are resolved in the open.
3. **Consensus before execution** — no code or plan is considered "final" until every active participant signs off.
4. **Auditable trail** — every argument, change of mind, and decision lives in a file that survives context compaction.

The protocol is designed to scale to **any number of agents (≥ 2)** and is **agent-implementation agnostic** — it does not assume any particular model, vendor, or runtime. It is also **transport-agnostic** in content; the three transports in §0 are surface-level variations on the same protocol.

### Non-solo execution requirement

A request to use `parley`, `parley-deck`, or this protocol ALWAYS means a real multi-agent workflow with other available models or agents. Parley Deck is never satisfied by one agent working alone as a solo checklist, solo review, or solo process framework.

If at least one other participant or CLI agent is available, the facilitator MUST invoke other agents. Each participant MUST create its own canonical artifact. The facilitator MUST NOT claim "Parley Deck was used" unless other participant artifacts exist, or the protocol explicitly records why multi-agent execution was impossible.

If no other agent can be invoked because of auth, CLI, timeout, permissions, or tooling failure, the facilitator MUST stop before merge, finalization, or claiming completion and report the blocker to the user. Work may continue only if the user explicitly authorizes a solo exception. That exception MUST be recorded in `inbox/` or the active idea's protocol notes before work continues.

### Participant sizing and lenses

Use enough participants to get genuinely different analysis without creating coordination drag:

- Default to 2–4 active participants for normal ideas.
- Use per-idea roles or lenses when distinct perspectives materially improve coverage.
- Add more participants only for cleanly separable modules, review scopes, or competing hypotheses.
- Avoid multi-agent overhead for sequential same-file work or tightly coupled edits.

Per-idea role/lens metadata is advisory only. It does not change quorum, signoff weight, artifact ownership, drafter eligibility, or the non-solo requirement.

### Internal helpers

An agent MAY use internal helper mechanisms such as subagents, retrieval, tools, scratchpads, or additional model calls to produce its own canonical artifact. These helpers are not Parley Deck participants, do not count toward the non-solo requirement, do not sign off, and do not own protocol files. Participant-spawned helpers MUST NOT create canonical round, review, consensus, or signoff files under a separate helper identity unless that identity is explicitly listed in the idea's `participants:` list. The named participant remains fully accountable for its own file and signoff.

## 2. Active agents (roster)

**The roster's authority is `parley-deck/agents.toml`, not this table.** Membership and each
agent's adapter, model, effort and speed live in `[roster.<id>]` blocks there; the table below is a
generated, human-readable **view** and is NOT authoritative. Do not hand-edit it to add, remove or
retire an agent — the edit will not take effect and will be overwritten on the next render.

This changed because hand-maintenance failed at scale: across 40 decks the table had drifted into
**nine different rosters**, 17 decks carried no roster at all, and 17 still named an agent retired
months earlier. A table that every project edits by hand and no tool validates cannot stay correct.

Change the roster with:

```bash
parley roster show                                   # the canonical answer, one fixed table
parley roster set <agent> --scope deck|machine …     # change one member (preview by default)
parley roster sync                                   # inherit the machine roster (machine -> deck)
```

`--scope deck` writes the **committed** `parley-deck/agents.toml`; `--scope machine` writes
`~/.parley/agents.toml` and every deck inherits it. Retiring an agent sets `active = false` — rows
are **marked, never deleted**, so a past idea's participant list stays interpretable.

A deck that predates this change and still has only a hand-written table keeps working: it is read
as a legacy roster and every row reports `legacy-roster`; that table remains the deck's
membership until it is migrated. `roster sync` does NOT migrate it — it only rebases an
existing deck roster onto the machine values. Migrate with `parley roster migrate` (fleet,
attended, backed up) or `parley roster set <id> --scope deck --adapter <family> --yes
--confirm-breaking` per member, then `parley roster render` to regenerate this view.

The generated view:

| Agent ID       | Workspace dir                       | Role          |
| -------------- | ----------------------------------- | ------------- |

**Local launch config (optional, gitignored):** Individual machines may keep
`parley-deck/meta/headless-agents.local.json` with CLI launch settings for the
rostered agents. This file is machine-local, not canonical project state, and
does not change quorum, ownership, signoff weight, or transport rules.

**Agent ID conventions:** short, stable, kebab-case, unique within the project. Suffix with a number if you may run multiple instances of the same family (e.g. `<family>-1`, `<family>-2`). Once chosen, an agent ID does not change for the lifetime of the project.

In transports B and C, each agent should also have a corresponding host account (GitHub user / GitLab user) so that PR/MR reviews and approvals carry their identity. Map the agent ID to the host handle in this table:

| Agent ID       | Host handle    |
| -------------- | -------------- |

When a new agent joins:

- Add a row to the roster (via a short `meta/roster-update_<date>.md` idea — see §7).
- Declare the agent's workdir, write permissions, and host handle.
- From the next idea onward, the new agent is part of quorum (§5).

When an agent leaves the project, mark its row as inactive (do not delete it) so historical references remain resolvable.

## 3. Directory layout

    parley-deck/
    ├── COOPERATION.md               ← this document
    ├── ideas/                       ← one subdir per idea/design/spec in progress
    │   └── <idea-slug>/
    │       ├── 00-prompt.md         ← original problem + participants + deadline
    │       ├── round-01/
    │       │   ├── <agent-id-1>.md
    │       │   ├── <agent-id-2>.md
    │       │   └── ...
    │       ├── round-02/
    │       │   └── ...
    │       ├── consensus.md         ← created once everyone is ready to sign off
    │       ├── FINAL.md             ← static, self-contained authoritative artifact (plan / spec / ADR)
    │       ├── IMPLEMENTATION.md    ← living execution doc (Progress / Decision Log / Surprises / Outcomes)
    │       └── review/              ← Phase 6–8 code review lifecycle
    │           ├── round-01/
    │           │   ├── <agent-id-1>.md
    │           │   ├── <agent-id-2>.md
    │           │   └── ...
    │           ├── round-02/
    │           │   └── ...
    │           └── consensus.md     ← review-cycle consensus (same signoff rules as §3 consensus)
    ├── inbox/                       ← direct 1-to-1 or 1-to-N notes not tied to an idea
    │   └── <from>-to-<to>_<topic>.md
    └── meta/                        ← roster updates, protocol changes, retrospectives

**Idea slug rules:** `kebab-case`, short, stable. Example: `execution-worker-retry-policy`.

**Repository scope (B and C only):** `parley-deck/` lives in a git repo. It may sit at the root of a dedicated coordination repo, or as a top-level directory inside the project's main code repo. The implementation phase typically operates on a _code repo_, which may equal the parley-deck repo (monorepo case) or be a different repo. When they differ, the **design PR/MR lives in the parley-deck repo** and the **implementation PR/MR lives in the code repo**, cross-referencing each other by URL.

## 4. Protocol — phases of an idea

This section describes the **conceptual** flow and the **artifacts** produced. The transport-specific _mechanics_ (commits vs PRs, comments vs files, merging vs status flags) are in §11.

### 4.0 — Track selection (conditional rigor)

Not every change needs the full lifecycle. Each idea runs on one of three **tracks**, set as
`track: fast | standard | deliberation` in `00-prompt.md` (default `standard`). The track is a
**mechanical routing decision** from the classifier below — it scales ceremony to risk. Round
content (analysis, review, refutation) is always model-driven; only the routing is objective.

**Classifier — check the `deliberation` triggers first; first match wins:**

| → `deliberation` if ANY                                                                                                                                                                                                                                              | → `fast` if ALL                                                                                              | → `standard` (default)                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| protocol change (§7); security / auth / secrets / payments / privacy / production infra; data migration / irreversible / destructive op; `strict_gate: true`; `auto_implement`; pipeline or action block (§12); public-API or persisted-schema break; > ~15 files / ~1000 LOC | fully reversible; ≤ ~3–5 files / ~300 LOC; no security or data surface; mechanically verifiable (lint / type / test) | everything that is neither forced to `deliberation` nor fully `fast` |

**Classifier ordering is normative and fail-safe:** evaluate all `deliberation` triggers
first; if none fire, evaluate the `fast` conditions; otherwise `standard`. On any doubt or
boundary case — the 6–14-file band, the `~300`–`~1000` LOC gap, or an unconfirmed-but-plausible
security / privacy / production / data-migration / pipeline / API-break / schema-break
trigger — **fail closed to the stricter track**: `standard` over `fast`, and `deliberation`
over `standard`, until the risk is disproven.

**Per-track behavior** (the invariants below hold on every track):

| Aspect                        | `fast`                                     | `standard` (default)                        | `deliberation`                          |
| ----------------------------- | ------------------------------------------ | ------------------------------------------- | --------------------------------------- |
| §9.0 readiness ping           | skipped                                     | full                                        | full                                    |
| Cross-review rounds (Phase 2) | skipped                                     | capped at 2, then escalate/upgrade          | unbounded                               |
| Consensus + FINAL (Phase 3–4) | collapsed: one `FINAL.md` with embedded signoffs | separate, drafted simultaneously        | separate                                |
| Reviewers (Phase 6)           | 1 (model-diverse)                           | 2                                           | all non-implementers                    |
| Review consensus (Phase 7)    | the one reviewer's ✅ = consensus            | reviewers who reviewed sign off             | all participants sign off               |
| Fix-up (Phase 8)              | cap 1 cycle; fix-only verification ok       | cap 2 cycles; fix-only verify for narrow fixes | unbounded; `strict_gate` available   |
| Timeout per agent             | ~5 min                                      | ~15 min                                     | ~30 min                                 |
| Auto-advance                  | full (pause only for the one signoff)       | auto-advance; human gate at FINAL→implementation | human gate at each transition      |

**This table is the single authoritative per-track gate. It OVERRIDES the full-lifecycle
defaults stated in the rest of §4 and in §5 (quorum), §9.0 (readiness), and §11 (transport).**
Where a later phase says "every participant," "all reviewers," or "consensus is reached when
every active participant signs off," read it through this table for `fast`/`standard`;
`deliberation` uses the rule exactly as written elsewhere.

**Invariants on every track (never dropped for speed):** at least one independent
non-facilitator artifact (non-solo, §1); refutation-default review — the reviewer *count*
shrinks by track, the refutation discipline never does; round-1 independence discipline
(Phase 1; an unenforced cooperative convention unless kickoff selects §11.B sub-branches or
per-agent isolated staging);
append-only ✅/🟡/❌ signoffs; files-canonical audit trail; the §14 human brake; English-only;
no-secrets. (Rules tagged `LE-N` below are the loop-engineering rules; the tag is only a
reference id — the rule text is what binds.)

**Binding, challenge & mid-idea upgrade.** The track is binding once Phase 0 closes, but any
participant may **force-upgrade** to a stricter track — an `inbox/` note before round-1 closes,
or a reviewer filing a MAJOR/CRITICAL finding that cites a trigger. Down-tiering below the
classifier floor requires a recorded user OK. If implementation later reveals a higher-risk
surface (e.g. it now touches auth), any participant force-upgrades and the idea **re-runs the
current phase** under the stricter track's rules. Upgrading from `fast` also reinstates any
phase `fast` skipped (cross-review, a separate consensus/FINAL step) for the remainder of the
idea. With only two participants, `standard`'s "2 reviewers" degrades to 1 (the trigger
accounts for roster size, not just risk).

### 4.0.1 — Loop-engineering rules (LE-N), in plain English

The `LE-N` tags cited inline in the phases below are shorthand for these rules (from the
loop-engineering work). The tag is only a reference id; the rule text is what binds.

- **LE-1 — Refutation-default review.** A reviewer assumes the implementation is wrong and records concrete attempts to break each acceptance criterion; a "no findings" review counts only with refutation attempts shown.
- **LE-2 — Driver auto-advance.** A deterministic driver may advance mechanical phase transitions; it never authors participant content or decides contested issues.
- **LE-3 — Model diversity.** A reviewer sharing the implementer's model is likelier to rubber-stamp; `require_model_diversity: true` turns an all-shared-model reviewer set into a hard gate.
- **LE-4 — Verification command.** `checks:` in `00-prompt.md` is the build/test gate the driver runs (as `sh -c`) at Phase 5/8. `checks:` accepts either a scalar command (today's behavior) or an optional named list of `{name, command}` criteria (each expects exit 0); the list form activates the **completion contract** — the driver runs every criterion and writes the per-criterion result table into the `## Validation evidence` section of `IMPLEMENTATION.md` each cycle (overwriting the prior entry; git history preserves earlier cycles), with output secret-scrubbed and truncated.
- **LE-5 — Loop budgets.** Driver runs are bounded by max steps / wall-clock / cost.
- **LE-7 / LE-11 — Close-decision integrity.** Before an auto-driven close, a goal-done check verifies FINAL's observable acceptance criteria; reservations or too-few reviewers escalate rather than close.
- **LE-10 — Candidate remediation.** Remediation ideas may start as `status: candidate`.

### Phase 0 — Kickoff

The agent (or user) who starts the idea creates `ideas/<slug>/00-prompt.md`:

    ---
    idea: <slug>
    author: <agent-id or "user">
    created: YYYY-MM-DD
    track: fast | standard | deliberation   # §4.0; default standard; deliberation is forced by the classifier triggers
    participants: [<agent-id-1>, <agent-id-2>, ...]
    roles:                         # optional; advisory per-idea lenses only
      <agent-id-1>: <lens-or-role>
      <agent-id-2>: <lens-or-role>
    deadline: YYYY-MM-DD        # optional
    strict_gate: true|false     # optional; exact case-insensitive "true" opts into
                                # the strict review gate (Phase 8); absent or any
                                # other value keeps the default close rule
    require_model_diversity: true|false  # optional; LE-3 — escalate (not just warn) if
                                # every reviewer shares the implementer's model
    checks: <command>           # optional; LE-4 — verification command the driver runs
                                # (sh -c) as the Phase 5/8 build-test gate; a code-writing
                                # (auto_implement) idea with no checks and no go.mod fails closed
    status: round-01            # round-N | consensus | final | abandoned
    ---

    ## Problem / idea
    ## Constraints
    ## Non-goals

After creating `00-prompt.md`, the author creates an empty `round-01/` dir. The idea is now "open". _(Transport-specific: see §11 for how this is published — a commit, a draft PR, a draft MR.)_

The `participants:` list MUST include at least one non-facilitator participant when another agent can be invoked. Optional participant selection MUST NOT silently collapse to only the facilitator. If discovery finds no invokable non-facilitator participant, the author MUST record the blocker and obtain an explicit user-authorized solo exception before continuing.

Keep `participants:` as a list of agent IDs. If the idea benefits from distinct perspectives, add an optional `roles:` map keyed by participant ID. Roles are free-form advisory lenses for this idea only; they do not change quorum, signoff weight, artifact ownership, drafter eligibility, or roster membership.

### Phase 1 — Round 1 (independent analysis)

> Verification verdicts, their provenance, and verdict conflicts follow **§15**.

Every listed participant creates `ideas/<slug>/round-01/<agent-id>.md`:

    ---
    agent: <agent-id>
    idea: <slug>
    round: 1
    date: YYYY-MM-DD
    ---

    ## Summary            (2–4 sentences)
    ## Proposed approach  (prose / code sketches / diagrams)
    ## Concerns / open questions
    ## Risks

**Rule:** Round 1 is written _without reading other agents' round-1 files_ — the point is independent analyses on the table before anchoring. Write your file, save (or commit/push), _then_ read the others. The facilitator MUST NOT substitute its own solo analysis for missing participant files. _(Transport B/C may use sub-branches for stronger isolation — see §11.)_

### Phase 2 — Cross-review rounds (2, 3, …)

> Verification verdicts, their provenance, and verdict conflicts follow **§15**.

Once all participants submitted round N, any agent may open round N+1 by creating `round-0(N+1)/<agent-id>.md`:

    ---
    agent: <agent-id>
    idea: <slug>
    round: 2
    date: YYYY-MM-DD
    responding-to: [<agent-id-1>/round-01, <agent-id-2>/round-01, ...]
    ---

    ## Position changes since round 1
    ## Responses to others
    ### @<agent-id-1> — round-01
    ### @<agent-id-2> — round-01
    ## New concerns / questions
    ## Current proposal   (concise restatement of your updated proposal)

**Rules:**

- **Never edit another agent's file.** React in your own file in the next round.
- **Address every other active agent explicitly.** Silence = implicit agreement.
- **Disagreement requires a counter-proposal.** "I don't like X" alone is insufficient; propose Y.
- Continue until nobody has new substantive objections.

### Phase 3 — Consensus

> Verification verdicts, their provenance, and verdict conflicts follow **§15**. At this phase
> §15 also carries two drafter-facing duties: §15.5's `## Drafter position changes` and §15.6's
> close-conditions.

When discussion has converged, an agent creates `ideas/<slug>/consensus.md`:

    ---
    idea: <slug>
    drafted-by: <agent-id>
    date: YYYY-MM-DD
    ---

    ## Agreed decisions
    ## Agreed trade-offs
    ## Open items deferred to implementation
    ## Comparison & blind spots
    <!-- Advisory (not a gate): contradictions not smoothed into vague trade-offs;
         partial coverage (what only one participant covered); unique insights worth
         keeping; and blind spots — what did NO participant address? -->

    ## Signoffs
    <!-- Each agent APPENDS their signoff block. Do NOT edit others' blocks. -->

Every listed participant then **appends** their own signoff block:

    ### Signoff: <agent-id> — YYYY-MM-DD
    Status: ✅ ACCEPT           (or 🟡 ACCEPT-WITH-RESERVATIONS, or ❌ BLOCK)
    Notes: <required if 🟡 or ❌>
    Counter-proposal (required if ❌): <link or inline>

**Consensus rules:**

- ✅ from _every_ active participant = consensus reached → Phase 4, subject to the close-conditions
  already binding under §15.3 (an unresolved `DISPUTED` claim a decision depends on) and §15.6
  (the correlated-agreement duties). Signoffs do not waive them; this line adds no new condition.
- Any ❌ → new round; the blocker's counter-proposal is the starting point.
- 🟡 is acceptable _if_ the reservation is logged as "open items deferred to implementation" and no one upgrades it to ❌.
- Agent silent past deadline is treated as ✅ — but only if they were pinged via `inbox/` first.
- The `## Comparison & blind spots` section is an **advisory drafting discipline**, not a gate: append-only signoffs remain the only gate, any participant may block if the comparison is inaccurate, and raw round files are never hidden behind the summary.

_(Transport B/C: signoffs in `consensus.md` are mirrored by a native PR/MR review; see §11. The file remains canonical.)_

### Phase 4 — Finalization

The **idea's initiator** — the agent listed as `author:` in `00-prompt.md` — is responsible for drafting `ideas/<slug>/FINAL.md` once consensus is reached. The initiator owns the idea end-to-end: they open it, steward it through the rounds, and produce the authoritative artifact.

If `author: user` (i.e. the user kicked off the idea rather than an agent), the default drafter is the **first agent to have submitted a round-01 file**. Any participant may volunteer to draft instead by posting a note in `inbox/` (or the design PR/MR conversation) before the consensus signoff completes; the volunteer's signoff block must state `Drafter: yes` to claim the role. If no one volunteers, the fallback rule applies.

The drafter writes:

    ---
    idea: <slug>
    status: final
    author: <agent-id>
    consensus-date: YYYY-MM-DD
    participants: [...]
    ---

    ## Final plan / specification
    ## Purpose / user-visible outcome
    ## Context & orientation
    ## Observable acceptance criteria
    ## Idempotence & recovery
    ## Known risks / de-risking
    ## References
    - Consensus: ./consensus.md
    - Rounds: ./round-01/, ./round-02/, …

`FINAL.md` is the **single source of truth**. If later invalidated, open a new idea (`<slug>-v2`) — do **not** edit the old FINAL. Update `00-prompt.md` `status: final` and optionally move the dir to `ideas/archived/<slug>/` after implementation.

The sections above the References are **written at design time and frozen** with the rest of `FINAL.md` — it is static; the *living* companion is `IMPLEMENTATION.md` (Phase 5). For complex, `auto_implement`, driver-managed, or pipeline ideas, `FINAL.md` plus `IMPLEMENTATION.md` MUST be self-contained enough that a fresh agent or the auto-drive driver can implement or resume **from them alone**, without session transcripts. **Observable acceptance criteria** state success as behavior a reviewer or the driver can check (e.g. "after X, Y is true"). For trivial or design-only ideas these added sections may be `N/A`.

**Idempotence & recovery** states what state matters, what is safe to rerun, and what needs a human gate; it is required for `auto_implement` / action / pipeline ideas, where the driver treats it as the recovery contract.

Before publishing `FINAL.md`, the drafter MUST verify that every active non-facilitator participant has created the expected canonical artifacts or that a recorded solo exception explains why multi-agent execution was impossible. A missing non-facilitator artifact is a blocker, not a reason to claim Parley Deck completed as a solo run.

**Closing the idea (transport-specific):** The drafter publishes `FINAL.md` and closes the idea on disk in a single transaction. In transport A this is a commit; in B/C it is a PR/MR merge that bundles the final commit. Either way, the closing transaction also picks up any uncommitted/unmerged contributions inside `ideas/<slug>/` so no deliberation history is orphaned. See §11 for the exact form.

### Phase 5 — Implementation

Once `FINAL.md` is published, the idea moves from design to build. **The default implementer is the FINAL drafter** (same agent as Phase 4). Any other participant may volunteer to implement instead by posting a claim in `inbox/<from>-to-all_<slug>_impl-claim.md` (or the appropriate transport surface) before work begins; if no one else claims within a reasonable window, the drafter proceeds.

The implementer:

- Creates a branch in the **target code repo** per that repo's branching convention (e.g. `feature/<slug>` off the integration branch).
- For multi-file changes or changes outside `parley-deck/`, opens or updates `IMPLEMENTATION.md` with a short implementation plan/checklist before making code changes. For risky plans, the implementer may use the active transport surface or `inbox/` for a brief feedback window before proceeding. Reviewers may block material divergence from that plan through the normal review process. This is not a new phase or artifact.
- Implements strictly to `FINAL.md`. Any unavoidable deviation is logged in `IMPLEMENTATION.md` — not silently absorbed into the code.
- On completion, finalizes `ideas/<slug>/IMPLEMENTATION.md`:

        ---
        idea: <slug>
        status: implemented        # implemented | fix-up-cycle-N | complete
        implementer: <agent-id>
        started: YYYY-MM-DD
        completed: YYYY-MM-DD
        branch: <repo-path>#<branch-name>
        head-commit: <sha or short sha>
        design-pr: <url or "n/a">           # B/C only
        implementation-pr: <url or "n/a">   # B/C only
        ---

        ## Summary of work
        (What was built. Which parts of FINAL.md this covers.)

        ## Implementation plan / checklist
        (Required before multi-file changes or changes outside `parley-deck/`; "N/A" is valid for trivial or design-only work.)

        - [ ] Files or areas to change:
        - [ ] Checks to run:
        - [ ] Review or risk notes:

        ## Deviations from FINAL.md
        (Any divergence, with rationale. "None" is a valid answer.)

        ## Notes for reviewers
        (Areas that need extra attention, known trade-offs, out-of-scope items.)

        ## Progress
        (Living checklist, updated at every stopping point; ISO timestamps
        `(YYYY-MM-DD HH:MMZ)`, partial steps as `(completed: X; remaining: Y)`.
        Required for complex / `auto_implement` / driver-managed / pipeline ideas;
        "N/A" for trivial or design-only work.)

        ## Decision Log
        (Decisions made *after* FINAL.md — Decision / Rationale / Date·Author.
        Deviations still go under `## Deviations from FINAL.md` above.)

        ## Surprises & Discoveries
        (Unexpected findings, with evidence — especially when they change choices.)

        ## Validation evidence
        (Which FINAL.md acceptance criteria were met, with the commands run and what
        they proved. When `checks:` is a list (LE-4 completion contract), the driver
        populates this section automatically each cycle; the implementer does not
        hand-write it.)

        ## Outcomes & Retrospective
        (At completion: achievements, gaps, lessons — framed to feed §13 `parley retro`.)

`IMPLEMENTATION.md` is the **living** companion to the static `FINAL.md`: kept current at every stopping point so a fresh agent or the auto-drive driver has task-level resume context. §12 supplies the low-level effects ledger and idempotency keys; these sections supply the orientation and recovery narrative. The living sections are required for complex / `auto_implement` / driver-managed / pipeline ideas and may be `N/A` for trivial or design-only work.

The implementer publishes `IMPLEMENTATION.md` (commit/PR/MR — see §11) and signals "open for review".

If the idea is design-only (no code artifact), Phase 5 may be reduced to a brief `IMPLEMENTATION.md` describing where the design output was applied. Phases 6–8 still apply unless the participants agree in `consensus.md` that review is not required.

### Phase 6 — Code review rounds

> Verification verdicts, their provenance, and verdict conflicts follow **§15**.

Once `IMPLEMENTATION.md` is published, every active participant **except the implementer** writes `ideas/<slug>/review/round-01/<agent-id>.md`:

    ---
    agent: <agent-id>
    idea: <slug>
    review-round: 1
    date: YYYY-MM-DD
    reviewed-commit: <sha>
    ---

    ## Summary            (1–3 sentences on overall health of the implementation)
    ## Refutation attempts (per FINAL.md criterion: what you tried to break and the result)
    ## Findings
    ### [CRITICAL] <short title>
    <what is wrong, why it blocks, concrete suggested fix>
    ### [MAJOR] <short title>
    ### [MINOR] <short title>
    ### [NIT] <short title>
    ## Open questions

**Severity tags** are fixed: `CRITICAL` (must fix before merge), `MAJOR` (should fix before merge), `MINOR` (nice to have), `NIT` (stylistic / optional). The implementer does not write a review-round file — they respond in Phase 7. Where `FINAL.md` states observable acceptance criteria, reviewers should check the implementation against them and may cite a criterion in a finding; this does **not** change the severity vocabulary — it only makes severity assignment less subjective.

**Refutation-default (LE-1).** Reviewers assume the implementation is wrong until they fail to break it: for each observable acceptance criterion, attempt a failing case or run the relevant check, and record those attempts under `## Refutation attempts`. A "no findings" review is credible only with refutation attempts recorded — the driver's review-artifact validation requires the section. **Model diversity (LE-3):** a checker sharing the implementer's model is likelier to rubber-stamp; under auto-drive the driver warns when every reviewer shares the implementer's model, and `require_model_diversity: true` makes it a hard gate.

If there is no invokable non-implementer reviewer, the implementation MUST NOT be merged or marked complete under Parley Deck. The implementer MUST report the blocker and continue only after either another reviewer is added or the user explicitly authorizes a recorded solo exception.

Rules for later review rounds mirror Phase 2: never edit another reviewer's file, respond in your own next-round file with `responding-to:` listing prior review files, address every other active reviewer explicitly.

_(Transport B/C: each review file is mirrored by a native PR review on the implementation PR/MR — see §11.)_

#### Review briefs and dispositions

Review briefs MUST NOT suppress findings. A facilitator, implementer, or prior
review consensus MAY describe known findings, rebuttals, accepted trade-offs,
sandbox artifacts, deferred follow-ups, and operator rulings as dispositions for
the reviewer to weigh openly. The brief MUST NOT say or imply "do not report",
"do not re-raise", "ignore", "only report above severity X", or otherwise narrow
what the reviewer may inspect or report.

When a brief includes a disposition, it SHOULD use this shape:

    - Finding/disposition: <short identifier or summary>
      Prior disposition: rebutted | accepted trade-off | deferred | dismissed | operator-ruling
      Rationale: <one or two lines>
      Authority: <review consensus path, follow-up idea, or quoted operator answer>
      Reviewer prompt: Please evaluate whether this rationale holds under the current scope. Do you concur?

The reviewer decides independently whether they concur with each disposition and
states that decision in their review file. A disputed finding closes only when
the reviewer withdraws it, the review consensus resolves it through the normal
signoff process, or the operator explicitly rules on it and that ruling is quoted
into the next review artifact.

### Phase 7 — Review consensus

When review discussion has converged, any participant (typically the implementer) drafts `ideas/<slug>/review/consensus.md`:

    ---
    idea: <slug>
    review-cycle: N
    drafted-by: <agent-id>
    date: YYYY-MM-DD
    reviewed-commit: <sha>
    ---

    ## Agreed fixes
    (Bulleted list. Each item cites the originating finding, e.g. "from <agent-id>/review/round-01 [MAJOR] <short-title>".)

    ## Deferred follow-ups
    (Findings everyone agrees are out of scope for this idea. Each links to the follow-up idea slug that will carry it, or `TBD` if not yet opened.)

    ## Dismissed findings
    (Findings the reviewer withdrew or the group judged not-an-issue, with 1-line rationale.)

    ## Coverage & blind spots
    (Advisory: findings everyone independently saw vs. only one reviewer saw, and
    areas no reviewer inspected deeply. Not a gate; signoffs remain the gate.)

    ## Signoffs
    <!-- Each active participant (implementer included) APPENDS their signoff block. -->

Signoff blocks use the same `✅ ACCEPT / 🟡 ACCEPT-WITH-RESERVATIONS / ❌ BLOCK` format as Phase 3. All ✅ → proceed to Phase 8. Any ❌ → new review round; the blocker's counter-proposal is the starting point.

### Phase 8 — Fix-up

The implementer applies the **Agreed fixes** from `review/consensus.md` on the same branch. On completion, they append a new section to `IMPLEMENTATION.md`:

When `checks:` is a list (LE-4 completion contract), closing additionally requires the latest driver run to be all-pass at the current HEAD: the driver vetoes `status: complete` while any criterion fails (it can only fail a close claim, never auto-pass one — the same shape as `strict_gate`, and independent of it). A failing criterion is recorded in `## Validation evidence` and escalates via stopping judgment rather than auto-retrying.

    ## Fix-up cycle N
    status: complete
    completed: YYYY-MM-DD
    head-commit: <new sha>

    ### Fixes applied
    (One line per item from Agreed fixes, with commit reference.)

    ### Deviations from agreed fixes
    (Any item that turned out to be infeasible or required a different approach, with rationale. "None" is a valid answer.)

They also update the top-level frontmatter: bump `status:` to `fix-up-cycle-N`, update `head-commit:`. Then publish per the active transport (see §11) with message `[<agent-id>] <slug>: IMPLEMENTATION.md fix-up cycle N — ready for re-review`.

Phases 6 → 7 → 8 repeat until a Phase 7 consensus lists **zero Agreed fixes**. At that point the implementer sets `status: complete` in `IMPLEMENTATION.md` frontmatter and publishes with `[<agent-id>] <slug>: IMPLEMENTATION.md — complete`. The implementation PR/MR is merged (B/C) or the idea is simply marked closed (A). Later invalidation follows the same rule as FINAL.md: open a new idea, do not edit the closed IMPLEMENTATION.md.

#### Strict review gate (optional)

An idea may opt into a strict review gate by setting `strict_gate: true` in
`00-prompt.md` frontmatter (exact, case-insensitive `true`; absent, empty, or any
other value means the default rule applies). If absent, the default Phase 8 rule
remains unchanged: the implementation may complete when Phase 7 consensus lists
zero Agreed fixes.

For `strict_gate: true`, zero Agreed fixes is necessary but not sufficient. The
gate closes only after a fresh full-scope Phase 6 review round — covering the
complete implementation diff at the time of the pass: all files changed since the
design FINAL plus every fix-up commit — produces no findings of any severity or
kind, and the subsequent Phase 7 consensus records that clean result. A
fix-verification or resumed pass may converge the gate by checking prior fixes,
but it never closes the gate by itself. Findings classified as NIT, deferred
follow-up, or accepted low severity still keep the strict gate open unless the
reviewer withdraws the finding or the operator explicitly rules it closed.

A finding under a strict gate must be an objective, code-grounded issue —
correctness, security, robustness, maintainability, or a factual documentation
error — in code the reviewer actually read; a subjective stylistic preference is
never a finding at any severity. NITs (dead code, typos, misleading comments)
remain findings and remain blocking.

`strict_gate` may be set at kickoff by the idea author. After kickoff, adding,
removing, or changing it requires either review/design consensus or explicit
operator direction recorded in the idea. A participant MUST NOT silently relax a
strict gate during implementation or review.

**Driver enforcement (LE-2).** Under auto-drive this gate is machine-enforced, not
advisory: the driver reads `strict_gate` from `00-prompt.md`; the Phase 7
review-consensus drafter sets the machine-readable `closing_review_round` and
`strict_gate_clean` fields; and the driver completes only when the named closing round
is certified clean AND a deterministic finding-scan of that round's review files finds
no concrete finding. The scan can only veto a clean claim (fail closed), never
auto-pass one, and the strict-close loop is bounded by the fix-up budget.

#### Stopping judgment

Review cycles are judged by trajectory, not by a pass counter. If findings are
fewer, lower severity, and confined to code changed by the latest fix-up, continue
within the configured fix-up budget. If fresh CRITICAL/MAJOR findings keep landing
on fix-up code, or the same ground is re-litigated despite open rebuttals, stop and
escalate with a short trajectory summary. If a finding requires an operator
decision, pause that finding's thread until the operator answers; unrelated fixes
may continue.

Illustrative triggers (examples, not normative thresholds): converging looks like
"total findings dropping sharply each pass, new ones low-severity and confined to
fresh fix code"; churning looks like "the finding count holding steady over two
passes, or new CRITICAL/MAJOR findings on previously unchanged code".

`MaxFixupCycles` and any driver retry budget are escalation thresholds, not close
criteria. Hitting the budget never marks an implementation complete; it requires
human review of the trajectory and either a new fix-up plan, a recorded operator
ruling, or a decision to abandon/defer the work.

**Loop budgets (LE-5).** An auto-driven loop carries explicit ceilings — max driver
steps, max wall-clock, and (best-effort) max cost — alongside `MaxRounds`/
`MaxFixupCycles`. Hitting any ceiling **escalates** (a durable blocking inbox note) and
halts; it never marks an idea complete. The ceilings are seeded per user from
`~/.parley [defaults.loop]` (`parley init` seeds generous safety-net defaults) and
overridable by `parley run --max-driver-steps` / `--max-wall-clock`; `0` means unlimited
(the backward-compatible default). Cost enforcement is telemetry-gated — it applies only
once the runner emits `agent.usage` events.

**Close-decision integrity (LE-7/LE-11).** Under `auto_implement`, a clean
`outstanding_agreed_fixes == 0` is necessary but not sufficient to auto-complete: the
driver refuses to auto-complete on an `ACCEPT-WITH-RESERVATIONS` triage (reservations need
a human to read them) or with fewer than two independent reviewers. And under
`auto_implement` or `strict_gate`, before completing, the driver runs a one-shot
**goal-done check** — a fresh non-implementer agent verifies the `FINAL.md` observable
acceptance criteria, and a confident fail escalates. The goal-check is defense-in-depth on
top of the review consensus and fail-open on its own error (a broken or inconclusive
checker never blocks a review-clean idea). A design-only idea keeps the lighter close
(conditional rigor).

### Escalation to user (any phase)

Any agent may escalate a question to the user at any phase when:

- The agent holds a **considered position** and the other agents are converging away from it, and the agent believes the direction matters enough to warrant human judgment.
- The decision hinges on **human-only judgment** (product priorities, aesthetic calls, risk tolerance, business constraints) that agents cannot resolve among themselves.
- The agent is **blocked on out-of-scope ambiguity** in `FINAL.md` or `00-prompt.md` that rounds cannot resolve.

**Non-triggers** (resolve these inside rounds, not via the user): style preferences without a concrete impact, valid-either-way choices where the agent has no real position, anything resolvable by re-reading existing docs.

Mechanism:

- Create `inbox/<from>-to-user_<slug>_<topic>.md` with frontmatter:

        ---
        from: <agent-id>
        to: user
        idea: <slug>
        phase: round-NN | consensus | implementation | review-round-NN | review-consensus | fix-up
        blocking: yes | no
        date: YYYY-MM-DD
        ---

        ## Question
        ## Context                 (what the other agents are proposing, what you are proposing, why it matters)
        ## What I need from you    (a decision, a constraint, a priority signal — be specific)

- If `blocking: yes`, the escalating agent **pauses their own contributions** on that idea until the user answers. Other agents may continue; they acknowledge the open escalation in their next round file.
- The user may respond by any medium: a direct message, a reply file in `inbox/`, an appended answer block in the escalation file itself, or (B/C) a comment on the design/implementation PR/MR.
- The escalating agent **quotes the user's answer verbatim into their next round/review file** (under a `## User direction` heading) so the decision survives in the idea's audit trail. The `inbox/` file is then moved to `inbox/archived/` or deleted — it is not the authoritative record.

Escalation is not a veto — the user's answer becomes input to the next round like any other constraint, and the group still reaches consensus via the normal signoff mechanism.

## 5. Quorum and async participation

- **Quorum = all agents listed in `participants:` of `00-prompt.md`.**
- **Quorum is set at the §9.0 pre-idea readiness check** and **locks once Phase 0
  completes.** Agents excluded there (with user confirmation) do not count toward this
  idea's quorum; a mid-idea unavailability does not silently shrink quorum — it falls to
  the async rules below and the runtime watchdog. Excluding the last non-facilitator
  still requires the §1 user-authorized solo exception.
- A valid Parley Deck idea normally has at least two active participants. A one-participant idea is valid only when a user-authorized solo exception is recorded with the auth/CLI/timeout/tooling blocker that made multi-agent execution impossible.
- An agent joining after round 1: either catch up (read priors, write late round-1, join from round 2) or decline (❌ NON-PARTICIPANT note in consensus).
- If an agent is inactive > 2 rounds and the idea has a deadline, others may drop them from quorum — but only after a `inbox/<from>-to-<missing>_<slug>.md` ping.
- For ideas with **only two participants**, the same rules apply unchanged: both must sign off ✅ for consensus, and disagreement still requires counter-proposals rather than tie-breaking. If a tie cannot be broken in rounds, escalate to the user (§4).

## 6. Conflict-avoidance mechanics

1. **One file per agent per round** — filename deterministic (`<agent-id>.md`), no collisions.
2. **`consensus.md` signoffs are append-only.**
3. **Never edit another agent's file.** If it's factually wrong, raise in next round with `@<agent-id>`. Exception: direct user instruction (e.g. a mandated translation or migration) overrides this rule — the editor must log the override in the commit message and append a trailing HTML comment in the file identifying the change and its authority.
4. If referring to something outside `parley-deck/`, **copy the snippet** — agents may lack cross-workdir read access.
   §6 rule 4 applies to scoping: source material the facilitator gathered while scoping an idea MUST be copied into
   `00-prompt.md`, or a sibling file referenced from it, before participants are invoked. If material cannot be
   shared — size, access, confidentiality, rights — the asymmetry MUST be disclosed and the source-dependent
   proposition MUST NOT be presented as established.
5. Before working on an idea, **re-read `00-prompt.md` `status:`** to avoid writing into a closed round.
6. **English only.** All content written to any file under `parley-deck/` MUST be in English. This covers round files, consensus, FINAL, inbox messages, meta docs, frontmatter values, and inline comments. In transports B and C, the rule extends to all PR/MR descriptions, review summaries, comments, and commit messages. Rationale: cross-agent interoperability and reviewability. If an agent needs to quote user input originally in another language, they translate it and note the original language in a trailing comment. _(Projects that explicitly need a different working language may override this rule in their own copy of COOPERATION.md, but it should be a deliberate, documented choice.)_

## 7. Changing this protocol

Open an idea under `ideas/meta-protocol-change-<topic>/` and run the full lifecycle (Phase 0 → Phase 4 at minimum; Phases 5–8 only if the change implies code work). The resulting FINAL.md supersedes this doc; the drafting agent updates `COOPERATION.md` in-place and logs the change in `meta/protocol-changelog.md`:

    ## YYYY-MM-DD — <short description>
    Idea: ideas/meta-protocol-change-<topic>/
    Drafted by: <agent-id>
    Summary: <1–2 sentences>

**Blast radius — a CORE change is not a deck change.** The protocol is moving to a single global
core in `~/.parley/protocol/core/<version>/`, of which each deck's `COOPERATION.md` is a generated
view (idea `meta-protocol-change-global-core-protocol`). One core change therefore reaches every
project at once, so the two are not the same act:

- A **core** change requires the meta-protocol-change idea above **and explicit user ratification**.
  **Only the user may change the global core.** An agent may not — not by editing a release, not by
  publishing one: releases are write-once and `parley protocol publish` refuses without a
  controlling terminal. That refusal stops an ordinary agent run, whose stdin is a pipe or
  `/dev/null`; it does not stop an agent that allocates a pty. An agent that needs different rules
  proposes them; it does not apply them.
- A **deck** change — the deck's own overlay, once that ships — is a smaller act and goes through a
  normal idea in that deck.

**Not yet in force — do not rely on it.** Per-idea version pinning (an open idea completing under
the version it started with) and the `DETECTED-UNATTRIBUTED` tamper signal are **ratified but not
implemented**. They are ranks 2 and 4 of the implementation plan. Until they ship, an idea does NOT
carry a pinned protocol version, and this section states that rather than describing an intended
future as present fact. What IS in force today, and no more than this: releases are
write-once and are refused through a symlinked store, `parley protocol publish` refuses when it
cannot see a controlling terminal (which stops an ordinary agent run, not one that allocates a
pty), and no agent-accessible code path writes a release.

**Carve-out — a version sync is not a protocol change.** Adopting an upstream-ratified
protocol version via the §9.0 freshness sync — when it is additive/compatible and
preserves the project-specific zones — is a maintenance sync, **not** a protocol change,
and does **not** require a meta-protocol-change idea. A breaking sync pauses for user
confirmation (§9.0); any genuine *new* rule still goes through this section.

## 8. Inbox (lightweight channel)

For pings, quick questions, heads-ups, handoffs — not a full design discussion:

`inbox/<from>-to-<to>_<topic>.md`

Examples:

- `inbox/<agent-id-1>-to-<agent-id-2>_<topic>.md`
- `inbox/<agent-id-1>-to-all_<topic>.md` (use `all` for broadcast)
- `inbox/<agent-id-1>-to-user_<slug>_<topic>.md` (escalation — see §4)

Inbox messages are outside the round/consensus protocol. Recipients read them at session start. If an inbox thread starts to look like a design discussion, promote it to `ideas/<slug>/`.

Mid-round discoveries, handoffs, and progress notes may use `inbox/`, but substantive decisions and positions that influence a phase transition MUST be mirrored in the next round/review file, `consensus.md`, `FINAL.md`, or `IMPLEMENTATION.md`. Inbox messages are coordination aids, not a substitute for canonical artifacts.

**In transports B and C**, casual inbox-style chatter _may_ additionally happen in PR/MR conversations or in a dedicated chat channel, but **escalations to the user (`to-user`) and any handoff that influences phase transitions MUST be filed as inbox files**. PR/MR threads are too easy to bury and not durable enough for audit purposes.

### Consults

Consult artifacts (`parley-deck/consults/`, written by `parley consult`) are
advisory and non-canonical: they are never round artifacts, signoffs, quorum
evidence, or dispositions. Promoting a consult's conclusion into protocol state
requires a normal idea/round/consensus artifact authored by a participant.

## 10. TL;DR

0. **Pick a track first (§4.0):** `fast` (1 reviewer, collapsed FINAL), `standard` (default), or `deliberation` (risky / protocol work). Trivial reversible work needs no Parley at all.
1. Parley Deck is non-solo: if another agent can be invoked, at least one non-facilitator participant MUST write its own canonical artifact.
2. One file per agent per round — no cross-editing.
3. Round 1 = independent analysis; later rounds = cross-review.
4. Consensus = all ✅ signoffs in `consensus.md`. In B/C, also mirrored by native PR/MR review approvals; the file wins on conflict.
5. The **idea initiator** (`author:` in `00-prompt.md`) drafts `FINAL.md`. Closing the idea is a single transaction (commit in A, PR/MR merge in B/C) that sweeps in any orphaned files.
6. Full dev flow: **idea → implementation → code review → fix-up**. The FINAL drafter is the default implementer; every other participant reviews; the same signoff mechanism gates each cycle; fix-up/review iterates until zero Agreed fixes.
7. **Any agent can escalate to the user** via `inbox/<from>-to-user_...md`. The user's answer is quoted into the next round/review file for the audit trail.
8. **English only** in every `parley-deck/` file _and_ every PR/MR description, comment, review, or commit message (unless the project deliberately overrides).
9. Change the protocol the same way you'd change any other artifact: open an idea.
10. **Files are canonical; PR/MR conversations are ergonomic.**

---

## 9. Session-start checklist for every agent

### 9.0 Pre-idea readiness check (facilitator, before opening a new idea)

Before creating `ideas/<slug>/00-prompt.md`, the facilitator runs a readiness check
(automatable via `parley preflight`) and records the result in the new idea's
`00-prompt.md`:

- **Protocol freshness.** Compare the live protocol against the installed skill's
  packaged protocol (e.g. `parley-deck-skill status`; `protocolSha256` vs
  `packagedProtocolSha256` in `meta/version.json`). Behaviour depends on
  `meta/version.json` `protocolRole`:
  - `source` → **advisory only; never auto-writes `COOPERATION.md`** (this project is
    the protocol's upstream, so a packaged copy is older, not newer).
  - `consumer` + a newer installed protocol → an **additive** change (a `deckVersion`
    minor/patch bump) is **auto-synced** into `COOPERATION.md`, **preserving every
    project-specific zone** (header, §0 transport, §2 roster — the same allowlist the
    drift guard uses); the sync updates the `Protocol synced:` header line and records
    `meta/protocol-sync_<ISO-timestamp>.md`. A **breaking** change (major `deckVersion`
    bump, or one that modifies/removes existing rules) **pauses for user confirmation**.
  - `protocolRole` missing/unknown → **do not auto-write**; ask the user once and
    backfill the field.
  - This sync adopts upstream-ratified text and is governed by the §7 carve-out; it is
    not itself a meta-protocol-change idea.
- **Roster liveness ping.** Probe every rostered participant (a bounded liveness
  round-trip via each agent's real configured invocation; a missing CLI is unavailable
  without a probe) and build an available/unavailable table.
  - **Excluding** an unavailable agent from this idea's quorum requires **explicit user
    confirmation** and is recorded in `00-prompt.md`
    (`excluded: [<roster-id> — reason — confirmed <date>]`). Exclusion is **per-idea and
    temporary**: the agent stays in the §2 roster and is re-probed at the next idea.
  - **Re-including** a previously-excluded, now-available agent into quorum **also**
    requires explicit user confirmation (no silent quorum expansion).
  - Excluding the last non-facilitator still requires the §1 user-authorized solo
    exception; the facilitator stops rather than silently going solo.
  - The quorum **locks once Phase 0 completes**; a mid-idea unavailability falls to §5
    and the runtime watchdog, downgrading to the same per-idea, user-confirmed waive.

Then proceed with the per-agent session-start checklist:

1. Read `parley-deck/COOPERATION.md` — note the active `Transport:` and check `meta/protocol-changelog.md` for updates.
2. Read `parley-deck/inbox/` — filter for files addressed to you or `all`. Escalations addressed `to: user` that are still unanswered are context you should respect: don't cut across an active user-direction request.
3. Read `parley-deck/ideas/*/00-prompt.md` — note open ideas where you are a participant.
4. **Transport B/C only:** check the project's open PRs/MRs for any titled `[<slug>] design` or `[<slug>] implementation` where you are a requested reviewer or assignee. If any is awaiting your action that maps to a missing file in §3, that file is what you owe — write it first.
5. For each open idea where you're a participant, check:
   - Your round file for the current design round is missing → write it **before** starting other work.
   - `IMPLEMENTATION.md` exists and `review/round-0N/<your-id>.md` is missing → write your review file **before** starting other work.
6. Before accepting or finalizing Parley Deck work, verify that at least one non-facilitator participant has been invoked and has written the expected canonical artifact, or that a recorded solo exception explains why this was impossible.
7. Only then proceed to the user's current task.

## 11. Transport mechanics

This section describes the _how_ for each of the three transports. Pick the subsection that matches your active `Transport:` setting; ignore the others.

### 11.A — Local directory

The simplest transport. Everything happens through commits to `parley-deck/` in a single git repo (or even a non-git directory, though git is strongly recommended for the audit trail).

**Commit message convention** for any change inside `parley-deck/`:

    [<agent-id>] <slug>: <one-line description>

    <optional body — multi-line context, especially around close-idea sweeps>

**Phase 0 — Kickoff.** Initiator commits `ideas/<slug>/00-prompt.md` and an empty `round-01/` (e.g. with a `.gitkeep`) to `parley-deck/`. Optionally pings via `inbox/<from>-to-all_<slug>_kickoff.md`.

**Phase 1 — Round 1.** Each agent commits their `round-01/<agent-id>.md`. Independence rule is a social one: write your file _first_, then `git pull`/`git log` to see others. There is no enforcement beyond agent discipline.

**Phase 2 — Cross-review rounds.** Each agent commits their `round-NN/<agent-id>.md`. Discussion lives entirely in the round files; there is no separate chat layer.

**Phase 3 — Consensus.** Drafter commits `consensus.md` (decisions, trade-offs, empty signoffs section). Each participant **appends** their signoff block in a follow-up commit. The frontmatter `status:` in `00-prompt.md` is bumped to `consensus`.

**Phase 4 — Finalization.** The drafter:

1. Commits `FINAL.md`.
2. Updates `00-prompt.md` `status:` to `final`.
3. Sweeps any uncommitted contributions from other agents (with permission, or after a reasonable interval).
4. Bundles all of the above into a **single commit** with message `[<drafter>] <slug>: FINAL.md + close idea`. The body summarizes what was included (and notes any swept-in files authored by others).

**Phase 5 — Implementation.** Implementer creates `feature/<slug>` in the target code repo, implements, then commits `IMPLEMENTATION.md` to `parley-deck/` with message `[<agent>] <slug>: IMPLEMENTATION.md — ready for review`. The `branch:` field in IMPLEMENTATION.md frontmatter points at the code-repo branch.

**Phase 6 — Code review.** Each non-implementer commits their `review/round-NN/<agent-id>.md`. No native review surface — discussion lives in the review files.

**Phase 7 — Review consensus.** Drafter commits `review/consensus.md`; signoffs appended in follow-up commits.

**Phase 8 — Fix-up.** Implementer pushes fix-up commits to `feature/<slug>` (in code repo), then updates `IMPLEMENTATION.md` (in parley-deck) with the fix-up cycle section and a new commit `[<agent>] <slug>: IMPLEMENTATION.md fix-up cycle N — ready for re-review`. When complete, status flips to `complete` in a final commit `[<agent>] <slug>: IMPLEMENTATION.md — complete`. The code-repo branch may or may not be merged — that is the code repo's own concern, not this protocol's.

**Inbox.** Files in `parley-deck/inbox/`, as described in §8.

---

### 11.B — GitHub Pull Requests

Each idea has **one long-lived PR per phase-cluster** in GitHub:

- **Design PR** in the parley-deck repo — covers Phases 0–4. Branch: `idea/<slug>`. Title: `[<slug>] design`. Merged at Phase 4 close.
- **Implementation PR** in the code repo — covers Phases 5–8. Branch: `feature/<slug>`. Title: `[<slug>] implementation`. Merged when Phase 8 reaches `status: complete`.

When the parley-deck repo and the code repo are the same, both PRs still exist and run in parallel post-Phase-4; they are simply two PRs in the same repo.

**Files are canonical, PR is ergonomic.** Every artifact lives as a file in `ideas/<slug>/`. The PR exposes those files via the **Files changed** tab to humans, and the PR's **Conversation** tab is the natural surface for chat-like cross-review and clarifications. Substantive positions still go into the round files; PR comments are non-authoritative.

**Conventions:**

- PR title: `[<slug>] design` or `[<slug>] implementation`.
- PR labels: `idea`, plus a phase label that the active phase owner updates (`phase:round-01`, `phase:round-02`, `phase:consensus`, `phase:final`, `phase:implementation`, `phase:review-round-NN`, `phase:review-consensus`, `phase:fix-up-N`, `phase:complete`).
- PR description: a brief mirror of `00-prompt.md` (problem statement + participant list + link to the file in the branch). Updated to also link to `FINAL.md` once it exists.
- PR assignees: all participants.
- PR reviewers: all participants except the author of the active commit.
- Commit messages: `[<agent-id>] <slug>: <one-line description>` — same as transport A.
- Merge strategy: **Merge commit** (preserves history). Squash-merge is forbidden — it destroys the per-agent commit attribution.

**Phase 0 — Kickoff.** Initiator:

1. Creates branch `idea/<slug>` off the integration branch of the parley-deck repo.
2. Commits `ideas/<slug>/00-prompt.md` and an empty `round-01/`.
3. Pushes and opens a **Draft PR** titled `[<slug>] design`. Description mirrors `00-prompt.md`. Labels: `idea`, `phase:round-01`. Assignees: all participants.

**Phase 1 — Round 1.** Each agent commits their `round-01/<agent-id>.md` to `idea/<slug>` and pushes.

> **Independence in Round 1.** The default rule is the same social one as transport A: write your file _first_, then look at the PR's Files changed. For stronger isolation, a project may opt into the **sub-branch protocol**: each agent works on `idea/<slug>/round-01-<agent-id>` and pushes only when ready; once all per-agent sub-branches exist, the idea owner merges them sequentially into `idea/<slug>` (no review on these merges). This guarantees no agent sees another's round-1 commit before having pushed their own. Document the chosen variant in the project's COOPERATION.md.

When all round-1 files are committed, the initiator switches the PR label from `phase:round-01` to `phase:round-02` and posts a top-level PR comment: `Round 1 complete — cross-review opens.`

**Phase 2 — Cross-review rounds.** Each agent commits their `round-NN/<agent-id>.md`. In addition, agents **may** post inline comments on the round files in the Files changed tab — this is encouraged for human readability and for short clarifications. Anything substantive (counter-proposals, position changes) MUST go into the next round file, never only as a PR comment. The phase label is bumped each round.

**Phase 3 — Consensus.** Drafter commits `consensus.md` (decisions, trade-offs, empty signoffs section) and bumps the label to `phase:consensus`. Each participant then performs **two coupled actions**:

1. **Canonical signoff:** append their signoff block to `consensus.md` (in a commit).
2. **Native mirror:** submit a formal PR review:
   - ✅ ACCEPT → **Approve**, with the same body text as their signoff Notes (or empty).
   - 🟡 ACCEPT-WITH-RESERVATIONS → **Approve** with a comment quoting the reservation.
   - ❌ BLOCK → **Request changes**, body MUST include the counter-proposal.

If the file and the review diverge, the file wins; the participant must update their PR review to match. GitHub's branch-protection rule (if used) should require N approving reviews from the participant set, where N = number of active participants minus the drafter — see "Branch protection" below.

**Phase 4 — Finalization.** Drafter:

1. Commits `FINAL.md`.
2. Updates `00-prompt.md` `status:` to `final`.
3. Sweeps any uncommitted contributions (with permission or after a reasonable interval).
4. Switches the PR from Draft to Ready-for-review (if not already).
5. Updates the PR description to link `FINAL.md`.
6. **Merges the PR** using **Merge commit** (not squash). The merge commit message is `[<drafter>] <slug>: FINAL.md + close idea`, with the body summarizing what was included (especially any swept-in files).
7. Deletes the `idea/<slug>` branch (GitHub's auto-delete-branch on merge is fine).

The merge IS the close-idea transaction. After this point, the design discussion is closed; further deliberation requires a new idea (`<slug>-v2`).

**Phase 5 — Implementation.** Implementer:

1. Creates branch `feature/<slug>` off the integration branch of the **code repo** (which may equal the parley-deck repo).
2. Implements per the merged `FINAL.md` (referencing the parley-deck-repo commit SHA).
3. On completion, commits `IMPLEMENTATION.md` directly to the integration branch of the parley-deck repo (small, no PR needed) with message `[<agent>] <slug>: IMPLEMENTATION.md — ready for review`. The frontmatter `implementation-pr:` field is filled in step 4.
4. Opens a **Draft PR** in the code repo titled `[<slug>] implementation` against the integration branch. Description references the merged design PR URL and the `FINAL.md` permalink. Labels: `implementation`, `phase:review-round-01`. Reviewers: all participants except the implementer.
5. Switches the PR to Ready-for-review when implementation is complete (i.e. when reviews can begin).

**Phase 6 — Code review rounds.** Each non-implementer reviewer:

1. Writes their `review/round-NN/<agent-id>.md` and commits it directly to the integration branch of the parley-deck repo (or via a small PR if branch protection requires).
2. Submits a corresponding **PR review** on the implementation PR in the code repo:
   - Use **inline comments** (anchored on lines) for findings tied to specific code locations — these are extremely useful for the human and the implementer.
   - Use the **review summary** to mirror the high-level summary of the review file, plus a link to the canonical review file.
   - Choose the review verdict by severity profile of the findings:
     - any `CRITICAL` → **Request changes**.
     - any `MAJOR` (no CRITICALs) → **Request changes** _or_ **Comment** depending on whether the reviewer considers them blocking.
     - only `MINOR` / `NIT` / no findings → **Approve** or **Comment**.

The implementer responds in Phase 7, not via a PR review.

**Phase 7 — Review consensus.** Drafter (typically the implementer) commits `review/consensus.md` to parley-deck. Each participant appends their signoff block AND submits a corresponding final PR review on the implementation PR (Approve / Request changes / Comment), same mapping as Phase 3.

**Phase 8 — Fix-up.** Implementer:

1. Pushes fix-up commits to `feature/<slug>` in the code repo.
2. Updates `IMPLEMENTATION.md` in parley-deck (new fix-up cycle section, bumped frontmatter) with commit `[<agent>] <slug>: IMPLEMENTATION.md fix-up cycle N — ready for re-review`.
3. **Re-requests review** from the participants on the implementation PR (GitHub: dismiss stale reviews if needed and click _Re-request review_).
4. Bumps the PR label to `phase:review-round-(N+1)` or `phase:review-consensus` as appropriate.

Phases 6 → 7 → 8 iterate until a Phase 7 consensus lists **zero Agreed fixes**. When that consensus is reached:

1. Implementer sets `status: complete` in `IMPLEMENTATION.md` frontmatter, commits `[<agent>] <slug>: IMPLEMENTATION.md — complete`.
2. Implementer **merges the implementation PR** (Merge commit, not squash) with message `[<agent>] <slug>: implementation — complete`.
3. PR label flips to `phase:complete`. Branch is deleted.

**Branch protection (recommended).** On the parley-deck repo's integration branch:

- Require PRs for all changes to `ideas/`.
- Require N approving reviews where N = expected quorum size (or "all assigned reviewers approve").
- Disallow squash-merge; allow merge commits only.
- Optionally require status checks (CI) if any.

On the code repo's integration branch: standard project policy plus the same N-approvals rule for PRs labeled `implementation`.

**Inbox.** Files in `parley-deck/inbox/` remain canonical, particularly for `to-user` escalations. For casual chatter that doesn't need durability, agents may use the design or implementation PR's Conversation tab — but anything that influences a phase transition MUST be filed as an inbox file. GitHub Issues MAY be used for tracking out-of-band project tasks, but they are **not** part of this protocol.

---

### 11.C — GitLab Merge Requests

Identical in spirit and structure to §11.B. The differences are mostly terminological, with a few GitLab-specific features that have no GitHub equivalent. Read §11.B first; this section lists only the deltas.

**Terminology mapping:**

| GitHub (§11.B)    | GitLab (§11.C)                                   |
| ----------------- | ------------------------------------------------ |
| Pull Request (PR) | Merge Request (MR)                               |
| Conversation tab  | Discussion / Threads                             |
| Files changed tab | Changes tab                                      |
| Approve           | Approve                                          |
| Request changes   | (no exact equivalent — see below)                |
| Comment (review)  | Add comment to MR                                |
| Draft PR          | Draft MR (`Draft:` title prefix)                 |
| Re-request review | Reset approvals (project setting) or manual ping |
| Branch protection | Push rules + Approval rules                      |
| CODEOWNERS        | CODEOWNERS (similar) + Approval rules            |

**Phase-by-phase deltas vs §11.B:**

- **All "PR" → "MR"**, "Draft PR" → "Draft MR", "Conversation" → "Threads", "Files changed" → "Changes". The flow is otherwise identical.
- **MR titles, labels, assignees, reviewers, commit messages, merge strategy** are exactly as in §11.B. GitLab's `Draft:` title prefix is the canonical Draft mechanism.
- **Merge strategy:** select **Merge commit** at the project level (_not_ "Fast-forward merge", _not_ "Squash"). Squash-merge is forbidden; per-agent commit attribution must survive.

**Native review mapping (Phase 3 / Phase 7 signoffs):**

GitLab has **Approve** and **Unapprove** but no native "Request changes" verdict. To express ❌ BLOCK, a participant must:

1. **Not approve** (or, if previously approved, click **Revoke approval**).
2. Open an **unresolved Thread** at the top of the MR titled `❌ BLOCK — see consensus.md` with the counter-proposal in the body.

To express 🟡 ACCEPT-WITH-RESERVATIONS:

1. **Approve**.
2. Open a (non-blocking) Thread quoting the reservation, prefixed `🟡 reservation —`. The thread can remain unresolved without blocking merge if your project's settings allow it.

✅ ACCEPT is just **Approve** with no thread (or a confirming thread).

**Approval rules (GitLab-specific, recommended).** On the parley-deck repo:

- Create an Approval rule named `idea-quorum` requiring N approvals from the `participants` group, where N = expected quorum size (or `All eligible users`).
- Set "Reset approvals when target branch is changed" to _off_ during normal flow, _on_ if you require fresh approvals after fix-up cycles.
- Set "Prevent merging unless all threads are resolved" to **on** — this enforces that ❌ BLOCK threads must be resolved (i.e. the blocker's counter-proposal must be addressed) before merge.
- Disable **Squash**; allow **Merge commit** only.

On the code repo: same Approval rule with quorum N for MRs labeled `implementation`. "Prevent merging unless all threads are resolved" remains **on** to enforce review-cycle blockers.

**Re-requesting review after fix-up.** GitLab does not have a per-reviewer "Re-request review" button. Instead:

- Set the project to **Reset approvals when new commits are pushed** so each fix-up cycle invalidates prior approvals automatically; _or_
- Have the implementer @-mention each reviewer in a Thread saying "Fix-up cycle N pushed at <sha>; please re-review".

**Suggestions.** GitLab's _Suggested change_ feature (commit-from-suggestion) is allowed for trivial fixes during cross-review but **must not be used to edit another agent's round file** (that violates §6 rule 3). It is fine to use it for the implementer's own code under review.

**Inbox.** Same as §11.B — files in `parley-deck/inbox/` are canonical; MR Threads are non-authoritative. GitLab Issues MAY be used for out-of-band tracking but are not part of this protocol.

Everything else — Phase 0–8 sequence, artifacts, signoff semantics, escalation, English-only rule — is identical to §11.B.

---

## Appendix A — Adopting this protocol in a new project

To bootstrap this protocol in a fresh project:

1.  **Pick a transport** (§0): `local-dir`, `github-pr`, or `gitlab-mr`.
2.  **Copy this file** to `<project>/parley-deck/COOPERATION.md`.
3.  **Fill in the header**: workspace name, shared channel path, transport, creation date, bootstrapping agent ID.
4.  **Declare the roster**: add a `[roster.<id>]` block per participant to `parley-deck/agents.toml` (`parley roster set <id> --scope deck --adapter <family> --yes --confirm-breaking`), then run `parley roster render` to generate the §2 view. Do NOT hand-edit the §2 table — it is generated and non-authoritative.
5.  **Create the directory skeleton**:

        parley-deck/
        ├── COOPERATION.md
        ├── ideas/
        ├── inbox/
        └── meta/
            └── protocol-changelog.md   (empty; appended on protocol changes)

6.  **Transport-specific bootstrap:**
    - **A (local-dir):** initialize a git repo at the parley-deck dir (or at a parent), commit the skeleton.
    - **B (github-pr):** create the parley-deck repo (or designate the directory inside an existing repo). Set up branch protection on the integration branch per §11.B. If a code repo is separate, ensure all participants have access.
    - **C (gitlab-mr):** create the parley-deck repo. Configure the Approval rule and merge strategy per §11.C. If a code repo is separate, ensure all participants have access and the same Approval rule.
7.  **Document any project-specific overrides** (e.g. branch naming, working language, monorepo vs split-repo decision) directly in this file — do not leave them as tribal knowledge.
8.  **Each agent runs the §9 session-start checklist** at the beginning of every session.

The protocol works for any number of agents ≥ 2. Roles, models, and runtimes are not part of the protocol — only agent IDs, files, and signoffs are. The transport choice is the one structural fork; the rest is uniform.

## 12. Pipeline blocks & action stages

§12 is additive and opt-in. If `parley-deck/pipelines/<slug>/pipeline.yaml` does not exist, the deck behaves exactly as Sections 0–11 define. Every existing idea is a valid degenerate one-block pipeline; no migration is required.

### 12.1 Block model
A pipeline is an ordered list of **blocks**. Each block is exactly one invocation of the existing cooperation engine; the pipeline layer only sequences blocks, records gates, and (for action blocks) executes approved side effects through the driver. Block kinds:
- `deliberation` — runs Phase 1–4, produces one typed stage artifact.
- `implementation` — runs Phase 5–8 unchanged, produces `IMPLEMENTATION.md` plus code state.
- `action` — runs Phase 1–4 to reach consensus on an action plan, then enters `execute`, a driver-only sub-phase that performs approved side effects.
- `watcher` — defines monitoring/alerting policy; breach handling opens a gated follow-up by default.

### 12.2 Canonical stage artifacts
Stage artifacts are normal consensus/finalize-compatible markdown with added typed frontmatter (transports and the round/consensus mechanics are unchanged). Names: `BUSINESS_SPEC.md`, `TECHNICAL_SPEC.md`, `IMPLEMENTATION_DESIGN.md`, `IMPLEMENTATION.md`, `DEPLOYMENT.md`, `RUNBOOK.md`, `MONITORING.md`. Required typed frontmatter: `artifact_kind`, `pipeline_slug`, `block_id`, `derived_from[]`, `risk` (low|normal|high|production), `providers_required[]`, `effects_intent` (none|planned|executed).

### 12.3 Manifest (`pipelines/<slug>/pipeline.yaml`)
`schema_version`, `idea_slug`, `autonomy` (supervised|auto-left), `transport` (default for the pipeline; a block may override it with its own `transport`), `decider` (optional agent that may auto-resolve ONLY low-risk, non-production boundary gates), `execution` (`linear` default, or `dag`), `participants`, `blocks[]` (id, kind, stage, role_lens, input_artifacts, output_artifact, risk, provider_capabilities, gate_policy, transport), `edges[]`. A `linear` manifest keeps the single-chain edge rule; a `dag` manifest is validated acyclic (known endpoints, no cycles) and advanced single-active by topological readiness — a block runs only when every inbound-edge source is complete, regardless of `blocks[]` order. Production gates remain non-bypassable under every execution mode.

### 12.4 Execution boundary (hard rule)
Local CLI agents author markdown only — their own round/consensus/signoff/plan artifact. The **driver** is the sole actor that performs side effects, through a **provider-agnostic interface** using generic capability names (`deploy.preview`, `deploy.production`, `runtime.rollback`, `monitor.alert`, `issue.create`, `notify.send`). Provider integrations (e.g. Vercel, Atlassian) are optional implementations behind that interface and are never protocol dependencies.

### 12.5 Seeding contract
The driver authors block N+1's `00-prompt.md` as initiator-owned kickoff material, built from the manifest, the prior block's finalized typed artifact (`derived_from` paths), the gate decision, and the next block contract (exact `input_artifacts` and expected `output_artifact`). A `00-prompt.md` is not a participant artifact, so canonical ownership (the facilitator/driver never writes a participant's round/consensus/signoff/final content) is preserved. If any required input artifact is missing, stale, or not finalized, the block does not start.

### 12.6 Durable state and effects ledger
`pipelines/<slug>/pipeline-run.json` is a cursor/index only: current block, completed blocks, pending gate, status, timestamps, and references to effects. Each side effect is its own file `pipelines/<slug>/effects/<key>.json`, semantically append-only, transitioning `planned → dry_run_ok → executing → succeeded|failed → reconciled|abandoned`, recording `external_ref` and an appended `attempts[]`. Agents never mutate the ledger; the driver is its only writer.

### 12.7 Idempotency and reconcile
Idempotency key = `sha256(pipeline_slug | block_id | provider | capability | target | request_hash)`, where `request_hash` is over the normalized request body. The stored filename is a stable digest prefix; the full key is recorded inside. Retrying without an idempotency key is prohibited. On resume the driver MUST reconcile external state (look up `external_ref`) for any `executing`/`failed`/ambiguous effect before retrying. Where a provider cannot dry-run, this is recorded explicitly, raises risk, and blocks auto-approval; for production a human gate may approve with the limitation visible.

### 12.8 Gates and autonomy (supervised-first)
Auto-advance is permitted only INSIDE a block, and only after the normal quorum + signoff predicates pass. Block-boundary gates default to `human`. Gate files (`pipelines/<slug>/gates/<edge-id>.gate.json`) reuse the HITL question/risk model and are resolved by one central policy evaluator keyed by policy names (no embedded per-gate scripts). `risk: production` mutations (`*.production`, `*.rollback`) are non-bypassable regardless of autonomy. A per-pipeline `autonomy: auto-left` flag may auto-resolve only low-risk, non-production left-half boundaries. A decider agent, if ever configured, is a future low-risk-only hook; block-and-wait is the default for every unresolved consensus or gate conflict.

### 12.9 Capability dispatch
Before consensus, the driver validates both sides: can the active roster satisfy the required advisory `role_lens`, and can the configured provider satisfy every required action capability? If either check fails, the block STOPS before consensus and raises a gate for a roster/provider/manifest change. It must never silently degrade to a solo run or to an unqualified executor — this is the automation-safe form of the non-solo execution requirement.

### 12.10 Execute sub-phase (action blocks)
Agents produce and reach consensus on a markdown action plan. The driver may call a provider only after: the plan artifact is finalized, the boundary gate is approved, provider-capability checks pass, and a ledger record exists in `planned` or `dry_run_ok`. Execution is never an informal continuation of Phase 1–4.

### 12.11 Monitoring loop-closure
`MONITORING.md` defines signal sources, thresholds, destinations, breach fingerprints, and dedupe windows. A breach notifies and opens a human gate by default. Auto-opening a remediation idea is allowed only for predeclared low-risk breach classes and uses the same sticky transport as the pipeline; production remediation remains gated. Breaches are deduplicated by fingerprint so one ongoing breach cannot spawn duplicate ideas. A watcher-auto-opened remediation idea is a non-active **candidate** (`status: candidate`, LE-10): the watcher does not staff a quorum, so it must not claim one (no `participants: []` at `round-01`). A human or the pipeline manifest sets `participants:` (at least one non-facilitator) and flips `status: round-01` before deliberation begins — the non-solo Phase-0 invariant.

### 12.12 Compatibility
All pipeline files are optional and live under `parley-deck/pipelines/<slug>/`; `ideas/`, `inbox/`, `meta/`, `runs/` are unchanged. Existing `run.json`/manifests may gain optional `pipeline_slug`/`block_id` fields under a schema bump with zero-value defaulting; older drivers ignore unknown fields and degrade to advisory.

Changing this section follows §7 (a meta-protocol-change idea). This section was ratified by idea `meta-protocol-change-end-to-end-pipeline` (2026-06-02).

## 13. Retrospective optimization

Inspired by Retrospective Harness Optimization (RHO): periodically mine the deck's own history to **propose** improvements to the harness — but never apply them automatically. A retrospective pass is **advisory input only**; every change it proposes enters through the normal lifecycle (Phases 0–8), and any protocol-text change goes through a meta-protocol-change idea (§7) with human approval. RHO's single-model self-preference is replaced here by the deck's multi-agent quorum.

### 13.1 What a retro pass is

A retro pass selects a diverse set of hard past cases (the **coreset**), diagnoses recurring failure modes from existing artifacts, and drafts the proposed improvement directions as an ordinary idea's `00-prompt.md`. It produces no canonical round/consensus/review/final/implementation content and applies no edit. Its output is a hypothesis, not a finding.

### 13.2 Harness layers — what a proposal may change, and how

- **Protocol harness** — `COOPERATION.md` and any in-repo copy kept in lockstep by the drift guard. Changeable only via a meta-protocol-change idea (§7) with human approval; a retro pass must never edit it directly.
- **Runtime / shared harness — Repository Instruction Files** — tracked, shared files: skills, CLI behavior, helper scripts, docs, and repo-level instruction files. Changeable via an ordinary idea and the full review gate (a meta idea if the change alters protocol semantics).
- **Local harness — Agent Local Memory** — operator-local, non-canonical state (caches, ignored launch config, per-machine memory). A retro pass may report observations only; it must never canonicalize them or infer protocol rules from one operator's local setup.
- **Evidence corpus** — structured Parley Deck artifacts (`ideas/*` rounds, `review/`, `consensus.md`, `FINAL.md`, `IMPLEMENTATION.md`, run event logs) are the primary evidence. Raw session transcripts are secondary, off by default, and quarantined; include them only with recorded provenance. Within this corpus, a retro pass SHOULD surface **confident-error** signals — a dismissed `CRITICAL`/`MAJOR` finding, an unsupported assumption that shaped `FINAL.md`, or a missed risk that caused fix-up churn — drawn from the `IMPLEMENTATION.md` Outcomes & Surprises sections and the `consensus.md` blind-spots fields. This is diagnostic evidence only: **never** a new review severity, a blame label, or a merge gate.

### 13.3 Acceptance gate

A retro-proposed change is accepted only by the normal gate: multi-agent consensus + all-participant signoff + human approval for protocol or shared-harness changes + no regression (the drift guard green where applicable, the relevant checks/tests green, and a clean multi-agent re-review). A self-preference or self-consistency score may be attached to a proposal as a diagnostic note; it is never an acceptance criterion.

### 13.4 Guardrails

- **Audit** — a retro pass is itself an idea; its coreset, diagnosis, and the provenance of both selected and excluded sources are recorded.
- **Adversarial-trajectory hygiene** — exclude trajectories that are compromised, contain injected or external content, or are out of project scope; record each exclusion and its reason.
- **Reversibility** — all proposed edits land on an idea branch with git history; never a silent in-place rewrite.
- **Multi-agent diagnosis** — when a retro pass opens an idea, its round-01 has each participant diagnose the coreset independently. Independent multi-agent disagreement is the deck's analogue of self-consistency, applied at diagnosis, not only at acceptance.

### 13.5 Playbooks (distilled retro output)

A **playbook** is a second, advisory output of retrospection: `parley learn <closed-idea-slug>` scaffolds a reusable `parley-deck/playbooks/<topic>.md` from a COMPLETED idea — a deterministic skeleton (track, roster, phase checklist, plus prompts for gotchas + fixes and the verification pattern) that the author refines into transferable, idea-agnostic prose before committing. Playbooks are **advisory and non-canonical** — like consults (§8) they are never quorum evidence and never override protocol text; referencing one in Phase 0 is optional context. Substantive revision of a playbook's recommended process goes through a normal idea. `parley learn` is a tooling command (read-only over the idea; writes exactly one new playbook file, fail-closed if it exists), NOT a Parley round — the advisory playbook does not need quorum, and normal commit review is its quality gate.

Tooling that performs retro passes (e.g. a `parley retro` command) is governed by this section but specified separately; such tooling defaults to read-only and may at most scaffold a single new `ideas/<slug>/00-prompt.md`.

Changing this section follows §7 (a meta-protocol-change idea). This section was ratified by idea `meta-protocol-change-rho-retrospective-optimization` (2026-06-16), amended by idea `meta-protocol-change-fusion-execplans` (2026-06-18) to add the confident-error evidence signal, and extended by idea `parley-learn-playbooks` (2026-07-04) to add §13.5 playbooks.

## 14. Automated outer loop (loop engineering) — the human brake

Parley Deck is a loop-engineering substrate: the human (or a full quorum) owns the
*decisions*, and automation may own only *discovery*. Any **automated, standing, or
scheduled loop** — anything not driven by a human in the current session: a cron job, a CI
hook, an MCP trigger, the `parley loop tick` command — is bound by this brake.

### 14.1 What an automated loop MAY do

- Discover candidate signals (new commits, CI results, issues, a signals file, monitoring
  breaches) and **draft Phase 0/1 prompts only**.
- A loop-drafted idea is always a non-active **`status: candidate`**: it carries provenance
  and a `## Promotion` note, and it does **not** claim a `participants:` quorum (the non-solo
  Phase-0 invariant — a loop must not staff a quorum it cannot itself convene). This is the
  same shape the §12.11 monitoring watcher uses.

### 14.2 What an automated loop MUST NOT do without a recorded human or full-quorum gate

- Promote a candidate to quorum (staff `participants:` / flip `status: candidate` →
  `round-01`), or otherwise start a deliberation or a `parley run`.
- Implement, write code, or apply fixes.
- Land, merge, push, or finalize (`FINAL.md` / closing an idea).
- Modify the active roster (`parley-deck/agents.toml`; §2 is the generated view).
- Override, bypass, reopen, or re-draft a consensus or signoff.

### 14.3 Fail-safe

The brake is fail-safe by construction: when an automated loop is uncertain, it does **less**
— it drafts a candidate and stops, or escalates to the inbox (§8) — never more. A scheduled
tick that is disabled, mis-configured, or sees no new signals writes nothing and exits
cleanly. Promotion of any candidate into an active idea is always a human action or an
explicit manifest action, recorded in the idea and (where it changes phase) mirrored into the
canonical round/consensus artifacts.

Tooling that runs an automated loop (e.g. a `parley loop tick` command) is governed by this
section but specified separately; such tooling is **disabled by default** and, even when
enabled, may at most scaffold `status: candidate` idea prompts. This section was ratified by
idea `automation-outer-loop` (2026-06-24).

## 15. Verification integrity

This section governs what makes a verification valid. Ratified by idea
`meta-protocol-change-verification-integrity` (2026-08-04). It composes with §4.0's per-track table
and never overrides it, and with the Phase 6 no-suppression rule: §15 gates what enters
`consensus.md`, never what a reviewer may report.

### 15.1 Scope, ownership, location

A factual assertion enters the verification regime only when a participant assigns a verdict to
it, another participant challenges it, or a rule in §15 expressly requires it. It does not apply
to every descriptive sentence.

An assignment of `CONFIRMED`, `WRONG`, or `UNVERIFIED`, or equivalent language that classifies a
claim as true, false, or not established, is a verification verdict; raw source text or command
output reported without a truth-status classification is evidence, not a verdict.

A claim is **material** when changing its truth value could change a recommendation, acceptance
criterion, finding severity, signoff, or close decision. Any participant may challenge a
materiality classification in its own next canonical artifact; the facilitator does not decide it.

**Every participant that asserts a claim as true where it first appears canonically is an
owner.** Quoting or endorsing another participant's claim does not transfer ownership. Material
a participant merely transcribes and explicitly marks as unverified testimony is **not** owned
by the transcriber, who may issue verdicts on it; a participant that marks material as testimony
while relying on it as established **is** an owner.

**An owner MUST NOT issue a verification verdict on a claim it owns.** An owner may append a
`SELF-CORRECTION` in its own artifact naming the statement it replaces; a weakening takes effect
immediately, a strengthening remains `UNVERIFIED` until a non-owner verdicts it.

A verdict is written in the **verifier's own** `round-NN/<agent-id>.md` or
`review/round-NN/<agent-id>.md`. On `fast`, where cross-review is skipped, it may be written in
that verifier's append-only signoff block. `consensus.md` and `FINAL.md` summarise statuses;
they never originate another participant's verdict.

Tags bind on verdicts about **what is**, not on positions about **what should be**.

### 15.2 Provenance

| Tag | Meaning | Maximum verdict |
|---|---|---|
| `PRIMARY` | The verifier consulted the thing itself: an authoritative source located and quoted with a stable locator and the relevant passage, **or a check the verifier executed, with the command, inputs and relevant output quoted** | `CONFIRMED` / `WRONG` |
| `SECONDARY` | The verifier relies on a **named** other participant's non-`RECALL` verdict; the dependency chain MUST be acyclic and terminate in `PRIMARY` | `CONFIRMED` / `WRONG` |
| `RECALL` | Memory or unsupported reasoning only | `UNVERIFIED` |

**A verdict with no tag is treated as `RECALL`.** A `PRIMARY` without its locator or quoted
output, and a `SECONDARY` without its named dependency, are malformed and read as `RECALL`.
A material claim reaching `FINAL.md` with only `RECALL` support MUST remain `UNVERIFIED`.

Where a verdict rests on more than one basis, tag the **decisive** basis and disclose the rest
in prose.

A locator proves that something was consulted. It does not prove it was interpreted correctly.

A claim that a problem is open, a result novel, or an approach previously untried carries
provenance under this section; `RECALL`-only support is recorded `NOVELTY UNVERIFIED` and may
not be presented as recommended work. *(This is the surviving core of MAJOR-5, folded in.)*

### 15.3 Conflicting verdicts

Contradictory verdicts on the same identified claim are resolved by reviewable evidence and
argument, **never by counting participants, including where the count is unanimous.**
Provenance controls whether a verdict is admissible; **it does not select the winner.**

A resolution MUST explain why the relied-upon evidence applies to and entails the scoped claim,
and why contrary sources, checks or counterexamples do not. Until that engagement resolves the
conflict, the claim is `DISPUTED`.

A `DISPUTED` claim enters `FINAL.md` under a mandatory heading and **may not be cited in support
of any acceptance criterion**. Consensus may close over a `DISPUTED` claim only when no decision
or acceptance criterion depends on it being true, and `FINAL.md` MUST record that dependency
check; otherwise the conflict blocks or follows the existing user-escalation path.

If any contradictory verdicts exist when consensus opens, or are first issued during consensus,
the drafter adds a `## Verdict conflicts` section to `consensus.md` quoting each verdict, its
author, its tag and its evidence verbatim, with the resolution. **Absent any conflict the
section does not exist.** No new file.

### 15.4 Exemption-claim admissibility

A canonical recommendation claiming to avoid a named known obstacle MUST identify the obstacle
and supply a witness: an explicit mapping of the obstacle's preconditions to the proposal
showing a necessary precondition does not hold; a reproducible check or counterexample
logically sufficient for the scoped claim; or a located authoritative result establishing the
exemption. **Adjectives asserting the exemption are not witnesses.** Without one, the artifact
records `EXEMPTION-CLAIM UNVERIFIED` and the assertion MUST NOT be used as a reason to accept
or implement the recommendation.

This gates entry into `consensus.md`. It does not gate what a reviewer may report — P6 governs
that, and this section never overrides it.

### 15.5 Role concentration

The facilitator has no dispute-adjudication authority beyond its own participant position. Its
**procedural** calls — declaring discussion converged, opening consensus, closing a round — are
provisional until the corresponding signoff gate passes. The signoffs, not the facilitator's
judgment, are the close. Binds on every track.

On every track, when the facilitator is also a participant and drafts `consensus.md` — or, on
`fast`, the collapsed `FINAL.md` — that artifact MUST record the role concentration in one line
and MUST contain `## Drafter position changes`: every material change in the drafter's position
since its most recent round file, each with an exact prior quotation or claim identifier, the
prior position, the new position, and the correct source round path. If there were none, write
`None`. Existing signoffs ratify its accuracy and completeness; no new reviewer, ownership
transfer or signoff weight is created.

### 15.6 Correlated agreement

On `standard` and `deliberation`, if round 1 closes with no substantive disagreement and the
idea's output is primarily a judgment rather than a mechanically decidable artifact, consensus
MUST NOT close until:

(a) the strongest rejected or unconsidered alternative is steelmanned, with its best supporting
evidence and an observation that would change the recommendation. **If no credible alternative
is found, the record states the search scope, the candidates considered and why each failed** —
that is a finding, not a failure to comply. The form differs by track:

- On `deliberation`, one participant is **assigned** and files it as a canonical round artifact.
- On `standard`, it is an `## Adversarial alternative` **section inside an existing round-02
  file** — no separate assignment and no extra round. Consensus MUST NOT close unless at least
  one existing round-02 artifact contains that section and satisfies this clause, null-result
  form included.

(b) `consensus.md` records that unanimity among related models is a shared prior, not
independent evidence, and states what would have to be true for the agreed position to be wrong.
This clause binds unchanged on both tracks, since `standard` has a separate `consensus.md`.

`FINAL.md` MUST state where multiple nominally independent proposals are in fact one family.

### 15.7 Per-track binding

| Rule | `fast` | `standard` | `deliberation` |
| --- | --- | --- | --- |
| 15.1 scope / no self-verdicts | yes | yes | yes |
| 15.2 provenance | yes | yes | yes |
| 15.3 conflicts | yes | yes | yes |
| 15.4 exemption claims | yes | yes | yes |
| 15.5 procedural calls provisional | yes | yes | yes |
| 15.5 drafter position changes | yes (in collapsed `FINAL.md`) | yes | yes |
| 15.6 correlated agreement | no | yes (section in an existing round-02 file) | yes (assigned round artifact) |
