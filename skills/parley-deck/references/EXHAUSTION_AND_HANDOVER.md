# Provider exhaustion and role handover

The live protocol governs. This reference explains CLI 1.56.0 and skill/core 2.20.0.

New ideas freeze `participant-failure-v2`. Saved policies retain their trigger, bytes, and hashes.
Only an owner-bound revision may widen a saved policy. It freezes original order and organizer identity at that boundary.
Use `parley run --organizer <participant>` or `--facilitator <external-organizer>` for new CLI runs.
An undeclared organizer has no inferred identity. `author: user` supplies no organizer identity.

Exhaustion requires failed execution and reviewed native account-credit, account-token, quota, or named usage-allowance evidence.
Bare 429/5xx, overload, auth, context limits, local budgets, prose, and tool output do not qualify.
Malformed or mixed framing rejects. Reset validity is separate; short, absent, past, malformed, or conflicting resets become unknown.
The legacy quota predicate and its 60-minute threshold remain unchanged.

Persist the bound invocation and output validation before return. A proven failure suppresses that identity throughout the idea.
Suppression survives new prompts, steps, runs, restarts, policy changes, and blocked membership transitions.
It does not itself change membership. Reconcile interrupted validation without another child.
Missing or corrupt authority blocks for repair. Valid output, including BLOCK or FAIL, wins.
An already in-flight later success also wins. Old valid implementation output cannot excuse a failed new code step.

Do not infer shared credentials from provider, model, gateway, or account aliases.
One identity's failure does not exclude peers. This release has no machine exhaustion cache.
The next idea probes afresh. SDK-internal retries before terminal failure remain outside the CLI's control.

## Succession and retained obligations

Resolve the initial implementer through its existing pin/designation/default/FINAL chain before a role transition.
Bind the identity and source in immutable history. Later validated role history governs.
Apply the owner order to the complete loss set:

- Organizer loss transfers organization to the implementer.
- Implementer loss transfers implementation to the organizer.
- Both losses transfer both roles to the first remaining participant in frozen original order.
- One identity with both roles counts as both losses. Ordinary participant loss transfers neither role.

Never skip an unusable selected successor. Require positive usability and two distinct non-facilitators after the whole batch.
Only the frozen declared facilitator can enter membership through implementation takeover. It becomes a required signer.
It remains excluded from the floor and independent review. An external organizer loss can change roles without membership deletion.
If a gate fails, commit no membership transition and issue one blocking decision. Exhaustion suppression still holds.

Typed `role_transition.v1` history precedes successor dispatch. It selects one `role-handover/<transition-id>.md`.
Bind roles, predecessor, successor, phase, base path/hash, branch, HEAD, and date.
Only the selected successor may author the pending handover. Preserve every predecessor byte.
Use the active record for current execution, evidence, reviews, fix-up, goal checks, and close.
Before Phase 5, handover supplies no review readiness. When implementation starts, the full ordinary implementation schema applies.
Missing, corrupt, changed, or contradictory authority blocks; filenames supply no fallback.

Complete shared drafts remain unchanged. Current participants append their own signoffs there.
Only structurally valid incomplete unsigned drafts can move. Record original path, author, hash, and archive before replacement.
Preserve bytes exactly once. Signed, malformed, contradictory, or truncated drafts need integrity repair.
Never move participant rounds or reviews. Frozen FINAL and closed execution records stay frozen.

All dissent, BLOCK, DISPUTED claims, and findings survive. A dropped author cannot withdraw them.
Use the existing quoted owner ruling or abandonment/v2 path for retained dissent.
A successor implementer never reviews its code. Its earlier findings remain binding.
The single-reviewer exception proves the complete causal Before/After transition with each set's implementer excluded.
Also exclude the frozen facilitator. Require distinct known snapshot models, even with diversity disabled.
Only the numeric minimum changes. Current signers, reservations, strict review, and independent current-tree evidence remain required.
A fresh reviewer process performs the goal check. A valid FAIL remains final.

## Adapter limits

Codex support is source-backed for exact discovered CLI version `0.165.0` with explicit effective `exec --json`.
Only primary `turn.failed` envelopes with the four exact reviewed workspace-credit/spend-cap messages qualify.
Added detail, generic quota text, mixed terminals, model quotes, and tool output reject.
The recognizer has no runtime access to internal Rust error enums. Source support proves no installed-binary equivalence.
Default Codex text, other versions, Kimi, and Claude remain diagnostic-only. An upgrade can disable recognition.
Use ordinary smoke verification for opt-in JSON argv. Never induce exhaustion or reconnect to collect proof.

Zcode retains its bounded stderr SDK grammar and existing owner-deviation provenance.
The native-positive limitation remains. This release adds no gateway waiver or grammar expansion.

## Private Zcode diagnostic capture

Capture defaults off. Only the owner's real machine file `~/.parley/agents.toml` can enable it:

```toml
[defaults]
capture_zcode_failures = true
```

Deck/idea settings, prompts, dispatch flags, and `PARLEY_HOME` cannot enable it.
Invocation metadata records the setting. No provider receives it.
Only a failed terminated Zcode invocation with invalid output can create a capture. Valid output suppresses capture.
The conservative scrubber accepts bounded known SDK framing and safe provider-error fields. Uncertain scrubbing writes nothing.
It removes URL, request, headers, data, and stack content with `[REDACTED]` markers.
Truncated input retains only a proven terminal tail and visible `[TRUNCATED]` markers when full framing cannot be scrubbed.
No capture supplies recognition or membership authority. Lost required framing prevents any complete-native-evidence claim.

Storage is `~/.parley/captures/zcode/`, outside worktrees. Directories require 0700; files require 0600 and exclusive creation.
Symlinks and unsafe existing permissions refuse. Limits are 256 KiB per file, 2 MiB total, and seven days.
Each use removes expired files first, then oldest files to fit capacity. A bounded private receipt records counts and time only.
No deletion is promised while idle. Disable capture to stop new files; retained files remain until cleanup.

```sh
parley quota capture status
parley quota capture purge
```

Status reports configuration, path, limits, and cleanup counts. Purge removes retained capture files.
Directory deletion also provides immediate cleanup. No command probes or contacts a provider for capture.
