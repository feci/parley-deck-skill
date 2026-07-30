# Platform adapter contract

Machine declarations live in `assets/platform-adapters/`. They describe known mechanics; they do not drive a browser or authorize an action.

## Required identity

Each declaration records:

- stable profile ID;
- platform family and concrete deployment;
- official base URL;
- tested/documented timestamp and validation scope;
- maturity and proof ceiling;
- documented versus observed capabilities;
- file and signature constraints;
- operation-to-effect mapping; and
- unsupported variants and stop conditions.

Never assume account portability, terms, modules, UI, signature, receipt, or withdrawal behavior across deployments in one family.

## Non-weakenable operations

| Operation | Minimum class |
|---|---|
| state-changing read | E1 |
| outbound communication | E3a |
| portal/account/bid edit | E4 |
| upload/staging | E5 |
| final submit | E6 |
| withdraw/amend/resubmit | E7 |
| onboarding/terms/roles/certificate/paid plan | E8 |

`adapter_validate.py` rejects weaker or unknown mappings. Capability does not equal authorization.
The mappings declare the minimum HITL class **if** an operation is performed; they are
not a claim that the adapter or platform supports that operation.

## Maturity

- `research-only`: official documentation only; no adapter-backed mutation.
- `fixture-validated`: sanitized offline contract/core behavior.
- `read-only-validated`: approved live identity/read surfaces; mutations still separately gated.
- `demo-submission-validated`: official sandbox/demo staging/final/evidence.
- `live-submission-validated`: one scoped human-authorized real submission and recorded proof.

Always show `tested_as_of`, environment, scope, and documented/observed split. UI drift blocks mutation even at the highest maturity.

Maturity also caps proof universally: `research-only` reaches at most P0;
`fixture-validated` and `read-only-validated` reach at most P1; demo/live maturity may
reach P0–P3 only when both the adapter declaration and actual evidence permit it.

## Proof ceiling

Profiles declare at most P0–P3. The achieved proof is the weaker of the ceiling and actual evidence. Manual mode is capped at P0. Only raw-byte comparison or unambiguous mapped platform checksums can reach P3.

## Unsupported platform

Use `manual.json` as a checklist and human attestation recorder. Never claim observed portal state, receipt, or exact submitted content through manual mode.
