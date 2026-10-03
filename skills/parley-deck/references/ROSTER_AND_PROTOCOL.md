# Roster and protocol reference — parley-deck

Relocated verbatim from the SKILL.md core (lean-organizer C.4). Covers roster
authority, the global core, drift checks, and the remaining operating detail.

## Skill Metadata

`SKILL.md` and `references/COOPERATION.md` are the vendor-neutral instructions for all agents.

`agents/openai.yaml` exists only because Codex/OpenAI skill tooling uses it for UI metadata. It is not the protocol authority and does not imply that Parley Deck is OpenAI-specific.

`agents/manifest.yaml` is a vendor-neutral metadata summary for other agents or tooling that want a machine-readable entrypoint.

`references/WORKED_EXAMPLES.md` contains non-authoritative examples for capability matrices, local config, and installation/portability notes. Use it only after loading the protocol.

`references/compatibility.json` describes the packaged protocol/metadata schema and compatibility policy. It is informational; the live project protocol remains canonical.

## Protocol Drift Check

If `parley-deck-skill` is available, start with the structured status check:

```bash
parley-deck-skill status --target all --project . --json
```

Use it to report the actual system installer version, installed runtime skill versions, project metadata state, and compatibility warnings. Do not force global lockstep: stale runtime installs or project metadata are warnings unless the live protocol or installer reports an explicit blocker.

When the system installer version changed or `parley-deck/meta/version.json` is missing/stale, run a dry-run project sync check:

```bash
parley-deck-skill sync-project --project . --dry-run --json
```

Ask before writing project metadata. If the user approves, run:

```bash
parley-deck-skill sync-project --project . --yes
```

`sync-project` updates only `parley-deck/meta/version.json`; it must not overwrite `parley-deck/COOPERATION.md`. Protocol content changes still require a protocol-change idea.

When both the live protocol and bundled fallback exist, compare them before work:

```bash
shasum -a 256 <project-root>/parley-deck/COOPERATION.md <skill-root>/references/COOPERATION.md
```

If the hashes differ, warn that the bundled fallback is stale and use the live `parley-deck/COOPERATION.md`.

## Protocol Coverage Checklist

Before starting work, verify that the workflow plan covers all applicable protocol sections:

- Transport choice and stickiness: choose exactly one of `local-dir`, `github-pr`, or `gitlab-mr`; do not switch later without a protocol-change idea.
- Scope and purpose: parallel work without collisions, explicit rounds, consensus before execution, durable audit trail.
- Non-solo execution: if any other participant or CLI agent is available, invoke at least one non-facilitator participant and verify its canonical artifacts exist.
- Active roster: use stable agent IDs from the roster; do not silently add new quorum members.
- Directory layout: create and maintain `00-prompt.md`, `round-NN/`, `consensus.md`, `FINAL.md`, `IMPLEMENTATION.md`, and `review/` artifacts in the required paths.
- Phase 0 kickoff: create `ideas/<slug>/00-prompt.md` and `round-01/` with correct frontmatter.
- Phase 1 independent analysis: every participant writes its own `round-01/<agent-id>.md` before reading other round-1 files; the facilitator MUST NOT substitute its own solo analysis for missing participant files.
- Phase 2 cross-review rounds: each participant writes its own next-round file, explicitly addresses every other participant, and provides counter-proposals for disagreements.
- Phase 3 consensus: draft `consensus.md`, then each participant appends its own signoff block. All active participants must accept, or blockers start another round.
- Phase 4 finalization: the initiator or agreed drafter writes `FINAL.md`, updates status, and closes the idea per transport rules.
- Phase 5 implementation: the implementer resolves by one chain — the `IMPLEMENTATION.md` pin, a per-idea `implementer:` designation in `00-prompt.md`, the standing `[defaults].default_implementer` (ships unset), then today's chain — `FINAL.md`'s recorded implementer/drafter, else the first eligible participant; a claim does not override a live designation (**with no designation, a claim remains the normal volunteer route**); implementation must follow `FINAL.md`; deviations go into `IMPLEMENTATION.md`.
- Phase 6 code review: every non-implementer writes `review/round-NN/<agent-id>.md` with fixed severities `CRITICAL`, `MAJOR`, `MINOR`, and `NIT`.
- Phase 7 review consensus: draft `review/consensus.md`; all participants append signoffs; agreed fixes, deferred follow-ups, and dismissed findings are explicit.
- Phase 8 fix-up: implement agreed fixes, update `IMPLEMENTATION.md`, repeat review until there are zero agreed fixes, then mark complete.
- Escalation to user: use `inbox/<from>-to-user_<slug>_<topic>.md` when human judgment is needed; quote the user's answer into the next round/review file.
- Quorum and async participation: quorum is the current `participants:` in `00-prompt.md`; §9.0 quota auto-exclusion is a recorded CLI transition, never an organizer inference. Other exclusions retain their confirmation/ping/deadline rules. Immutable membership history preserves known signers, vetoes, disputes and findings; required signers follow the current set.
- Participant sizing and lenses: default to 2-4 active participants, use optional per-idea `roles:` only as advisory lenses, and do not let roles change quorum, ownership, signoff weight, or drafter eligibility.
- Conflict avoidance: one file per agent per round, append-only signoffs, never edit another agent's file, and copy external snippets when other agents may lack access.
- Internal helpers: participants may use internal subagents/tools/retrieval/scratchpads, but those helpers are not Parley Deck participants, do not satisfy non-solo execution, and do not own canonical artifacts.
- Version/project sync: check `parley-deck-skill status` when available; if project metadata is missing or stale after a system skill update, propose `sync-project` before starting work.
- Protocol changes: open a meta-protocol-change idea; do not edit the protocol ad hoc.
- Inbox: use for lightweight durable pings; promote design discussions to ideas, and mirror phase-affecting decisions into canonical round/review/consensus/final artifacts.
- Session start: read protocol, inbox, open idea prompts, and outstanding PR/MR actions before new work.
- Transport mechanics: apply the exact mechanics for Local Directory, GitHub PRs, or GitLab MRs from section 11 of the protocol.
- English-only rule: every file under `parley-deck/`, PR/MR comment, review summary, and commit message is English unless the project protocol explicitly overrides it.

If any checklist item is unclear for the requested workflow, ask the user before creating or modifying protocol artifacts.

## Transport Selection / deck bootstrap

The user chooses the coordination transport before the first idea starts. Once `COOPERATION.md` has a concrete transport, treat that choice as sticky. Do not switch transports silently; switching later requires a protocol-change idea.

**Deck bootstrap — mandatory roster, model & reasoning confirmation (once, at deck creation).** When the `parley-deck/` directory is first created in a project (`parley init` / first bootstrap), the facilitator MUST run an explicit roster + per-agent model + per-agent reasoning/effort confirmation with the user as a required setup step before the first idea. This fires **only at deck creation** — not per idea and not on later sessions:

- **Seed from the central default.** Load `~/.parley/agents.toml` (the user-global default that `parley init` creates) and present its agents, models, and reasoning as the starting point. The deck inherits these unless the user changes them here; a per-project change is written to the deck config and overrides the central default for this project only.
- **List the candidate roster** (agent IDs + their CLIs) and ask the user to confirm or adjust which agents are in the deck.
- **For each confirmed agent, list its available models AND its reasoning/effort levels** — use discovery where the CLI exposes it (e.g. `<cli> models`, `model list`, documented aliases; thinking/effort/reasoning flags such as `--effort`, `--reasoning`, thinking levels). Otherwise show the configured/`cli-default` value and let the user enter an exact model id / effort level. Ask which model **and which reasoning/effort level** the user wants for that agent. **The default reasoning/effort is the strongest (highest) level the agent supports** — only drop to `cli-default` when the level cannot be discovered.
- **Record each pick as the persistent default** in the deck's roster authority `parley-deck/agents.toml`, via `parley roster set <id> --scope deck --model M --effort E --yes` (never by hand-editing the §2 table, which is a generated view): the agent's `model`, its `thinking`/effort level, and (where used) the `deep`/`review` profiles. These are used for that agent in every run until the user changes them. Prefer an **exact model id over a vendor "latest" alias** (an alias can resolve to an older model), and prefer the **highest reasoning level** unless the user chooses otherwise.

An **already-bootstrapped deck** (roster + per-agent models + reasoning already recorded) does **not** re-prompt — the saved selection is reused. The user may re-run this confirmation any time on request (e.g. to change an agent's model or effort level); changing a pick updates the persistent file. This bootstrap gate is separate from the per-idea Startup Flow (step 7) and from the §9.0 readiness check (which only pings agent liveness per idea).

Use this decision rule:

- Use `local-dir` when the user wants the simplest filesystem-only flow or there is no remote git host yet.
- Use `github-pr` when the project is on GitHub and the user wants native PR discussion/review ergonomics.
- Use `gitlab-mr` when the project is on GitLab and the user wants native MR discussion/review ergonomics.

All transports still write canonical artifacts under `parley-deck/`. PR/MR comments are ergonomic mirrors, not the source of truth.

If the chosen transport is not yet reflected in `COOPERATION.md`, ask the user before updating the `Transport:` header. For GitHub or GitLab, also confirm repository URL, target integration branch, and whether the design should use a new branch or an existing one.

Transport-specific facilitator duties:

- `local-dir`: create kickoff files and round directories under `parley-deck/`; each participant writes its own round/review/signoff artifacts; use commits when appropriate.
- `github-pr`: create canonical files and have each participant write its own artifacts on the design or implementation branch, then mirror the lifecycle in GitHub PRs according to `COOPERATION.md` section 11.B.
- `gitlab-mr`: create canonical files and have each participant write its own artifacts on the design or implementation branch, then mirror the lifecycle in GitLab MRs according to `COOPERATION.md` section 11.C.

Under manual facilitation with `github-pr` or `gitlab-mr`, do not assume API permissions. If GitHub/GitLab tools are unavailable, produce the canonical files and tell the user exactly which PR/MR actions remain: branch creation, PR/MR creation, labels, requested reviewers, native approvals/reviews, and merge/finalization. Native PR/MR comments never replace canonical files.

## Commit Message Conventions

For any committed change inside `parley-deck/`, use the protocol prefix:

```text
[<agent-id>] <slug>: <one-line description>
```

Phase-specific messages required by the local-directory transport:

- Phase 4 close: `[<drafter>] <slug>: FINAL.md + close idea`
- Phase 5 ready: `[<agent>] <slug>: IMPLEMENTATION.md — ready for review`
- Phase 8 fix-up: `[<agent>] <slug>: IMPLEMENTATION.md fix-up cycle <N> — ready for re-review`
- Phase 8 complete: `[<agent>] <slug>: IMPLEMENTATION.md — complete`

Under GitHub/GitLab transports, keep the same commit prefix convention and also apply the PR/MR titles, labels, reviewers, and native review mirrors required by the selected transport section of `COOPERATION.md`.

## Agent Capability Discovery

The facilitator that starts the workflow is responsible for discovering other available agents. Discovery must produce a capability matrix, not a hardcoded vendor list.

For each candidate agent, determine:

- `agentId`: stable Parley agent ID from the roster, or a temporary observer ID approved by the user.
- `cli`: executable path or command.
- `installed`: yes/no.
- `headlessMode`: how to run a non-interactive prompt.
- `writeMode`: how to allow narrow workspace writes for one protocol artifact.
- `modelOptions`: supported model names or `unknown`.
- `thinkingOptions`: supported thinking/reasoning/effort levels or `unknown`.
- `speedProfiles`: user-facing speed/quality choices such as `fast`, `balanced`, `deep`, `review`, or `unknown`.
- `timeoutMs`: effective process timeout.
- `notes`: auth, quota, workspace trust, or unsupported features.

Use non-destructive discovery commands first:

```bash
<cli> --help
<cli> help
<cli> --version
```

If the CLI exposes model discovery, use it. Common names include `models`, `model list`, `list-models`, `config`, or provider-specific subcommands, but do not assume they exist. If discovery cannot prove supported model or thinking options, present them as `unknown`, default to the CLI default, and ask only if launch would fail without an explicit setting.

Do not invent model names, aliases, or thinking levels. If the user wants a specific model such as a top-tier or slow/deep model, use that exact choice only when the target CLI supports it or the user accepts the risk of trying it.

## The roster: one answer, three verbs

**`parley roster show` is THE answer to "what is the current agent roster?"** Run it and reproduce
its output. Do not build a roster yourself by parsing `COOPERATION.md` §2, `agents.toml`, or
`parley agents list` — that is how three different tables came to answer one question.

It prints a frozen, versioned column contract, identical in text and `--json`:

```
AGENT  ADAPTER  STATE  INSTALLED  MODEL  MODEL-FAMILY  MODEL-COMPANY  EFFORT  SPEED  AUTO  STATUS
```

- **`MODEL` and `EFFORT` are what the launch ACTUALLY passes**, or `unknown` — never a configured
  value the argv does not carry. A configured value that never reaches the process shows up as
  `STATUS=model-drift` or `effort-unknown`, not as a confident cell.
- **One exception, reported under its own status**: when a CLI has no flag for the value at all,
  no parley layer can bind it and the process reads its **own** config instead. The cell then
  carries what that file says, with `STATUS=model-from-config` / `effort-from-config` — never
  plain `ok`, because the launch does not enforce it. This is not a loosening of the rule above:
  the rule forbids echoing a *parley-side* declaration back as if the argv carried it, whereas
  this reads the same file the agent itself reads at launch. `--explain` names the file, and
  states the limitation — the file can change before launch and the CLI does not echo the model
  back, so the value is not confirmable after a run. Applies to `zcode` (model and effort),
  `kimi` (effort) and `opencode` (effort).
- **`MODEL-FAMILY` / `MODEL-COMPANY`** are derived by the CLI from the model reference, with any
  gateway prefix peeled off first: `litellm/xai/grok-4.5` is **xAI** via LiteLLM, not "LiteLLM", and
  an adapter never implies a company (hermes running `glm-5p2` is Zhipu AI, not hermes).
- **`STATUS`** carries a closed vocabulary: `ok`, `unmapped`, `not-installed`, `model-drift`,
  `model-unbound`, `effort-unknown`, `metadata-unknown`, `model-from-config`,
  `effort-from-config`, `masked-by-env`, `legacy-roster`, `inactive`, `stale-snapshot`,
  `section2-only`, `inherited-roster`, `not-in-roster`.

`roster show` also takes `--all` (additionally list configured adapters that no roster declares —
use it when an agent you installed does not appear) and `--explain AGENT` (per-field provenance:
which config layer set each value). `--scope deck` is the default; `--scope machine` reads
`~/.parley/agents.toml`.

The other verbs:

```bash
parley roster set <agent> --scope deck|machine [--adapter A] [--model M] [--effort E] [--speed S] [--state active|inactive] [--confirm-breaking]
parley roster sync [--keep AGENT.FIELD]...
parley roster render [--adopt-inherited]
parley roster migrate --backup-dir DIR [--yes --confirm-breaking]
```

- `set` changes ONE member in ONE file. **Preview is the default**; `--yes` applies. `--scope deck`
  writes the committed `parley-deck/agents.toml`, never the gitignored `agents.local.toml`.
  `--state inactive` **marks** a retired agent; rows are never deleted, so past ideas stay readable.
  A **membership change** — adding, retiring or reviving a member — needs `--confirm-breaking` on
  top of `--yes`, because it changes who deliberates and therefore a future idea's quorum.
- `sync` is the single defined way to reconcile a deck with the machine roster, in **one direction
  only** (machine → deck). Its semantics are **rebase**: it removes deck overrides that merely
  restate the machine value so the deck goes back to inheriting. A deliberate pin — a deck value
  that differs — is never dropped silently: it is enumerated with the exact `--keep AGENT.FIELD`
  that retains it. A `--keep` token matching no override is an error, not a no-op.
- `render` regenerates the §2 table from the authority. It is idempotent, and it **reports** every
  row it removes before removing it.
- `migrate` is the one-shot converter for legacy decks (see below). Attended only.

## The protocol: a global core, a generated deck view

`COOPERATION.md` in a deck is a **generated view** of a global core at
`~/.parley/protocol/core/<version>/` — the same move §2's roster table made. Do not hand-edit it.

```bash
parley protocol status                     # which core is installed, which the deck pins
parley protocol render [--dry-run] [--yes] # regenerate the deck view from the core
parley protocol check                      # report a hand-edited or stale deck copy (never rewrites)
```

- **Releases are write-once.** A core version is never edited in place; a change is a new version.
- **`publish` is attended-only** — it refuses without a controlling terminal. Changing the global
  core is the user's call. An agent proposes a change; it does not apply one.
- **A missing pinned release BLOCKS** rendering rather than substituting another version.
- `render` **reports what it will not carry forward**, in preview and on apply. That report is a
  **line-level diff, not a Markdown semantic analysis**: an empty report means no line disappeared,
  not that no meaning was lost. Read the diff before `--yes`.

**Not yet in force** (ratified, not implemented — do not rely on them): per-idea protocol version
pinning, the deck overlay for local override/extension, and OS-sandbox enforcement.

**Authority.** `parley-deck/agents.toml` owns the roster; `COOPERATION.md` §2 is a generated,
non-authoritative view. Never hand-edit §2 to add or retire an agent.

**Membership is the DECK FILE.** The machine layer (`~/.parley/agents.toml`) seeds *values* for
members the deck declares — it does not add members. A deck declaring two participants runs two,
not however many the machine happens to configure. A deck that declares no roster at all may
display the machine roster, but every such row is marked `inherited-roster`, and `roster render`
refuses to commit it into `COOPERATION.md` without `--adopt-inherited`.

**Legacy decks.** A deck that still has only the old hand-written table keeps working and reports
`legacy-roster` on every row. `roster sync` does **not** migrate it — sync only rebases an existing
deck roster onto the machine values, so on a legacy deck it correctly reports "nothing to do". The
remediation is `parley roster migrate --backup-dir DIR --dry-run` (fleet, attended, with backups
and rollback) or `parley roster set <id> --scope deck --adapter <family> --yes --confirm-breaking`
per member, then `parley roster render` to regenerate §2. An ID that exists only in §2 is reported
`unmapped` / `section2-only`; it is never auto-added.

Agents are also shown with a composite display name of the form `family_model_effort` (e.g.
`claude_opus-5-1m_max`). It is DERIVED for display; the stable roster ID (`claude-1`) remains the
identity used in artifact paths and signoffs. `fast` is a startup speed on a separate axis from
effort — same model, same effort, faster output — never a downgrade.

## Quota auto-exclusion (per-idea only)

The binding predicate and recovery contract live in the live protocol's §9.0. A presence-aware
`[defaults].quota_auto_exclude` boolean supports a deck override and the per-idea `false` opt-out.
Only newly created ideas default on; recorded policy and scope are reused on resume and never widen
on binary upgrade. No roster file changes, and `roster_change_policy` does not gate this per-idea rule.

Only a provenance-verified native terminal provider failure can authorize exclusion. The CLI waits
for the whole readiness/dispatch batch and validates the fixed two-non-facilitator floor and protected
roles. An unsupported adapter or ambiguous error stays on the human path. Standalone preflight is
report-only. Never make the decision from assistant text, tool output, a hang, or disagreement.

Read automatic notices and pending-transition reports from status/wait/organizer brief. Never derive
membership from repeated `excluded:` lines. Historical objections and findings retain their force;
re-inclusion requires owner confirmation and catch-up. A known reset plus five minutes is only a
provider-estimated suggestion for one owner-authorized relaunch, not a timer or retry permission.

## Selection Checkpoint

Before every new idea, every new round, Phase 5 implementation, Phase 6 review cycle, or any requested mid-stream model change, prepare defaults first. Do not ask seven separate required questions.

Required input:

- task statement, if the user has not already provided it.

(The roster + per-agent model confirmation is **not** required here — it is a one-time deck-bootstrap step, see "Transport Selection / deck bootstrap".)

Optional overrides:

- transport: `local-dir`, `github-pr`, or `gitlab-mr`
- facilitator agent
- participant agents
- per-agent model
- per-agent thinking/reasoning/effort level
- speed profile: `fast`, `balanced`, `deep`, or `review`
- timeout policy
- whether code/private data may be sent to each selected external backend

Default selection policy:

- transport: current `COOPERATION.md` transport when set; otherwise `local-dir`.
- participants: a bounded set of discovered installed CLI agents that can run headlessly and write their own artifact, normally 2-4 active participants unless the task genuinely benefits from more distinct modules, review scopes, or competing hypotheses. This MUST include at least one non-facilitator participant when one is available. If a discovered agent is not in the roster, list it and treat pressing Enter as approval to include it with a stable agent ID for this workflow.
- facilitator: the agent/runtime that invoked the skill.
- model: strongest discovered model for each agent. If discovery cannot prove model options, use the CLI default and record `model: cli-default`.
- thinking/reasoning/effort: strongest discovered mode for each agent. If discovery cannot prove thinking options, use the CLI default and record `thinking: cli-default`.
- speed profile: `balanced`, interpreted as smart-fast: the fastest available setting that still keeps the strongest available model/reasoning choice. Use `fast` only when the user explicitly chooses speed over quality.
- timeout: 30 minutes per agent process unless the user overrides it.
- external backend disclosure: YES for task brief and necessary repository/code context, except for credentials, customer data, private documents unrelated to the task, or other clearly sensitive material.

Prompt shape:

```text
Task is required. Everything else has defaults.

Task: <missing or already-known task>

Defaults if you just press Enter:
- participants: <all discovered installed CLI agents, including at least one non-facilitator when available>
- facilitator: <current agent>
- model/thinking: strongest discovered per agent, otherwise CLI default
- speed: balanced smart-fast
- timeout: 30m
- external backend disclosure: yes for task brief and necessary repo/code context, secrets excluded

Reply with only the task, or include overrides.
```

If the task statement is already known, do not stop just to ask for optional settings. Present the defaults briefly, then proceed unless the user overrides them in the same message.

If participant defaults would select only the facilitator, do not proceed as Parley Deck. Retry discovery, ask for another invokable agent, or record a user-authorized solo exception before continuing. The facilitator MUST NOT present a solo run as a completed Parley Deck workflow.

Default to keeping the same selected model/thinking/speed config for all rounds of one idea unless the user changes it. If the user changes config mid-idea, record the change in an inbox note or the next round file so the audit trail explains the difference.

When the user chooses "always use X" preferences, record them in `parley-deck/meta/headless-agents.local.json` only after asking. Treat that file as local machine configuration; do not require it to be committed.

Temporary observers are not quorum members and do not sign off. If the user wants an observer to write a protocol file, first clarify whether to add it as a participant through the roster/protocol path or to keep its output as a non-quorum inbox note.

Participant sizing and per-idea roles:

- Default to 2-4 active participants for normal ideas.
- Add more participants only when the task splits cleanly by module, review scope, or competing hypothesis.
- Use optional `roles:` metadata in `00-prompt.md` when distinct lenses improve coverage.
- Role/lens values are advisory only. They do not change quorum, signoff weight, artifact ownership, drafter eligibility, or roster membership.
- Avoid multi-agent overhead for sequential same-file work or tightly coupled edits.

Speed profile semantics:

- `fast`: shortest acceptable reasoning, smallest/fastest user-approved model, for low-risk drafting or mechanical signoff.
- `balanced`: default smart-fast mode for normal design rounds; use the strongest available model/reasoning that can still complete promptly.
- `deep`: stronger model or deeper reasoning setting for architecture, ambiguity, or contentious decisions.
- `review`: optimize for careful defect finding; prefer deeper reasoning and longer timeout over speed.

Map these labels through the capability matrix. If a CLI cannot express a speed/thinking distinction directly, use the selected model or a local profile. If neither exists, record `unknown` and ask the user.

## Recovery And Partial Completion

Use recovery instead of restarting whole ideas.

1. Inspect the expected files for the active phase and list missing or invalid artifacts.
2. Re-invoke only the missing participant, reviewer, signer, or implementer action.
3. Preserve existing valid files. Never overwrite another agent's file.
4. For non-zero CLI exit, rate limit, auth failure, empty output, or timeout, capture the failure in an inbox note and ask the user whether to retry, replace the participant, extend the deadline, or continue under the protocol's silence/deadline rule.
5. If a round is partial, do not call it complete until every expected file exists or the quorum/deadline rule explicitly permits progress.
6. If recovery changes model, thinking level, timeout, or participant set, record that in the audit trail.

If a file exists but is malformed, ask the owning agent to fix its own file. The facilitator may only repair mechanical directory setup or files it owns.

If the owning agent is unreachable because the CLI is unavailable, credentials expired, the model/profile no longer works, or the agent has left the project, the facilitator must not edit that file as the normal path. Instead:

1. Send a ping via `parley-deck/inbox/<facilitator>-to-<missing-agent>_<slug>.md` according to the quorum rules.
2. If the agent misses the applicable deadline, treat the artifact as late or missing under the quorum/deadline rules.
3. If the user explicitly authorizes a mechanical repair under the protocol's direct-user-instruction exception, apply only that repair, log the override in the commit message, append a trailing HTML comment in the edited file identifying the user authorization, and file an inbox note recording the deviation.

## Protocol Changes

When the skill or workflow exposes a protocol ambiguity that should persist for future agents, do not patch `COOPERATION.md` ad hoc. Open a meta-protocol-change idea under `parley-deck/ideas/meta-protocol-change-<topic>/` and run Phase 0-4 at minimum. Only update `COOPERATION.md` after that idea reaches consensus/finalization.

## Keep It Small

Run the minimum number of rounds needed for the user's goal. Do not add new skills, scripts, roster entries, transports, or protocol changes unless the user approves them.
