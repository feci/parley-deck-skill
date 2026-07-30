# Changelog

Notable changes per release. Dates are release dates.

## 2.1.0 — unreleased

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
- Installation is atomic across the whole selected set, not merely per skill directory. A
  predictable failure — an unmarked destination, or a source payload that disagrees with its
  own manifest — produces zero writes.
- The published-command documentation guard was generalized from a hardcoded `node --test`
  pair to a `{binary, flag}` shape, and gained a **static** `python3 scripts/*.py` arm that
  checks the referenced script exists and compiles, without executing it.

- An installed skill directory with no readable `parley-deck-skill` install marker is now
  reported `malformed` rather than `valid`. This includes trees copied by a third-party skill
  installer, which do not write our marker: `doctor` reports them as not installed by this tool.
  The payload is untouched and still usable; only this tool's verdict about it changed.

### Compatibility

Install markers written by 2.0.0 carry no schema version and are treated as legacy, so
upgrading in place does not report a healthy install as malformed. `--no-addons` and
`--only <name>` are unchanged.

## 2.0.0

Skills moved to a `skills/<name>/` layout, with the core protocol and its add-ons as siblings
so a generic skill installer sees all of them. See the GitHub release notes for `v2.0.0`.
