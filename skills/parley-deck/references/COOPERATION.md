# COOPERATION.md — Multi-Agent Cooperation Protocol

**Workspace:** `parley-deck`
**Parley deck:** `./parley-deck/`
**Transport:** `github-pr`
**Created:** 2026-05-09 (initial draft)
**Protocol synced:** 2026-09-18 — parley-deck-skill 2.12.0 / parley-deck-cli 1.48.0
**Status:** Living document — any agent may propose changes via a dedicated idea (see §7).

---

## Quickstart — start here (developers & first-timers)

Read this Quickstart, §4.0, and §4's phases first. Open other references when the task needs them.

**Start an idea:**

1. Create `ideas/<slug>/00-prompt.md` with `track:`; the default is `standard` (§4.0).
2. Write your independent `round-01/<agent-id>.md` before you read peer answers.
3. Follow the track: `fast` uses round 1, collapsed FINAL signoff, one refutation-default reviewer, and at most one fix-up.
   `standard` uses the normal flow with two reviewers. `deliberation` uses the full lifecycle for risky or protocol work.

Trivial reversible work needs no Parley idea or verification claim: typos, documentation lines, one-file renames, and dependency bumps with passing tests.
Use Parley when independent verification earns its cost.

| Role | Read | Work |
| --- | --- | --- |
| Developer/implementer | Quickstart, §4.0, §4, §6 | Choose track; write plan/implementation; run checks |
| Reviewer | Phase 6–8 | Try to break acceptance criteria; file findings |
| PM/designer | Quickstart, §1 | State outcome, constraints, non-goals, risk tolerance |
| Facilitator | Quickstart, §4, §5, §9, active §11 transport | Open ideas; obtain consensus; maintain roster |

A declared `facilitator:` can act as pure organizer. Participants implement and verify; it reads verdicts.
`facilitator_participates: true` restores participation. V2 exhaustion succession follows §9.0.

The core is §0–§8 and §15, which binds on every track.
Reference sections: §9 session start, §10 summary, §11 transports, §12 pipelines/actions, §13 retrospectives, §14 automated loops.
Open each when its task applies. Section numbers do not determine physical order; §10 sits between §8 and §9.

---

## 0. Choose the transport

At bootstrap choose exactly one transport; artifacts/frontmatter/signoffs are identical,
but publication and phase-transition mechanics differ (§11).

| Transport | Use | Surface |
| --- | --- | --- |
| **A. Local directory** | Filesystem only; no host required | Direct `parley-deck/` commits |
| **B. GitHub Pull Requests** | GitHub projects; native review UI | One long-lived PR per idea |
| **C. GitLab Merge Requests** | GitLab projects; native review UI | One long-lived MR per idea |

Set the header's `Transport:` and follow that §11 variant. The choice is sticky:
switching requires a §7 meta-protocol-change idea because in-flight work spans branches/PRs.

**Deck bootstrap (one-time).** At deck creation (`parley init`), the facilitator MUST
confirm the active roster and each agent's model and reasoning/effort with the user.
Default to the highest supported effort; use `cli-default` only if undiscoverable.
Record choices in `parley-deck/agents.toml` via `parley roster set`, then regenerate §2
with `parley roster render`. Reuse them thereafter; re-confirm only on user request.
This is model/effort-agnostic, not a per-idea selection gate; §9.0 checks liveness only.
The skill gives the list-roster → confirm → list-models/effort → pick flow.

`parley init` creates the user-global `~/.parley/agents.toml`; deck settings override it.
Its `[defaults]` covers `ping_tier`, `preferred_transport` (init's seed),
`roster_change_policy`, `quota_auto_exclude` (§9.0's historical boolean; trigger freezes
at kickoff), `speed`/`timeouts`, and Phase 5's `default_implementer`. The last ships
COMMENTED OUT, deliberately deviating from the template's active-key shape to avoid
setting a global designee. Per-idea `implementer:` outranks it; deck-wide
`default_implementer = "none"` suppresses it.

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

A request to use `parley`, `parley-deck`, or this protocol requires real work by multiple agents.
A solo checklist, review, or process does not satisfy it. If another participant or CLI agent is
available, the facilitator MUST invoke it. Each participant MUST write its own canonical artifact.
Claim Parley use only with those artifacts, or an explicit protocol record that explains why
multi-agent execution was impossible.

If auth, CLI, timeout, permission, or tool failure prevents every other agent from participation,
stop before merge, finalization, or a completion claim. Report the blocker. Only an explicit user
solo exception permits continuation. Record that exception in `inbox/` or the idea's protocol notes first.
A §9.0 v3 automatic exclusion is a standing owner exception.

### Participant sizing and lenses

Default to 2–4 active participants. Use enough agents for different analysis without needless coordination.
Add participants for separable modules, review scopes, or competing hypotheses. Avoid extra agents for
sequential changes to one file or tightly coupled work. Optional per-idea roles and lenses are advisory.
They change no quorum, signoff weight, artifact ownership, drafter eligibility, or the non-solo requirement.

### Internal helpers

Participants may use internal subagents, tools, retrieval, scratchpads, or other model calls.
These helpers are not participants. They supply no non-solo evidence, own no protocol files, and do not sign.
A helper MUST NOT create a canonical round, review, consensus, or signoff file under a separate identity
unless `participants:` explicitly lists that identity. The named participant remains accountable for its file and signoff.

## 2. Active agents (roster)

**Roster authority:** `parley-deck/agents.toml`. Its `[roster.<id>]` blocks own membership,
adapter, model, effort, and speed. The §2 table is a generated view. Do not edit it by hand.

```bash
parley roster show
parley roster set <agent> --scope deck|machine …
parley roster sync
```

`set` previews by default. Deck scope writes committed `parley-deck/agents.toml`;
machine scope writes `~/.parley/agents.toml`. Retire with `active = false`; retain historical rows.
`sync` rebases an existing deck roster onto machine values. It does not migrate a legacy table.

Authority order: deck blocks, then a legacy §2 table (`legacy-roster`), then the machine roster
(`inherited-roster`). Machine changes reach an inherited deck without edits. A table row is a
declaration. Removal of deck blocks falls through to that table. Inheritance needs no declaration.

Migrate through attended, backed-up `parley roster migrate`, or per-member
`parley roster set <id> --scope deck --adapter <family> --yes --confirm-breaking`.
Then run `parley roster render`.

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
| `claude-1`      | `feci` |
| `codex-1`       | `feci` |
| `hermes-1`      | `feci` |
| `kimi-1`        | `feci` |
| `opencode-1`    | `feci` |
| `zcode-1`       | `feci` |

When a new agent joins:

- Add a row to the roster (via a short `meta/roster-update_<date>.md` idea — see §7).
- Declare the agent's workdir, write permissions, and host handle.
- From the next idea onward, the new agent is part of quorum (§5).

When an agent leaves the project, mark its row as inactive (do not delete it) so historical references remain resolvable.

## 3. Directory layout

    parley-deck/
    ├── COOPERATION.md               ← this document
    ├── agents.toml                  ← roster AUTHORITY (§2) + per-agent launch config
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
    │       ├── IMPLEMENTATION.md    ← original living execution document
    │       ├── role-handover/        ← successor execution records under §9.0
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
    ├── meta/                        ← roster updates, protocol changes, retrospectives
    └── runs/                        ← driver run state and per-agent logs (§12.12)

**Idea slug rules:** `kebab-case`, short, stable. Example: `execution-worker-retry-policy`.

**Repository scope (B and C only):** `parley-deck/` lives in a git repo. It may sit at the root of a dedicated coordination repo, or as a top-level directory inside the project's main code repo. The implementation phase typically operates on a _code repo_, which may equal the parley-deck repo (monorepo case) or be a different repo. When they differ, the **design PR/MR lives in the parley-deck repo** and the **implementation PR/MR lives in the code repo**, cross-referencing each other by URL.

## 4. Protocol — phases of an idea

This section describes the **conceptual** flow and the **artifacts** produced. The transport-specific _mechanics_ (commits vs PRs, comments vs files, merging vs status flags) are in §11.

### 4.0 — Track selection (conditional rigor)

Set `track: fast | standard | deliberation` in `00-prompt.md`; absent means `standard`.
The classifier scales ceremony to risk. Routing is mechanical; analysis, review, and refutation remain model-driven.

Evaluate all `deliberation` triggers first. If none applies, evaluate every `fast` condition; otherwise use `standard`.

| `deliberation` if ANY | `fast` if ALL | `standard` |
| --- | --- | --- |
| protocol change (§7); security/auth/secrets/payments/privacy/production infrastructure; migration/irreversible/destructive operation; `strict_gate: true`; `auto_implement`; pipeline/action (§12); public API or persisted-schema break; >~15 files/~1000 LOC | fully reversible; ≤~3–5 files/~300 LOC; no security/data surface; mechanically verifiable by lint/type/test | neither prior class |

On doubt, use the stricter track until risk is disproved: standard over fast, deliberation over standard.
This includes 6–14 files, ~300–~1000 LOC, and plausible unconfirmed security/privacy/production/migration/pipeline/API/schema risks.

| Aspect | `fast` | `standard` | `deliberation` |
| --- | --- | --- | --- |
| §9.0 readiness | skipped | full | full |
| Phase 2 cross-review | skipped | at most 2, then escalate/upgrade | at most 3 after round 1, then escalate |
| Consensus/FINAL | collapsed FINAL with signoffs | separate, drafted simultaneously | separate |
| Reviewers | 1 model-diverse | 2 | all non-implementers |
| Review consensus | reviewer's ACCEPT | reviewers who reviewed sign | all participants sign |
| Fix-up | cap 1; fix-only verification permitted | cap 2; fix-only verification for narrow fixes | cap 5; strict_gate available |
| Agent timeout | ~5 minutes | ~15 minutes | ~30 minutes |
| Auto-advance | full, except the signoff | human gate at FINAL→implementation | human gate at each transition |

This table overrides full-lifecycle defaults in §4, §5, §9.0, and §11.
Read later "every participant/reviewer" duties through it; deliberation keeps their full form.
The cause-derived §9.0 exception changes only reviewer minimums, never signer/refutation/other duties.

Every track retains: an independent non-facilitator artifact (§1), refutation-default review, round-1 independence, append-only signoffs, canonical files, §14's human brake, English, and no secrets.
Round-1 independence is a cooperative convention unless kickoff selects §11.B sub-branches or isolated staging.
The reviewer count can shrink; refutation discipline cannot. `LE-N` tags are references; their rule text binds.

The track binds after Phase 0. Any participant can force-upgrade through an inbox note before round 1 closes.
A reviewer can force-upgrade through a MAJOR/CRITICAL finding that cites a trigger.
A lower track than the classifier floor requires recorded user approval.
New implementation risk requires a stricter track and repetition of the current phase under its rules.
An upgrade from fast also restores its skipped cross-review and separate consensus/FINAL phases for the remaining idea.
With two participants, standard's two-reviewer rule becomes one; roster size and risk both affect the trigger.

### 4.0.1 — Loop-engineering rules (LE-N), in plain English

The `LE-N` tags cited inline in the phases below are shorthand for these rules (from the
loop-engineering work). The tag is only a reference id; the rule text is what binds.

- **LE-1 — Refutation-default review.** A reviewer assumes the implementation is wrong and records concrete attempts to break each acceptance criterion; a "no findings" review counts only with refutation attempts shown.
- **LE-2 — Driver auto-advance.** A deterministic driver may advance mechanical phase transitions; it never authors participant content or decides contested issues.
- **LE-3 — Model diversity.** A reviewer sharing the implementer's model is likelier to rubber-stamp; `require_model_diversity: true` turns an all-shared-model reviewer set into a hard gate.
- **LE-4 — Verification command.** The driver runs `checks:` through `sh -c` at Phase 5/8. A scalar command retains existing behavior. An optional named list of `{name, command}` criteria activates the **completion contract**; each command must exit 0. Each cycle, the driver replaces the `## Validation evidence` criterion table in the active execution record. Git history preserves earlier entries. Scrub secrets and truncate output.
- **LE-5 — Loop budgets.** Driver runs are bounded by max steps / wall-clock / cost.
- **LE-7 / LE-11 — Close-decision integrity.** Before an auto-driven close, a goal-done check verifies FINAL's observable acceptance criteria; it can only withhold a close, never establish one — a missing, self or unavailable checker, a failed run, or an inconclusive or reserved verdict leaves completion unverified and escalates, and a textual pass never replaces current-tree criterion evidence. Reservations or too-few reviewers escalate rather than close.
- **LE-10 — Candidate remediation.** Remediation ideas may start as `status: candidate`.

### Phase 0 — Kickoff

The agent (or user) who starts the idea creates `ideas/<slug>/00-prompt.md`:

    ---
    idea: <slug>
    author: <agent-id or "user">
    created: YYYY-MM-DD
    track: fast | standard | deliberation   # §4.0; default standard; deliberation is forced by the classifier triggers
    participants: [<agent-id-1>, <agent-id-2>, ...]
    organizer: <agent-id>       # optional ordinary-participant organizer; v2 succession uses §9.0
    roles:                         # optional; advisory per-idea lenses only
      <agent-id-1>: <lens-or-role>
      <agent-id-2>: <lens-or-role>
    deadline: YYYY-MM-DD        # optional
    strict_gate: true|false     # optional; exact case-insensitive "true" opts into
                                # the strict review gate (Phase 8); absent or any
                                # other value keeps the default close rule
    quota_auto_exclude: false   # opt out of quota/participant-failure exclusion; saved scope/trigger govern later runs
    require_model_diversity: true|false  # optional; LE-3 — escalate (not just warn) if
                                # every reviewer shares the implementer's model
    checks: <command>           # optional; LE-4 — verification command the driver runs
                                # (sh -c) as the Phase 5/8 build-test gate; a code-writing
                                # (auto_implement) idea with no checks and no go.mod fails closed
    implementer: <agent-id>     # optional; designates who executes FINAL (Phase 5) — a
                                # designation, while IMPLEMENTATION.md's `implementer:` is
                                # the outcome record. Absent = the default chain; `none` =
                                # decline any standing default for this idea; an empty
                                # value is an incomplete designation (blocked at the first role action);
                                # an id outside `participants:` is invalid (blocked).
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

Historical signers retain their filed positions under §5 and §9.0; an automatic exclusion never withdraws a veto.

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

If `author: user` (i.e. the user kicked off the idea rather than an agent), the default drafter is the **first agent to have submitted a round-01 file**. Any participant may volunteer to draft instead by posting a note in `inbox/` (or the design PR/MR conversation) before the consensus signoff completes; the volunteer's signoff block must state `Drafter: yes` to claim the role. If no one volunteers, the fallback rule applies. When the idea designates an implementer (Phase 5), prefer a drafter that is NOT the designee; the driver applies this preference with the designee as the fallback, and drafter and implementer coinciding is never forbidden (two-participant decks need it).

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

Freeze all sections above References at design time with `FINAL.md`. The active execution record (Phase 5) is its living companion. For complex, `auto_implement`, designated, driver-managed, or pipeline ideas, both artifacts MUST support implementation and resume without session transcripts. **Observable acceptance criteria** state behavior that a reviewer or driver can check. These added sections may be `N/A` for trivial or design-only ideas.

**Idempotence & recovery** states what state matters, what is safe to rerun, and what needs a human gate; it is required for `auto_implement` / action / pipeline ideas, where the driver treats it as the recovery contract.

Before publishing `FINAL.md`, the drafter MUST verify that every active non-facilitator participant has created the expected canonical artifacts or that a recorded solo exception explains why multi-agent execution was impossible. A missing non-facilitator artifact is a blocker, not a reason to claim Parley Deck completed as a solo run.

**Closing the idea (transport-specific):** The drafter publishes `FINAL.md` and closes the idea on disk in a single transaction. In transport A this is a commit; in B/C it is a PR/MR merge that bundles the final commit. Either way, the closing transaction also picks up any uncommitted/unmerged contributions inside `ideas/<slug>/` so no deliberation history is orphaned. See §11 for the exact form.

### Phase 5 — Implementation

The **active execution record** is `IMPLEMENTATION.md` before succession, then the handover selected by validated v2 history.
That history takes priority over the legacy role chain below.

After publication of `FINAL.md`, participants implement and verify code. A declared facilitator reads their verdicts and validator output.
It does not implement or verify code unless `facilitator_participates: true` or §9.0 v2 succession permits implementation.

Resolve the implementer through this chain. Stop at the first hit:

1. Phase-5 re-entry pin: `IMPLEMENTATION.md` → `implementer:`.
2. Per-idea designation: `00-prompt.md` → `implementer:`.
3. Standing default: `[defaults].default_implementer`, from live layered configuration at dispatch (§0).
4. `FINAL.md` → `implementer:` / `drafted-by:`, then the first eligible participant in list order.

The prompt designation states who must execute. The implementation pin records who did execute.
The per-idea field has four states: absent permits the global default; empty blocks as incomplete;
`none` suppresses the global default without a gate; an agent ID designates that agent.
Single and double quotes around an ID are accepted.

Empty, malformed, or ineligible designations block every run that reaches an implementer, review-round, goal-check, or fix-up action.
Never trim or repair malformed values: `implementer: kimi-1  # note` is invalid.
A design-only run (`auto_implement` off) leaves that defect latent until a later implementation run.

A per-idea designee that fails the §9.0 ping blocks a run that reaches Phase 5.
The user-confirmed gate has exactly three recorded exits:
re-designate an eligible participant; record `implementer_waived: {agent-id} — {reason} — confirmed {date}`;
or set `implementer: none`.
An unavailable, non-participant, or non-participating-facilitator global default does not block.
Print one notice with the designee, cause, and those exits, then use the fallback.
A malformed global default still blocks.

A conflict between the pin and live designation escalates. The owner or author must record its correction.
Restore the designation to the pin, or record
`implementer_reassigned: {old-agent-id} to {new-agent-id} — {reason} — confirmed {date}`
to retire the abandoned attempt and re-pin.

Before work, another participant may claim implementation through
`inbox/<from>-to-all_<slug>_impl-claim.md` or the transport surface.
With no claim after a reasonable window, the drafter proceeds.
A live designation makes the claim advisory. Answer it through a per-idea edit or §4 escalation.
Without a designation, the normal volunteer route applies.

A designation changes only the executor. It transfers no quorum, roster, signoff weight, or attended publication authority.
Core publication, channel publication, and `parley protocol publish` retain their gates.
Validate designations against current `participants:` (§9.0). Immutable history supplies known signers; current membership supplies required signers.
Never derive membership by subtraction of `excluded:` markers.
A per-idea designee or pin cannot be automatically excluded under the legacy rules.
Its recorded failure opens the three-exit gate with evidence prefilled.
The drafter may also implement, including with two participants. Record that concentration in the active execution record in one line.

**V2 handover contract (§9.0).** The successor owns one `role-handover/<transition-id>.md`.
Use ordinary `status:`/`implementer:` execution keys plus transition, predecessor, successor, roles, phase, base path/hash, branch, HEAD, and date.
Add `## Takeover` and `## Resume state` to the existing living sections. State the next action and canonical resume paths.
Before Phase 5, base is `none`. At implementation, this file must satisfy every Phase 5 field and required section below.
Later handovers bind the previous execution record by exact hash. Preserve its bytes and inherit its progress, cycles, validation, and findings.
One `ResolveActiveExecution` helper selects the tip from validated history, never filename order.
Every current-state reader/writer uses it: dispatch, checks, evidence, status/wait/brief, review, goal check, and close.
A missing/corrupt tip or changed base blocks without fallback. Completion updates the active record, never the predecessor.
Commit history before handover dispatch. Only the selected successor can write the pending handover; ordinary work waits for validation.

The implementer:

- Creates a branch in the **target code repo** per that repo's branching convention (e.g. `feature/<slug>` off the integration branch).
- Before multi-file changes or changes outside `parley-deck/`, open or update the active execution record with a short plan/checklist. Risky plans may receive a brief feedback window through the active transport or `inbox/`. Reviewers may block material divergence through normal review. This adds no phase or artifact.
- Implement strictly to `FINAL.md`. Record unavoidable deviations in the active execution record.
- On completion, finalize the active execution record with this schema:

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
        (Work completed and FINAL.md coverage.)

        ## Implementation plan / checklist
        (Plan before multi-file or non-deck changes; "N/A" for trivial/design-only work.)

        - [ ] Files or areas to change:
        - [ ] Checks to run:
        - [ ] Review or risk notes:

        ## Deviations from FINAL.md
        (Deviations and rationale; "None" is valid.)

        ## Notes for reviewers
        (Review focus, trade-offs, and out-of-scope items.)

        ## Progress
        (Checklist at each stopping point, with ISO timestamps `(YYYY-MM-DD HH:MMZ)`.
        Use `(completed: X; remaining: Y)` for partial steps.)

        ## Decision Log
        (Decisions after FINAL.md: Decision / Rationale / Date·Author.
        Record deviations under `## Deviations from FINAL.md`.)

        ## Surprises & Discoveries
        (Unexpected findings and evidence, especially changes to choices.)

        ## Validation evidence
        (Commands and their FINAL.md criterion evidence. For a `checks:` list, the driver
        writes this section each cycle; the implementer must not write it manually.)

        ## Outcomes & Retrospective
        (At completion: achievements, gaps, and lessons for §13 `parley retro`.)

Keep the active execution record current at every stopping point. It supplies resume context; §12 supplies the effects ledger and idempotency keys. Its living sections supply orientation and recovery. They are required for complex, `auto_implement`, driver-managed, or pipeline ideas; trivial or design-only work may use `N/A`.

Publish the active execution record through the §11 transport and signal "open for review".

A design-only idea may use a brief active execution record that states where the design was applied. Phases 6–8 still apply unless `consensus.md` waives review.

### Phase 6 — Code review rounds

> Verification verdicts, their provenance, and verdict conflicts follow **§15**.

In a declared-facilitator run, code review and code verification stay with the participants by default; the declared facilitator consumes review verdicts rather than reviewing code itself.

After a §9.0 exclusion, re-evaluate reviewer count using its cause-derived exception.
The sole reviewer must have a known distinct model even if `require_model_diversity`
is false. Strict-gate, independent goal-check and historical-finding obligations remain.

After publication of the active execution record, every active participant **except the implementer** writes `ideas/<slug>/review/round-01/<agent-id>.md`:

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

If there is no invokable non-implementer reviewer, the implementation MUST NOT be merged or marked complete under Parley Deck. The implementer MUST report the blocker and continue only after either another reviewer is added or the user explicitly authorizes a recorded solo exception. §9.0 v3 is the only exception.

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

A §9.0 exclusion does not dispose of historical signoffs or findings (§5).
Required review-consensus signers follow current participants, including a v2 successor, through §4.0;
on deliberation every current participant, including the implementer, signs.
The single-reviewer exception never withdraws retained dissent.

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

Apply the **Agreed fixes** from `review/consensus.md` on the same branch.
On completion, append the fix-up section to the active execution record:

A `checks:` list requires the latest driver criteria to pass at current HEAD before close. The driver vetoes `status: complete` if any criterion fails. It never auto-passes a close claim; this gate is independent of `strict_gate`. Record failures in `## Validation evidence`. Escalate through stopping judgment without automatic retry.

    ## Fix-up cycle N
    status: complete
    completed: YYYY-MM-DD
    head-commit: <new sha>

    ### Fixes applied
    (One line per item from Agreed fixes, with commit reference.)

    ### Deviations from agreed fixes
    (Any item that turned out to be infeasible or required a different approach, with rationale. "None" is a valid answer.)

Update the active execution record's top-level frontmatter: bump `status:` to `fix-up-cycle-N`, update `head-commit:`. Then publish per the active transport (see §11) with message `[<agent-id>] <slug>: IMPLEMENTATION.md fix-up cycle N — ready for re-review`.

Repeat Phases 6 → 7 → 8 until Phase 7 lists **zero Agreed fixes**. Set `status: complete` in the active execution record. Publish with `[<agent-id>] <slug>: IMPLEMENTATION.md — complete`. Merge the implementation PR/MR (B/C), or mark the idea closed (A). Later invalidation requires a new idea. Never edit a closed execution record.

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
a human to read them) or with fewer than two independent reviewers, except the
cause-derived single-reviewer case in §9.0. Under `auto_implement` or `strict_gate`,
before completing, the driver runs a bounded **goal-done check**: a fresh process
of a non-implementer verifies `FINAL.md`'s observable acceptance criteria. The sole
remaining reviewer may perform it in a fresh process. Its hard ceiling is the minimum
of the active track's 5/15/30 minutes and a positive configured checker timeout;
missing configuration uses the track bound, absent track means standard, and malformed
track refuses. Goal execution, including protected checkers, uses §9.0 v2 exhaustion suppression when applicable. Otherwise it uses the existing durable
original-plus-one retry at that same frozen ceiling and the existing watchdog/buffering
rules. A valid FAIL is final; retry never grants dropout authority or changes protected
roles. A confident fail escalates. **The check can only withhold a
close, never establish one.** A checker that is missing, is the implementer, or cannot be
resolved and launched; an execution that fails or exits non-zero; and a verdict that is
inconclusive or only a pass-with-reservations each leave completion **unverified**, and
each escalates for a human decision instead of passing. A textual goal-check verdict is
defense in depth on top of the review consensus and **never substitutes for the
current-tree independent criterion evidence a close already requires**: a self-issued
verdict, a stale code tree, a skipped or no-execution report, a missing criterion, or a
partial original scope cannot close an implementation. The trade is deliberate — an
unavailable checker now halts a review-clean close until a human restores an independent
checker or rules on it. A design-only idea keeps the lighter close (conditional rigor).

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

- **Quorum = current `participants:` in `00-prompt.md`, reconciled with immutable §9.0 history.**
- A frozen external facilitator enters quorum only through the v2 implementation-takeover exception. It supplies no floor seat or independent review.
- **Quorum is set at the §9.0 pre-idea readiness check** and **locks once Phase 0
  completes.** Agents excluded there (with user confirmation or recorded §9.0 versioned automatic exclusion)
  do not count toward this idea's quorum; a mid-idea unavailability does not silently shrink quorum,
  except the recorded §9.0 versioned automatic exclusion, which is never silent. Otherwise it falls to
  the async rules below and the runtime watchdog. Excluding the last non-facilitator
  still requires the §1 user-authorized solo exception, except §9.0 v3.
- An excluded participant's filed signoffs, ❌s, `DISPUTED` claims and findings survive. It remains a known signer through immutable membership history; required signers follow the current `participants:`. Exclusion is never a withdrawal or disposition: a ❌ stands until its eligible author withdraws it after owner-confirmed legacy-quota re-inclusion, or the owner rules and the ruling is quoted into the next artifact. Participant-failure dropout is permanent for this idea, including kickoff drops and after policy opt-out/downgrade; no ordinary revision, recovery or catch-up can re-add the author. Its retained dissent requires an owner ruling or abandonment/v2. Open CRITICAL/MAJOR and every strict-gate finding require an explicit disposition backed by independent evidence; disputes are never resolved by count (§15.3).
- A valid Parley Deck idea normally has at least two active participants. A one-participant idea is valid only when a user-authorized solo exception is recorded with the auth/CLI/timeout/tooling blocker that made multi-agent execution impossible, or a §9.0 v3 automatic exclusion leaves one role holder.
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
6. **English only; ASD-STE100 by default.** Write new protocol prose in English. This includes artifacts, inbox notes, briefs, PR/MR text, and commit messages. Use ASD-STE100 Issue 9 through the working summary in Appendix B.

   Read Appendix B before you write or review English prose. Preserve exact source quotations and add English explanation when needed. Appendix B defines the exemptions and the per-idea exception.

   Non-English owner chat is outside this file rule. STE applies only to English output. A deck can retain a deliberate, documented working-language override.

## 7. Changing this protocol

Open `ideas/meta-protocol-change-<topic>/`. Complete Phases 0–4, plus 5–8 for code changes.
FINAL.md supersedes this document. The drafter updates `COOPERATION.md` and `meta/protocol-changelog.md`:

    ## YYYY-MM-DD — <short description>
    Idea: ideas/meta-protocol-change-<topic>/
    Drafted by: <agent-id>
    Summary: <1–2 sentences>

**Global core:** `~/.parley/protocol/core/<version>/` supplies generated views across projects.
Changes require a meta idea and explicit user ratification. Only the owner publishes write-once releases; symlinked stores refuse.
`parley protocol publish` requires a controlling terminal; ordinary pipes and `/dev/null` fail.
This prevents quiet/normal-path changes, not privileged access: an agent can allocate a pty.
Agents propose only. No agent-accessible publication path writes a release.

**Deck overlay:** `parley-deck/protocol-overlay.md` affects one deck under its normal idea process.
Implemented: file grammar, `parley.protocol-lock/v2`, extend-only terminal-boundary composition.
Not implemented: roster-annotation identity slot or removal of prose-matched zone addressing. Do not rely on them.

Per-idea version pinning and `DETECTED-UNATTRIBUTED` tamper detection remain unimplemented (ratified ranks 2 and 4).
Open ideas are unpinned. Only write-once, symlink, and terminal gates are active.

**Version-sync exception (§9.0):** upstream-ratified additive/compatible adoption needs no meta idea if project-specific zones remain intact.
A breaking sync requires user confirmation. New rules still follow this section.

## 8. Inbox (lightweight channel)

For pings, quick questions, heads-ups, handoffs — not a full design discussion:

`inbox/<from>-to-<to>_<topic>.md`

Examples:

- `inbox/<agent-id-1>-to-<agent-id-2>_<topic>.md`
- `inbox/<agent-id-1>-to-all_<topic>.md` (use `all` for broadcast)
- `inbox/<agent-id-1>-to-user_<slug>_<topic>.md` (escalation — see §4)

Inbox messages are outside the round/consensus protocol. Recipients read them at session start. If an inbox thread starts to look like a design discussion, promote it to `ideas/<slug>/`.

Use `inbox/` for discoveries, handoffs, and progress notes. Mirror phase-affecting decisions and positions into the next round/review, `consensus.md`, `FINAL.md`, or active execution record. Inbox notes never replace canonical artifacts.

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
6. Flow: **idea → implementation → review → fix-up**. Validated v2 role history has priority. Otherwise use the Phase 5 chain: implementation pin, per-idea designation, owner-set default (unset initially), FINAL implementer/drafter, first eligible participant. Every non-implementer reviews. Signoffs gate each cycle; repeat until zero Agreed fixes.
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

- **Protocol freshness.** Compare live and installed packaged protocol hashes
  (`parley-deck-skill status`; `protocolSha256`/`packagedProtocolSha256` in
  `meta/version.json`). `protocolRole: source` is advisory and NEVER auto-writes:
  this deck is upstream, so its package may be older. For `consumer`, auto-sync a newer
  additive minor/patch while preserving header, §0 transport and §2 roster (the drift
  guard's allowlist); update `Protocol synced:` and record
  `meta/protocol-sync_<ISO-timestamp>.md`. A major or rule-modifying/removing change
  pauses for user confirmation. Missing/unknown role: ask once and backfill; no auto-write.
  Adopting ratified upstream text uses §7's carve-out, not a new meta-protocol-change idea.
- **Roster liveness ping.** Probe every rostered participant (a bounded liveness
  round-trip via each agent's real configured invocation; a missing CLI is unavailable
  without a probe) and build an available/unavailable table.
  - **Excluding** an unavailable agent from this idea's quorum requires **explicit user
    confirmation**, except the versioned automatic-exclusion rule below, and is recorded in `00-prompt.md`
    (`excluded: [<roster-id> — reason — confirmed <date>]`). Exclusion is **per-idea and
    temporary**: the agent stays in the §2 roster and is re-probed at the next idea.
  - **Automatic exclusion** (versioned quota and participant-failure policy).
    Only CLI-recorded decisions authorize it. Prose, disagreement, elapsed time, and roster edits supply no authority.
    - **Policy.** Presence-aware `[defaults].quota_auto_exclude` follows machine → deck → idea; per-idea false opts out. New ideas freeze enabled, scope `kickoff-and-mid-idea`, trigger `participant-failure-v3`. V3 keeps every v2 rule; only its floor and review gates below differ. Saved v1/v2 behavior stays unchanged. Saved omitted-trigger policies keep quota-only behavior and identical bytes/hashes. Unrecorded legacy ideas require confirmation. Immutable scope/trigger project into the prompt; upgrade/resume never widens them. Widening requires owner-bound revision. Unknown, null, duplicate, or malformed fields block.
    - **Two-attempt path.** Except v2 exhaustion below, a non-protected step gets the original attempt plus one retry after five seconds. Both attempts use the same ceiling; watchdog retry consumes the second slot. Eligible streaming steps, including signoffs, use first output 120s, stall 300s after activity, heartbeat 60s. Heartbeats are not activity. Honor configured overrides/disables and truthful buffering. Buffered final-text transports, including zcode and default Claude text, disable soft guards; hard ceilings remain. Readiness stays 90s. Goal checks use Phase 8's track/configuration ceiling. Manual `agents exec` and interactive paths remain hard-ceiling-only. Buffered silence cannot support a universal early-drop claim. Exec/ACP errors of any code, crashes/start failures, missing/invalid own output, and supervisor `no_first_output`/`stalled`/`timeout` qualify after cleanup. Valid output, including BLOCK/disagreement, on either attempt wins. Parent cancellation, policy/budget/protocol/telemetry refusal, unresolved writers, and tampering never authorize dropout. Preserve invalid own output before retry; shared edits block for repair. Bind idea, agent, and logical step. Restart, run ID, and prompt changes grant no third attempt. Unsettled starts require host/boot/PID stopped-writer proof, never invented success. Kickoff uses the same bound within its readiness batch. Rule `participant-failure.v1` uses supervisor facts independently of quota recognition. It binds both invocation IDs/linkage, step, terminal/exit/watchdog class, validator reason, UTC times, and verbatim decisive evidence. Only secret redaction and visible truncation may alter it. Full logs/partials stay private.
    - **Provider exhaustion in v2.** `provider-exhaustion.v1` requires failed execution and explicit exhausted account credit, token, quota, or named usage allowance. Native authority requires CLI behavior/source and positive/adversarial fixtures. Unsupported adapters remain diagnostic-only. The bounded zcode stderr exception below applies; no new gateway waiver exists. Assistant text, quotes, tool output, `is_error`, generic quota text, context/response/session budgets, bare429/5xx, auth, overload, and watchdogs do not qualify. Malformed, mixed, contradictory, or truncated framing/class evidence rejects. Reset proof is separate. Short, absent, past, malformed, or contradictory resets become unknown; they never cause a retry of proven exhaustion. The legacy 60-minute threshold stays unchanged. Valid output or an already in-flight later success wins. Validate output before suppression. Persist invocation/validation proof before return. A terminal-to-validation crash blocks admission until reconciliation without another child. Missing/corrupt pending proof blocks for repair. After the first qualifying attempt, start no retry, probe, or reconnection for that identity in this idea, including protected roles. Common admission enforces this across steps, prompts, runs, restart, policy downgrade/opt-out, recovery, and blocked membership batches. SDK retries before terminal observation remain outside this boundary. Scope is one agent in one idea. Provider/model/gateway labels prove no shared account; peer inference and machine caches are deferred.
    - **Private zcode capture.** Default off; only owner machine configuration enables it, never ideas/prompts.
      Capture failed-invocation stderr after termination, without provider calls. Keep scrubbed provider-error framing/fields only.
      Remove credentials, authorization, cookies, prompts, requests, and unrelated responses before storage. Uncertain scrubbing writes nothing.
      Store in `~/.parley/captures/zcode/`: directories 0700, exclusive files 0600, no symlinks.
      Caps: 256 KiB/file, 2 MiB total, seven days. Each use deletes expired files, then oldest files to fit.
      Mark removals `[REDACTED]` and caps `[TRUNCATED]`. Disable stops new captures. Owner purge/directory deletion gives immediate cleanup.
      No idle deletion is guaranteed. Captures grant no authority or grammar expansion; lost required framing means incomplete evidence.
      The follow-up's provenance/completeness review still applies.
    - **Legacy quota predicate (unchanged).** Require a failed invocation (nonzero exit or structured terminal provider error), no valid completed artifact and no later batch success. Native provider-error provenance needs CLI behavior/source plus positive/adversarial fixtures; unsupported adapters are diagnostic-only. is_error, assistant quotes or tool output are not provider proof, even with an unrelated later failure. **Owner-ratified zcode exception (2026-10-04):** instead allow a nonzero root exit, no valid artifact/later success, terminal zcode turn-failure line and stderr responseBody JSON. Require provider records, ALL HTTP429, ALL explicit "Limit Exhausted" or exhaustion below, ALL with machine reset_at/retry_after, agreeing on class/reset within one second and ≥60min. Missing/mixed/malformed/contradictory records gate. This zcode-only exception accepts subagent error accompanying unrelated root failure; other adapters need native provenance. Quoted prose is not a provider record; recorded positive stderr/adversarial fixtures remain required. Exhaustion must name account credit/quota or a reached/exhausted usage allowance. Stated reset must be ≥60min; short/past/unparseable/contradictory resets gate, never become unknown. A timezone-free clock supplements complete RFC3339 Z/offset or numeric seconds retry_after/Retry-After only. ALL decisive values (including reset-after durations) agree within one second; clock matches an offset -12:00..+14:00 in 15min steps; retain raw text. Missing/discarded machine reset, unmatched/display-only reset or contradiction gates. Without reset only explicit account exhaustion or a reached ≥24h allowance (daily/weekly/monthly) qualifies; hourly/N-hour <24h requires qualifying reset. Bare429, generic quota exceeded, bare credit balance, 5xx/reset timer, long Retry-After alone, 400/auth/hang/watchdog do not qualify. Gateway-pool wording needs cause evidence; generic provider classification stays separate (bare503 cannot be excluded with --yes).
    - **Batch and floor.** `parley run` settles the exact kickoff batch before the first authoritative prompt/list/manifest; standalone preflight only reports. Mid-idea settlement uses saved enabled scope after ALL writers stop, before dispatch/signoff/close. Apply all eligible candidates together or none, independent of order. Require two distinct usable non-facilitators. V3 requires one usable organizer or implementer holder; participants are optional. A declared facilitator never counts, including participation or implementation takeover. Participant-failure policies require positive execution or validated phase evidence, including designee/pin; unresolved failures and role-only seats do not count. Legacy policies protect facilitator, designee, pin, and started consensus/FINAL/review-consensus drafters. Their failure blocks the batch. An undeclared legacy organizer must hold a protected role or declare facilitator. A global default before its pin stays unchanged. Designee/pin failure uses Phase 5's three-exit gate, except v2 exhaustion succession below.
    - **V2 succession.** Freeze original participant order and organizer identity at kickoff. `organizer:` names an ordinary participant organizer. Otherwise, `facilitator:` supplies it. Conflicts block; `author: user` supplies no identity. The initial implementer may be unresolved. Before the first transition, resolve Phase 5's existing chain and bind its identity/source. Unresolved affected roles block succession; ordinary participant loss can proceed. Malformed/conflicting authority still blocks. Only exhaustion removes protected roles in v2. Protected transient failures keep legacy gates. Settle all losses before selection: organizer loss transfers organization to the implementer; implementer loss transfers implementation to the organizer. Both losses transfer both roles to the first remaining original participant. One holder of both counts as both losses. Ordinary participant loss transfers neither role. The facilitator implementation restriction yields to this order. The selected counterpart/first participant needs positive usability. Never skip an unusable selection or choose a new roster identity. A frozen organizer outside membership permits a role-only transition. If that frozen facilitator takes implementation, append it to current membership as a known/required signer. This sole automatic membership addition supplies no floor seat or independent review. Typed `role_transition.v1` history binds before/after membership and roles, source hashes, evidence, and one active handover pointer. Validated history outranks retired pins/designations. Never fabricate `implementer_reassigned` confirmation. Preserve predecessor bytes. The successor writes `role-handover/<transition-id>.md` under Phase 5's handover contract. Until validation, admit only its selected author's handover action. Complete shared drafts stay, including unsigned drafts. Missing drafts use current eligible selectors. Structurally valid incomplete shared drafts without signoffs may move byte-exactly to a recorded archive. Bind original path, author, hash, and archive before successor authorship at the canonical path. Any signoff, malformed identity/frontmatter, or truncated syntax blocks partial-draft recovery. Participant rounds/reviews never move. Closed FINAL and execution records stay frozen. The CLI enforces supervised actions; an external organizer must follow the protocol itself.
    - **Review gates.** Before commit, re-evaluate reviewer count, LE-7/LE-11, independent goal check, model diversity, and strict_gate. A successor cannot review its own code. Its prior findings stay binding; require fresh independent current-tree evidence. One reviewer suffices only when immutable history proves the latest automatic membership transition reduced ≥2 independent reviewers to exactly one. After must equal current membership. Before and After contain the sole reviewer and, without succession, the same implementer. For validated succession, count each set without its own implementer/facilitator. The successor belongs to After. Only the frozen-facilitator exception permits the successor's absence from Before. Every removed identity needs exact typed `participant-failure.v1`, v2 `provider-exhaustion.v1`, or legacy evidence: `quota.named-reset-ge-60m.v1`, `quota.account-exhausted-no-reset.v1`, `quota.allowance-ge-24h-no-reset.v1`. Retain each rule's provenance/reset constraints. A settled prospective decision supplies the same precommit proof, without committed exclusion authority. Policy-only revisions preserve cause; later manual/owner membership changes invalidate it. Markers, manual exclusions, arbitrary rules, stale causes, missing/corrupt/pending history, and two-person-by-design ideas earn no exception. Implementer/reviewer models must be known and distinct in the run snapshot, even with diversity disabled. Trim and compare case-insensitively; empty/unknown/cli-default and absent snapshots cannot qualify. Unbound/unreported model values supply configured authority, not observed-model proof. Re-derive this shared condition at precommit, review, review consensus, goal check, and close; writable gate metadata supplies no authority. Only the numeric minimum changes. Keep signer duties, applicable protection, floor, reservations, retained dissent/findings, and current-tree AC evidence. Strict review remains fresh, independent, full-scope, and zero-findings, including NITs. The same reviewer may goal-check in a fresh process. In v3, zero reviewers suffice when the same proof shows automatic exclusion removed every independent reviewer. That close needs green checks and current-tree AC evidence. It records `independent review: none`, never a pass. The driver hands that close to the organizer. Without eligible succession/floor/review, escalate once with candidates, evidence, arithmetic, and owner options: an eligible model-diverse reviewer process (recommended), attended evidence-backed continuation, or pause/abandon. Select no substitute or waiver automatically. Standing owner authority can support attended continuation; §1 stays unchanged.
    - **History and recovery.** Immutable kickoff/revisions distinguish current and known membership; kickoff drops never became known signers.
      Current members control dispatch/await/required signers. Never subtract markers or rewrite run.created/artifacts.
      Retain §5 obligations, partials, and earlier incomplete/failure records. Only validated survivor artifacts permit transition-bound terminal re-evaluation.
      Before checked-durable commit, bind idea/run, prior revision, Before/After, attempts, policy/scope/trigger, evidence, and role transition.
      Saved enabled mid-idea scope serializes each driving run for its lifetime; competitors serialize/refuse.
      Policy-off, unrecorded legacy, and kickoff-only driving stay unchanged.
      Reconcile prompt/manifest/consumers/evaluation before dispatch/signoff/close. Recover pending commits; missing/contradictory/truncated authority blocks.
      Read-only status/wait/brief agree on membership/drops/pending state without repair. Recovery never changes history or resolves foreign/unknown writers.
      Other organizer failover and replacement agents remain outside this rule.
    - **Notice and return.** Markers show label, rule, UTC reset/unknown, scrubbed raw reset, transition/date, never "confirmed".
      One idempotent non-blocking notice per applied batch lists IDs, reasons, hints, survivors, gates, and takeover.
      Create missing inboxes safely. Blocked-kickoff delivery failure prints the decision to stderr; crash replay uses existing receipts.
      Preserve owner-edited/archived copies. Delivery failure is diagnostic, not rollback or delivery proof; unavailable storage has no exactly-once guarantee.
      Later failed batches retain history and get their own decision. Reduction is not wait exit4; wait refreshes membership.
      Participant-failure/provider-exhaustion drops are permanent through kickoff, revision, opt-out/downgrade, recovery, and catch-up.
      Dropped authors cannot sign or withdraw. Retained dissent needs a quoted owner ruling in the next artifact or abandonment/v2.
      Only the next idea probes afresh. Legacy quota rejoin needs owner confirmation, never a timer.
      Its notice may suggest authorized relaunch at known reset+5min (provider estimate). Permanent dropout has no reset/relaunch suggestion.
  - **Re-including** an eligible legacy-excluded agent requires explicit user confirmation;
    participant-failure dropout cannot rejoin this idea (§5).
  - Excluding the last non-facilitator still requires the §1 user-authorized solo
    exception; the facilitator stops rather than silently going solo.
  - The quorum **locks once Phase 0 completes**, except the recorded versioned automatic exclusion above;
    every other mid-idea unavailability falls to §5 and the runtime watchdog, downgrading to the
    same per-idea, user-confirmed waive.
  - **Designated implementer.** When the launched idea designates an implementer
    (`implementer:` in `00-prompt.md`, or the standing `[defaults].default_implementer`),
    the designee's ping result is what §4 Phase 5's availability rules read: except v2 exhaustion succession above, a per-idea
    designee failing the ping gates a Phase-5-reaching run behind the recorded three-exit
    confirmation; a global-default designee failing it is surfaced as a one-line notice and
    dispatch falls through to the default chain — there is no gate at that layer.

Section 9.0 v2 exhaustion succession can transfer implementation to a declared facilitator. Otherwise, declaring `facilitator:` makes the pure organizer this idea's default: participants own drafting, implementation, and code verification while the facilitator reads their verdicts and validator output (`facilitator_participates: true` restores full participation).

Then proceed with the per-agent session-start checklist:

1. Obtain official-launch context (runner, interactive or skill-facilitated) from the
   shared `parley protocol packet` renderer. Retain `context_mode`, `source_sha256`,
   `packet_sha256`, `fallback_reason`. Authority is the live source-role file or a
   consumer's verified core + lock + overlay, never a bundled snapshot. Default `full`
   means read it all. Experimental opt-in `packet` contains verbatim applicable blocks
   plus a complete omission index; read omitted source when its triggers apply.
   `full-fallback` means read the complete live authority and record the visible reason.
   `refused` (e.g. unprovable authority or secret detection), or missing attestation,
   stops the launch: resolve and re-render or report the blocker. Never substitute
   bundled, cached, stale or hand-excerpted text or continue unattested. Only an
   unreachable renderer permits direct full-live-source reading with a recorded
   `full-fallback` reason; refusal is not unavailability. In every mode note `Transport:`
   and check `meta/protocol-changelog.md`. The applicability map is protocol (§7).
   A facilitator may request `parley protocol packet --audience facilitator`: an opt-in,
   verbatim, omission-indexed view that never cuts below the never-cut floor; after
   compaction it may re-orient from the computed `parley organizer brief` instead of
   re-reading SKILL.md and the full COOPERATION.md.
2. Read `parley-deck/inbox/` — filter for files addressed to you or `all`, and read automatic quota-exclusion notices for the current idea. Escalations addressed `to: user` that are still unanswered are context you should respect: don't cut across an active user-direction request.
3. Read `parley-deck/ideas/*/00-prompt.md` — note open ideas where you are a participant.
4. **Transport B/C only:** check the project's open PRs/MRs for any titled `[<slug>] design` or `[<slug>] implementation` where you are a requested reviewer or assignee. If any is awaiting your action that maps to a missing file in §3, that file is what you owe — write it first.
5. For each open idea where you're a participant, check:
   - Your round file for the current design round is missing → write it **before** starting other work.
   - The active execution record exists and `review/round-0N/<your-id>.md` is missing → write your review file **before** starting other work.
6. Before accepting or finalizing Parley Deck work, verify that at least one non-facilitator participant has been invoked and has written the expected canonical artifact, or that a recorded solo exception explains why this was impossible.
7. Only then proceed to the user's current task.

## 11. Transport mechanics

Advisory: one blocking `parley wait` — a read-only verb that returns at the awaited phase boundary, on timeout, or loudly on degradation — is preferred over repeated short polls of `parley status`.

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

**Phase 5 — Implementation.** Create `feature/<slug>` in the target code repo. Implement, then commit the active execution record to `parley-deck/`. Use `[<agent>] <slug>: IMPLEMENTATION.md — ready for review`. Its `branch:` points at the code-repo branch.

**Phase 6 — Code review.** Each non-implementer commits their `review/round-NN/<agent-id>.md`. No native review surface — discussion lives in the review files.

**Phase 7 — Review consensus.** Drafter commits `review/consensus.md`; signoffs appended in follow-up commits.

**Phase 8 — Fix-up.** Push fixes to the code repo's `feature/<slug>`. Add the cycle section to the active execution record. Commit with `[<agent>] <slug>: IMPLEMENTATION.md fix-up cycle N — ready for re-review`. At completion, set its status to `complete`; commit `[<agent>] <slug>: IMPLEMENTATION.md — complete`. The code repo controls whether its branch merges.

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
3. Commit the active execution record on the implementation branch, in the same PR as the code. Use `[<agent>] <slug>: IMPLEMENTATION.md — ready for review`. Section 11.B branch protection covers its `ideas/<slug>/` path. Fill its `implementation-pr:` field in step 4.
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
2. Update the active execution record with the cycle section and frontmatter. Commit `[<agent>] <slug>: IMPLEMENTATION.md fix-up cycle N — ready for re-review`.
3. **Re-requests review** from the participants on the implementation PR (GitHub: dismiss stale reviews if needed and click _Re-request review_).
4. Bumps the PR label to `phase:review-round-(N+1)` or `phase:review-consensus` as appropriate.

Phases 6 → 7 → 8 iterate until a Phase 7 consensus lists **zero Agreed fixes**. When that consensus is reached:

1. Set `status: complete` in the active execution record. Commit `[<agent>] <slug>: IMPLEMENTATION.md — complete`.
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
- `implementation` — runs Phase 5–8 unchanged; produces the active execution record and code state.
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

Changing this section follows §7 (a meta-protocol-change idea). This section was ratified by idea `2026-06-02T12-07-14-meta-protocol-ch` (2026-06-02).

## 13. Retrospective optimization

Inspired by Retrospective Harness Optimization (RHO): periodically mine the deck's own history to **propose** improvements to the harness — but never apply them automatically. A retrospective pass is **advisory input only**; every change it proposes enters through the normal lifecycle (Phases 0–8), and any protocol-text change goes through a meta-protocol-change idea (§7) with human approval. RHO's single-model self-preference is replaced here by the deck's multi-agent quorum.

### 13.1 What a retro pass is

A retro pass selects a diverse set of hard past cases (the **coreset**), diagnoses recurring failure modes from existing artifacts, and drafts the proposed improvement directions as an ordinary idea's `00-prompt.md`. It produces no canonical round/consensus/review/final/implementation content and applies no edit. Its output is a hypothesis, not a finding.

### 13.2 Harness layers — what a proposal may change, and how

- **Protocol harness** — `COOPERATION.md` and any in-repo copy kept in lockstep by the drift guard. Changeable only via a meta-protocol-change idea (§7) with human approval; a retro pass must never edit it directly.
- **Runtime / shared harness — Repository Instruction Files** — tracked, shared files: skills, CLI behavior, helper scripts, docs, and repo-level instruction files. Changeable via an ordinary idea and the full review gate (a meta idea if the change alters protocol semantics).
- **Local harness — Agent Local Memory** — operator-local, non-canonical state (caches, ignored launch config, per-machine memory). A retro pass may report observations only; it must never canonicalize them or infer protocol rules from one operator's local setup.
- **Evidence corpus** — structured Parley Deck artifacts (`ideas/*` rounds, `review/`, `consensus.md`, `FINAL.md`, `IMPLEMENTATION.md`, `role-handover/`, run event logs) are the primary evidence. Raw session transcripts are secondary, off by default, and quarantined; include them only with recorded provenance. Within this corpus, a retro pass SHOULD surface **confident-error** signals — a dismissed `CRITICAL`/`MAJOR` finding, an unsupported assumption that shaped `FINAL.md`, or a missed risk that caused fix-up churn — drawn from the active execution record's Outcomes & Surprises sections and the `consensus.md` blind-spots fields. This is diagnostic evidence only: **never** a new review severity, a blame label, or a merge gate.

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

Humans or full quorum own decisions; automation can discover candidates.
This brake binds every automated, standing, or scheduled loop without a human driving the current session.
Examples include cron, CI, MCP triggers, and `parley loop tick`.

### 14.1 What an automated loop MAY do

- Discover commits, CI results, issues, signal files, or monitoring breaches; draft only Phase 0/1 prompts.
- Use non-active `status: candidate`, provenance, and `## Promotion`; claim no `participants:` quorum.
  A loop cannot staff a quorum it cannot convene. Section 12.11 uses the same watcher form.

### 14.2 What an automated loop MUST NOT do without a recorded human or full-quorum gate

- Staff participants, promote candidate to round-01, start deliberation, or start `parley run`.
- Implement, write code, or apply fixes.
- Land, merge, push, finalize FINAL, or close an idea.
- Modify the active roster in `parley-deck/agents.toml`; §2 is its generated view.
- Override, bypass, reopen, or redraft consensus or signoffs.

### 14.3 Fail-safe

Uncertainty permits only a candidate draft and stop, or inbox escalation (§8).
Disabled/misconfigured ticks and ticks without new signals write nothing and exit cleanly.
Promotion requires a human or explicit manifest action, recorded in the idea and mirrored canonically when phase changes.
Loop tooling follows this section but has a separate specification. It is disabled by default.
Even enabled tooling may at most scaffold candidate prompts. Authority: `automation-outer-loop` (2026-06-24).

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

### 15.6 Alternatives and correlated agreement

Unconditional on every track. This section carries the duty; the executing wording lives in the
round prompt templates. Only (a) is machine-validated today — (b) and (c) bind by discipline, and
this sentence says so rather than implying a gate that does not exist.

(a) `## Existing alternatives` in round 1: the mechanisms the proposal builds by hand, and for each
what the toolchain already ships, with a locator. A scoped null names the sources consulted.

(b) `consensus.md` records that unanimity among related models is a shared prior, not independent
evidence, and what would make the agreed position wrong. `FINAL.md` states where nominally
independent proposals are one family.

(c) `## Alternatives disposition` in `consensus.md`: an `ALT-` id and an adopt or reject with the
decisive reason for each alternative. `FINAL.md` may not contradict a recorded adoption; a
contradiction blocks signoff and escalates to the owner. The scanner never auto-halts.

### 15.7 Per-track binding

| Rule | `fast` | `standard` | `deliberation` |
| --- | --- | --- | --- |
| 15.1 scope / no self-verdicts | yes | yes | yes |
| 15.2 provenance | yes | yes | yes |
| 15.3 conflicts | yes | yes | yes |
| 15.4 exemption claims | yes | yes | yes |
| 15.5 procedural calls provisional | yes | yes | yes |
| 15.5 drafter position changes | yes (in collapsed `FINAL.md`) | yes | yes |
| 15.6 alternatives & correlated agreement | yes | yes | yes |

## Appendix B — ASD-STE100 output text

**Authority and access.** ASD-STE100 Issue 9, January 2025, is the default standard for new English protocol prose. This appendix is its required working summary. For protocol decisions, this summary is binding. The external standard does not override protocol authority or the exemptions below.

The official download page identifies Issue 9 as current on 2026-10-13: https://www.asd-ste100.org/STE_downloads.html#article02-2l. Request the free official standard there. The official FAQ is https://www.asd-ste100.org/STE_faq.html.

This summary uses original words. It does not contain the copyrighted dictionary or replace the full standard. Do not copy or redistribute the dictionary or long passages from the standard. A summary or an automated check cannot certify full conformance. Consult the full standard for vocabulary disputes and any full conformance claim.

**Core rules.** Parley adopts these limits as its working rules:

- Limit each procedural sentence to 20 words. Limit each descriptive sentence to 25 words.
- Use at most six sentences per paragraph. Give each paragraph one subject.
- Give one instruction per sentence. Use the imperative for procedures.
- Use active voice. Descriptive text can use passive voice when the actor is unknown.
- Use simple present, simple past, simple future, or imperative forms.
- Do not use an `-ing` form as a verb. Permitted nouns and adjectives can end with `-ing`.
- Use approved words with their approved meanings and parts of speech. Do not invent dictionary approval or rejection.
- Use technical names and technical verbs only where the standard permits them. Define project terms and use each term consistently.

**Scope and exemptions.** Apply these rules to new English prose in rounds, consensus, FINAL, IMPLEMENTATION, reviews, signoffs, inbox notes, briefs, mirrors, and commits. They also apply to other new English output under this protocol.

Preserve verbatim quotations from the owner, sources, and other agents, including quotations in another language. Preserve code, commands, paths, identifiers, URLs, log and error excerpts, schema keys, and all frontmatter. Preserve required headings, verdict tokens, and signoff syntax. Preserve mechanically generated text and validator output. Keep each exempt span exact; apply the rules to its surrounding explanation.

Agent-authored prose is not exempt merely because an agent generated it. Non-English chat with the owner remains outside the English file rule. The prose policy changes no source, evidence, ownership, or language requirement beyond section 6.6.

**Default and exception.** The default is on. The idea author can set `ste_output: false` in `00-prompt.md` at kickoff and state an English reason there. Only an explicit false setting disables the default. Absent, true, empty, or unknown values retain STE.

After kickoff, a change needs owner direction or participant consensus in the next canonical artifact. The exception affects only that idea's prose. It changes no other protocol duty. There is no new deck configuration key. Agents apply this writing instruction; the CLI does not parse the field or use it as a phase gate.

**Adoption.** New decks use this rule. Existing decks adopt it through their normal protocol update, subject to section 9.0. A rule-modifying consumer sync needs user confirmation. A newer CLI or installed skill does not override an older live authority.

After adoption, apply the rule to every new artifact, including artifacts for open ideas. Apply it to newly authored prose in a living artifact. Do not rewrite existing text, signatures, closed artifacts, or old protocol prose.

**Review.** Cite the exact new text and the applicable rule when you give feedback. Pure prose-style feedback is advisory, outside the fixed-severity findings list. It cannot block a phase or a strict-gate close. Defects in technical meaning, evidence, or correctness still follow the existing finding and gate rules. Do not hide those defects as style feedback.

This release adds no prose linter, executable check recipe, or dictionary checker. Any mechanical prose check must remain advisory and skip exempt content. It cannot replace independent review.

Before you publish new prose, do this manual review:

- Count the words in each non-exempt sentence and the sentences in each paragraph.
- Remove ambiguity without a change to technical meaning.
- Confirm that quotations and required syntax remain exact.
- Use the full standard for a vocabulary dispute; state any unverified limit on your claim.
