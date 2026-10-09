---
name: parley-deck
description: "Run Parley Deck multi-agent idea, implementation, review, or consensus workflows through local CLI agents, using defaulted or user-overridden transport: local files, GitHub PRs, or GitLab MRs. Use when a user wants a task, design, implementation plan, or code review to be independently analyzed by multiple headless or interactive agents according to parley-deck/COOPERATION.md, with each participant writing its own canonical artifacts under parley-deck/ideas/."
---

# Parley Deck

## Core Rule

Act as the facilitator agent. Every participant writes its own protocol artifact, including participants invoked headlessly through local CLIs. The facilitator prepares directories, discovers agent capabilities, prompts agents, and verifies outputs; it must not proxy-write another participant's round, review, or signoff content as the normal path.

First obtain and read the protocol context as specified in **Required Protocol Context** below. Follow the resolved authority's active transport, roster, phase rules, and English-only rule for every file under `parley-deck/`.

## Non-Solo Requirement

A request to use `parley`, `parley-deck` or this skill ALWAYS requires real multi-agent
work. Invoke available peers; each writes its own canonical artifact. A solo checklist
or review is not Parley Deck. Claim the workflow only with peer artifacts or a protocol
record explaining why multi-agent execution was impossible.

If no peer is invokable (auth/CLI/timeout/permission/tool failure), stop before merge,
finalization or completion and report the blocker. Continue only with an explicit user
solo exception, recorded in inbox/protocol notes first.

## Required Protocol Context

Obtain protocol context before an official project launch; the abbreviated workflow
alone is insufficient:

```bash
parley protocol packet --dir <project-root> --phase <0..8> --track <track> --idea <slug> --json
```

Read `body_path`. Record `context_mode`, `source_sha256`, `packet_sha256` and
`fallback_reason` (empty/absent without fallback) in your own artifact. Use the actual
phase/track/idea and applicable `--flag` values: strict_gate, auto_implement, pipeline,
protocol_change. Full context is default; `--optimize` is the explicit experimental
ratified packet trial, not default or proven efficiency.

- `full`: read the complete live resolved authority.
- `packet`: read every included block and the omission index; follow triggers to the
  full source when an omitted section becomes relevant.
- `full-fallback`: read all live authority and retain the visible reason.
- `refused`: stop, resolve the authority/secret-detection issue and re-render. Never
  substitute bundled/cached text or a hand excerpt, or continue unattested.

Only an unreachable renderer (e.g. an older CLI) permits directly reading the full live
`parley-deck/COOPERATION.md` and recording `full-fallback` with that reason. Refusal is
not unavailability. Any other failure producing no attestation, including authority/I/O
errors, stops the launch until resolved and re-rendered. Missing live protocol blocks
the project launch. Bundled `references/COOPERATION.md` is portability/bootstrap only,
never official-launch authority. The live `meta/packet-applicability.yaml` map is
protocol and changes follow §7.

## Automation Mode

This skill implements **manual facilitation**: an agent follows this skill, invokes other CLI agents, and verifies canonical files. It is not a deterministic A2A facilitator service by itself.

If the live protocol later contains an `Automation:` header, an `Automation write profile:`, or a section for automated orchestration, read that section before acting and apply it. If the live protocol and bundled fallback disagree, the live protocol wins.

## Startup Flow

1. Obtain and read the protocol context under **Required Protocol Context**, retain its attestation, and identify the current `Transport:` value and active roster.

2. Run the version and project sync check before accepting new work:

   - Prefer `parley-deck-skill status --target all --project . --json` when the command is installed.
   - Note the actual installer version, each installed runtime skill marker version, and `parley-deck/meta/version.json` state.
   - If metadata is missing/stale, run `parley-deck-skill sync-project --project . --dry-run --json` and ask before `--yes`.
   - If runtime skill copies are older than the installer, warn and suggest `parley-deck-skill install --target all --force` for managed installs.
   - If the command is unavailable, fall back to the manual hash comparison in the Protocol Drift Check section.

3. Run the session-start state check before accepting new work:

   - Read `parley-deck/inbox/` for messages addressed to the current agent, `all`, or unresolved `to-user` escalations.
   - Read open `parley-deck/ideas/*/00-prompt.md` files and note ideas where the current agent owes a round, signoff, implementation update, review, or fix-up.
   - For GitHub/GitLab transports, check the matching open PR/MR actions if tools and permissions are available.
   - If outstanding protocol work conflicts with the user's new request, surface it and ask which to handle first.

4. Use the active `COOPERATION.md` transport when it is set. If the project is new, the transport is still a placeholder, or the user starts a workflow without naming a transport, default to `local-dir` and mention the available overrides:

   - `local-dir` / files only
   - `github-pr` / GitHub Pull Requests
   - `gitlab-mr` / GitLab Merge Requests

5. Discover candidates without assuming a vendor/model/CLI: user list →
   `PARLEY_HEADLESS_AGENT_CONFIG` JSON → project `meta/headless-agents.local.json`
   or `parley-deck/agents.toml` → `~/.parley/agents.toml` → active protocol IDs/workspace
   hints → ask which installed CLIs to consider. Config precedence is built-in → machine
   → deck/local project → environment config; unset fields inherit. `parley init`
   creates the central per-agent model/reasoning defaults. Machine `[defaults]` also
   carries ping_tier, preferred_transport, roster_change_policy, speed/timeouts;
   deck defaults override. Honor roster_change_policy after liveness checks (e.g.
   confirm-breaking auto-adds available agents but asks before dropping/breaking roster).

6. For each candidate command, verify it is installed with `command -v <cli>` or an explicit configured path.

7. Build a capability matrix before starting a new idea, implementation, or review cycle. Show the matrix and the effective defaults, but do not block on optional choices. The only required startup answer is the task statement when it was not already provided. _(The one-time roster + per-agent model confirmation is a **bootstrap** step performed when the deck is first created — see "Transport Selection / deck bootstrap" — not a per-idea gate.)_

8. Verify that participant selection includes at least one non-facilitator participant when another agent or CLI is available. Optional selection MUST NOT silently collapse to only the facilitator. If no non-facilitator participant can be invoked, stop and report the blocker unless the user explicitly authorizes a recorded solo exception.

9. If a candidate agent is not in the roster, list the proposed stable agent ID in the default summary. Pressing Enter accepts that agent for the current workflow. If the user explicitly rejects roster expansion, run it only as a temporary observer or skip it. Rejecting every non-facilitator participant requires an explicit solo exception note before continuing.

10. Default external-backend disclosure approval is YES for the task brief and necessary repository/code context. Still redact obvious secrets and stop for explicit confirmation before sending credentials, customer data, private documents unrelated to the task, or other clearly sensitive material.

## Driver-First Operation (lean organizer loop)

Route the deliberation through the CLI driver instead of hand-launching participants:
`parley run` (start), `parley continue` (advance), `parley wait` (one blocking read),
`parley status` (state), `parley consensus` (signoff lifecycle), and
`parley preflight` (readiness). Hand-launching participants remains the recorded
fallback when the driver cannot do a step — record why in the idea; that gap is
evidence, not a silent path around the driver.

A deck may declare `facilitator:` in `00-prompt.md`. In such a declared-facilitator
run the default is the **pure organizer**: participants implement and verify code;
the facilitator reads their verdicts and validator output. The driver refuses the
declared facilitator as drafter, implementer, reviewer, or goal-done checker and
escalates rather than silently falling back; `facilitator_participates: true`
restores full participation. A deck without the field is untouched.

The lean loop after a compaction (or at any phase start): the computed
`parley organizer brief --idea <slug>` (never stored, deterministic over an
unchanged tree), the facilitator protocol view
(`parley protocol packet --audience facilitator`), and `parley status --idea <slug>`.
Do not re-read this SKILL.md or the full COOPERATION.md to re-orient.

`parley wait --idea <slug> --for round|consensus|review|implementation|any` replaces
poll loops: exit 0 boundary reached, 3 timeout (partial digest, outstanding agents
named), 4 a present-but-invalid artifact (validator reason verbatim) or a blocking
escalation/driver error that ARRIVES after the wait started, 1 usage/IO. An
escalation blocks only when its note belongs to this idea, is not `blocking: no`,
and is not answered/resolved; pre-existing qualifying notes, historical driver
errors, and to-user notes the wait could not evaluate (frontmatter unreadable, or
no `idea:` to match against) are reported as digest notes, never exit 4. Missing
artifacts keep waiting. With `--json`, stdout carries ONLY the machine-readable
envelope — `{"notes": [annotations], "digest": PhaseDigest}` (`notes` omitted when
empty) — on exits 0, 3 and 4; the terminal status line (`wait: boundary reached …`
/ `wait: timeout after …`) goes to stderr, and a usage/IO failure (exit 1) prints
its error to stderr with no envelope on stdout at all. Human (non-`--json`)
output is unchanged. The
PhaseDigest it prints is mechanically derived — treat any block / DISPUTED / unparsed /
adverse validity as the signal to open the RAW artifact and adjudicate there; the
digest never substitutes for canonical files (residual over-trust risk, accepted).

## Automatic exclusion notices

Read §9.0, current participants and immutable history. The historical
quota_auto_exclude boolean (machine → deck → idea, per-idea false opt-out) governs
both triggers. New ideas freeze participant-failure-v1/kickoff-and-mid-idea; saved
absent-trigger policies stay quota-only. Upgrade/resume never widens policy.
Standalone preflight reports only; only CLI evidence authorizes batch reduction.

New-trigger non-protected steps get original plus one retry after five seconds at
the same ceiling, including watchdog retry. Durable idea/agent/logical-step identity
prevents a third attempt across restarts/input/run changes. Child failures or invalid
own output qualify; valid BLOCK/disagreement wins. Cancellation, control-plane refusal
and shared-file tampering never qualify. Preserve partials privately; unresolved
writers/tampering stop for repair. Never infer failure from prose or elapsed time.

Require two positively usable non-organizers, including any designee/pin; roles alone
supply no seat. Re-evaluate all precommit gates. The §9.0 cause-derived exception permits
one independent reviewer only after validated latest automatic history (or the settled
prospective decision) proves a >=2→1 reviewer loss. Match Before/After and every removed
ID to valid typed failure/recognized quota evidence. Manual/marker-only exclusions,
stale causes, missing/corrupt/pending history and two-person-by-design ideas earn nothing;
later manual membership edits invalidate old cause. Policy-only revisions may retain it.
Known distinct snapshot models are mandatory even with diversity disabled; snapshot-only
native model identity is configured authority, not observation. Same reviewer may goal-check
in a fresh process, bounded by min(track 5/15/30m, positive checker timeout); absent track
means standard, malformed track refuses. Goal execution uses two durable attempts at the
same frozen ceiling, including protected checkers, without widening dropout authority.
Valid FAIL is final. Only the reviewer count changes: all current
signer, strict clean-round, reservations, dissent and current-tree evidence duties remain.
Unqualified cases retain attended owner options; select no substitute or wider waiver.

Eligible streaming participant-failure steps, including headless signoffs, use defaults
first 120s/stall 300s/heartbeat 60s; heartbeat is not activity. Reuse two attempts at the same
hard ceiling and only classified terminal failures after child cleanup. Honor explicit
window overrides/disables and buffering. Zcode/default Claude final-text output is buffered;
soft guards are disabled, hard bounds remain. Manual agents exec/interactive stay hard-only;
readiness 90s and other existing operation/track ceilings stay. Silence is not universal
hang evidence. Custom streaming args may explicitly override buffers_stdout.

Dropout is permanent for this idea through opt-out/downgrade/revision/catch-up, including
kickoff drops; next idea re-probes. Legacy quota return remains owner-confirmed. Retained
vetoes/disputes/findings bind; dropped authors cannot withdraw. Obtain a quoted owner
ruling or open v2. Never derive membership from excluded markers or alter agents.toml.
Current members are required signers; status/wait/organizer brief never repair state.

Pending transitions and floor/role/integrity gates block. Owner-bound quota revise
and stopped-writer recovery never erase permanent drops. Receipted notices include
kickoff replay; preserve owner copies and report delivery failure. Commands,
policy-off forms and legacy limits: `references/ROSTER_AND_PROTOCOL.md`.

## File Ownership Model

The canonical protocol artifact must be created by the agent whose ID appears in the file path or signoff block.

- The facilitator may create `00-prompt.md`, empty round/review directories, consensus drafts, `FINAL.md`, and orchestration inbox notes.
- A participant writes only its own `round-NN/<agent-id>.md` file.
- A reviewer writes only its own `review/round-NN/<agent-id>.md` file.
- A signer appends only its own signoff block to `consensus.md` or `review/consensus.md`.
- No agent edits another agent's file or signoff block.

For headless CLI participants, give the agent one exact output path and enough workspace-write permission to create that file. If the CLI cannot write the file, stop and report the blocker instead of silently writing the participant file yourself.

A participant may use internal helper mechanisms such as subagents, retrieval, tools, scratchpads, or additional model calls to produce its own artifact. Those helpers are not Parley Deck participants, do not satisfy the non-solo requirement, do not sign off, and do not own protocol files. Participant-spawned helpers MUST NOT create canonical round, review, consensus, or signoff files under a separate helper identity unless that identity is explicitly listed in the idea's `participants:` list. The named participant remains fully accountable for its own file and signoff.

## Escalation To User

Escalate when a decision depends on human-only judgment, when agents converge away from a considered position that matters, or when ambiguity blocks implementation/review.

Create:

```text
parley-deck/inbox/<from>-to-user_<slug>_<topic>.md
```

with frontmatter:

```markdown
---
from: <agent-id>
to: user
idea: <slug>
phase: round-NN | consensus | implementation | review-round-NN | review-consensus | fix-up
blocking: yes | no
date: YYYY-MM-DD
---
```

Include `## Question`, `## Context`, and `## What I need from you`. If `blocking: yes`, pause the escalating agent's work for that idea. When the user answers, quote the answer verbatim into the next round/review file under `## User direction`, then archive or delete the inbox escalation because the next round/review file becomes authoritative.

For non-escalation inbox handoffs, progress notes, or mid-round discoveries, keep the message lightweight. Any decision or position that affects a phase transition must be mirrored in the next canonical round/review file, `consensus.md`, `FINAL.md`, or `IMPLEMENTATION.md`; inbox messages are coordination aids, not substitutes for protocol artifacts.

## Quality Gates

Before reporting completion:

- Verify selected/confirmed transport and selected/defaulted facilitator, participants,
  model, reasoning/profile/effort, speed and timeout policy (Selection Checkpoint).
- Verify real multi-agent execution: at least one available non-facilitator was invoked
  and wrote its canonical artifact. Missing artifacts block round/review/consensus/final
  claims; an impossible invocation requires recorded reasons and an explicit user solo
  exception before merge/finalization/completion. Never call a solo checklist Parley.
- Verify every headless launch used discovered/selected/defaulted model/profile/effort
  and sufficient timeout. Check exactly one participant-owned file per completed round,
  expected paths and actual invocation authorship; no proxy writing or overwriting peers.
- Verify advisory roles changed no quorum/ownership/signoff weight/drafter eligibility.
  Internal helpers remain represented by their owner, supply no non-solo seat, and own
  no separate canonical artifact unless their ID is an explicit participant.
- Verify a nontrivial implementation's IMPLEMENTATION.md plan/checklist precedes or
  accompanies its summary; all protocol files are English and all phase gates hold.
- Summarize transport/CLIs, models/thinking levels, rounds, artifact locations and actual
  consensus/finalization state. Record future-agent orchestration issues in
  `inbox/<facilitator>-to-all_<slug>_<topic>.md`.

## References (on demand)

- `references/COOPERATION.md` — the upstream protocol snapshot (portability/bootstrap only).
  Replace its upstream project header and host mappings when bootstrapping, as Appendix A directs.
  The live authority of an official launch always wins.
- `references/HEADLESS_LAUNCH.md` — autonomous execution, headless agent
  configuration, timeout policy, and the generic CLI invocation contract.
- `references/ARTIFACT_TEMPLATES.md` — kickoff, round, cross-review,
  consensus/FINAL, and implementation artifact templates.
- `references/ROSTER_AND_PROTOCOL.md` — roster verbs and authority, the global
  core, drift checks, coverage checklist, transport bootstrap, commit conventions,
  capability discovery, selection checkpoint, recovery, protocol changes.
- `references/WORKED_EXAMPLES.md` — non-authoritative examples; use after the protocol.
- `references/compatibility.json` — packaged metadata schema; informational.
