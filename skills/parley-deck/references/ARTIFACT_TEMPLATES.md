# Artifact templates reference — parley-deck

Relocated verbatim from the SKILL.md core (lean-organizer C.4). The canonical
artifact rules live in the protocol (COOPERATION.md §3/§4); these templates mirror
them for quick copying.

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
## Existing alternatives
## Concerns / open questions
## Risks
```

`## Existing alternatives` is required and must not be empty (§15.6a). Instruct the participant:
enumerate the mechanisms the proposal builds **by hand** — name the components, do not describe them
— and for each name the closest thing the toolchain, stdlib, dependencies or platform **already
ships**, with a locator. Mark each load-bearing element constraint-forced or merely inherited. A null
result is legal and must name the sources consulted; *"the hand-built route is correct"* is a valid
outcome. Do **not** ask for an open-ended "consider alternatives" — an unenumerated search is the
form measured not to work.

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
