# Changelog

Notable changes per release. Dates are release dates.

## 2.2.0 — 2026-08-01

### Fixed

- **`doctor` no longer calls a byte-perfect install broken.** Installing all six skills with a
  foreign installer — including the universal `skills` command this README recommends first —
  reported five of six `malformed` and exited 1, because a tree can only be proven intact
  against a packaged manifest and only `parley-bidding` shipped one. Every packaged skill now
  ships a `parley-addon.json`, and the proof is anchored through each unit's packaged source
  directory rather than through an add-on-only field, which the core skill never had. Such a
  tree now reports `valid-unmanaged`: healthy, and not owned by this installer.

- **`doctor` no longer called a gutted install healthy.** With this installer's own marker
  retained, an add-on reduced to a single `SKILL.md` reported `valid`, `managed: true`, and
  `doctor` exited 0 — for four of the six skills. An add-on's required-file list was `SKILL.md`
  and nothing more, and the manifest check had nothing to check against. Manifest coverage
  closes it: the marker now records a payload digest for every skill.

- **The core skill's required-file list was shorter than what it installs.** A natively
  installed core survived deletion of `plugin.json`, `agents/openai.yaml` and
  `references/WORKED_EXAMPLES.md` with `doctor` reporting `valid` and no problems at all. The
  list is now derived from the copy plan instead of hand-maintained, so it names every file the
  installer writes.

- **Manifest coverage is mandatory rather than opt-in.** `build-addon-manifest.js --check`
  verified only directories that already carried a manifest, so the absence being checked for
  removed a skill from the check. A packaged skill without a manifest is now a `--check`
  failure, and a newly added skill cannot repeat this silently.

### Upgrading — one-time action required

**If you installed with 2.1.0 or earlier, `doctor` will report your add-ons `malformed` until
you re-run `install`.** Those installs recorded `manifest: false`, which was true when they were
made; trusting that record now would leave them on the old `SKILL.md`-only check forever, which
is the defect above. Re-run your usual install command — for example
`parley-deck-skill install --target all` — and `doctor` returns to green. Nothing is deleted and
no payload changes; only the marker is refreshed.

This is deliberately loud. The alternative was that the fix never reaches an existing install,
because nobody re-installs while `doctor` is green.

## 2.1.0 — 2026-08-01

### Added

- **`parley-bidding`, a sixth skill.** Evidence-backed bidding on software procurements:
  discovery, qualification, requirements analysis, bid preparation, release freezing, portal
  staging, and submission — with every consequential step held by a human. Tender and portal
  content is treated as untrusted evidence rather than as instruction; the skill never handles
  a password, cookie, token, or MFA code, and it never treats an upload as a submission or a
  green screen as a receipt. Seven local, deterministic Python tools; adapters for
  Cosinex/DTVP, NRW, subreport ELViS, and a manual profile capped at operator-attested proof.

  It installs by default, including on `install --force` upgrades. What expands is
  *availability*, not permission. Use `--no-addons`, or `--only` without it, to leave it out.

- **Add-on payload integrity.** An add-on may now ship a `parley-addon.json` manifest listing
  every payload file with its raw SHA-256, plus one aggregate digest. The installer records
  the manifest's aggregate and its own hash in the install marker, so deleting the manifest
  after installation is detectable rather than a silent downgrade. `doctor` and `status`
  report integrity problems separately from missing required files.

  This is **defect detection, not tamper resistance** — anyone who can rewrite the payload can
  rewrite the marker beside it. It catches partial copies, interrupted installs, stray
  generated files, and accidental edits.

- `npm test` now runs the bidding add-on's Python suite (54 tests across seven files) and
  verifies every shipped add-on manifest. A missing interpreter **fails** rather than skips.
- A CI workflow that runs on every push and pull request, across Python 3.10 and 3.13. Before
  this, tests ran only after a release was published.
- `doctor` and `status` report operational availability separately from payload validity. An
  add-on whose manifest declares an interpreter it cannot find is reported `valid` **and**
  `unavailable`, and `doctor` exits non-zero. `paths` does not probe — it answers where a skill
  would go, and must not execute a `PATH`-resolved program to do it.

  The probe looks for **`python3` specifically**, and is resolved against the environment the
  caller passes, not the parent process's. On a Windows host where only `python` exists, or
  where `python3` is the Store app-execution alias, the add-on is reported unavailable. That is
  the fail-safe direction and matches how the skill's own published commands invoke it.

### Changed

- **`doctor` no longer approves a gutted add-on tree.** An add-on directory containing nothing
  but `SKILL.md` previously reported `valid`. With a manifest present it now reports
  `malformed` on any missing, modified, or undeclared file.
- **Installation and removal are atomic across the whole fleet**, not merely per skill
  directory and not merely per target. The complete target x unit plan is checked before the
  first write or the first deletion, and a predictable failure anywhere produces **zero** writes
  and zero deletions. The questions asked are the ones a mutation actually depends on: may this
  destination be touched (is it ours), can it be created (is an ancestor a non-directory, or
  unwritable), and does the source payload agree with its own manifest.

  `--force` overrides **whose** tree may be replaced or removed. It does not suppress the
  feasibility checks, and it does not let recorded data widen the command's path scope: add-on
  names read from an install marker are validated as plain skill names, confined to a direct
  child of the skills directory, and accepted only when this package ships that add-on or the
  destination already carries this installer's marker claiming that identity. Manifest file
  keys are validated and confined to the payload root for the same reason.

  Both mutations are transactions rather than predictions. Installation stages every unit
  first, commits them by rename, and reverts every earlier commit if any later one fails. Removal renames every destination in the plan
  aside first — a rename needs permission on the parent only — and only once the whole fleet is
  set aside is anything deleted. A rename failure rolls back and deletes nothing. A
  deletion failure afterwards leaves a named leftover directory and is reported as a warning,
  because the destination is genuinely gone. For the same reason a replacement that has already
  committed is never reported as a failure.
- The published-command documentation guard was generalized from a hardcoded `node --test`
  pair to a `{binary, flag}` shape, and gained a **static** `python3 scripts/*.py` arm that
  checks the referenced script exists and compiles, without executing it.

- **A third verdict, `valid-unmanaged`.** An installed skill directory with no readable
  install marker is no longer automatically `malformed`. Where the packaged skill ships a
  manifest and the installed tree's manifest fully verifies, the payload is *provably* intact
  and the only missing fact is provenance — so it is reported `valid-unmanaged` with
  `managed: false`, and it does not fail health. `doctor --json` carries both the status and
  the boolean, so automation that requires tool-managed installs can still insist on one.

  A marker that is present but unreadable, or one naming another installer, stays `malformed`:
  that is corrupted management metadata, not "never installed by this tool". A tree with
  neither a marker nor the manifest its packaged source ships also stays `malformed` — that is
  the gutting signal.

  **Known residual.** *(Resolved in 2.2.0 — every packaged skill now ships a manifest. The
  paragraph below describes 2.1.0 as released and is kept for the record.)* Only
  `parley-bidding` ships a manifest today, so a skill installed by a
  third-party installer that does *not* ship one has nothing to verify against and is reported
  `malformed` with the reason stated. Installing all six skills with the universal `skills` CLI
  therefore reports one `valid-unmanaged` and five `malformed`, and `doctor` exits 1. Closing
  that means shipping manifests for the remaining skills; it is tracked as a follow-up and is
  deliberately not done here, because the ratified design for this change holds the other
  add-ons unaffected. The payloads are untouched and fully usable either way — this is a
  verdict about what this tool can vouch for, not about the files.

- **`valid-unselected`.** Read-only commands now report an add-on directory that is on disk
  but absent from the recorded install selection, instead of omitting it. `--no-addons` and an
  excluding `--only` write only what they select — they do not remove what is already there —
  so previously a green `doctor` was not evidence that the opt-out had taken effect. It fails
  health with the remedy named. The payload verdict stays separate: a tree this tool installed
  is `valid-unselected`, not `malformed`.

- `status` remains informational and always exits 0, even when it prints an `integrity:` or
  `unavailable:` line. **`doctor` is the health gate** and is the command to use in scripts and
  CI; it exits non-zero on any problem.

### Known limits

Installer mutations are single-writer in 2.1.0. Do not run two `install`/`uninstall` commands,
or another skill manager targeting any of the same skills roots, at the same time. Wait for one
command to finish before starting the next. Concurrent processes are not isolated; an
overlapping rollback can invalidate a command that already reported success. After any suspected
overlap, serialize further commands, run `doctor`, and reinstall the intended selection.

### Compatibility

Install markers written by 2.0.0 carry **neither** a schema version nor a manifest record, and
that exact shape is treated as legacy for the skills that shipped in 2.0.0, so upgrading in
place does not report a healthy install as malformed. The exemption does not extend to a skill
whose packaged payload ships a manifest — `parley-bidding` shipped in neither 2.0.0 nor with a
manifest-free installer, so a schema-less marker there can only be damage, and is reported with
the repair named. Otherwise deleting one or two metadata fields would silently downgrade a
current install from byte validation to none. `--no-addons` and `--only <name>` are unchanged.

## 2.0.0

Skills moved to a `skills/<name>/` layout, with the core protocol and its add-ons as siblings
so a generic skill installer sees all of them. See the GitHub release notes for `v2.0.0`.
