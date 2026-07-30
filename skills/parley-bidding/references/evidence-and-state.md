# Evidence and state

## Evidence axes

Record independently:

1. requirement authority — origin, document, version, location, publication time;
2. claim provenance — bidder evidence, product/supplier evidence, named human attestation, inference, or unknown;
3. verification method — document inspection, portal observation, supplier confirmation, test, calculation, or counsel/human decision;
4. applicability scope — bidder, offered service, product, hosting, location, environment, subcontractor, subprocessor, or phase; and
5. status/confidence — open, evidenced, contradicted, accepted-risk, not-applicable with basis, or blocked.

Filename is metadata, not content identity. Use raw SHA-256. Extracted text, rendered comparison, or normalized OOXML is diagnostic only.

## Canonical lifecycle

```text
candidate → triaged → qualified | declined
qualified → acquired → inventoried → reconciled
reconciled → analyzed → drafting → challenged
challenged → release-candidate → release-frozen
release-frozen → platform-bound → staging → staged
staged → pre-submit-checked → awaiting-final-approval
awaiting-final-approval → submitting → submission-recorded
```

Exceptional states:

- `blocked`: affected transition cannot proceed;
- `failed-before-submit`: evidence proves no submission occurred;
- `session-lost`: session ended outside the final-action ambiguity window;
- `unknown-possibly-submitted`: final outcome ambiguous; no proof and no retry;
- `verification-failed`: expected durable/content evidence mismatched;
- `amendment-pending`: a recorded offer requires an E7 cycle; and
- `withdrawn`: withdrawal is recorded with its evidence.

Do not use `submitted`, `verified`, or `verification-limited` as lifecycle states.

## Independent assurance axes

Adapter maturity:

```text
research-only
fixture-validated
read-only-validated
demo-submission-validated
live-submission-validated
```

Submission proof:

| Level | Meaning |
|---|---|
| P0 | Human operator attestation only |
| P1 | Agent-observed portal success, no durable receipt |
| P2 | Durable receipt/protocol with submission identity and timestamp |
| P3 | Submitted bytes/checksums match the frozen raw SHA-256 manifest |

`unknown-possibly-submitted` has no proof level. Expected verification failure never degrades silently.
The maturity ceiling is independent: research-only is at most P0; fixture/read-only
validation is at most P1; demo/live validation may reach P3 only when the declared
ceiling and evidence also support it.

## Bindings and approvals

Before mutation bind deployment, account, bidder, procedure, lot/offer, deadline,
signature regime, deterministic price digest, visible target, declarant signatory,
authority basis, click approver, commercial approver, declarations digest, and
first-offer acknowledgement. Approval fingerprints include the effect, action, exact
payload/manifest, bindings, current state, adapter maturity, and frozen manifest digest.
Changes make approvals and any dependent freeze stale; consumption is one-time and
append-only.
