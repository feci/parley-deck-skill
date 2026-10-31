# Provider exhaustion and role handover

The live protocol governs. This reference explains CLI 1.57.0 and skill/core 2.21.0.

New ideas freeze `participant-failure-v3`, which keeps every v2 rule. Saved policies retain their trigger, bytes, and hashes.
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

Never skip an unusable selected successor. Require positive usability after the whole batch: v2 needs two distinct non-facilitators, v3 one usable role holder.
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

Protected transient failures keep their existing gates. Code-mutating steps gain no automatic retry.

## Optional participants (v3)

The owner set this rule on 2026-10-31: "ak hocijaky agent nema tokeny hned ho vyluc, pokial existuje organizer alebo
implementer, tak moze parley pokracovat, participanti su volitelny". Translation: "If any agent has no tokens, exclude
it at once. While an organizer or an implementer exists, Parley can continue. Participants are optional."

- New ideas freeze `participant-failure-v3`. Saved v1 and v2 ideas keep their floor and gates.
- The batch floor is one usable organizer or implementer holder after succession. A usable frozen facilitator counts
  when it holds a role. If nobody can hold a role, the batch applies nothing and escalates once.
- The exception covers automatic exclusion only. An idea that starts with one participant by choice still needs the §1
  user solo exception.
- Zero independent reviewers suffice only when validated immutable history proves that the latest automatic
  transition removed every remaining independent reviewer. Manual exclusions, markers, and stale or missing history
  earn nothing.
- The CLI driver does not auto-close such an idea. It stops at review and hands the close to the organizer.
- The organizer closes with green checks and current-tree AC evidence, and records `independent review: none` in the
  execution record and the release note. A missing review is never a pass, and no agent gives a verdict on its own work.
- Filed dissent, findings, and the no-retry exhaustion rule do not change.

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

Status reports configuration, path, limits, and cleanup counts.
It also deletes expired files, removes oldest files for the total cap, and updates `cleanup.json`.
Purge removes retained capture files.
Directory deletion also provides immediate cleanup. No command probes or contacts a provider for capture.
