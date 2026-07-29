---
id: T-001                          # immutable, never reused
type: subtask
title: "Add a claim command that gates on the readiness scan"   # imperative, <=80 chars
parent: S-001                      # the owning story id
status: draft                      # draft | ready | in-progress | review | done | blocked | paused | dropped
assignee: n/a                      # human | agent:AGENT-ID | n/a
priority: p1                       # p0 | p1 | p2 | p3
labels: [domain:tracker]
estimate: n/a
files: [addons/parley-tracker/bin/claim.js]   # the parallelism boundary; keep disjoint from sibling subtasks
apis: [n/a]
arch: [n/a]
worktree: n/a                      # or { path: PATH, branch: BRANCH, base: BASE-COMMIT }
dod: [AC-1, AC-2, AC-3]            # Definition of Done = checklist of AC ids
mirror-owned: [status, assignee]
canonical_source: parley-deck/ideas/SLUG/FINAL.md@REVISION
tracker: { provider: generic, external_id: n/a, url: n/a }   # filled after create
---

# Add a claim command that gates on the readiness scan

<!-- This is a FILLED, self-passing example. A subtask is a TECHNICAL unit with a
     DISJOINT file scope; it is NOT independently end-to-end valuable (its parent
     story is). Copy it, then replace every value (id, title, SLUG, REVISION,
     AGENT-ID, COMMIT-SHA, the prose) with your own. `validate` FAILS on any
     leftover <...> placeholder, so a half-filled copy cannot be marked ready. -->

## At a glance
<!-- MANDATORY 2-4 lines, all three audiences. Surface any constraint that materially alters the outcome. -->
Ship a claim command that runs the readiness scan and writes the claim only on pass ·
scope = one new bin command, no template or schema change · done when a passing
ticket is claimed and a failing ticket is refused with a non-zero exit.

## [B] Business
n/a (this subtask has no standalone business value; it enables parent story S-001)

## [T] Technical
Objective: implement the claim command so the parent story's claiming capability works.
Interfaces / contracts: reuse the validate module's single-file check as the gate.
Implementation notes: on pass, write status: in-progress + assignee; on fail, exit non-zero and write nothing.
NFR (state explicitly where it applies; do not imply): runs as one command, no network.
Out of scope: tracker projection, locking servers, claim expiry.

## [A] Agent directives
Canonical source: parley-deck/ideas/SLUG/FINAL.md@REVISION.
Run the gap-scan before claiming; on any missing required slot, return `BLOCKED: <slot>`.
Allowed files / areas (likely, not exhaustive):
- addons/parley-tracker/bin/claim.js
Do not modify:
- addons/parley-tracker/bin/validate.js
- addons/parley-tracker/templates/
Do not (negative scope — keep at least one explicit constraint):
- change a public API / interface without raising an Open question
- change a stored schema without raising an Open question
- broaden the `files` scope beyond this subtask without recording it in IMPLEMENTATION.md
- weaken validation or security behaviour
Assumption policy: if a required behaviour is undefined, stop and ask — never invent it.

## Acceptance criteria
<!-- AC-N, audience-tagged. Behaviour -> Gherkin; NFR -> measurable bullet + mandatory Verify:.
     Required: >=1 happy-path AC AND >=1 edge/error AC (or n/a with reason). -->
- AC-1 [A][T] Given a ticket that passes the readiness scan, When claim runs, Then
  the file is written with status in-progress and the given assignee.
- AC-2 [A][T] Given a ticket that fails the readiness scan, When claim runs, Then
  the command exits non-zero and the file is left unchanged (error path).
- AC-3 [T][NFR] Measurable: the subtask's tests pass on the integration branch.
  Verify: `node --test addons/parley-tracker/bin`

## Definition of Done / Verification
<!-- Tick each AC when it passes; record the verifying commit sha. -->
- [ ] AC-1 (Verify: claim writes the file on a passing ticket) — COMMIT-SHA
- [ ] AC-2 (Verify: claim refuses and exits non-zero on a failing ticket) — COMMIT-SHA
- [ ] AC-3 (Verify: `node --test addons/parley-tracker/bin`) — COMMIT-SHA

## Non-goals
- No tracker projection or live API write in this subtask.

## Dependencies / blocks
- blocked-by n/a
- blocks S-001 (the parent story's claiming capability depends on this command)

## Open questions
- [needs:technical] Should claim also stage the file, or only write it?
