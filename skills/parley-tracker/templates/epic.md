---
id: E-001                          # immutable, never reused
type: epic
title: "Author tickets any tracker and any AI implementer can act on"  # imperative, <=80 chars
parent: n/a                        # an epic has no parent
status: draft                      # draft | ready | in-progress | review | done | blocked | paused | dropped
assignee: n/a                      # human | agent:AGENT-ID | n/a
priority: p1                       # p0 | p1 | p2 | p3
labels: [domain:tracker]           # free-form tags; mapped to tracker labels/components
estimate: n/a
files: [tickets/]                  # the parallelism boundary; AI scopes its reads to these
apis: [n/a]                        # interface/contract refs, or n/a
arch: [parley-deck/ideas/SLUG/FINAL.md]   # architecture refs, or n/a
worktree: n/a                      # epics are not built in a single worktree
dod: [AC-E1, AC-E2, AC-E3]         # Definition of Done = checklist of AC ids
mirror-owned: [status, assignee]   # only these fields are written back on --pull
canonical_source: parley-deck/ideas/SLUG/FINAL.md@REVISION
tracker: { provider: generic, external_id: n/a, url: n/a }   # filled after create
---

# Author tickets any tracker and any AI implementer can act on

<!-- This is a FILLED, self-passing example. Copy it, then replace every value
     (id, title, SLUG, REVISION, AGENT-ID, COMMIT-SHA, the prose) with your own.
     `validate` FAILS on any leftover <...> placeholder, so a half-filled copy
     cannot be marked ready by mistake. -->

## At a glance
<!-- MANDATORY 2-4 lines, all three audiences. Surface any constraint that materially alters the outcome. -->
A backlog whose tickets read for business, technical, and AI audiences at once ·
scope = the epic's child stories and subtasks, no code in the epic itself ·
done when every child story is done and the epic acceptance criteria pass.

## [B] Business
Who benefits: delivery teams and the stakeholders who track their work.
Why this matters / why now: AI implementers waste effort on under-specified tickets.
Success indicator: tickets pass readiness validation before any work starts.

## [T] Technical
Systems touched: the tickets/ tree and the chosen tracker mirror.
Primary constraints: canonical files stay vendor-neutral; the tracker is a mirror.
Security / privacy constraints: n/a (no credentials in canonical files).
Performance / reliability constraints: n/a.
Where the mechanics live: this addon skill — the core protocol gets only a thin seam.

## [A] Agent directives
Scope: this epic is a container; build happens in its child stories/subtasks.
Do: keep child tickets' `files` sets disjoint so they can be built in parallel.
Do not: implement mechanics in the core protocol — that belongs in the skill.
Do not: treat a tracker edit as authoritative over the canonical file.
Assumption policy: if a required behaviour, schema, or interface is missing, stop
and ask through the configured Parley/tracker channel — never invent it.

## Acceptance criteria
<!-- AC-N, audience-tagged; Gherkin for behaviour, measurable bullet + Verify: for NFR.
     Tag at least one AC [B] so the business value is explicit, not implied. -->
- AC-E1 [B][T] Given every linked story is `done`, When the epic is reviewed, Then
  each epic acceptance criterion passes its `Verify:` command and the epic is `done`.
- AC-E2 [B][T] Measurable: 100% of ready child tickets pass readiness validation.
  Verify: `node addons/parley-tracker/bin/validate.js --strict --dir tickets`
- AC-E3 [T][NFR] Measurable: validation of the whole tree completes in one command.
  Verify: `node addons/parley-tracker/bin/validate.js --strict --dir tickets`
- AC-E4 [T] Edge/error: a child ticket with a leftover placeholder is rejected, not
  silently accepted. Verify: `node addons/parley-tracker/bin/validate.js tickets/example/epic.md`

## Definition of Done / Verification
<!-- Tick each AC when it passes; record the verifying commit sha. -->
- [ ] AC-E1 (Verify: every child story `done`) — COMMIT-SHA
- [ ] AC-E2 (Verify: `node addons/parley-tracker/bin/validate.js --strict --dir tickets`) — COMMIT-SHA
- [ ] AC-E3 (Verify: `node addons/parley-tracker/bin/validate.js --strict --dir tickets`) — COMMIT-SHA
- [ ] AC-E4 (Verify: `node addons/parley-tracker/bin/validate.js tickets/example/epic.md`) — COMMIT-SHA

## Non-goals
- No tracker credentials or live API calls in the canonical files.
- No per-technical-layer epics; one epic per business outcome.

## Dependencies / blocks
- blocks S-001 (the stories cannot be `done` before the epic closes)
- blocked-by n/a

## Open questions
- [needs:decision] Which tracker is the mirror for this epic?
- [needs:business] Who signs off the success indicator?
