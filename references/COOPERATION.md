# COOPERATION.md — Multi-Agent Cooperation Protocol

**Workspace:** `parley-deck`
**Parley deck:** `./parley-deck/`
**Transport:** `github-pr`
**Created:** 2026-05-09 (initial draft)
**Status:** Living document — any agent may propose changes via a dedicated idea (see §7).

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

The roster is project-specific. Maintain it as a table here:

| Agent ID       | Workspace dir                       | Role          |
| -------------- | ----------------------------------- | ------------- |
| `<agent-id-1>` | `<workspace-dir-or-transport-ref>`  | `participant` |
| `<agent-id-2>` | `<workspace-dir-or-transport-ref>`  | `participant` |
| ...            | ...                                 | ...           |

**Agent ID conventions:** short, stable, kebab-case, unique within the project. Suffix with a number if you may run multiple instances of the same family (e.g. `<family>-1`, `<family>-2`). Once chosen, an agent ID does not change for the lifetime of the project.

In transports B and C, each agent should also have a corresponding host account (GitHub user / GitLab user) so that PR/MR reviews and approvals carry their identity. Map the agent ID to the host handle in this table:

| Agent ID       | Host handle    |
| -------------- | -------------- |
| `<agent-id-1>` | `@<host-user>` |
| ...            | ...            |

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
    │       ├── FINAL.md             ← the authoritative artifact (plan / spec / ADR)
    │       ├── IMPLEMENTATION.md    ← created in Phase 5; tracks branch + fix-up cycles
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

### Phase 0 — Kickoff

The agent (or user) who starts the idea creates `ideas/<slug>/00-prompt.md`:

    ---
    idea: <slug>
    author: <agent-id or "user">
    created: YYYY-MM-DD
    participants: [<agent-id-1>, <agent-id-2>, ...]
    roles:                         # optional; advisory per-idea lenses only
      <agent-id-1>: <lens-or-role>
      <agent-id-2>: <lens-or-role>
    deadline: YYYY-MM-DD        # optional
    status: round-01            # round-N | consensus | final | abandoned
    ---

    ## Problem / idea
    ## Constraints
    ## Non-goals

After creating `00-prompt.md`, the author creates an empty `round-01/` dir. The idea is now "open". _(Transport-specific: see §11 for how this is published — a commit, a draft PR, a draft MR.)_

The `participants:` list MUST include at least one non-facilitator participant when another agent can be invoked. Optional participant selection MUST NOT silently collapse to only the facilitator. If discovery finds no invokable non-facilitator participant, the author MUST record the blocker and obtain an explicit user-authorized solo exception before continuing.

Keep `participants:` as a list of agent IDs. If the idea benefits from distinct perspectives, add an optional `roles:` map keyed by participant ID. Roles are free-form advisory lenses for this idea only; they do not change quorum, signoff weight, artifact ownership, drafter eligibility, or roster membership.

### Phase 1 — Round 1 (independent analysis)

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

When discussion has converged, an agent creates `ideas/<slug>/consensus.md`:

    ---
    idea: <slug>
    drafted-by: <agent-id>
    date: YYYY-MM-DD
    ---

    ## Agreed decisions
    ## Agreed trade-offs
    ## Open items deferred to implementation

    ## Signoffs
    <!-- Each agent APPENDS their signoff block. Do NOT edit others' blocks. -->

Every listed participant then **appends** their own signoff block:

    ### Signoff: <agent-id> — YYYY-MM-DD
    Status: ✅ ACCEPT           (or 🟡 ACCEPT-WITH-RESERVATIONS, or ❌ BLOCK)
    Notes: <required if 🟡 or ❌>
    Counter-proposal (required if ❌): <link or inline>

**Consensus rules:**

- ✅ from _every_ active participant = consensus reached → Phase 4.
- Any ❌ → new round; the blocker's counter-proposal is the starting point.
- 🟡 is acceptable _if_ the reservation is logged as "open items deferred to implementation" and no one upgrades it to ❌.
- Agent silent past deadline is treated as ✅ — but only if they were pinged via `inbox/` first.

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
    ## References
    - Consensus: ./consensus.md
    - Rounds: ./round-01/, ./round-02/, …

`FINAL.md` is the **single source of truth**. If later invalidated, open a new idea (`<slug>-v2`) — do **not** edit the old FINAL. Update `00-prompt.md` `status: final` and optionally move the dir to `ideas/archived/<slug>/` after implementation.

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

The implementer publishes `IMPLEMENTATION.md` (commit/PR/MR — see §11) and signals "open for review".

If the idea is design-only (no code artifact), Phase 5 may be reduced to a brief `IMPLEMENTATION.md` describing where the design output was applied. Phases 6–8 still apply unless the participants agree in `consensus.md` that review is not required.

### Phase 6 — Code review rounds

Once `IMPLEMENTATION.md` is published, every active participant **except the implementer** writes `ideas/<slug>/review/round-01/<agent-id>.md`:

    ---
    agent: <agent-id>
    idea: <slug>
    review-round: 1
    date: YYYY-MM-DD
    reviewed-commit: <sha>
    ---

    ## Summary            (1–3 sentences on overall health of the implementation)
    ## Findings
    ### [CRITICAL] <short title>
    <what is wrong, why it blocks, concrete suggested fix>
    ### [MAJOR] <short title>
    ### [MINOR] <short title>
    ### [NIT] <short title>
    ## Open questions

**Severity tags** are fixed: `CRITICAL` (must fix before merge), `MAJOR` (should fix before merge), `MINOR` (nice to have), `NIT` (stylistic / optional). The implementer does not write a review-round file — they respond in Phase 7.

If there is no invokable non-implementer reviewer, the implementation MUST NOT be merged or marked complete under Parley Deck. The implementer MUST report the blocker and continue only after either another reviewer is added or the user explicitly authorizes a recorded solo exception.

Rules for later review rounds mirror Phase 2: never edit another reviewer's file, respond in your own next-round file with `responding-to:` listing prior review files, address every other active reviewer explicitly.

_(Transport B/C: each review file is mirrored by a native PR review on the implementation PR/MR — see §11.)_

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

    ## Signoffs
    <!-- Each active participant (implementer included) APPENDS their signoff block. -->

Signoff blocks use the same `✅ ACCEPT / 🟡 ACCEPT-WITH-RESERVATIONS / ❌ BLOCK` format as Phase 3. All ✅ → proceed to Phase 8. Any ❌ → new review round; the blocker's counter-proposal is the starting point.

### Phase 8 — Fix-up

The implementer applies the **Agreed fixes** from `review/consensus.md` on the same branch. On completion, they append a new section to `IMPLEMENTATION.md`:

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
- A valid Parley Deck idea normally has at least two active participants. A one-participant idea is valid only when a user-authorized solo exception is recorded with the auth/CLI/timeout/tooling blocker that made multi-agent execution impossible.
- An agent joining after round 1: either catch up (read priors, write late round-1, join from round 2) or decline (❌ NON-PARTICIPANT note in consensus).
- If an agent is inactive > 2 rounds and the idea has a deadline, others may drop them from quorum — but only after a `inbox/<from>-to-<missing>_<slug>.md` ping.
- For ideas with **only two participants**, the same rules apply unchanged: both must sign off ✅ for consensus, and disagreement still requires counter-proposals rather than tie-breaking. If a tie cannot be broken in rounds, escalate to the user (§4).

## 6. Conflict-avoidance mechanics

1. **One file per agent per round** — filename deterministic (`<agent-id>.md`), no collisions.
2. **`consensus.md` signoffs are append-only.**
3. **Never edit another agent's file.** If it's factually wrong, raise in next round with `@<agent-id>`. Exception: direct user instruction (e.g. a mandated translation or migration) overrides this rule — the editor must log the override in the commit message and append a trailing HTML comment in the file identifying the change and its authority.
4. If referring to something outside `parley-deck/`, **copy the snippet** — agents may lack cross-workdir read access.
5. Before working on an idea, **re-read `00-prompt.md` `status:`** to avoid writing into a closed round.
6. **English only.** All content written to any file under `parley-deck/` MUST be in English. This covers round files, consensus, FINAL, inbox messages, meta docs, frontmatter values, and inline comments. In transports B and C, the rule extends to all PR/MR descriptions, review summaries, comments, and commit messages. Rationale: cross-agent interoperability and reviewability. If an agent needs to quote user input originally in another language, they translate it and note the original language in a trailing comment. _(Projects that explicitly need a different working language may override this rule in their own copy of COOPERATION.md, but it should be a deliberate, documented choice.)_

## 7. Changing this protocol

Open an idea under `ideas/meta-protocol-change-<topic>/` and run the full lifecycle (Phase 0 → Phase 4 at minimum; Phases 5–8 only if the change implies code work). The resulting FINAL.md supersedes this doc; the drafting agent updates `COOPERATION.md` in-place and logs the change in `meta/protocol-changelog.md`:

    ## YYYY-MM-DD — <short description>
    Idea: ideas/meta-protocol-change-<topic>/
    Drafted by: <agent-id>
    Summary: <1–2 sentences>

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

## 9. Session-start checklist for every agent

1. Read `parley-deck/COOPERATION.md` — note the active `Transport:` and check `meta/protocol-changelog.md` for updates.
2. Read `parley-deck/inbox/` — filter for files addressed to you or `all`. Escalations addressed `to: user` that are still unanswered are context you should respect: don't cut across an active user-direction request.
3. Read `parley-deck/ideas/*/00-prompt.md` — note open ideas where you are a participant.
4. **Transport B/C only:** check the project's open PRs/MRs for any titled `[<slug>] design` or `[<slug>] implementation` where you are a requested reviewer or assignee. If any is awaiting your action that maps to a missing file in §3, that file is what you owe — write it first.
5. For each open idea where you're a participant, check:
   - Your round file for the current design round is missing → write it **before** starting other work.
   - `IMPLEMENTATION.md` exists and `review/round-0N/<your-id>.md` is missing → write your review file **before** starting other work.
6. Before accepting or finalizing Parley Deck work, verify that at least one non-facilitator participant has been invoked and has written the expected canonical artifact, or that a recorded solo exception explains why this was impossible.
7. Only then proceed to the user's current task.

## 10. TL;DR

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
4.  **Fill in §2 roster**: list every agent that will participate, with their workdirs, roles, and (for B/C) host handles.
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
