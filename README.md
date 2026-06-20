# Parley Deck Skill

> **Install the Parley Deck cooperation protocol into your AI agents** — real
> multi-agent deliberation with a durable audit trail, not one model role-playing
> a committee.

`parley-deck-skill` installs the vendor-neutral **Parley Deck** cooperation
instructions (and a fallback protocol snapshot) into supported agent runtimes —
Codex, Claude Code, Antigravity, Gemini, Hermes, or a custom skill directory — then
helps you check and sync project metadata. It teaches agents *how to participate*
in the protocol; the companion `parley` CLI orchestrates the runs.

**Parley Deck** is a transport-agnostic protocol where several agents genuinely
cooperate on a change: each writes its own analysis, they cross-review, reach a
recorded consensus, implement, and review the implementation — every step a file
you can read, diff, and resume. It is intentionally not tied to one model, one
vendor, or one orchestration platform.

### What the protocol gives your agents

- **An 8-phase idea lifecycle** — kickoff → independent analysis → cross-review →
  consensus → `FINAL.md` → `IMPLEMENTATION.md` → code review → fix-up; append-only
  and resumable from the documents alone.
- **Non-solo by design** — stable agent IDs, one canonical file per agent per round;
  no agent overwrites another.
- **Compare, don't merge** — a consensus "Comparison & blind spots" lens that rates
  confidence by agreement and surfaces blind spots instead of averaging them away.
- **Discipline that travels** — no-suppression review dispositions, strict gates,
  and pre-idea readiness checks, the same across every runtime.

### Inspired by — adopted & adapted

Parley Deck didn't invent these ideas; it wired them into one quorum-gated protocol:

- **OpenRouter Fusion** → the compare-not-merge consensus lens.
- **OpenAI ExecPlans / PLANS.md** → resume-from-the-doc `FINAL.md` + living `IMPLEMENTATION.md`.
- **RHO** → advisory, quorum-gated retrospective optimization.
- **kindly** → strict gates, stopping judgment, no-suppression dispositions, artifact-wins.
- **Preflight readiness** → protocol-freshness + roster liveness before each idea.

*Reference to these projects is for attribution and lineage only; no endorsement,
sponsorship, or affiliation is implied.*

## Install

Fastest path:

```bash
npx -y parley-deck-skill@latest install --target all
```

Then restart your agent runtime and verify:

```bash
npx -y parley-deck-skill@latest doctor --target all
```

Homebrew:

```bash
brew install feci/parley/parley-deck-skill
parley-deck-skill install --target all
```

## Use Parley Deck

After installing, ask your agent to use the skill by name. In Codex, use `$parley-deck`.

```text
Use $parley-deck to design this feature.
Discover available CLI agents, use the default participants, and write the Parley Deck artifacts.
```

```text
Use $parley-deck to implement the accepted plan for <idea-slug>.
Follow FINAL.md, record IMPLEMENTATION.md, run review rounds, and do not merge until consensus is ready.
```

```text
Use $parley-deck to review this branch against the idea's FINAL.md.
Ask every non-implementer agent for its own review file, draft review consensus, and list agreed fixes.
```

```text
Use $parley-deck to continue the current Parley Deck workflow.
Start with the session-start checklist, read inbox and open ideas, then tell me the next required action.
```

Useful copy/paste prompts:

```text
Use $parley-deck for a quick architecture decision on:
<task>

Use participants codex, claude, agy, hermes if available.
Keep the scope small and stop after FINAL.md.
```

```text
Use $parley-deck to compare two implementation approaches:
<approach A>
<approach B>

Make each agent argue independently in round 1, then converge on a recommendation.
```

```text
Use $parley-deck to ship this change end to end:
<task>

Run design, implementation, code review, fix-up, tests, and merge only after all signoffs are ready.
```

```text
Use $parley-deck with GitHub PR transport.
Create or continue the idea for <task>, keep canonical files under parley-deck/ideas/, and mirror the lifecycle in PRs.
```

If your runtime does not support skills directly, attach `SKILL.md` and `references/COOPERATION.md` as instruction context. The skill is plain Markdown by design, so any capable tier-1 model can follow it.

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
|-- plugin.json
|-- gemini-extension.json
`-- references/
    |-- COOPERATION.md
    |-- compatibility.json
    `-- WORKED_EXAMPLES.md
```

- `bin/` and `lib/` contain the dependency-free Node installer.
- `SKILL.md` is the canonical entrypoint for agents.
- `references/COOPERATION.md` is a portability snapshot of the protocol.
- `references/compatibility.json` describes packaged protocol and project metadata schema compatibility.
- `references/WORKED_EXAMPLES.md` contains non-authoritative examples and config shapes.
- `agents/manifest.yaml` is vendor-neutral metadata.
- `agents/openai.yaml` is only UI metadata for Codex/OpenAI skill tooling.
- `plugin.json` lets Antigravity CLI load the repository as a plugin.
- `gemini-extension.json` lets legacy Gemini CLI load the repository as an extension.

## Installation Details

Recommended:

```bash
npx -y parley-deck-skill@latest install --target all
```

The installer uses an AionUI-style local runtime registry: it checks known user-level agent directories and CLI commands, then installs into the runtimes it can detect. For broad AionUI-derived targets, a marker-only directory created by this installer is not treated as a real runtime. Current native targets are Codex, Claude Code, Antigravity CLI plugin mode, legacy Gemini CLI extension mode, Hermes, Qwen, CodeBuddy, Goose, Kimi, Factory Droid, Vibe, Cursor, OpenCode, and AionRS.

Install into every detected runtime:

```bash
npx -y parley-deck-skill@latest install --target all
```

Seed every supported target path even when the runtime is not detected:

```bash
npx -y parley-deck-skill@latest install --target all --include-undetected
```

Install a single target:

```bash
npx -y parley-deck-skill@latest install --target codex
npx -y parley-deck-skill@latest install --target claude
npx -y parley-deck-skill@latest install --target agy
npx -y parley-deck-skill@latest install --target hermes
npx -y parley-deck-skill@latest install --target gemini  # legacy Gemini only
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
brew install feci/parley/parley-deck-skill
parley-deck-skill install
```

Standalone Windows binaries are attached to GitHub releases. They do not require Node:

```powershell
.\parley-deck-skill-v1.2.1-windows-x64.exe install --target all --force
```

This is the packaging shape intended for WinGet. Until the WinGet manifest is accepted, download the `.exe` from the latest GitHub release.

Antigravity CLI uses the `agy` installer target:

```bash
npx -y parley-deck-skill@latest install --target agy
agy plugin validate ~/.gemini/config/plugins/parley-deck
```

Legacy Gemini CLI can also install the repository as an extension:

```bash
gemini extensions install https://github.com/feci/parley-deck-skill
```

Use either the Gemini extension command or `parley-deck-skill install --target gemini`, not both. The npm installer writes to `~/.gemini/extensions/parley-deck`; Gemini's own GitHub installer may name the copy from the repository URL. Prefer `--target agy` for new Antigravity installs.

Manual paths:

```text
Codex:    ${CODEX_HOME:-~/.codex}/skills/parley-deck
Claude:   ~/.claude/skills/parley-deck
Antigravity: ~/.gemini/config/plugins/parley-deck
Gemini legacy: ~/.gemini/extensions/parley-deck
Hermes:   ~/.hermes/skills/parley-deck
Qwen:     ~/.qwen/skills/parley-deck
Goose:    ~/.goose/skills/parley-deck
OpenCode: ~/.opencode/skills/parley-deck
```

Codex users can also use the built-in `$skill-installer` with the GitHub repository URL, then restart Codex.

## Installer Commands

```bash
parley-deck-skill install
parley-deck-skill paths
parley-deck-skill doctor
parley-deck-skill status --target all --project . --json
parley-deck-skill sync-project --project . --dry-run
parley-deck-skill uninstall
parley-deck-skill --version
```

Useful flags:

```text
--target auto|all|codex|claude|agy|gemini|hermes|qwen|codebuddy|goose|kimi|droid|vibe|cursor|opencode|aionrs|generic
--scope user|project
--project <path>
--dest <path>
--force
--dry-run
--yes
--json
--include-undetected
```

The installer writes `.parley-deck-skill-install.json` into every managed destination. Updates replace marked installs safely. Unmarked directories are never overwritten or removed unless you pass `--force`.

## Updating

Recommended update:

```bash
npx -y parley-deck-skill@latest install --target all --force
```

That downloads the latest npm release and replaces existing managed installs for every detected target. Restart the affected agent runtime after updating so it reloads `SKILL.md`.

Update only one runtime:

```bash
npx -y parley-deck-skill@latest install --target codex --force
npx -y parley-deck-skill@latest install --target claude --force
npx -y parley-deck-skill@latest install --target agy --force
npx -y parley-deck-skill@latest install --target hermes --force
npx -y parley-deck-skill@latest install --target gemini --force  # legacy Gemini only
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
