# Discovery

## Separate discovery from submission

Record for every candidate:

- discovery source name, notice ID, URL, and observation timestamp;
- authoritative origin notice URL and procedure ID;
- submission platform URL and deployment, if known;
- buyer, title, lots, CPV/category, location, language, deadlines, and procedure type;
- source evidence for every field; and
- unresolved divergence between publication and origin.

Never infer that a notice aggregator accepts bids. Follow the authoritative origin link and verify the submission destination from buyer-controlled evidence.

## Initial German public sources

Machine profiles live in `assets/discovery-sources/`.

- Datenservice Öffentlicher Einkauf / `oeffentlichevergabe.de`: central public discovery and open-data surface.
- TED: EU publication/discovery. The origin platform still controls documents, communication, and submission.
- `service.bund.de`: publication evidence only; never treat it as the transactional channel.

## Qualification triage

Capture first:

- deadline/timezone and remaining decision time;
- hard eligibility, signature, language, location, and evidence requirements;
- lot and variant rules;
- rough capability, delivery capacity, supplier dependencies, and budget/economics;
- access or account prerequisites;
- document availability and known addenda; and
- whether negotiation is guaranteed, possible, or excluded.

Create accounts, subscriptions, saved searches, paid plans, notification rules, company profiles, certificates, or MFA only under E8 approval. The human enters credentials directly.

## Monitoring

Recheck binding origin sources at qualification, release freeze, immediately before E5, and immediately before E6. A new material publication invalidates qualification and release approvals.

Do not run unattended monitoring unless the user separately authorizes its schedule, sources, external effects, retention, and notification channel.

