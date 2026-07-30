# Cosinex/VMP deployments

## Deployment separation

DTVP and Vergabemarktplatz NRW are separate deployment profiles in the same broad platform family. Do not transfer accounts, terms, modules, UI details, signature behavior, file constraints, or proof capabilities by inference.

## DTVP profile

`assets/platform-adapters/cosinex-vmp.dtvp.json` records a sanitized `live-submission-validated` observation tested on 2026-07-22. The observed scope was:

- human-authorized account/procedure binding;
- staging and portal-only completeness review;
- a separately authorized final action;
- durable receipt capture; and
- submitted archive re-download with raw-byte SHA-256 comparison.

It contains no customer, procedure, account, price, receipt, or submitted-file data. The maturity label is evidence, never permission for another action or a promise that another DTVP procedure/UI variant behaves identically.

## NRW profile

`assets/platform-adapters/cosinex-vmp.nrw.json` starts `research-only`. Do not use DTVP selectors or observed DTVP semantics on NRW. Promote only from separately recorded NRW evidence.

## Runtime checklist

Before any mutation:

- confirm exact domain/deployment;
- confirm signed-in account, bidder identity, procedure, lot/offer, and deadline;
- identify whether opening/reading changes state;
- compare visible required fields and staged files with the frozen release;
- confirm procedure-specific signature regime;
- capture the available receipt/download/checksum evidence;
- stop on UI drift or unsupported state.

