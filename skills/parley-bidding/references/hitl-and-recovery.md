# HITL and recovery

## Approval record

Every consequential approval names:

- action ID and E-class;
- exact target and intended effect;
- current lifecycle state;
- deployment, account, bidder, procedure, lot/offer, and deadline;
- exact payload or manifest digest;
- deterministic price digest, declarant signatory, authority/signature basis,
  declarations digest, frozen release/manifest, and adapter maturity when relevant;
- approver, explicit role, and timestamp; and
- single-use fingerprint.

Approval is invalid after any relevant change and is never inherited by a later effect class.

## Recovery table

| Condition | Required response |
|---|---|
| Read changed portal state unexpectedly | Stop; record evidence; reclassify as E1 if needed |
| Upload differs from frozen manifest | Stop; remove/replace only under fresh E5 |
| UI, deployment, account, or target mismatch | Stop; no mutation; rebind from evidence |
| Session lost before final-action window | Reopen read-only; prove no submission; then resume |
| Session lost or ambiguous during final action | Set `unknown-possibly-submitted`; no retry |
| Portal shows success without receipt | Record at most P1 |
| Receipt captured, bytes unavailable | Record at most P2 and display verification gap |
| Submitted archive/checksum mismatches | Set `verification-failed`; preserve both sides |
| New addendum after freeze | Mark release stale; reopen affected gates; create new release |
| Withdrawal/amendment needed | Preserve old release/receipt; E7; re-freeze; fresh E6 |

`blocked` and pre-submit `session-lost` retain their predecessor in
`exception_context`. Resume only with `resolve-blocked` or `reconcile-session` and a
durable read-only evidence file. When recovery would re-enter
`awaiting-final-approval`, pass the explicit portfolio root so the single-active
irreversible-window check runs before recovery. A buyer addendum uses
`reopen-binding-update`, which
preserves and stales the old freeze and reopens all four affected workstreams. It
cannot escape an exception state or skip forward from an earlier lifecycle phase.
Every reopened workstream requires named-owner closure evidence before re-freeze.

## Ambiguous final action

Do not click again. Use read-only evidence such as offer status, submission timestamp/ID, receipt list, submitted package download, buyer-side acknowledgement, or platform history. If evidence still cannot resolve the outcome, remain in `unknown-possibly-submitted` and ask the human/platform support. A `submitted` reconciliation must atomically record P0–P3 proof under the applicable adapter ceiling; a `not-submitted` reconciliation stores its evidence and reconciler while retaining no proof. Never convert uncertainty into P0.

## Credentials and onboarding

The human types credentials and MFA in the real platform UI. Do not ask them to paste secrets into chat or files. E8 approval is required for account creation, terms/DPA acceptance, company/user/role changes, MFA, certificate/signature helper, or paid services.
