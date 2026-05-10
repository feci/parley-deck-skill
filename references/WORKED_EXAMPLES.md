# Worked Examples

These examples are non-authoritative. `SKILL.md` and `COOPERATION.md` remain canonical.

## Capability Matrix Example

```markdown
| Agent ID | CLI | Installed | Headless mode | Write mode | Models | Thinking | Speed | Timeout | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| agent-a | agent-a-cli | yes | stdin + configured args | workspace write args | user-selected | high/deep if supported | deep | 75m | external backend approved |
| agent-b | agent-b-cli | yes | stdin + configured args | workspace write args | unknown | unknown | balanced | 45m | ask user before launch |
```

When options are unknown, do not guess. Ask the user or run non-destructive CLI discovery.

## Local Config Example

```json
{
  "defaults": {
    "timeouts": {
      "signoffMs": 900000,
      "roundMs": 2700000,
      "reviewMs": 3600000,
      "deepReasoningMs": 4500000
    }
  },
  "agents": {
    "agent-a": {
      "cli": "agent-a-cli",
      "headlessArgs": ["--non-interactive"],
      "promptMode": "stdin",
      "writeModeArgs": ["--workspace-write"],
      "modelFlag": "--model",
      "model": "user-selected-model",
      "thinkingFlag": "--effort",
      "thinking": "user-selected-thinking-level",
      "speed": "deep",
      "timeoutMs": 4500000
    }
  }
}
```

Store machine-local preferences in `parley-deck/meta/headless-agents.local.json` only after user approval. Do not require that file to be committed.

## Example Workflow

User request:

```text
Use Parley Deck for a design review of X with the installed CLI agents.
```

Facilitator flow:

1. Load live `parley-deck/COOPERATION.md`.
2. Run the session-start check for inbox, open ideas, missing round/review files, and PR/MR actions.
3. Discover candidate CLI agents and build the capability matrix.
4. Ask the user to choose transport, facilitator, participants, model, thinking level, speed, timeouts, and external disclosure approval.
5. Create `ideas/<slug>/00-prompt.md` and `round-01/`.
6. If the facilitator is a participant, write its own round file first.
7. Invoke each headless participant with one exact output path.
8. Verify all expected files exist, then continue to cross-review, consensus, finalization, implementation, review, and fix-up as required.

## Portability Notes

The skill directory is self-contained:

```text
parley-deck/
├── SKILL.md
├── agents/
│   ├── manifest.yaml
│   └── openai.yaml
└── references/
    ├── COOPERATION.md
    └── WORKED_EXAMPLES.md
```

Agents that support skills should load `SKILL.md` as the primary entrypoint. Agents that do not support the skill format can still use `SKILL.md` and `references/COOPERATION.md` as normal prompt context.

`agents/openai.yaml` is only for Codex/OpenAI UI metadata. Other agents should use `agents/manifest.yaml` if they want machine-readable metadata.
