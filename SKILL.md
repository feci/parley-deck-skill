---
name: parley-deck
description: "Run Parley Deck multi-agent idea, implementation, review, or consensus workflows through local CLI agents, using defaulted or user-overridden transport: local files, GitHub PRs, or GitLab MRs. Use when a user wants a task, design, implementation plan, or code review to be independently analyzed by multiple headless or interactive agents according to parley-deck/COOPERATION.md, with each participant writing its own canonical artifacts under parley-deck/ideas/."
---

# Parley Deck

## Core Rule

Act as the facilitator agent. Every participant writes its own protocol artifact, including participants invoked headlessly through local CLIs. The facilitator prepares directories, discovers agent capabilities, prompts agents, and verifies outputs; it must not proxy-write another participant's round, review, or signoff content as the normal path.

Always read `parley-deck/COOPERATION.md` first. Follow the active transport, roster, phase rules, and English-only rule for every file under `parley-deck/`.

## Non-Solo Requirement

A request to use `parley`, `parley-deck`, or this skill ALWAYS means a real multi-agent workflow with other available models or agents. Parley Deck is never satisfied by one agent working alone as a solo checklist, solo review, or solo process framework.

If at least one other participant or CLI agent is available, the facilitator MUST invoke other agents. Each participant MUST create its own canonical artifact. The facilitator MUST NOT claim "Parley Deck was used" unless other participant artifacts exist, or the protocol explicitly records why multi-agent execution was impossible.

If no other agent can be invoked because of auth, CLI, timeout, permissions, or tooling failure, the facilitator MUST stop before merge, finalization, or claiming completion and report the blocker to the user. The facilitator may continue only if the user explicitly authorizes a solo exception, and that exception MUST be recorded in an inbox/protocol note before work continues.

## Required Protocol Context

Do not run this skill from the abbreviated workflow alone. Load the full cooperation protocol before acting:

1. Prefer the live project file `parley-deck/COOPERATION.md`.
2. If the live file is unavailable, load the bundled fallback snapshot `references/COOPERATION.md`.
3. If both are unavailable, stop and ask for the protocol.

The live `parley-deck/COOPERATION.md` is canonical. The bundled reference is only a portability fallback for agents that receive the skill without the repository context.

## Skill Metadata

`SKILL.md` and `references/COOPERATION.md` are the vendor-neutral instructions for all agents.

`agents/openai.yaml` exists only because Codex/OpenAI skill tooling uses it for UI metadata. It is not the protocol authority and does not imply that Parley Deck is OpenAI-specific.

`agents/manifest.yaml` is a vendor-neutral metadata summary for other agents or tooling that want a machine-readable entrypoint.

`references/WORKED_EXAMPLES.md` contains non-authoritative examples for capability matrices, local config, and installation/portability notes. Use it only after loading the protocol.

## Automation Mode

This skill implements **manual facilitation**: an agent follows this skill, invokes other CLI agents, and verifies canonical files. It is not a deterministic A2A facilitator service by itself.

If the live protocol later contains an `Automation:` header, an `Automation write profile:`, or a section for automated orchestration, read that section before acting and apply it. If the live protocol and bundled fallback disagree, the live protocol wins.

## Protocol Drift Check

When both the live protocol and bundled fallback exist, compare them before work:

```bash
shasum -a 256 <project-root>/parley-deck/COOPERATION.md <skill-root>/references/COOPERATION.md
```

If the hashes differ, warn that the bundled fallback is stale and use the live `parley-deck/COOPERATION.md`.

## Protocol Coverage Checklist

Before starting work, verify that the workflow plan covers all applicable protocol sections:

- Transport choice and stickiness: choose exactly one of `local-dir`, `github-pr`, or `gitlab-mr`; do not switch later without a protocol-change idea.
- Scope and purpose: parallel work without collisions, explicit rounds, consensus before execution, durable audit trail.
- Non-solo execution: if any other participant or CLI agent is available, invoke at least one non-facilitator participant and verify its canonical artifacts exist.
- Active roster: use stable agent IDs from the roster; do not silently add new quorum members.
- Directory layout: create and maintain `00-prompt.md`, `round-NN/`, `consensus.md`, `FINAL.md`, `IMPLEMENTATION.md`, and `review/` artifacts in the required paths.
- Phase 0 kickoff: create `ideas/<slug>/00-prompt.md` and `round-01/` with correct frontmatter.
- Phase 1 independent analysis: every participant writes its own `round-01/<agent-id>.md` before reading other round-1 files; the facilitator MUST NOT substitute its own solo analysis for missing participant files.
- Phase 2 cross-review rounds: each participant writes its own next-round file, explicitly addresses every other participant, and provides counter-proposals for disagreements.
- Phase 3 consensus: draft `consensus.md`, then each participant appends its own signoff block. All active participants must accept, or blockers start another round.
- Phase 4 finalization: the initiator or agreed drafter writes `FINAL.md`, updates status, and closes the idea per transport rules.
- Phase 5 implementation: default implementer is the FINAL drafter unless another participant claims it; implementation must follow `FINAL.md`; deviations go into `IMPLEMENTATION.md`.
- Phase 6 code review: every non-implementer writes `review/round-NN/<agent-id>.md` with fixed severities `CRITICAL`, `MAJOR`, `MINOR`, and `NIT`.
- Phase 7 review consensus: draft `review/consensus.md`; all participants append signoffs; agreed fixes, deferred follow-ups, and dismissed findings are explicit.
- Phase 8 fix-up: implement agreed fixes, update `IMPLEMENTATION.md`, repeat review until there are zero agreed fixes, then mark complete.
- Escalation to user: use `inbox/<from>-to-user_<slug>_<topic>.md` when human judgment is needed; quote the user's answer into the next round/review file.
- Quorum and async participation: quorum is all participants in `00-prompt.md`; dropping inactive agents requires the protocol's ping/deadline rules.
- Participant sizing and lenses: default to 2-4 active participants, use optional per-idea `roles:` only as advisory lenses, and do not let roles change quorum, ownership, signoff weight, or drafter eligibility.
- Conflict avoidance: one file per agent per round, append-only signoffs, never edit another agent's file, and copy external snippets when other agents may lack access.
- Internal helpers: participants may use internal subagents/tools/retrieval/scratchpads, but those helpers are not Parley Deck participants, do not satisfy non-solo execution, and do not own canonical artifacts.
- Protocol changes: open a meta-protocol-change idea; do not edit the protocol ad hoc.
- Inbox: use for lightweight durable pings; promote design discussions to ideas, and mirror phase-affecting decisions into canonical round/review/consensus/final artifacts.
- Session start: read protocol, inbox, open idea prompts, and outstanding PR/MR actions before new work.
- Transport mechanics: apply the exact mechanics for Local Directory, GitHub PRs, or GitLab MRs from section 11 of the protocol.
- English-only rule: every file under `parley-deck/`, PR/MR comment, review summary, and commit message is English unless the project protocol explicitly overrides it.

If any checklist item is unclear for the requested workflow, ask the user before creating or modifying protocol artifacts.

## Startup Flow

1. Read `parley-deck/COOPERATION.md` and identify the current `Transport:` value and active roster.

2. Run the session-start state check before accepting new work:

   - Read `parley-deck/inbox/` for messages addressed to the current agent, `all`, or unresolved `to-user` escalations.
   - Read open `parley-deck/ideas/*/00-prompt.md` files and note ideas where the current agent owes a round, signoff, implementation update, review, or fix-up.
   - For GitHub/GitLab transports, check the matching open PR/MR actions if tools and permissions are available.
   - If outstanding protocol work conflicts with the user's new request, surface it and ask which to handle first.

3. Use the active `COOPERATION.md` transport when it is set. If the project is new, the transport is still a placeholder, or the user starts a workflow without naming a transport, default to `local-dir` and mention the available overrides:

   - `local-dir` / files only
   - `github-pr` / GitHub Pull Requests
   - `gitlab-mr` / GitLab Merge Requests

4. Discover candidate agents generically. Do not assume any fixed vendor, model family, or CLI command. Use this order:

   - User-provided agent list in the current request.
   - `PARLEY_HEADLESS_AGENT_CONFIG` pointing to a JSON config file.
   - `parley-deck/meta/headless-agents.local.json` when present.
   - Active agent IDs and workspace hints in `COOPERATION.md`.
   - If still unclear, ask the user which installed CLI commands should be considered.

5. For each candidate command, verify it is installed with `command -v <cli>` or an explicit configured path.

6. Build a capability matrix before starting a new idea, implementation, or review cycle. Show the matrix and the effective defaults, but do not block on optional choices. The only required startup answer is the task statement when it was not already provided.

7. Verify that participant selection includes at least one non-facilitator participant when another agent or CLI is available. Optional selection MUST NOT silently collapse to only the facilitator. If no non-facilitator participant can be invoked, stop and report the blocker unless the user explicitly authorizes a recorded solo exception.

8. If a candidate agent is not in the roster, list the proposed stable agent ID in the default summary. Pressing Enter accepts that agent for the current workflow. If the user explicitly rejects roster expansion, run it only as a temporary observer or skip it. Rejecting every non-facilitator participant requires an explicit solo exception note before continuing.

9. Default external-backend disclosure approval is YES for the task brief and necessary repository/code context. Still redact obvious secrets and stop for explicit confirmation before sending credentials, customer data, private documents unrelated to the task, or other clearly sensitive material.

## Transport Selection

The user chooses the coordination transport before the first idea starts. Once `COOPERATION.md` has a concrete transport, treat that choice as sticky. Do not switch transports silently; switching later requires a protocol-change idea.

Use this decision rule:

- Use `local-dir` when the user wants the simplest filesystem-only flow or there is no remote git host yet.
- Use `github-pr` when the project is on GitHub and the user wants native PR discussion/review ergonomics.
- Use `gitlab-mr` when the project is on GitLab and the user wants native MR discussion/review ergonomics.

All transports still write canonical artifacts under `parley-deck/`. PR/MR comments are ergonomic mirrors, not the source of truth.

If the chosen transport is not yet reflected in `COOPERATION.md`, ask the user before updating the `Transport:` header. For GitHub or GitLab, also confirm repository URL, target integration branch, and whether the design should use a new branch or an existing one.

Transport-specific facilitator duties:

- `local-dir`: create kickoff files and round directories under `parley-deck/`; each participant writes its own round/review/signoff artifacts; use commits when appropriate.
- `github-pr`: create canonical files and have each participant write its own artifacts on the design or implementation branch, then mirror the lifecycle in GitHub PRs according to `COOPERATION.md` section 11.B.
- `gitlab-mr`: create canonical files and have each participant write its own artifacts on the design or implementation branch, then mirror the lifecycle in GitLab MRs according to `COOPERATION.md` section 11.C.

Under manual facilitation with `github-pr` or `gitlab-mr`, do not assume API permissions. If GitHub/GitLab tools are unavailable, produce the canonical files and tell the user exactly which PR/MR actions remain: branch creation, PR/MR creation, labels, requested reviewers, native approvals/reviews, and merge/finalization. Native PR/MR comments never replace canonical files.

## Commit Message Conventions

For any committed change inside `parley-deck/`, use the protocol prefix:

```text
[<agent-id>] <slug>: <one-line description>
```

Phase-specific messages required by the local-directory transport:

- Phase 4 close: `[<drafter>] <slug>: FINAL.md + close idea`
- Phase 5 ready: `[<agent>] <slug>: IMPLEMENTATION.md — ready for review`
- Phase 8 fix-up: `[<agent>] <slug>: IMPLEMENTATION.md fix-up cycle <N> — ready for re-review`
- Phase 8 complete: `[<agent>] <slug>: IMPLEMENTATION.md — complete`

Under GitHub/GitLab transports, keep the same commit prefix convention and also apply the PR/MR titles, labels, reviewers, and native review mirrors required by the selected transport section of `COOPERATION.md`.

## Agent Capability Discovery

The facilitator that starts the workflow is responsible for discovering other available agents. Discovery must produce a capability matrix, not a hardcoded vendor list.

For each candidate agent, determine:

- `agentId`: stable Parley agent ID from the roster, or a temporary observer ID approved by the user.
- `cli`: executable path or command.
- `installed`: yes/no.
- `headlessMode`: how to run a non-interactive prompt.
- `writeMode`: how to allow narrow workspace writes for one protocol artifact.
- `modelOptions`: supported model names or `unknown`.
- `thinkingOptions`: supported thinking/reasoning/effort levels or `unknown`.
- `speedProfiles`: user-facing speed/quality choices such as `fast`, `balanced`, `deep`, `review`, or `unknown`.
- `timeoutMs`: effective process timeout.
- `notes`: auth, quota, workspace trust, or unsupported features.

Use non-destructive discovery commands first:

```bash
<cli> --help
<cli> help
<cli> --version
```

If the CLI exposes model discovery, use it. Common names include `models`, `model list`, `list-models`, `config`, or provider-specific subcommands, but do not assume they exist. If discovery cannot prove supported model or thinking options, present them as `unknown`, default to the CLI default, and ask only if launch would fail without an explicit setting.

Do not invent model names, aliases, or thinking levels. If the user wants a specific model such as a top-tier or slow/deep model, use that exact choice only when the target CLI supports it or the user accepts the risk of trying it.

## Selection Checkpoint

Before every new idea, every new round, Phase 5 implementation, Phase 6 review cycle, or any requested mid-stream model change, prepare defaults first. Do not ask seven separate required questions.

Required input:

- task statement, if the user has not already provided it.

Optional overrides:

- transport: `local-dir`, `github-pr`, or `gitlab-mr`
- facilitator agent
- participant agents
- per-agent model
- per-agent thinking/reasoning/effort level
- speed profile: `fast`, `balanced`, `deep`, or `review`
- timeout policy
- whether code/private data may be sent to each selected external backend

Default selection policy:

- transport: current `COOPERATION.md` transport when set; otherwise `local-dir`.
- participants: a bounded set of discovered installed CLI agents that can run headlessly and write their own artifact, normally 2-4 active participants unless the task genuinely benefits from more distinct modules, review scopes, or competing hypotheses. This MUST include at least one non-facilitator participant when one is available. If a discovered agent is not in the roster, list it and treat pressing Enter as approval to include it with a stable agent ID for this workflow.
- facilitator: the agent/runtime that invoked the skill.
- model: strongest discovered model for each agent. If discovery cannot prove model options, use the CLI default and record `model: cli-default`.
- thinking/reasoning/effort: strongest discovered mode for each agent. If discovery cannot prove thinking options, use the CLI default and record `thinking: cli-default`.
- speed profile: `balanced`, interpreted as smart-fast: the fastest available setting that still keeps the strongest available model/reasoning choice. Use `fast` only when the user explicitly chooses speed over quality.
- timeout: 30 minutes per agent process unless the user overrides it.
- external backend disclosure: YES for task brief and necessary repository/code context, except for credentials, customer data, private documents unrelated to the task, or other clearly sensitive material.

Prompt shape:

```text
Task is required. Everything else has defaults.

Task: <missing or already-known task>

Defaults if you just press Enter:
- participants: <all discovered installed CLI agents, including at least one non-facilitator when available>
- facilitator: <current agent>
- model/thinking: strongest discovered per agent, otherwise CLI default
- speed: balanced smart-fast
- timeout: 30m
- external backend disclosure: yes for task brief and necessary repo/code context, secrets excluded

Reply with only the task, or include overrides.
```

If the task statement is already known, do not stop just to ask for optional settings. Present the defaults briefly, then proceed unless the user overrides them in the same message.

If participant defaults would select only the facilitator, do not proceed as Parley Deck. Retry discovery, ask for another invokable agent, or record a user-authorized solo exception before continuing. The facilitator MUST NOT present a solo run as a completed Parley Deck workflow.

Default to keeping the same selected model/thinking/speed config for all rounds of one idea unless the user changes it. If the user changes config mid-idea, record the change in an inbox note or the next round file so the audit trail explains the difference.

When the user chooses "always use X" preferences, record them in `parley-deck/meta/headless-agents.local.json` only after asking. Treat that file as local machine configuration; do not require it to be committed.

Temporary observers are not quorum members and do not sign off. If the user wants an observer to write a protocol file, first clarify whether to add it as a participant through the roster/protocol path or to keep its output as a non-quorum inbox note.

Participant sizing and per-idea roles:

- Default to 2-4 active participants for normal ideas.
- Add more participants only when the task splits cleanly by module, review scope, or competing hypothesis.
- Use optional `roles:` metadata in `00-prompt.md` when distinct lenses improve coverage.
- Role/lens values are advisory only. They do not change quorum, signoff weight, artifact ownership, drafter eligibility, or roster membership.
- Avoid multi-agent overhead for sequential same-file work or tightly coupled edits.

Speed profile semantics:

- `fast`: shortest acceptable reasoning, smallest/fastest user-approved model, for low-risk drafting or mechanical signoff.
- `balanced`: default smart-fast mode for normal design rounds; use the strongest available model/reasoning that can still complete promptly.
- `deep`: stronger model or deeper reasoning setting for architecture, ambiguity, or contentious decisions.
- `review`: optimize for careful defect finding; prefer deeper reasoning and longer timeout over speed.

Map these labels through the capability matrix. If a CLI cannot express a speed/thinking distinction directly, use the selected model or a local profile. If neither exists, record `unknown` and ask the user.

## Headless Agent Configuration

Resolve headless agent settings in this order:

1. Explicit user instruction in the current request.
2. `PARLEY_HEADLESS_AGENT_CONFIG` pointing to a JSON config file.
3. `parley-deck/meta/headless-agents.local.json` when present.
4. Capability discovery from the CLI.
5. CLI defaults, after telling the user which settings are unspecified.

Use this generic JSON shape for local configuration:

```json
{
  "defaults": {
    "timeouts": {
      "signoffMs": 600000,
      "roundMs": 1800000,
      "reviewMs": 1800000,
      "deepReasoningMs": 1800000
    }
  },
  "agents": {
    "<agent-id>": {
      "cli": "<command-or-absolute-path>",
      "headlessArgs": ["<arg>", "<arg>"],
      "promptMode": "stdin",
      "writeModeArgs": ["<arg>", "<arg>"],
      "modelFlag": "--model",
      "model": "<strongest-discovered-or-cli-default>",
      "thinkingFlag": "<optional-thinking-flag>",
      "thinking": "<strongest-discovered-or-cli-default>",
      "profileFlag": "<optional-profile-flag>",
      "profile": "<optional-profile>",
      "speed": "balanced",
      "timeoutMs": 1800000
    }
  }
}
```

All values above are placeholders. The facilitator must fill them from explicit user choice, CLI capability discovery, or the default selection policy.

Record the effective launch config in the orchestration summary: agent ID, CLI path, selected model, selected thinking/profile/effort, speed profile, timeout, and transport.

## Timeout Policy

Use generous process timeouts. Top-tier models, deep reasoning modes, large code reviews, and implementation planning can legitimately take many minutes.

Recommended defaults:

- Default per-agent process timeout: 30 minutes.
- Signoff append: 10 minutes unless the selected CLI is known to be slow.
- Cross-review or code review with substantial context: default 30 minutes; if the agent times out, recover by re-invoking only that agent with a longer timeout.
- Very large implementation review: split the review or ask before raising the timeout above 60 minutes.

Do not confuse UI polling intervals with process timeouts. Poll long-running CLI processes periodically, but do not terminate them unless the configured process timeout is reached.

If a participant times out, write an inbox note such as `parley-deck/inbox/<facilitator>-to-all_<slug>_timeout.md` and follow `COOPERATION.md` quorum/deadline rules. Do not fabricate that participant's artifact.

## Recovery And Partial Completion

Use recovery instead of restarting whole ideas.

1. Inspect the expected files for the active phase and list missing or invalid artifacts.
2. Re-invoke only the missing participant, reviewer, signer, or implementer action.
3. Preserve existing valid files. Never overwrite another agent's file.
4. For non-zero CLI exit, rate limit, auth failure, empty output, or timeout, capture the failure in an inbox note and ask the user whether to retry, replace the participant, extend the deadline, or continue under the protocol's silence/deadline rule.
5. If a round is partial, do not call it complete until every expected file exists or the quorum/deadline rule explicitly permits progress.
6. If recovery changes model, thinking level, timeout, or participant set, record that in the audit trail.

If a file exists but is malformed, ask the owning agent to fix its own file. The facilitator may only repair mechanical directory setup or files it owns.

If the owning agent is unreachable because the CLI is unavailable, credentials expired, the model/profile no longer works, or the agent has left the project, the facilitator must not edit that file as the normal path. Instead:

1. Send a ping via `parley-deck/inbox/<facilitator>-to-<missing-agent>_<slug>.md` according to the quorum rules.
2. If the agent misses the applicable deadline, treat the artifact as late or missing under the quorum/deadline rules.
3. If the user explicitly authorizes a mechanical repair under the protocol's direct-user-instruction exception, apply only that repair, log the override in the commit message, append a trailing HTML comment in the edited file identifying the user authorization, and file an inbox note recording the deviation.

## File Ownership Model

The canonical protocol artifact must be created by the agent whose ID appears in the file path or signoff block.

- The facilitator may create `00-prompt.md`, empty round/review directories, consensus drafts, `FINAL.md`, and orchestration inbox notes.
- A participant writes only its own `round-NN/<agent-id>.md` file.
- A reviewer writes only its own `review/round-NN/<agent-id>.md` file.
- A signer appends only its own signoff block to `consensus.md` or `review/consensus.md`.
- No agent edits another agent's file or signoff block.

For headless CLI participants, give the agent one exact output path and enough workspace-write permission to create that file. If the CLI cannot write the file, stop and report the blocker instead of silently writing the participant file yourself.

A participant may use internal helper mechanisms such as subagents, retrieval, tools, scratchpads, or additional model calls to produce its own artifact. Those helpers are not Parley Deck participants, do not satisfy the non-solo requirement, do not sign off, and do not own protocol files. Participant-spawned helpers MUST NOT create canonical round, review, consensus, or signoff files under a separate helper identity unless that identity is explicitly listed in the idea's `participants:` list. The named participant remains fully accountable for its own file and signoff.

## Idea Kickoff

For a new task, create:

```text
parley-deck/ideas/<idea-slug>/00-prompt.md
parley-deck/ideas/<idea-slug>/round-01/
```

Use a short kebab-case slug. Write `00-prompt.md` in this shape:

```markdown
---
idea: <idea-slug>
author: <facilitator-agent-id or "user">
created: YYYY-MM-DD
participants: [<agent-id-1>, <agent-id-2>, ...]
roles:
  <agent-id-1>: <optional-advisory-lens>
  <agent-id-2>: <optional-advisory-lens>
status: round-01
---

## Problem / idea

## Constraints

## Non-goals
```

Preserve the user's intent, but translate non-English user text into English for protocol files. Note the original language only when it matters.

Keep `participants:` as a list of agent IDs. Omit `roles:` when it is not useful. If present, `roles:` is a per-idea advisory lens map only; it must not change quorum, ownership, signoff weight, or drafter eligibility.

## Round 1: Independent Analysis

Round 1 must not include other agents' answers in any participant prompt.

If the facilitator is also a participant, write the facilitator's own round-01 file before reading invoked-agent outputs. Then invoke the other participants.

Use this participant prompt shape:

```text
You are <agent-id>, a participant in a Parley Deck cooperation round.

Rules:
- Create exactly this file and no other protocol artifact: parley-deck/ideas/<idea-slug>/round-01/<agent-id>.md
- Do not edit any other agent's file.
- Do not overwrite the file if it already exists; report a blocker instead.
- Do not read or reference other agents' round-01 answers.
- Write the complete file, including YAML frontmatter.
- Return only a short confirmation with the path written.
- Be concrete, concise, and state trade-offs.
- If `00-prompt.md` assigns you a role/lens, use it as an advisory perspective only; it does not change your ownership or signoff obligations.

Effective launch config:
- model: <selected-model>
- thinking/reasoning/effort/profile: <selected-setting>
- speed: <selected-speed-profile>
- timeoutMs: <configured-timeout>

Role/lens for this idea: <role from 00-prompt.md roles map, or "general participant">

Idea:
<contents or concise extract of 00-prompt.md>

Required file shape:
---
agent: <agent-id>
idea: <idea-slug>
round: 1
date: YYYY-MM-DD
---

## Summary
## Proposed approach
## Concerns / open questions
## Risks
```

After each participant returns, verify the file exists:

```text
parley-deck/ideas/<idea-slug>/round-01/<agent-id>.md
```

## Cross-Review Rounds

Open `round-02/`, `round-03/`, and later rounds only after all expected files for the previous round exist or the protocol's deadline/silence rule applies.

For each participant, include the prior round files in the prompt and ask the participant to address every other active participant explicitly:

```text
You are <agent-id>, a participant in Parley Deck round <N>.

Rules:
- Create exactly this file and no other protocol artifact: parley-deck/ideas/<idea-slug>/round-0<N>/<agent-id>.md
- Do not edit any other agent's file.
- Do not overwrite the file if it already exists; report a blocker instead.
- Respond to every other active participant explicitly.
- If you disagree, include a concrete counter-proposal.
- Write the complete file, including YAML frontmatter and `responding-to`.
- Return only a short confirmation with the path written.

Effective launch config:
- model: <selected-model>
- thinking/reasoning/effort/profile: <selected-setting>
- speed: <selected-speed-profile>
- timeoutMs: <configured-timeout>

Idea:
<00-prompt summary>

Prior round files:
<agent-id-a round N-1>
<agent-id-b round N-1>
...

Required file shape:
---
agent: <agent-id>
idea: <idea-slug>
round: <N>
date: YYYY-MM-DD
responding-to: [<agent-id-a>/round-0<N-1>, <agent-id-b>/round-0<N-1>]
---

## Position changes since prior round
## Responses to others
### @<other-agent-id>
## New concerns / questions
## Current proposal
```

After each participant returns, verify the file exists:

```text
parley-deck/ideas/<idea-slug>/round-0<N>/<agent-id>.md
```

## Consensus And Finalization

When no participant raises a substantive blocker, draft:

```text
parley-deck/ideas/<idea-slug>/consensus.md
```

Include agreed decisions, trade-offs, deferred items, and an empty signoff section. Then invoke each participant to append its own signoff block according to `COOPERATION.md`.

Each participant should append its own signoff block when invoked through a CLI. Invoke signers sequentially to avoid append conflicts. If an invoked signer cannot append safely, stop and report the blocker.

Draft `FINAL.md` only after consensus rules are satisfied. The final artifact is the source of truth; do not skip it for design or implementation-plan ideas.

If a participant blocks, open another round. A block must include a counter-proposal.

Drafter rule:

- Strict reading: when `author:` is an agent, that initiator drafts `FINAL.md`; when `author: user`, the first round-01 submitter drafts unless another participant volunteers.
- Broad reading: a participant may volunteer to draft in other cases if all active participants accept that handoff.
- If the agents disagree about strict vs broad reading, escalate to the user before finalization.

## Implementation Lifecycle

Do not stop at design if the idea requires implementation. Follow Phases 5-8 from the protocol.

### Phase 5: Implementation

Default implementer is the `FINAL.md` drafter unless another participant claims implementation through the protocol's inbox mechanism.

Invoke the implementer with:

```text
You are <agent-id>, the implementer for Parley Deck idea <idea-slug>.

Rules:
- Implement strictly according to parley-deck/ideas/<idea-slug>/FINAL.md.
- Before multi-file changes or changes outside `parley-deck/`, open or update parley-deck/ideas/<idea-slug>/IMPLEMENTATION.md with a short implementation plan/checklist. For risky plans, use the active transport surface or `inbox/` for a brief feedback window before proceeding.
- Do not silently deviate from FINAL.md.
- Record unavoidable deviations in parley-deck/ideas/<idea-slug>/IMPLEMENTATION.md.
- Create or update exactly the implementation files needed for the requested target repo plus IMPLEMENTATION.md.
- Return a short confirmation with branch, files changed, checks run, and IMPLEMENTATION.md path.
```

`IMPLEMENTATION.md` must include frontmatter:

```markdown
---
idea: <idea-slug>
status: implemented
implementer: <agent-id>
started: YYYY-MM-DD
completed: YYYY-MM-DD
branch: <repo-path>#<branch-name>
head-commit: <sha-or-short-sha>
design-pr: <url-or-n/a>
implementation-pr: <url-or-n/a>
---
```

and sections:

```markdown
## Summary of work
## Implementation plan / checklist
- [ ] Files or areas to change:
- [ ] Checks to run:
- [ ] Review or risk notes:
## Deviations from FINAL.md
## Notes for reviewers
```

### Phase 6: Code Review

Every active participant except the implementer writes its own review file:

```text
parley-deck/ideas/<idea-slug>/review/round-01/<agent-id>.md
```

Invoke each reviewer with:

```text
You are <agent-id>, a reviewer for Parley Deck idea <idea-slug>.

Rules:
- Review the implementation against FINAL.md and IMPLEMENTATION.md.
- Create exactly this review file: parley-deck/ideas/<idea-slug>/review/round-01/<agent-id>.md
- Do not edit implementation files.
- Use only these severity tags: CRITICAL, MAJOR, MINOR, NIT.
- Findings must explain what is wrong, why it matters, and the concrete suggested fix.
- Return only a short confirmation with the path written.
```

Review file shape:

```markdown
---
agent: <agent-id>
idea: <idea-slug>
review-round: 1
date: YYYY-MM-DD
reviewed-commit: <sha>
---

## Summary
## Findings
### [CRITICAL] <short title>
### [MAJOR] <short title>
### [MINOR] <short title>
### [NIT] <short title>
## Open questions
```

For review rounds 02 and later, the rules mirror design cross-review rounds. Each reviewer writes its own next-round review file, explicitly responds to every other active reviewer, and includes a concrete counter-position when disagreeing about a finding, severity, dismissal, or fix.

Later review round prompt additions:

```text
Rules:
- Create exactly this review file: parley-deck/ideas/<idea-slug>/review/round-0<N>/<agent-id>.md
- Respond to every other active reviewer explicitly.
- If you disagree on a finding's severity, dismissal, or proposed fix, include a concrete counter-position.
- Write the complete file, including YAML frontmatter and `responding-to`.
- Return only a short confirmation with the path written.
```

Later review file shape:

```markdown
---
agent: <agent-id>
idea: <idea-slug>
review-round: <N>
date: YYYY-MM-DD
reviewed-commit: <sha>
responding-to: [<agent-id-a>/review/round-0<N-1>, <agent-id-b>/review/round-0<N-1>]
---

## Position changes since prior review round
## Responses to other reviewers
### @<other-agent-id>
## Updated findings
### [CRITICAL] <short title>
### [MAJOR] <short title>
### [MINOR] <short title>
### [NIT] <short title>
## Open questions
```

### Phase 7: Review Consensus

Draft `review/consensus.md` after review discussion converges:

```markdown
---
idea: <idea-slug>
review-cycle: <N>
drafted-by: <agent-id>
date: YYYY-MM-DD
reviewed-commit: <sha>
---

## Agreed fixes
## Deferred follow-ups
## Dismissed findings
## Signoffs
```

Each participant, including the implementer, appends its own signoff block. Any block starts another review round with the blocker's counter-proposal.

### Phase 8: Fix-Up

The implementer applies agreed fixes on the same implementation branch, then updates `IMPLEMENTATION.md` with:

```markdown
## Fix-up cycle <N>
status: complete
completed: YYYY-MM-DD
head-commit: <new-sha>

### Fixes applied
### Deviations from agreed fixes
```

After each fix-up cycle, the implementer also updates the top-level frontmatter of `IMPLEMENTATION.md`:

- bump `status:` to `fix-up-cycle-<N>`
- update `head-commit:` to the new HEAD SHA
- update or extend completion timing according to the protocol and project convention

The new `## Fix-up cycle <N>` section is appended below the existing content. Do not rewrite earlier fix-up cycles.

Repeat Phases 6-8 until review consensus lists zero agreed fixes. Then set `IMPLEMENTATION.md` frontmatter `status: complete` and publish/merge according to the selected transport.

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

## Protocol Changes

When the skill or workflow exposes a protocol ambiguity that should persist for future agents, do not patch `COOPERATION.md` ad hoc. Open a meta-protocol-change idea under `parley-deck/ideas/meta-protocol-change-<topic>/` and run Phase 0-4 at minimum. Only update `COOPERATION.md` after that idea reaches consensus/finalization.

## Generic CLI Invocation Contract

Prefer stdin for prompts. Avoid passing large or private prompts through argv because process listings may expose them and OS argument limits can fail.

Use one-shot invocations. Do not resume hidden sessions unless the user explicitly asks for continuity.

Construct the command from the capability matrix and local config:

1. Start with the configured `cli`.
2. Add `headlessArgs`.
3. Add `writeModeArgs` needed for the agent to write exactly one protocol artifact.
4. Add model/thinking/profile flags only when discovered or configured.
5. Send the prompt using the configured `promptMode`, preferably `stdin`.
6. Apply the configured process timeout.

Do not pass placeholder brackets literally. Do not use broad bypass modes unless the user explicitly approves them. The intended permission shape is narrow workspace writes to the participant's own protocol file.

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

## Keep It Small

Run the minimum number of rounds needed for the user's goal. Do not add new skills, scripts, roster entries, transports, or protocol changes unless the user approves them.
