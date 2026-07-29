# Parley Deck Skill

<!-- Hook base: claude-1. Grafts: repository-file proof from kimi-1; five-skill close from codex-1. -->

> **One model playing four reviewers is still one model.**

Parley Deck requires separate participants to write their own files, write round
one before reading the others, and cross-review what the others wrote. Disagreements
stay on disk, and recorded signoffs gate what becomes final.

The working state lives in files in your repository that you can read, diff, and
resume — not a chat log you have to trust.

This package includes five skills: the core cooperation protocol and four add-ons
for design, design enforcement, tracker-ready tickets, and parallel worktrees.

## What's in the box

The installer places five skills into each detected runtime. The first is the protocol; the
other four build on it. All five install by default — `--no-addons` takes just the core skill,
`--only <name>[,<name>]` picks specific add-ons.

- **`parley-deck`** — the multi-agent cooperation protocol.
- **`parley-design`** — collaborative design that refuses to read as machine-made.
- **`parley-design-check`** — that doctrine's rules, enforced against files on disk.
- **`parley-tracker`** — tickets a stakeholder, a reviewer, and an agent can all read.
- **`parley-worktrees`** — parallel agents over one repo, without silent corruption.

<!-- Base: codex-1. Graft: the closing "more than one model's first answer" line from kimi-1. -->

### [`parley-deck`](./skills/parley-deck/SKILL.md) — make multi-agent work inspectable

Use the core skill when a design, plan, implementation, or review deserves
independent analysis. Every participant owns its canonical artifact; one agent
does not proxy-write another agent's round, review, or signoff.

The protocol records kickoff, independent round one, cross-review, consensus,
`FINAL.md`, `IMPLEMENTATION.md`, code review, and fix-up. The `fast`, `standard`,
and `deliberation` tracks scale the route to the risk. Canonical files remain
authoritative whether the working surface is a local directory, GitHub pull
requests, or GitLab merge requests. Reach for it when the work is worth more than
one model's first answer.

<!-- Base: kimi-1. Grafts: the alongside/never-instead relationship from hermes-1; the bounded-graft constraint from claude-1. -->

### [`parley-design`](./skills/parley-design/SKILL.md) — choose one visual direction without averaging it away

PDS/1.0 makes participants diverge on directions, critique them, choose one whole,
bind it as a contract, apply it, and audit what shipped. It is markdown doctrine
with no runtime, network, or framework; load it alongside `parley-deck`, never
instead of it.

Its refusals are the point: no numeric aesthetic score, no house look, and no
"good default aesthetic" guessed from the category. One direction wins whole;
zero to three bounded grafts may come from losing directions, but none may modify
the winner's token file. Use it for a new visual world, a changed design rule, or
an audit against a ratified contract instead of taste.

<!-- Base: codex-1. Graft: the "says so instead of passing it" line from claude-1. -->

### [`parley-design-check`](./skills/parley-design-check/SKILL.md) — enforce only what the evidence can prove

This add-on runs the checkable PDS/1.0 rules over design artifacts, DTCG token
documents, stylesheets, and markup. It uses Node built-ins, carries no fallback
registry, and emits stable `rule-id — violation — remedy` findings.

With no registry it refuses rule checks and exits `3`. What it cannot decide is
reported `UNJUDGEABLE`; a run that judged nothing reportable, or left a conformance
claim unverified, exits `4`, not `0`. Its capability declaration is generated from
its detector modules, so it says what it cannot check instead of passing it.

<!-- Base: codex-1. Grafts: "the tracker is a mirror" and the migration consequence from claude-1. -->

### [`parley-tracker`](./skills/parley-tracker/SKILL.md) — write tickets for the business, the builder, and the agent

This skill authors canonical markdown epics, stories, and subtasks with `At a
glance`, `[B] Business`, `[T] Technical`, and `[A] Agent directives` sections.
Acceptance criteria carry audience tags, and the Definition of Done points back
to those criteria with verification commands. Its gap-scan reports the full
readiness list; `claim` refuses to mark a ticket `in-progress` when that scan fails.

The tracker is a mirror; the markdown file is canonical. Sync is one-way by
default, and pull reconciliation may write back only fields declared
`mirror-owned`. The skill defines neutral projections for Jira, Linear, GitHub
Issues, GitLab, Trello, and plain boards; live create/update requires an opt-in
connector. Change trackers and you lose a projection, not a requirement.

<!-- Base: kimi-1. Graft: the no-stack-trace failure framing from claude-1. -->

### [`parley-worktrees`](./skills/parley-worktrees/SKILL.md) — isolate concurrent work before it collides

This is protection against the concurrency failure that leaves no stack trace:
two agents writing the same files and producing a result nobody intended. The
branch + worktree + file-set discipline turns that invisible corruption into a
conflict Git can show.

The worktree-allocation table in `IMPLEMENTATION.md` is the lock manifest. Before
a second concurrent worktree is provisioned, its file set is compared with every
claimed boundary; an intersection is refused unless an explicit override is
recorded. Each implementer gets a sibling worktree. Git gives that worktree its own
working tree, index, `HEAD` and branch — it does not give it its own ports, databases or
caches, so the manifest records those overrides too. Use it when two or more sessions
or Phase-5 implementers work in one repository at once.

## Install

> [!TIP]
> **One command, most agents.** The universal skill installer from
> [`vercel-labs/skills`](https://github.com/vercel-labs/skills) installs all five skills into
> the coding agents it supports — a longer list than this package's own installer covers, and
> theirs to state, not ours:
>
> ```bash
> npx -y skills add feci/parley-deck-skill
> npx -y skills list
> ```
>
> It detects your agents and asks which to install into. `--agent <name>` picks them
> explicitly; `--list` shows what the repository offers without installing anything.

This package's own installer covers fourteen named runtimes and adds health checks
(`doctor`, `status`) and project-metadata sync that the universal one does not:

```bash
npx -y parley-deck-skill@latest install --target all
npx -y parley-deck-skill@latest doctor --target all
```

If your runtime does not pick the change up, follow its own instructions for reloading
skills. The full command reference is in [Install, update, and remove](#install-update-and-remove).

## Use Parley Deck

Ask your agent for the skill by name. In Codex, use `$parley-deck`.

```text
Use $parley-deck to design this feature.
Discover available CLI agents, use the default participants, and write the Parley Deck artifacts.
```

```text
Use $parley-deck to implement the accepted plan for <idea-slug>.
Follow FINAL.md, record IMPLEMENTATION.md, run review rounds, and do not merge until consensus is ready.
```

```text
Use $parley-deck to continue the current Parley Deck workflow.
Start with the session-start checklist, read inbox and open ideas, then tell me the next required action.
```

Substitute freely: *"review this branch against the idea's FINAL.md"*, *"compare two
approaches, arguing each independently in round 1"*, or *"use GitHub PR transport"* — the
shape of the request is the same.

If your runtime does not support skills directly, attach the skill and the protocol as
instruction context. In a repository checkout they are `skills/parley-deck/SKILL.md` and
`skills/parley-deck/references/COOPERATION.md`; in an installed skill directory they are
`SKILL.md` and `references/COOPERATION.md`. The skill is plain Markdown by design.

## Install, update, and remove

The installer checks known user-level agent directories and CLI commands, then installs into
the runtimes it detects. A marker-only
directory created by this installer is not treated as a real runtime.

Native targets are **fourteen named runtimes** — Codex, Claude Code, Antigravity CLI (plugin
mode), legacy Gemini CLI (extension mode), Hermes, Qwen, CodeBuddy, Goose, Kimi, Factory
Droid, Vibe, Cursor, OpenCode and AionRS — **plus `generic`, a destination you point at with
`--dest`.**

```bash
# every detected runtime, then verify
npx -y parley-deck-skill@latest install --target all
npx -y parley-deck-skill@latest doctor --target all

# update in place
npx -y parley-deck-skill@latest install --target all --force

# preview without writing
npx -y parley-deck-skill@latest install --target all --dry-run

# one runtime, a project scope, or an explicit directory
npx -y parley-deck-skill@latest install --target codex
npx -y parley-deck-skill@latest install --scope project --target all --project . --include-undetected
npx -y parley-deck-skill@latest install --target generic --dest /path/to/skills/parley-deck

# seed every supported path even where the runtime is not detected
npx -y parley-deck-skill@latest install --target all --include-undetected

# remove managed copies
npx -y parley-deck-skill@latest uninstall --target all
```

Commands: `install`, `paths`, `doctor`, `status`, `sync-project`, `uninstall`, `--version`.

```text
--target auto|all|codex|claude|agy|gemini|hermes|qwen|codebuddy|goose|kimi|droid|vibe|cursor|opencode|aionrs|generic
--scope user|project     --project <path>     --dest <path>
--force  --dry-run  --json  --include-undetected
--yes                    (sync-project only: without it, sync-project is a dry run)
--no-addons              --only <name>[,<name>]
```

Other channels:

```bash
brew install feci/parley/parley-deck-skill && parley-deck-skill install --target all
winget install Feci.ParleyDeckSkill        # Windows; standalone binaries also on GitHub releases
npm install -g parley-deck-skill && parley-deck-skill install
gemini extensions install https://github.com/feci/parley-deck-skill   # legacy Gemini only
```

For legacy Gemini use `--target gemini`, which writes `~/.gemini/extensions/parley-deck`.
`gemini extensions install <repo-url>` is the other manager of that same destination — use one
or the other, never both. The repository manifest points at `skills/parley-deck/SKILL.md` for
that path, and a native install rewrites its staged copy to the flat destination shape;
**we have not been able to run the Gemini CLI to confirm it end to end.** Antigravity is a
separate target: prefer `--target agy`, and validate with
`agy plugin validate ~/.gemini/config/plugins/parley-deck`.

Run `parley-deck-skill paths` for the install directory of every *detected* target, or
`parley-deck-skill paths --target all --include-undetected` for all fourteen. The installer writes
`.parley-deck-skill-install.json` into each managed destination; updates replace marked
installs safely, and unmarked directories are never overwritten or removed without `--force`.

## Local agent contract

Parley Deck hardcodes no agent names. Any CLI agent can participate if it can run headlessly,
receive a prompt through stdin or a configured argument, read the workspace, write exactly the
requested protocol file, and report enough failure information for recovery.

The facilitator builds a capability matrix before each workflow. By default it uses a bounded
participant set — normally two to four, including at least one non-facilitator when one is
available — the strongest discovered model and thinking mode per agent, a 30-minute timeout,
and YES for sending the task brief plus necessary repository context to external CLI backends.
Obvious secrets and clearly sensitive customer data still require explicit handling.

## Transports

- `local-dir` — canonical files in the repository
- `github-pr` — canonical files plus GitHub PR ergonomics
- `gitlab-mr` — canonical files plus GitLab MR ergonomics

Canonical files are the source of truth. PR and MR comments are mirrors.

## Repository layout

```text
parley-deck-skill/
├── skills/
│   ├── parley-deck/              # the core skill
│   │   ├── SKILL.md              # canonical entrypoint for agents
│   │   ├── references/           # COOPERATION.md, compatibility.json, WORKED_EXAMPLES.md
│   │   └── agents/               # manifest.yaml (neutral), openai.yaml (Codex UI metadata)
│   ├── parley-design/            # doctrine + PDS/1.0 (markdown only)
│   ├── parley-design-check/      # the checker: bin/, lib/, test/
│   ├── parley-tracker/
│   └── parley-worktrees/
├── bin/  lib/                    # dependency-free Node installer
├── test/  packaging/  scripts/
├── plugin.json                   # Antigravity CLI plugin mode
├── gemini-extension.json         # legacy Gemini extension mode
└── NOTICE.md  RELEASING.md  LICENSE
```

## Related repositories, and what this one owes

This repository is only the skill layer, and the skill implements **manual facilitation**:
an agent follows it, invokes other CLI agents, and verifies canonical files. Deterministic
automated orchestration is not part of it and requires separate tooling.

Parley Deck did not invent the ideas it runs on. The protocol lineage recorded here is
**RHO** (Retrospective Harness Optimization), credited in `skills/parley-deck/references/COOPERATION.md` §13,
where RHO's single-model self-preference is deliberately replaced by the deck's multi-agent
quorum. `NOTICE.md` records `hallmark` and `impeccable` as the prior art studied for the
design add-ons. Reference is for attribution and lineage only; no endorsement, sponsorship,
or affiliation is implied.

## License

Apache-2.0. See `LICENSE`.
