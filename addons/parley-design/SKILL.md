---
name: parley-design
description: "Produce a design system with several independent participants and then apply it, without the result reading as machine-made. Use when a Parley Deck idea creates a new visual world, changes a ratified design rule, or needs an interface audited against a contract instead of against taste. Vendor- and surface-agnostic companion add-on to the parley-deck skill: it ships the PDS/1.0 protocol (typed design artifacts, distinctness and coherence gates, evidence tiers, rule authority, waivers, conformance levels) as pure markdown with zero runtime dependencies, and it never changes canonical artifact ownership."
---

# parley-design

An opt-in Parley Deck add-on for **collaborative design-system work**: diverging on
directions, critiquing them, choosing one whole, binding it as a contract, applying it, and
auditing what shipped against what was ratified. It is doctrine plus a protocol (`PDS/1.0`,
in `references/PDS.md`) — markdown only, no runtime, no network, no framework.

Load it **alongside** `parley-deck`, never instead of it. `parley-deck/COOPERATION.md` owns
phases, ownership, quorum and terminal states; this add-on is a **profile** over those
phases, adding design artifacts and gates that attach to existing transitions and
introducing **no second phase cursor**.

## When to use this skill

Run the full ritual when any of these hold:

- The work creates a new visual world — greenfield, or no ratified design system exists.
- The work changes a ratified rule, foundation, or token family.
- An existing interface must be audited against a contract rather than against opinion.

Run the **fast path** (invariants plus the checker, one agent) when all of these hold: a
ratified system exists, the change touches one surface inside it, and it introduces no new
token family, foundation, or visual direction. Greenfield work can never use the fast path.

**The fast path is not a Parley Deck run.** `COOPERATION.md` §1 makes multi-agent execution
mandatory, so one agent alone never satisfies it: a fast-path run claims no Parley
verification and no level above L1 (PDS §4 rule 8).

## When NOT to use this skill

- **Not for a component inside an already ratified system** that introduces nothing new.
  That is the fast path; the full ritual there is pure cost.
- **Not as a taste oracle.** It emits no score, no ranking, no "which is prettier". The
  Decider is a human by default and receives a findings ledger, not a verdict.
- **Not as a theme catalogue.** It ships invariants, never a house look. A request for "a
  good default aesthetic" is one this skill refuses on purpose — a look guessable from the
  category is the failure mode it exists to prevent.
- **Not a Phase-5 owner.** It does not own implementation code, and it never edits the
  core protocol.

## Invariants — hold these before editing anything

**The honesty rule.** Never invent a metric, benchmark, testimonial, customer logo,
rating, award, or person. A labelled hole ("no benchmark measured yet") is honest; a
plausible fabricated number is not a style choice, it is a `quality` violation.

**Interaction-state completeness.** Every interactive element declares rest, focus,
pressed and disabled, plus hover wherever the target has a pointer. Every element that
waits declares loading, empty and error. A state you did not design is a state that ships
broken, and reviewers cannot see what was never drawn.

**The contrast floor.** Text and meaningful non-text indicators meet WCAG 2.2: 4.5:1 for
body text, 3:1 for large text and for non-text indicators. This floor is **system-blind** —
widening the ratified ramp does not satisfy it, because an implementer will otherwise
legalise its own output by editing the system.

**The effect budget.** Count the decorative devices on one surface: gradient fills,
shadows, glows, blurs, textures, idle animation. The budget is three per surface and one
per element. Anything above budget MUST be named and motivated in the direction's
Signature. Motion ships with a reduced-motion path or it does not ship.

**The precedence chain** (top wins, binding): `quality` rules > the ratified design
system > the brief > parity with existing code > model habit. The top two are **not**
bypassable by "preserve structural parity", "mirror this reference", or "match the prior
build". An instruction to match something is an instruction about the lower rungs only.

Durable per-deck decisions are written as **Named Rules** — `**The <Name> Rule.**` plus
one forceful sentence — because a named rule can be cited, contested and violated by name.

## Dispatcher — fixed read sets

Read exactly the set for the phase you are in, so every participant loads identical bytes.
Do not read the rest. `WEB` means `references/WEB-ANNEX.md`, and it is added only when the
target profile is web.

| Phase (Parley home) | Read |
|---|---|
| BRIEF (Phase 0) | SKILL.md + PDS §0–§2 |
| DIVERGE (round-01) | SKILL.md + PDS §2 §4 §5 §6 + RULES.md `class: slop` + WEB |
| G1 DISTINCTNESS (facilitator, between rounds) | PDS §3 §4 + RULES.md `class: slop` |
| CRITIQUE (round-02) | SKILL.md + PDS §2 §5 §6 §7 + RULES.md (all) + WEB |
| DECIDE + GRAFT (consensus.md) | PDS §2 §3 §4 §5 §7 |
| CONTRACT (FINAL.md) | PDS §2 §9 §11 |
| APPLY (Phase 5) | SKILL.md + PDS §2 §7 + RULES.md `class: quality` + `class: system` + WEB |
| AUDIT (Phases 6–8) | SKILL.md + PDS §2 §3 §6 §7 §8 §9 + RULES.md (all) + WEB |
| SYSTEM (after Phase 8) | PDS §2 §5 §10 §11 |
| Fast path (outside Parley, §4 rule 8) | SKILL.md + RULES.md `class: quality` + `class: system` + WEB |

`references/RULES.md` is the single source of truth for rules: one `pds-rule` YAML fence
per rule, with its rationale, counterexample and remedy in the same file. There is no
generated copy of it anywhere, including inside the checker.

## Enforcement is optional, and the doctrine is complete without it

The companion `parley-design-check` add-on mechanises the checkable part: it reads the same
`RULES.md`, runs detectors against files on disk, and emits `rule-id — violation — remedy`.

**Every rule here applies with no checker installed.** Participants read the same registry
records and write the same three-part findings by hand; the checker only makes a subset of
them cheaper and diffable. What it cannot decide it reports `UNJUDGEABLE` rather than
passing, and with no registry it refuses rule checks instead of guessing from a bundled copy.
