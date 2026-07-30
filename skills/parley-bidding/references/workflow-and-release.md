# Workflow and release

## Phase gates

| Phase | Entry evidence | Exit condition |
|---|---|---|
| Discover | Notice/source URL | Origin procedure and submission destination identified |
| Qualify | Current notice and hard criteria | Human `pursue`, `pursue-with-conditions`, or `decline` |
| Acquire | Authorized document access | Original package, communications, and timestamps captured |
| Reconcile | Inventory and hashes | Current binding version/addenda map; conflicts resolved |
| Prepare | Qualified scope | Atomic requirements, delivery, evidence, price, and owners |
| Challenge | Draft bid | Material lenses reviewed; findings resolved or accepted |
| Release | Release candidate | Exact bytes, manifest, completeness, authority, price approval |
| Platform bind | Frozen release | Account/bidder/procedure/lot/signature/deadline rebound |
| Stage | E5 approval | Exact frozen files staged; no final action |
| Submit | Fresh E6 approval | Final action attempted once; external state reconciled |
| Verify/archive | Submission evidence | Proof level recorded; receipt/content and recovery archived |

## Source hierarchy

Use the most recent binding origin-platform publication or communication first, then current buyer documents, then earlier submissions, and only then internal drafts or reference tenders. Record authority, publication time, acquisition time, and supersession.

Hard-block release when the origin cannot be reconciled with discovery metadata on procedure/lot, deadline/timezone, scope, mandatory requirements, evaluation, eligibility, documents/addenda, signature/submission regime, or cancellation/amendment status. A harmless metadata lag is only a warning after documented substantive equivalence.

## Release freeze

Freeze:

- exact file set and raw-byte SHA-256;
- form/version mapping;
- requirements disposition and evidence;
- bidder, consortium, subcontractor, supplier, and subprocessor model;
- price schedule digest, taxes, assumptions, options, and first-offer decision;
- declarant signatory, authority basis, click approver, and commercial approver;
- procedure, lot/offer, deadline/timezone, signature regime, and adapter deployment.

Create a new immutable release after any material change. Do not edit a frozen release in place.

The state transition to `release-frozen` requires a non-empty release ID, the exact
manifest as payload, complete target/authority/declaration/price bindings, first-offer
acknowledgement, and an E2 approval from the bound `commercial_approver`. Store the
manifest SHA-256 and binding fingerprint in `bid-state.json`. E5, E6, and E7 approvals
must name that same manifest digest and the recorded adapter maturity.

Late addenda or other buyer-controlled binding updates preserve the previous release,
mark its freeze stale, return the lifecycle to `release-candidate`, and reopen
qualification, requirements, commercial, and release workstreams.

If the bid has not yet reached the release phase, record the update and open the
workstreams without advancing the lifecycle. The addendum command is forbidden from
`blocked` and `session-lost`; resolve those states first through their evidence-gated
recovery commands.

Open workstreams are enforced gates, not labels. Close each with
`bid_state.py close-workstream --stream ... --evidence-file ... --closed-by ...`.
Re-freeze is refused until all are closed. Closure evidence remains append-only in
state history.

A release ID is an immutable identity for manifest digest, binding fingerprint, and
adapter maturity. Reusing an ID for any different frozen input is refused and every
successful freeze is retained in `release_history`.

## Portfolio boundary

Keep opportunities beneath an explicit portfolio root:

```text
portfolio/
  opportunity-a/bid-state.json
  opportunity-b/bid-state.json
```

Pass that root when entering `awaiting-final-approval` or `submitting`. A bid workspace
itself is not a plausible portfolio root. Missing, unreadable, or conflicting state
fails closed.

## Portal-only pre-submit review

Without mutation, compare the visible portal state with the frozen release:

- correct deployment, account, bidder, procedure, lot, and offer;
- deadline and timezone still open;
- visible price and declarations match;
- required fields show complete;
- staged filenames, counts, and sizes match the manifest;
- signature method matches the procedure;
- no new message, addendum, or buyer document exists.

Only then request E6. Upload/staging approval is never reused.
