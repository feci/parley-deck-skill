# Software bid model

## Atomic requirements

One row represents one independently verifiable commitment. Preserve the buyer's stable ID and exact authority. Record classification, response, provenance, proven scope, owner, strategy, dependency, work package, price impact, acceptance proof, confidence, blocker, and release disposition.

Allowed delivery strategies:

- `comply` — already supported and evidenced;
- `configure` — delivered through supported configuration;
- `customize` — bidder-owned change with effort, acceptance, and maintenance;
- `integrate` — external interface with both-side dependencies;
- `third-party` — supplier/subcontractor capability with contract and scope evidence;
- `roadmap` — future capability only when the procedure permits it;
- `deviate` — explicit buyer-visible qualification; or
- `decline` — cannot responsibly commit.

Never turn inference into `comply`.

## Analysis dimensions

Activate when relevant; unknown applicability stays active:

- eligibility, procedure, authority, lots, and signatures;
- functional requirements and non-functional qualities;
- architecture, integrations, APIs, product fit, and customization;
- migration, data quality, hosting, environments, and operations;
- security, privacy, compliance, accessibility, and evidence scope;
- governance, milestones, testing, acceptance, training, and rollout;
- staffing, capacity, locations, suppliers, subcontractors, and subprocessors;
- support, SLAs, service credits, warranty, continuity, and exit;
- price, tax, assumptions, dependencies, economics, and first-offer risk;
- contract, IP, licensing, OSS, vendor terms, and deviations;
- references, declarations, and evidence; and
- buyer value, evaluation response, differentiators, and win strategy.

## Executable delivery patterns

### Custom development

Define discovery, architecture, backlog/change control, environments, CI/CD, security, test levels, acceptance, rollout, warranty, ownership/IP, staffing, and exit. Separate estimates from fixed commitments.

### SaaS

Define tenant model, configuration/customization boundary, hosting/data location, identity, integrations, migration, availability, support, release management, subprocessors, audit evidence, portability, and termination.

### Product implementation

Map standard/configuration/customization for every requirement. Tie custom work to effort, acceptance, upgrade compatibility, source ownership, maintenance, and price.

### Integration and migration

Name both systems, APIs, data owners, volumes, mappings, transformations, reconciliation, cutover, rollback, security, test data, acceptance, and dependencies. Never promise the external system's behavior without evidence.

### AI and data

Define model/provider, data use and location, training/retention, human oversight, quality metrics, hallucination/error handling, explainability, security, IP, monitoring, fallback, and regulatory applicability. Separate probabilistic capability from deterministic acceptance.

### Managed service and SLA

Define service hours, channels, severity, response/restoration targets, exclusions, monitoring, incident/problem/change, patching, backup/restore, RPO/RTO, capacity, reporting, continuity, exit, service credits, and delivery locations.

### Licensing

Define licensed entity, users/devices/instances/usage metric, environments, term, renewal, audit, transfer, affiliates, subcontractor use, support/maintenance, third-party/OSS terms, price escalators, and exit rights.

## Cross-document consistency

Keep requirements, offer letter, price schedule, delivery plan, contracts/deviations, AVV/DPA, TOMs/security, supplier agreements, and portal fields aligned. One third party may simultaneously be supplier, procurement subcontractor, and GDPR subprocessor; record each role separately.

