# Parley Deck Skill

Multi-agent cooperation for AI developers who want more than a chat transcript.

Parley Deck is a protocol for making several AI agents think independently, challenge each other, converge on a decision, implement it, review it, and leave behind a durable audit trail. This repository contains the portable skill layer: a vendor-neutral `SKILL.md` that teaches a capable agent runtime how to facilitate that workflow with local CLI agents, files, GitHub PRs, or GitLab MRs.

It is intentionally not tied to one model, one vendor, or one orchestration platform.

## Why This Exists

Most multi-agent workflows fail in predictable ways:

- one agent anchors the rest before they form their own view
- disagreements vanish inside a long chat history
- implementation starts before there is real consensus
- reviews are informal, unowned, and hard to resume
- vendor-specific assumptions leak into the workflow

Parley Deck turns the conversation into structured project artifacts. Every participant writes its own files. Every round is explicit. Consensus is gated. Implementation and review are separate phases. Recovery is possible because the state lives in the repository.

## What The Skill Does

When invoked by an AI agent, this skill guides it to:

- read the live `COOPERATION.md` protocol, or the bundled fallback
- discover available local CLI agents without assuming vendor names
- ask only for the required task statement, then continue with clear defaults unless the user overrides them
- start a new idea with independent Round 1 analysis
- run cross-review rounds and consensus signoff
- continue into implementation, code review, review consensus, and fix-up cycles
- enforce file ownership so headless agents create their own protocol artifacts
- handle partial completion, timeouts, unreachable agents, and user escalations

The result is a reusable cooperation loop for serious AI-assisted engineering work.

## Repository Layout

```text
parley-deck-skill/
|-- bin/
|   `-- parley-deck-skill.js
|-- lib/
|   `-- installer.js
|-- SKILL.md
|-- agents/
|   |-- manifest.yaml
|   `-- openai.yaml
|-- gemini-extension.json
`-- references/
    |-- COOPERATION.md
    `-- WORKED_EXAMPLES.md
```

- `bin/` and `lib/` contain the dependency-free Node installer.
- `SKILL.md` is the canonical entrypoint for agents.
- `references/COOPERATION.md` is a portability snapshot of the protocol.
- `references/WORKED_EXAMPLES.md` contains non-authoritative examples and config shapes.
- `agents/manifest.yaml` is vendor-neutral metadata.
- `agents/openai.yaml` is only UI metadata for Codex/OpenAI skill tooling.
- `gemini-extension.json` lets Gemini CLI load the repository as an extension.

## Quick Start

Install into detected personal agent runtimes:

```bash
npx -y parley-deck-skill@latest install
```

Then restart the target agent runtime and ask it to use Parley Deck:

```text
Use $parley-deck to start a design review for this task.
Discover installed CLI agents, show me the capability matrix, and use the default participants/model/thinking/speed/timeout choices unless I override them.
```

If your runtime does not support skills directly, attach `SKILL.md` and `references/COOPERATION.md` as instruction context. The skill is plain Markdown by design, so any capable tier-1 model can follow it.

## Installation

Recommended:

```bash
npx -y parley-deck-skill@latest install
```

Install everywhere, whether or not the runtime is currently detected:

```bash
npx -y parley-deck-skill@latest install --target all
```

Install a single target:

```bash
npx -y parley-deck-skill@latest install --target codex
npx -y parley-deck-skill@latest install --target claude
npx -y parley-deck-skill@latest install --target gemini
```

Install into a project instead of your personal skill directories:

```bash
npx -y parley-deck-skill@latest install --scope project --target all --project .
```

Install into an explicit directory:

```bash
npx -y parley-deck-skill@latest install --target generic --dest /path/to/skills/parley-deck
```

Global npm install:

```bash
npm install -g parley-deck-skill
parley-deck-skill install
```

Homebrew:

```bash
# Available after the feci/homebrew-parley tap is published.
brew install feci/parley/parley-deck-skill
parley-deck-skill install
```

Gemini CLI can also install the repository as an extension:

```bash
gemini extensions install https://github.com/feci/parley-deck-skill
```

Use either the Gemini extension command or `parley-deck-skill install --target gemini`, not both. The npm installer writes to `~/.gemini/extensions/parley-deck`; Gemini's own GitHub installer may name the copy from the repository URL.

Manual paths:

```text
Codex:  ${CODEX_HOME:-~/.codex}/skills/parley-deck
Claude: ~/.claude/skills/parley-deck
Gemini: ~/.gemini/extensions/parley-deck
```

Codex users can also use the built-in `$skill-installer` with the GitHub repository URL, then restart Codex.

## Installer Commands

```bash
parley-deck-skill install
parley-deck-skill paths
parley-deck-skill doctor
parley-deck-skill uninstall
parley-deck-skill --version
```

Useful flags:

```text
--target auto|all|codex|claude|gemini|generic
--scope user|project
--project <path>
--dest <path>
--force
--dry-run
--json
```

The installer writes `.parley-deck-skill-install.json` into every managed destination. Updates replace marked installs safely. Unmarked directories are never overwritten or removed unless you pass `--force`.

## Updating

Recommended update:

```bash
npx -y parley-deck-skill@latest install --target all --force
```

That downloads the latest npm release and replaces existing managed installs for Codex, Claude, and Gemini. Restart the affected agent runtime after updating so it reloads `SKILL.md`.

Update only one runtime:

```bash
npx -y parley-deck-skill@latest install --target codex --force
npx -y parley-deck-skill@latest install --target claude --force
npx -y parley-deck-skill@latest install --target gemini --force
```

Preview an update without writing files:

```bash
npx -y parley-deck-skill@latest install --target all --dry-run
```

If you installed the package globally, update the global installer first:

```bash
npm install -g parley-deck-skill@latest
parley-deck-skill install --target all --force
```

If you installed via Gemini's native extension manager instead of the npm installer:

```bash
gemini extensions update parley-deck
```

If you installed via Homebrew after the tap is published:

```bash
brew update
brew upgrade parley-deck-skill
parley-deck-skill install --target all --force
```

Check an install:

```bash
parley-deck-skill doctor --target all
```

Uninstall managed copies:

```bash
parley-deck-skill uninstall --target all
```

## Local Agent Contract

Parley Deck does not require hardcoded agent names. Any CLI agent can participate if it can:

- run headlessly or semi-headlessly
- receive a prompt through stdin or a configured prompt argument
- read the project workspace
- write exactly the requested protocol file
- report enough failure information for recovery

The facilitator builds a capability matrix before each workflow. By default it uses all discovered installed CLI agents, the current agent as facilitator, the strongest discovered model and thinking mode per agent, balanced smart-fast speed, a 30 minute timeout, and YES for sending the task brief plus necessary repository/code context to external CLI backends. Obvious secrets and clearly sensitive private/customer data still require explicit handling.

## Transports

The skill supports the three protocol transports:

- `local-dir`: canonical files in the repository
- `github-pr`: canonical files plus GitHub PR ergonomics
- `gitlab-mr`: canonical files plus GitLab MR ergonomics

Canonical files remain the source of truth. PR/MR comments are mirrors and workflow aids, not the protocol authority.

## Relationship To Other Parley Deck Repositories

This repository is only the skill layer.

- `parley-deck`: server app, protocol deck, A2A facilitator, UI, database, auth, and spikes
- `parley-deck-cli`: standalone CLI for local and server-backed workflows
- `parley-deck-skill`: this portable AI skill

The skill implements manual facilitation. Deterministic automated orchestration belongs in the server and CLI repositories.

## Status

This is an early, practical skill for developers experimenting with multi-agent engineering workflows. The protocol is deliberately file-first, auditable, and resumable. That makes it useful today with ordinary CLI agents, while leaving room for deeper A2A automation later.

Start with the skill, run one real discussion, and inspect the files it leaves behind. The protocol's value should be obvious from the artifact trail.

## License

Apache-2.0. See `LICENSE`.
