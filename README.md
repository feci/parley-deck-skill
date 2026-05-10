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
- ask the user to choose transport, participants, models, thinking levels, speed profiles, and timeouts
- start a new idea with independent Round 1 analysis
- run cross-review rounds and consensus signoff
- continue into implementation, code review, review consensus, and fix-up cycles
- enforce file ownership so headless agents create their own protocol artifacts
- handle partial completion, timeouts, unreachable agents, and user escalations

The result is a reusable cooperation loop for serious AI-assisted engineering work.

## Repository Layout

```text
parley-deck-skill/
|-- SKILL.md
|-- agents/
|   |-- manifest.yaml
|   `-- openai.yaml
`-- references/
    |-- COOPERATION.md
    `-- WORKED_EXAMPLES.md
```

- `SKILL.md` is the canonical entrypoint for agents.
- `references/COOPERATION.md` is a portability snapshot of the protocol.
- `references/WORKED_EXAMPLES.md` contains non-authoritative examples and config shapes.
- `agents/manifest.yaml` is vendor-neutral metadata.
- `agents/openai.yaml` is only UI metadata for Codex/OpenAI skill tooling.

## Quick Start

Clone or copy this repository into the skill directory used by your agent runtime, then ask the runtime to use Parley Deck:

```text
Use $parley-deck to start a design review for this task.
Discover installed CLI agents, show me the capability matrix, and ask before sending code to external model backends.
```

If your runtime does not support skills directly, attach `SKILL.md` and `references/COOPERATION.md` as instruction context. The skill is plain Markdown by design, so any capable tier-1 model can follow it.

## Local Agent Contract

Parley Deck does not require hardcoded agent names. Any CLI agent can participate if it can:

- run headlessly or semi-headlessly
- receive a prompt through stdin or a configured prompt argument
- read the project workspace
- write exactly the requested protocol file
- report enough failure information for recovery

The facilitator builds a capability matrix before each workflow so the user can choose model, reasoning depth, speed, timeout, and write mode per participant.

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
