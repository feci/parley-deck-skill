---
name: parley-deck
description: "Run Parley Deck multi-agent idea, implementation, review, or consensus workflows through local CLI agents, using defaulted or user-overridden transport: local files, GitHub PRs, or GitLab MRs. Use when a user wants a task, design, implementation plan, or code review to be independently analyzed by multiple headless or interactive agents according to parley-deck/COOPERATION.md, with each participant writing its own canonical artifacts under parley-deck/ideas/."
---

# Parley Deck

## Core Rule

Act as the facilitator agent. Every participant writes its own protocol artifact, including participants invoked headlessly through local CLIs. The facilitator prepares directories, discovers agent capabilities, prompts agents, and verifies outputs; it must not proxy-write another participant's round, review, or signoff content as the normal path.

First obtain and read the protocol context as specified in **Required Protocol Context** below. Follow the resolved authority's active transport, roster, phase rules, and English-only rule for every file under `parley-deck/`.

## Non-Solo Requirement

A request to use `parley`, `parley-deck`, or this skill ALWAYS means a real multi-agent workflow with other available models or agents. Parley Deck is never satisfied by one agent working alone as a solo checklist, solo review, or solo process framework.

If at least one other participant or CLI agent is available, the facilitator MUST invoke other agents. Each participant MUST create its own canonical artifact. The facilitator MUST NOT claim "Parley Deck was used" unless other participant artifacts exist, or the protocol explicitly records why multi-agent execution was impossible.

If no other agent can be invoked because of auth, CLI, timeout, permissions, or tooling failure, the facilitator MUST stop before merge, finalization, or claiming completion and report the blocker to the user. The facilitator may continue only if the user explicitly authorizes a solo exception, and that exception MUST be recorded in an inbox/protocol note before work continues.

## Required Protocol Context

Do not run this skill from the abbreviated workflow alone. For an official project launch,
obtain the protocol context and attestation from the shared CLI renderer before starting:

```bash
parley protocol packet --dir <project-root> --phase <0..8> --track <track> --idea <slug> --json
```

Read the emitted `body_path` and record `context_mode`, `source_sha256`, `packet_sha256`,
and `fallback_reason` (absent or empty when no fallback occurred) in the participant's own artifact. Use the actual phase, track and
idea; pass applicable `--flag` values (`strict_gate`, `auto_implement`, `pipeline`,
`protocol_change`). Full context is the default. `--optimize` is an explicit experimental
input for the ratified packet trial, not a default or a proven efficiency improvement.

- `full`: read the complete emitted context from the live resolved authority.
- `packet`: read every included block and the omission index; follow its triggers to read
  the full source whenever an omitted section becomes relevant.
- `full-fallback`: read the complete live authority and retain the visible fallback reason.
- `refused`: stop that launch, resolve the authority or secret-detection problem, and
  re-render. Never replace a refusal with a bundled snapshot, cached text or hand excerpt.

If the renderer is unreachable (for example, an older CLI without this command), read the
full live `parley-deck/COOPERATION.md` and record `context_mode=full-fallback` with that
reason. A reachable renderer's refusal is not unavailability. Any other renderer failure
that produces no attestation (including authority or I/O errors) also stops the launch:
resolve the error and re-render; do not reinterpret it as permission to use unattested text.
If no live protocol is
available, stop the project launch and report the missing authority. The bundled
`references/COOPERATION.md` is a portability/bootstrap reference only; it cannot substitute
for the live authority of an official launch. The live applicability map
`parley-deck/meta/packet-applicability.yaml` is protocol and changes follow §7.

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

5. Discover candidate agents generically. Do not assume any fixed vendor, model family, or CLI command. Use this order:

   - User-provided agent list in the current request.
   - `PARLEY_HEADLESS_AGENT_CONFIG` pointing to a JSON config file.
   - `parley-deck/meta/headless-agents.local.json` (or `parley-deck/agents.toml`) when present — the **per-project override**.
   - `~/.parley/agents.toml` — the **user-global central default** (each agent's model + reasoning), created by `parley init` and inherited by every project unless the deck overrides it.
   - Active agent IDs and workspace hints in `COOPERATION.md`.
   - If still unclear, ask the user which installed CLI commands should be considered.

   Precedence is low-to-high: built-in defaults → `~/.parley/agents.toml` (central) → project deck config → `PARLEY_HEADLESS_AGENT_CONFIG`. The deck overrides the central default; a field the deck leaves unset falls through to the central value.

   `~/.parley/agents.toml` may also carry a `[defaults]` block of project-wide policy knobs: `ping_tier` (§9.0 liveness ping, e.g. `hosted-pong` or `none`), `preferred_transport` (the transport `parley init` seeds), `roster_change_policy` (e.g. `confirm-breaking`: auto-add newly available agents, but require user confirmation before dropping or breaking the roster), and `speed`/`timeouts`. Honor `roster_change_policy` when adjusting the roster after the liveness ping; a deck's `parley-deck/agents.toml` overrides any of these per-project.

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

## Quota auto-exclusion notices

When the CLI records a §9.0 quota auto-exclusion, read its owner notice and the current
`participants:` plus immutable membership history before continuing. The CLI's §9.0 evidence predicate
(including the bounded, owner-ratified zcode stderr exception), saved policy/scope, fixed floor and
role gates authorize the change; an organizer never infers exhaustion from logs, model prose, tool output, elapsed time or disagreement.
Standalone `parley preflight` reports candidates only. A pending transition or integrity/floor/role
escalation blocks progress; let a mutating driver reconcile pending state before dispatch or signoff.
Read-only status, wait and organizer brief do not repair records.

Never silently re-include an excluded agent, subtract `excluded:` markers to derive quorum, or edit
`agents.toml` to implement a per-idea exclusion. Required signers use current membership; historical
signers and their filed vetoes, disputes and findings retain their force. Re-evaluate review, diversity,
strict-gate and goal-check requirements after a transition. Re-inclusion is owner-confirmed; the next
idea probes readiness again. A reset hint is a provider estimate, never permission to schedule a retry.

For a recorded policy-on idea, use `parley quota revise --dir <root> --idea <slug> --run <run-id>
--request <request.json>` for an owner-confirmed membership or scope change. Bind the request to the
verbatim ruling and its committed path/blob digest, so permitted inbox archival or deletion preserves
the authority. Follow the existing catch-up requirements; a returned author must explicitly withdraw
its own retained veto. Knob-off ideas keep their ordinary recorded confirmations.

`parley quota recover --dir <root> --idea <slug> --run <run-id>` reconciles mutable projections and
receipts from validated history. It does not authorize changing immutable history or taking another
host's lease. A foreign-host or unknown-boot lease needs owner-visible recovery; a PID absent on this
host is not evidence that the holder is dead.

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

- Verify the user selected or confirmed the transport used for the workflow.
- Verify facilitator, participants, model, thinking/reasoning level, speed profile, and timeout policy were either selected by the user or defaulted according to Selection Checkpoint.
- Verify Parley Deck did not collapse to a solo facilitator run: at least one non-facilitator participant was invoked when another agent was available.
- Verify each invoked non-facilitator participant created its own canonical artifact in the expected path before claiming a round, review, consensus, or finalization is complete.
- If no non-facilitator participant artifact exists, verify the protocol records why multi-agent execution was impossible and that the user explicitly authorized any solo exception before merge/finalization.
- Verify each headless agent launch used explicit, discovered, or defaulted model/profile/effort settings and sufficient timeout.
- Verify every participant has exactly one file per completed round.
- Verify every participant file was written by that participant's invocation; otherwise stop and report a blocker.
- Verify any `roles:` metadata is advisory only and did not change quorum, ownership, signoff weight, or drafter eligibility.
- Verify any internal helper/subagent use is represented only through the owning participant's canonical artifact, was not counted as a non-facilitator participant, and did not create canonical files under a helper identity that is absent from `participants:`.
- For non-trivial implementation, verify `IMPLEMENTATION.md` includes a plan/checklist before or alongside the implementation summary.
- Verify protocol files under `parley-deck/` are in English.
- Verify the facilitator did not overwrite another agent's file.
- Summarize which transport and CLIs were used, which models/thinking levels were selected, which rounds ran, where artifacts were written, and whether consensus/finalization was reached.
- Record important orchestration issues in `parley-deck/inbox/<facilitator>-to-all_<slug>_<topic>.md` when they affect future agents.

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
