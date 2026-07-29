---
name: parley-worktrees
description: >-
  Allocate, name, isolate, merge, and clean up git worktrees so multiple Parley Deck
  sessions or parallel Phase-5 implementers can work over one repository without
  collisions. Use when two or more agents/sessions touch the same repo concurrently,
  when an implementation needs its own tests/installs/env/local state, or when work
  splits cleanly along a feature/file-set boundary. Vendor-, tracker-, and
  runtime-agnostic companion add-on to the parley-deck skill: it teaches worktree
  mechanics and a file-based claim discipline, and it never changes canonical artifact
  ownership (FINAL.md and IMPLEMENTATION.md stay authoritative).
version: 0.1.0
---

# parley-worktrees

A narrow, **operational** add-on for the `parley-deck` cooperation protocol. It teaches
an agent how to **allocate, name, isolate, merge, and clean up isolated git worktrees**
for Parley sessions and Phase-5 implementers, so that several sessions or implementers
can work over one repository at the same time without trampling each other.

Its highest-value contribution is not "agents can use worktrees" in the abstract. It is
the exact **branch + worktree + file-set discipline** that turns invisible,
concurrent-write corruption into ordinary git merge conflicts, and that prevents two
agents from checking out the same branch, trampling each other's untracked runtime
state, or merging half-tested parallel work straight to the default branch.

It does **NOT** change Parley Deck's canonical artifact model. `FINAL.md` and
`IMPLEMENTATION.md` remain authoritative; external PR/MR surfaces and trackers are
mirrors. This add-on only adds the worktree discipline the core protocol intentionally
leaves out. **It does not re-implement `git worktree`** — it adds the claim manifest,
the file-set-disjointness check, and the lifecycle the runtimes do not provide.

This skill is loaded **alongside** `parley-deck`, never instead of it. Always read the
live `parley-deck/COOPERATION.md` first and obey the active transport, roster, phase
rules, and English-only rule.

## When to use this skill (trigger)

USE worktrees when ANY of these hold:

- Two or more sessions/implementers will modify the same repo concurrently.
- A Phase-5 implementation needs tests, generated files, dependency installs, or other
  local runtime state.
- Agents need different environment variables, ports, databases, caches, or branch heads.
- The work splits cleanly by feature boundary, package, service, or ownership area.

SKIP worktrees when ANY of these hold:

- An agent only writes one owned protocol artifact (a round file, review, or signoff)
  and no code.
- The change is a trivial same-file edit that must be coordinated sequentially anyway.
- The base branch is not clean enough to establish a known starting point.

The add-on **REFUSES** (or warns and requires an explicit, recorded override) when two
concurrent sessions declare **intersecting file sets**. Intersecting file sets are
exactly the collision worktrees exist to prevent (see §6).

## 1. Model

One base repository, one shared `.git` object store. Each session/implementer gets its
own working directory, index, `HEAD`, and checked-out branch. Isolation is what
converts concurrent-write corruption into normal, reviewable merge conflicts.

```bash
git worktree list
git rev-parse --git-common-dir   # the shared .git all worktrees point at
```

Mechanics to remember:

- Each worktree has its own working tree, index, `HEAD`, and branch.
- All worktrees share the object database and refs through the common `.git` directory.
- **One branch CANNOT be checked out in two worktrees at once.** Give every agent a
  unique branch.
- Local runtime files (`.env.local`, SQLite files, build output, install dirs) are
  per-worktree **only if they live inside the working tree**. Anything under shared
  `.git` is shared.
- Repository-wide refs such as `refs/stash` are shared; avoid `git stash` and
  force-push as an inter-agent workflow. Prefer WIP commits on the agent's own branch.

## 2. Layout and naming (DECISION: sibling dir, NEVER inside `.git/`)

Worktrees live in a **sibling** directory next to the base repo. The root is
configurable via `$PARLEY_WORKTREES_DIR` (default `../worktrees`).

```text
../worktrees/<slug>-design                 branch idea/<slug>
../worktrees/<slug>-r01-<agent-id>         branch idea/<slug>/round-01-<agent-id>   (optional round isolation)
../worktrees/<slug>-integration            branch integration/<slug>
../worktrees/<slug>-impl-<agent-id>        branch feature/<slug>/<agent-id>
```

Branch naming:

```text
idea/<slug>                       design branch, one owner / integration worktree
idea/<slug>/round-01-<agent-id>   optional isolated round branch (one per agent)
integration/<slug>                staging branch for parallel implementation
feature/<slug>/<agent-id>         per-implementer feature branch
```

> **Do NOT nest worktree checkouts under `.git/worktrees/`.** That path is git's own
> administrative metadata for worktrees, not a place to check out code. Always use the
> sibling directory above.

`<slug>` is the Parley idea slug. `<agent-id>` is the stable participant id from the
roster (for example `agent-a`, `agent-b`). Never embed a human username, email, or
absolute home path in a branch or worktree name.

## 3. Lifecycle command sequences

All sequences are run from the **base repository directory** unless a `cd` is shown.
Substitute the repo's real remote name (`origin` is assumed below) and its real default
branch (`main` is assumed below). Replace `<test command>` / `<lint command>` with the
project's actual checks taken from `FINAL.md` / `IMPLEMENTATION.md`.

### 3.1 Preflight

```bash
git status --short                 # base repo must be clean enough to branch from
git fetch origin                   # refresh remote-tracking refs
git worktree list                  # see what already exists (do not duplicate)
mkdir -p "${PARLEY_WORKTREES_DIR:-../worktrees}"
```

### 3.2 Optional round isolation (design rounds)

Provision one isolated round worktree per agent off the design branch. Each agent
writes only its own owned artifact, commits to its own sub-branch, and the design-branch
owner later merges the sub-branches into the single design branch:

```bash
# existing-or-create: adopt the round sub-branch if a concurrent agent already
# made it, otherwise create it off the design branch (see §3.3 for the pattern)
git worktree add "${PARLEY_WORKTREES_DIR:-../worktrees}/<slug>-r01-<agent-id>" idea/<slug>/round-01-<agent-id> 2>/dev/null \
  || git worktree add -b idea/<slug>/round-01-<agent-id> \
       "${PARLEY_WORKTREES_DIR:-../worktrees}/<slug>-r01-<agent-id>" \
       origin/idea/<slug>

cd "${PARLEY_WORKTREES_DIR:-../worktrees}/<slug>-r01-<agent-id>"
git status --short
# ... agent writes ONLY its own round file under parley-deck/ideas/<slug>/round-01/ ...
git add parley-deck/ideas/<slug>/round-01/<agent-id>.md
git commit -m "[<agent-id>] <slug>: round-01 analysis"
git push -u origin idea/<slug>/round-01-<agent-id>

# design-branch owner merges sub-branches (keeps rounds independent, one design branch)
cd "${PARLEY_WORKTREES_DIR:-../worktrees}/<slug>-design"
git fetch origin
git merge --no-ff origin/idea/<slug>/round-01-<agent-id> \
  -m "[<agent-id>] <slug>: merge <agent-id> round-01"
git push origin idea/<slug>
```

> If `idea/<slug>` is already checked out in the base (main) worktree, treat that as the
> design worktree. Do **not** try to check out the same branch in a second worktree.

### 3.3 Provision Phase-5 implementer worktrees

Use an **integration branch + one feature branch per implementer**. Never put two
agents directly on one shared `feature/<slug>` branch.

```bash
# create the integration branch + worktree off the default branch.
# Existing-or-create: a concurrent agent/facilitator may have already created
# integration/<slug>. Try to CHECK OUT the existing branch first; only create
# it (-b ... origin/main) if it does not yet exist. The bare `-b` form aborts
# when the branch already exists, so it is never the first attempt here.
git fetch origin
git worktree add "${PARLEY_WORKTREES_DIR:-../worktrees}/<slug>-integration" integration/<slug> 2>/dev/null \
  || git worktree add -b integration/<slug> \
       "${PARLEY_WORKTREES_DIR:-../worktrees}/<slug>-integration" \
       origin/main
# push only when we just created the branch (a no-op / fast-forward otherwise)
git -C "${PARLEY_WORKTREES_DIR:-../worktrees}/<slug>-integration" \
  push -u origin integration/<slug>

# one worktree per implementer, branched off the integration branch.
# Same existing-or-create guard: if a runtime or earlier attempt already made
# feature/<slug>/<agent-id>, adopt it; otherwise create it off integration/<slug>.
git worktree add "${PARLEY_WORKTREES_DIR:-../worktrees}/<slug>-impl-<agent-id>" feature/<slug>/<agent-id> 2>/dev/null \
  || git worktree add -b feature/<slug>/<agent-id> \
       "${PARLEY_WORKTREES_DIR:-../worktrees}/<slug>-impl-<agent-id>" \
       integration/<slug>
```

> **Existing-or-create pattern.** Apply this same form
> (`git worktree add "<path>" <branch> 2>/dev/null || git worktree add -b <branch> "<path>" <base>`)
> anywhere a worktree is added for a branch another agent or the runtime may have already
> created — the integration branch, a per-implementer feature branch, and the round
> sub-branches in §3.2. The first clause checks out an existing branch; the fallback
> creates it from the base ref.

### 3.4 Isolate runtime + scope files (per implementer worktree)

```bash
cd "${PARLEY_WORKTREES_DIR:-../worktrees}/<slug>-impl-<agent-id>"

# per-worktree env (gitignored — see §3.7). Copy the repo's template, then apply any
# per-worktree overrides (ports, DB names, cache dirs) the manifest assigns.
cp ../../<repo>/.env.example .env.local

# optional sparse-checkout guardrail: limit the visible tree to this agent's boundary
git sparse-checkout init --cone
git sparse-checkout set <pkg-paths> parley-deck/ideas/<slug>

# submodules are per-worktree state — initialize them in THIS worktree
git submodule update --init --recursive
git submodule status --recursive
```

Sparse-checkout rule: it is a **guardrail, not authority**. `FINAL.md` and
`IMPLEMENTATION.md` still define real scope; sparse-checkout only narrows what the agent
sees and edits.

Submodule rule: each worktree needs its own submodule checkout state. If submodule
*branches* are also being edited, give each agent a branch inside the submodule too. Do
not let two agents share a detached submodule worktree for writes.

### 3.5 Implement (per implementer worktree)

```bash
cd "${PARLEY_WORKTREES_DIR:-../worktrees}/<slug>-impl-<agent-id>"
git status --short
# ... edit only the files in this agent's claimed boundary + its own IMPLEMENTATION.md row ...
git add <changed-files>
git commit -m "[<agent-id>] <slug>: implement <boundary>"
git push -u origin feature/<slug>/<agent-id>
```

### 3.6 Integrate (staging -> test -> default branch)

The integration-branch owner merges each implementer branch **sequentially**, then runs
the project's checks before anything reaches the default branch:

```bash
cd "${PARLEY_WORKTREES_DIR:-../worktrees}/<slug>-integration"
git fetch origin

git merge --no-ff origin/feature/<slug>/<agent-id> \
  -m "[<agent-id>] <slug>: integrate <agent-id> implementation"
# ... repeat for each implementer branch ...

git status --short
git log --oneline --decorate --max-count=12

<test command>     # the repo's REAL checks from FINAL.md / IMPLEMENTATION.md
<lint command>
```

Record each merge in the `## Integration log` (see §5). If the active Parley transport
is PR/MR-based, the merge to the default branch is normally a **PR/MR from**
`integration/<slug>`, not a local fast-forward. PR/MR commands are an optional **mirror**
of this workflow, not its core; the canonical record stays in the Parley Deck files. If
a host CLI is available, open the PR/MR with it (`base = main`, `head = integration/<slug>`,
body pointing at `parley-deck/ideas/<slug>/IMPLEMENTATION.md`); otherwise open it in the
host UI.

### 3.7 Required `.gitignore`

Per-worktree runtime state must never be committed:

```gitignore
.env.local
.env.*.local
*.sqlite
*.sqlite3
*.sqlite-journal
.worktree-state/
```

### 3.8 Cleanup

Confirm each worktree is clean (or intentionally preserved) before removing it:

```bash
git -C "${PARLEY_WORKTREES_DIR:-../worktrees}/<slug>-impl-<agent-id>" status --short
git worktree list

git worktree remove "${PARLEY_WORKTREES_DIR:-../worktrees}/<slug>-impl-<agent-id>"

# Delete the local branch from a worktree where integration/<slug> is checked out,
# so `-d` can confirm the feature branch is merged into integration:
git -C "${PARLEY_WORKTREES_DIR:-../worktrees}/<slug>-integration" \
  branch -d feature/<slug>/<agent-id>

git push origin --delete feature/<slug>/<agent-id>   # delete the merged remote branch
```

> **Branch-delete safety (`-d` vs `-D`).** `git branch -d` only succeeds when the branch
> is merged into the **currently checked-out** branch. The implementer branch was merged
> into `integration/<slug>` (§3.6), not into whatever branch the base repo's HEAD points
> at, so running `-d` from the base repo typically fails with "not fully merged". Two safe
> ways to delete it:
>
> - **Preferred — delete from the integration worktree** (shown above): run `-d` with
>   `git -C <integration-worktree>` (or `cd` into it) where `integration/<slug>` is checked
>   out, so `-d`'s merged-into-HEAD check passes honestly.
> - **`-D` only after the remote is verified merged** — if you must delete from elsewhere,
>   first confirm the work is safe (the feature branch is pushed and merged into
>   `integration/<slug>`, and integration has reached the default branch / its PR/MR is
>   merged), then use `git branch -D feature/<slug>/<agent-id>`. `-D` skips the merge check,
>   so only use it once that merge is verified — otherwise it can silently drop unmerged
>   commits.

### 3.9 Prune & repair

```bash
git worktree prune     # drop metadata for worktrees whose dirs were deleted manually
git worktree list      # confirm no stale entries remain
git worktree repair    # fix bookkeeping if a worktree dir was MOVED (not deleted)
```

## 4. Decision rules

USE worktrees when (any): two or more sessions/implementers touch the repo
concurrently; Phase-5 needs tests/installs/generated files/local state; agents need
different env/ports/DB/caches/branch heads; work splits cleanly by feature, package,
service, or ownership boundary.

SKIP worktrees when (any): an agent only writes one owned protocol artifact (no code);
the change is a trivial sequential same-file edit; the base branch is not clean.

**Refuse / warn rule (the central safety property):** refuse, or warn and require an
explicit recorded override, before starting two concurrent sessions whose **file sets
intersect**. On intersection, either split the work so boundaries are disjoint, or
serialize those edits through the integration-branch owner (see §6).

Design-round note: for design rounds, worktrees are useful but **not mandatory** — a
single owned protocol artifact can use ordinary branch discipline. Phase-5
implementation should **strongly prefer** worktrees whenever parallel work is real.

Integration-branch note: the default is to prescribe `integration/<slug>` and merge
implementer branches into it. A repo MAY map this onto its existing branch convention;
if it does, record the mapping in `IMPLEMENTATION.md` so every agent sees the same base.

## 5. Coordination manifest (the lock layer)

Do **NOT** invent a new claim document — Parley already has `IMPLEMENTATION.md`. The
worktree allocation table **is** the lock manifest. Add this compact section to the
idea's `IMPLEMENTATION.md`:

```markdown
## Worktree allocation

Base branch: integration/<slug>
Integration worktree: ../worktrees/<slug>-integration

| Boundary (file set)  | Owner      | Branch                    | Worktree                            | Status  |
| -------------------- | ---------- | ------------------------- | ----------------------------------- | ------- |
| <pkg/paths or globs> | <agent-id> | feature/<slug>/<agent-id> | ../worktrees/<slug>-impl-<agent-id> | claimed |
| <pkg/paths or globs> | <agent-id> | feature/<slug>/<agent-id> | ../worktrees/<slug>-impl-<agent-id> | open    |

## Integration log

- <date> <agent-id>: merged feature/<slug>/<agent-id> at <sha>; checks: <command / result>.
```

`Status` values: `open` -> `claimed` -> `in-progress` -> `review` (merged to
integration) -> `done` (worktree removed / pruned). A `paused` status is allowed when an
agent must stop mid-build but keep its worktree alive (it holds the claim without
consuming active build resources).

Claim rule:

- An agent claims by editing **only its own row, or an `open` row** — never another
  agent's `claimed`/`in-progress` row.
- A claim MUST name the **branch**, the **worktree path**, and the **boundary** (file set).
- If two agents need the same files, **split the boundaries before implementation
  starts** so they are disjoint, or **serialize** those edits through the
  integration-branch owner.
- Conflicts are detected by git on the shared `IMPLEMENTATION.md`: the losing writer
  re-reads, picks an unclaimed boundary, and retries.

When the companion `parley-tracker` add-on is in use, each subtask ticket carries a
`worktree: { path, branch, base }` field; claiming the ticket (a frontmatter
`status`/`assignee`/`worktree` edit) is the same act as claiming a row here, expressed
at the ticket layer. The set of subtask files plays the role of the lock manifest. No
separate claim server is needed in either layer.

## 6. File-set disjointness rule

This is the property the whole skill exists to protect:

> **Two boundaries that share no files can run in separate worktrees with zero merge
> conflict, by construction. Two boundaries whose file sets intersect cannot.**

Therefore:

- Every claimed boundary in the manifest (§5) is defined by a **file set** (paths or
  globs).
- Before provisioning a second concurrent worktree, **compute the intersection** of its
  boundary with every already-claimed boundary. If the intersection is non-empty, the
  skill **refuses** (or warns and requires an explicit, recorded override) — see §4.
- The fix is always one of: (a) re-split the work so boundaries become disjoint, or
  (b) serialize the overlapping edits through the integration-branch owner so they
  happen on one branch in sequence.
- Boundary decomposition should follow **vertical slices that map to disjoint file
  sets**. This is the seam shared with `parley-tracker`: the ticket's `files` field
  defines the boundary, and the worktree enforces the isolation.

Sparse-checkout and submodule scoping (§3.4) **constrain** what an agent sees, but they
do **not** redefine canonical scope and do **not** by themselves guarantee disjointness
— the manifest does.

### 6.1 Intersection helper (do not hand-roll the check)

Expand each boundary's `files` globs against the real tree, then report any path that
two boundaries both claim. Run this before provisioning a second concurrent worktree; a
non-empty report is the refuse/warn trigger above.

```bash
# Usage: ./overlap.sh "<globs for boundary A>" "<globs for boundary B>"
#   globs are space-separated, relative to the repo root, e.g.
#   ./overlap.sh "pkg/api/** docs/api.md" "pkg/web/** docs/api.md"
# Exit 0 = disjoint (safe); exit 1 = overlap (refuse/warn + record an override).
set -euo pipefail
expand() { git ls-files -- $1 | sort -u; }   # tracked files matching the globs
overlap="$(comm -12 <(expand "$1") <(expand "$2"))"
if [ -n "$overlap" ]; then
  echo "OVERLAP — boundaries are NOT disjoint:"; echo "$overlap"; exit 1
fi
echo "disjoint"; exit 0
```

```python
# Same check in Python (use when globs must match untracked/not-yet-created paths too).
# Disjoint -> exit 0; overlap -> prints the shared paths and exits 1.
import glob, sys
def expand(globs):
    out = set()
    for g in globs.split():
        out |= set(glob.glob(g, recursive=True))
    return out
a, b = expand(sys.argv[1]), expand(sys.argv[2])
shared = sorted(a & b)
if shared:
    print("OVERLAP — boundaries are NOT disjoint:"); print("\n".join(shared)); sys.exit(1)
print("disjoint")
```

Both forms compare the two boundaries' `files` glob lists and report the intersection.
A non-empty intersection means the work is split wrong: re-split into disjoint boundaries
or serialize the overlap through the integration-branch owner (see §4).

## 7. Runtime detect-and-adopt

Some runtimes (for example agent IDEs / CLIs that ship their own worktree feature)
**already create a worktree** for a branch. In that case:

- **Detect** the existing worktree (`git worktree list`) and **adopt** it — record its
  path and branch in the `IMPLEMENTATION.md` allocation row (or the ticket's `worktree`
  field). Do **not** create a second worktree for the same branch.
- This skill then adds the layer the runtime does not provide: the **claim**, the
  **file-set-disjointness** check, and the **lifecycle/cleanup** discipline.
- It does **not** re-implement `git worktree`, and it does not fight the runtime's own
  worktree management.

If the runtime created the worktree at a path this skill would not have chosen, adopt
the actual path verbatim in the manifest rather than relocating it.

## 8. Pitfalls

- **Same-branch double-checkout** — git refuses to check out one branch in two
  worktrees; give every agent a unique branch (`feature/<slug>/<agent-id>`).
- **Untracked env not carried** — a new worktree does not copy `.env.local` / SQLite /
  caches; copy the repo's templates and apply per-worktree overrides (§3.4).
- **Stale worktree after a manual `rm -rf`** — deleting a worktree dir by hand leaves
  metadata behind and can make a branch undeletable; run `git worktree prune`.
- **Moved worktree dir** — if a worktree directory was *moved* (not deleted), run
  `git worktree repair`.
- **Shared refs** — `refs/stash`, branch deletion, and force-push affect more than one
  worktree; avoid `git stash` and force-push as inter-agent workflow; use WIP commits on
  the agent's own branch and coordinate any force-push.
- **Submodules** — submodule checkout state is per-worktree; run
  `git submodule update --init --recursive` in each worktree.
- **IDE dual-index** — an editor may index both the base repo and `../worktrees/`,
  doubling results and CPU; add the worktrees root to the editor's exclude/ignore
  settings.
- **Dependency lock files** (`go.sum`, `package-lock.json`, and similar) regenerate on
  install and routinely conflict on the integration branch — **serialize dependency
  changes**, or regenerate the lock file once on the integration branch after merging.
- **Per-worktree env drift** — divergent ports/DB names/caches cause false test failures
  or false passes; record per-worktree ports/DBs/caches/test temp dirs in
  `IMPLEMENTATION.md` whenever they differ.
- **False isolation from sparse-checkout/submodules** — they limit files but do not
  change canonical scope; the manifest, not the checkout, is the source of truth for who
  owns what.

## 9. The thin parley-deck core seam (documented, NOT edited here)

This skill carries **all** the mechanics; the `parley-deck` core protocol carries only a
thin, declarative seam. **Do not edit the core protocol from this add-on.** The seam
below documents what the core says (or should say) so this skill stays aligned with it;
changing the core is a separate, meta-protocol-change idea.

The core (a §6 conflict-avoidance / Phase-5 note) states only:

- Parallel implementers **MAY** be isolated in git worktrees.
- Coordination uses the shared `IMPLEMENTATION.md` lock manifest (the worktree
  allocation table); merge via an **integration branch**.
- Worktree use **never changes canonical artifact ownership**: `FINAL.md` and
  `IMPLEMENTATION.md` remain authoritative, and external PR/MR and tracker surfaces are
  **mirrors**.

Everything operational — the commands, naming, integration pattern, sparse-checkout and
submodule handling, env isolation, claim/disjointness rules, and troubleshooting — lives
**here**, in `parley-worktrees`, not in the core. This keeps the core thin and the
mechanics independently versioned.

## Quick reference

```text
preflight   git status --short && git fetch origin && git worktree list && mkdir -p ../worktrees
integration git worktree add ../worktrees/<slug>-integration integration/<slug> 2>/dev/null \
              || git worktree add -b integration/<slug> ../worktrees/<slug>-integration origin/main   # existing-or-create
provision   git worktree add ../worktrees/<slug>-impl-<agent-id> feature/<slug>/<agent-id> 2>/dev/null \
              || git worktree add -b feature/<slug>/<agent-id> ../worktrees/<slug>-impl-<agent-id> integration/<slug>
isolate     cp ../../<repo>/.env.example .env.local
            git sparse-checkout init --cone && git sparse-checkout set <pkg-paths> parley-deck/ideas/<slug>
            git submodule update --init --recursive
disjoint?   ./overlap.sh "<globs A>" "<globs B>"   # §6.1: exit 1 = overlap (refuse/warn)
integrate   cd ../worktrees/<slug>-integration
            git merge --no-ff origin/feature/<slug>/<agent-id> -m "[<agent-id>] <slug>: integrate"
            <test command> ; <lint command>
cleanup     git worktree remove ../worktrees/<slug>-impl-<agent-id>
            git -C ../worktrees/<slug>-integration branch -d feature/<slug>/<agent-id>   # -d from integration; -D only after merge verified
prune       git worktree prune
repair      git worktree repair
```
