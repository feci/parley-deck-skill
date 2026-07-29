---
id: S-001                          # immutable, never reused
type: story
title: "As an author I claim a ticket so no implementer duplicates it"   # imperative, <=80 chars
parent: E-001                      # the owning epic id
status: draft                      # draft | ready | in-progress | review | done | blocked | paused | dropped
assignee: n/a                      # human | agent:AGENT-ID | n/a
priority: p1                       # p0 | p1 | p2 | p3
labels: [domain:tracker, nfr:reliability]
estimate: n/a
files: [addons/parley-tracker/bin/claim.js]   # the parallelism boundary; AI scopes its reads to these
apis: [n/a]
arch: [parley-deck/ideas/SLUG/FINAL.md]
worktree: n/a                      # or { path: PATH, branch: BRANCH, base: BASE-COMMIT }
dod: [AC-1, AC-2, AC-3]            # Definition of Done = checklist of AC ids
mirror-owned: [status, assignee]
canonical_source: parley-deck/ideas/SLUG/FINAL.md@REVISION
tracker: { provider: generic, external_id: n/a, url: n/a }   # filled after create
---

# As an author I claim a ticket so no implementer duplicates it

<!-- This is a FILLED, self-passing example. A story is a VERTICAL, end-to-end
     slice that delivers one observable, independently valuable behaviour (INVEST).
     Copy it, then replace every value (id, title, SLUG, REVISION, AGENT-ID,
     COMMIT-SHA, the prose) with your own. `validate` FAILS on any leftover
     <...> placeholder, so a half-filled copy cannot be marked ready by mistake. -->

## At a glance
<!-- MANDATORY 2-4 lines, all three audiences. Surface any constraint that materially alters the outcome. -->
An author claims a ready ticket and no second implementer can pick up the same work ·
scope = one claim operation that runs the gap-scan and writes status + assignee ·
done when a second claim on an in-progress ticket is refused with a non-zero exit.

## [B] Business
As an author, I want to claim a ticket, so that two implementers never build the same thing.
Outcome: parallel work is safe; cost tracks unique tickets, not duplicated attempts.
Success indicator: zero duplicate-claim incidents once claiming is enforced.

## [T] Technical
Systems / components: the claim command and the canonical ticket file.
Data touched: the ticket frontmatter (status, assignee).
Interfaces / APIs: the validate readiness scan, reused as the claim gate.
Dependencies: validate must exit 0 before a claim is written.
Constraints: a claim is a single atomic frontmatter edit.
NFRs (state explicitly; do not imply):
- Performance: the gate runs in a single command, no network.
- Security / privacy: n/a (no credentials).
- Accessibility: n/a (no UI).
- Observability: a refused claim prints the failing check.
- Offline / error behaviour: a failing scan refuses the claim and exits non-zero.

## [A] Agent directives
Canonical source: parley-deck/ideas/SLUG/FINAL.md@REVISION.
Read the whole ticket before claiming, then run the gap-scan; if any required
slot is missing and not `n/a`, do NOT claim — return `BLOCKED: <slot>`.
Allowed files / areas (likely, not exhaustive):
- addons/parley-tracker/bin/claim.js
Do not modify:
- addons/parley-tracker/templates/
References: API/contract: the validate module; architecture: the FINAL design;
existing tests: addons/parley-tracker/bin/validate.test.js; similar prior work: n/a.
Assumption policy: if any required endpoint, schema, UX state, or error
behaviour is missing, stop and ask through the configured Parley/tracker channel.

## Acceptance criteria
<!-- AC-N, audience-tagged. Behaviour -> Gherkin; NFR -> measurable bullet + mandatory Verify:.
     Tag at least one AC [B] so the business value is explicit, not implied.
     Required: >=1 happy-path AC AND >=1 edge/error/offline AC (or n/a with reason). -->
- AC-1 [B][A][T] Given an unclaimed ticket that passes the gap-scan, When the author
  claims it, Then the file shows status in-progress and the author as assignee.
- AC-2 [A][T] Given a ticket already in-progress with another assignee, When a second
  claim is attempted, Then the claim is refused and the file is left unchanged (error path).
- AC-3 [T][NFR] Measurable: claiming runs the readiness scan and exits non-zero on failure.
  Verify: `node addons/parley-tracker/bin/claim.js --assignee me addons/parley-tracker/templates/story.md`

## Definition of Done / Verification
<!-- Tick each AC when it passes; record the verifying commit sha. -->
- [ ] AC-1 (Verify: claim succeeds on a passing ticket) — COMMIT-SHA
- [ ] AC-2 (Verify: claim refused on an in-progress ticket) — COMMIT-SHA
- [ ] AC-3 (Verify: `node addons/parley-tracker/bin/claim.js --assignee me ...`) — COMMIT-SHA

## Non-goals
- No locking server or distributed coordination — the claim is a file edit.

## Dependencies / blocks
- blocked-by T-001 (the claim command must ship first)
- blocks S-002 (downstream stories assume claiming is enforced)

## Open questions
- [needs:technical] Should a stale in-progress claim auto-expire?
- [needs:business] Who may override a claim held by another assignee?
