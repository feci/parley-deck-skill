# Headless launch reference — parley-deck

Relocated verbatim from the SKILL.md core (lean-organizer C.4). Load on demand;
the core's Driver-First Operation section says when hand-launching applies.

## Autonomous Execution (required)

Every headless participant MUST be invoked in its non-interactive auto-approve ("yolo") mode so it can WRITE its own canonical artifact (`round-NN/<id>.md`, signoffs, review files) without a blocking permission prompt. There is no single flag across vendors — each CLI has its own equivalent, scoped to the deck/workspace (never a blanket machine-wide bypass). Obvious-secret redaction still applies.

| CLI | Autonomous write mode |
| --- | --- |
| claude | `--permission-mode bypassPermissions` (+ `--add-dir <deck>` to scope it) |
| codex | `--sandbox workspace-write -c approval_policy="never"` |
| hermes | `--yolo` |
| agy (Antigravity) | `--dangerously-skip-permissions` (+ `--add-dir <deck>`) |
| kimi (Kimi Code) | plain `-p` — its print mode already auto-approves in-workspace writes. NOTE: `--yolo`/`--auto` are mutually exclusive with `-p`, so `-p` IS kimi's yolo-equivalent. |
| opencode | `run --auto` — the prompt is an argv positional, not stdin. `opencode run` writes unattended even without `--auto`; pass `--auto` explicitly, because an implicit vendor default is what may change between versions. |
| zcode (Z.AI) | `--mode yolo` (+ `--cwd <deck>` to scope it). The prompt is the value of `--prompt`, not stdin. `zcode --help` calls yolo the default for `--prompt`, but `~/.zcode/cli/config.json` stores `permission.mode = "build"` — the two disagree, so pass `--mode yolo` explicitly. zcode has NO model flag: `--model` is absent from `--help` and exits 1, so the model comes from that same config file and cannot be pinned per invocation. |

The source of truth for an agent's autonomous capability is the **effective launch argv**, not the declared mode. The declared autonomous-write mode is a verification contract, not a second set of launch arguments: before treating a headless participant as able to write its artifact, inspect the effective launch arguments after all configuration layers have been applied — the launch config recorded in the orchestration summary, or `parley agents list` when the parley CLI drives the agents — and verify that every argument required by the declared mode is present. A config override can replace the launch arguments wholesale and silently drop the enabling flag. If the effective arguments cannot be inspected, or any required argument is absent, treat autonomous write as unavailable (`AUTO=no`) and do not launch that participant as write-capable. Passing this check proves only that the autonomous mode is enabled; it does not prove workspace confinement. If workspace confinement cannot be demonstrated for an agent, treat its autonomous bit as unset (fail-closed) rather than escalating to a full-filesystem bypass. A vendor flag change is a config edit, not a skill revision.

## Headless Agent Configuration

Resolve headless agent settings in this order:

1. Explicit user instruction in the current request.
2. `PARLEY_HEADLESS_AGENT_CONFIG` pointing to a JSON config file.
3. `parley-deck/meta/headless-agents.local.json` when present.
4. Capability discovery from the CLI.
5. CLI defaults, after telling the user which settings are unspecified.

Use this generic JSON shape for local configuration:

```json
{
  "defaults": {
    "timeouts": {
      "signoffMs": 600000,
      "roundMs": 1800000,
      "reviewMs": 1800000,
      "deepReasoningMs": 1800000
    }
  },
  "agents": {
    "<agent-id>": {
      "cli": "<command-or-absolute-path>",
      "headlessArgs": ["<arg>", "<arg>"],
      "promptMode": "stdin",
      "modelFlag": "--model",
      "model": "<strongest-discovered-or-cli-default>",
      "thinkingFlag": "<optional-thinking-flag>",
      "thinking": "<strongest-discovered-or-cli-default>",
      "profileFlag": "<optional-profile-flag>",
      "profile": "<optional-profile>",
      "speed": "balanced",
      "timeoutMs": 1800000
    }
  }
}
```

All values above are placeholders. The facilitator must fill them from explicit user choice, CLI capability discovery, or the default selection policy.

This shape is **manual-facilitator input**: it is what you read when you assemble and run the command yourself (branch A of "Generic CLI Invocation Contract"). The Parley CLI reads its own snake-case configuration instead, where `headless_args` is the complete argv template and nothing is appended to it — see branch B.

**There is no separate write-mode argument list.** The flag that lets an agent write its own artifact belongs **inside** `headlessArgs`. Model, thinking and profile flags remain separate fields and are appended by branch A at launch; the write-enabling flag is not one of them.

**Migrating an older config.** When an existing `headless-agents.local.json` contains a `writeModeArgs` field, merge its arguments into that agent's `headlessArgs` and remove the field. It was a separate list in older revisions of this skill and is no longer part of the shape; leaving the enabling flag there means the agent launches without it.

Record the effective launch config in the orchestration summary: agent ID, CLI path, selected model, selected thinking/profile/effort, speed profile, timeout, and transport.

## Timeout Policy

Use generous process timeouts. Top-tier models, deep reasoning modes, large code reviews, and implementation planning can legitimately take many minutes.

Recommended defaults:

- Default per-agent process timeout: 30 minutes.
- Signoff append: 10 minutes unless the selected CLI is known to be slow.
- Cross-review or code review with substantial context: default 30 minutes; if the agent times out, recover by re-invoking only that agent with a longer timeout.
- Very large implementation review: split the review or ask before raising the timeout above 60 minutes.

Do not confuse UI polling intervals with process timeouts. Poll long-running CLI processes periodically, but do not terminate them unless the configured process timeout is reached.

If a participant times out, write an inbox note such as `parley-deck/inbox/<facilitator>-to-all_<slug>_timeout.md` and follow `COOPERATION.md` quorum/deadline rules. Do not fabricate that participant's artifact.

## Generic CLI Invocation Contract

Prefer stdin for prompts. Avoid passing large or private prompts through argv because process listings may expose them and OS argument limits can fail. This is a preference, not a rule: some CLIs do not read the prompt from stdin, so always honor the selected agent's actual prompt-delivery contract over this default.

`promptMode` records how the chosen CLI takes the prompt. Discover it before launch and record it in the capability matrix:

- `stdin`: pipe the prompt to the process's standard input. Default preference.
- `argv`: pass the prompt as a positional argument.
- `flag:<name>`: pass the prompt as the *value* of a specific flag, for example `flag:--print`. The prompt token must come immediately after that flag and be the final argument. Never leave a value-taking prompt flag as the last token while sending the prompt on stdin: such a CLI aborts with a "flag needs an argument" parse error and writes no output, so the launch silently fails. Antigravity (`agy --print "<prompt>"`) is the canonical example — its `--print`/`--prompt` is value-taking, so `agy ... --print` with the prompt piped to stdin fails, while `agy ... --print "<prompt>"` succeeds.

Use one-shot invocations. Do not resume hidden sessions unless the user explicitly asks for continuity.

There are two different activities here, and they do not follow the same rules. Decide which one you are doing before building anything.

### A. Hand-rolling an invocation yourself (manual facilitation)

When you assemble and run the command yourself, construct it from the capability matrix and local config:

1. Start with the configured `cli`.
2. Add `headlessArgs` — including the flag that lets the agent write its own artifact. That flag belongs in this list; there is no separate write-mode list. (If an older config still carries a `writeModeArgs` field, merge it into `headlessArgs` and drop the field.)
3. Add model/thinking/profile flags only when discovered or configured.
4. Deliver the prompt using the configured `promptMode`: pipe it to stdin, append it as a positional argument, or place it as the value of the configured prompt flag (last). When the prompt flag is value-taking, the prompt must be its explicit value rather than stdin.
5. Apply the configured process timeout.

Do not pass placeholder brackets literally. Do not use broad bypass modes unless the user explicitly approves them. The intended permission shape is narrow workspace writes to the participant's own protocol file.

### B. Letting the Parley CLI launch the agent

`parley` does **not** assemble a command. The resolved `headless_args` is the complete argv template and is launched as-is:

- `{prompt}` and `{root}` are substituted **inside** `headless_args`, so `{prompt}` must already sit in the position that CLI requires.
- `prompt_mode` only decides whether the prompt is wired to stdin; it does not add or move arguments.
- **Nothing is appended afterwards** — no permission flag, no model flag, no thinking flag, no profile flag, no separate write-mode list.

The practical consequence: a config layer that overrides `headless_args` replaces it wholesale, and can silently drop an enabling flag that a declared autonomous mode still claims. That is why the check in "Autonomous Execution" reads the effective argv rather than the declared mode.
