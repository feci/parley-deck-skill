# Qualification and commercial control

## Hard gates

Before major effort, determine with citations:

- bidder/consortium eligibility and exclusions;
- mandatory references, certifications, insurance, turnover, staffing, and evidence;
- deadline, timezone, submission language, lot/variant rules, and signature regime;
- authority of declarants and portal operator;
- mandatory delivery, hosting, data-location, security, and subcontractor constraints;
- capacity to deliver the required dates and support model; and
- access to the authoritative documents and submission channel.

A failed hard gate produces `decline` or an explicit human `pursue-with-conditions`; it is never hidden in a score.

## Evidence-cited assessment

Assess capability, capacity, winnability, strategic fit, competition, buyer fit, risk-adjusted economics, contractual exposure, supplier dependencies, and evidence readiness. Distinguish fact, named human attestation, reasoned estimate, and open assumption.

Record one human decision:

- `pursue`;
- `pursue-with-conditions`, with owner and closure time for every condition; or
- `decline`, with reason and reusable lessons.

Material binding updates reopen qualification.

Translate every pursued engagement into one of the
[executable delivery patterns](software-bid-model.md#executable-delivery-patterns).
The commercial schedule must name the same work packages, dependencies, suppliers,
locations, acceptance proof, support boundaries, and change mechanics as that delivery
model; a generic product or reference description is not an executable commitment.

## Commercial gate

Before release freeze, bind:

- exact price workbook/file hashes and a price-schedule digest;
- currency, VAT/tax treatment, indexation, discounts, options, and validity;
- license/hosting/support metrics and minimums;
- implementation work packages, rates, effort, supplier cost, contingency, and exclusions;
- dependencies, assumptions, change mechanics, payment/milestone terms, and contractual caps;
- human margin/economics decision and commercial approver; and
- first-offer risk acknowledgement.

Scripts may check arithmetic and consistency but never decide margin sufficiency, tax treatment, delivery feasibility, or acceptable legal risk.

Price arithmetic is cent-safe: monetary inputs and line totals may not contain
fractional cents, and `quantity × unit price` is rounded half-up once to the currency
cent. The deterministic price digest normalizes all pricing columns, decimals, currency
case, and row order; any material price-row change changes the digest.

## First-offer risk

When negotiation is not guaranteed, treat the submitted offer as potentially directly acceptable. Do not rely on later negotiation to repair:

- underpricing or missing supplier cost;
- unsupported scope or integration commitments;
- authority/signature gaps;
- security, privacy, subcontractor, hosting, or data-location issues;
- deviations or contract positions; or
- project plan and capacity infeasibility.

Every material price, scope, assumption, supplier, delivery model, tax, or deviation change invalidates commercial approval and release freeze.
