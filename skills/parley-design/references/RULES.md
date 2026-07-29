---
registry: core-rules/1.0.0
spec: PDS/1.0
status: stable
encoding: UTF-8
---

# PDS core rule registry

This file is the single source of truth for PDS rules: the fenced YAML blocks are the only
machine source, the prose beside each the only human source. There is no generated
catalogue, no exported JSON, no copy inside a checker — a second representation goes stale.

Rule ids are append-only and never change meaning. Re-classifying a rule, or widening what
it covers, needs a spec version bump, so an older review stays readable.

## Extraction grammar (frozen)

A consumer reads this file, and any surface annex, with exactly these rules.

- A rule begins at an H3 heading, whose text is the rule name.
- Immediately beneath it, with no prose between, sits exactly one fenced block tagged
  `pds-rule` containing YAML. A `pds-rule` fence anywhere else is not part of the registry.
- Everything from the close of that fence to the next heading is the rule's prose: why the
  thing it names reads as machine-made or is broken, a counterexample, and the remedy.
- The file is UTF-8. Duplicate ids are fatal: a consumer MUST abort and name both sites.
- An unknown key warns, unless prefixed `x-`, which is reserved for local use and ignored.
- A rule id a consumer does not know MUST be reported `UNJUDGEABLE` and MUST NOT crash the
  run.

## Keys

| key | required | meaning |
|---|---|---|
| `id` | yes | `core:<slug>` here, `<surface>:<slug>` in an annex. `core:` is reserved for this registry; a project's own rules use `<project>:<slug>`. |
| `class` | yes | `quality`, `slop` or `system`. Sets the burden of proof, not the impact — PDS §7. |
| `tier` | yes | Lowest evidence tier at which the rule can be decided, written here as the bare ordinal `T0`–`T3`; prose spells it number-plus-word (`T0 ARTIFACT`). A finding raised below its rule's tier is `UNJUDGEABLE`, never `PASS`. |
| `surface` | yes | `core` holds on every surface. `web` holds only where the target is a web interface. |
| `enforced-by` | yes | `check`, `agent-judgement` or `both`. A `check` rule for which a consumer has no detector is `UNJUDGEABLE`, never silently passed. |
| `severity` | yes | 0–4. Impact only. |
| `added` | yes | Registry version that introduced the id. |
| `status` | yes | `stable`, `draft` or `deprecated`. A deprecated rule keeps validating for at least one minor version. |
| `system-blind` | no | Cannot be satisfied by changing the ratified system, and no waiver may claim otherwise. |
| `sources` | no | The external standard a threshold is taken from. Absence means the calibration is ours, contestable on evidence. |

## Severity anchors

Severity states what the defect costs a user, on the usability-inspection scale in common
use: 0 nothing, 1 cosmetic, 2 minor, 3 major, 4 unusable for somebody. Only severity 4, and
at the Decider's discretion severity 3, may block. Severity and class are independent: a
`slop` rule at severity 3 never blocks unilaterally, because its burden of proof limits it,
not its impact.

## Contesting a threshold (informative)

Every number here with no `sources` key is ours and will be wrong somewhere. The route is a
waiver for the instance (PDS §8) and a registry change for the class (PDS §11), never a local
reinterpretation and never a quiet edit to the ratified system.

## Rules — class `quality`, surface `core`

### Declared contrast floor

```pds-rule
id: core:contrast-floor
class: quality
tier: T0
surface: core
enforced-by: check
severity: 4
added: 1.0.0
status: stable
system-blind: true
sources: [WCAG-2.2-SC-1.4.3, WCAG-2.2-SC-1.4.11]
```

Every foreground/background pairing the token contract declares as text-bearing MUST meet
the legibility floor its surface annex sets, and this is decidable from the token graph
alone, before any implementation exists.

The failure this closes is not the ratio but the repair: an implementer edits the ramp
until the pairing is legal, and the system certifies its own defect. `system-blind`
forbids that.

Counterexample: helper text declared `text.muted` on `surface.raised` computes to 3.9:1
against a 4.5:1 floor; the next revision adds `surface.raised.alt` and re-points the
pairing. Nothing a reader experiences changed.

Remedy: move the foreground until the pairing clears the floor, or stop declaring it
text-bearing and give the text a different surface.

### Applied contrast floor

```pds-rule
id: core:contrast-applied
class: quality
tier: T2
surface: core
enforced-by: both
severity: 4
added: 1.0.0
status: stable
system-blind: true
sources: [WCAG-2.2-SC-1.4.3]
```

Text in the built interface MUST clear the floor against the background actually behind it,
not the one its token nominally sits on. A contract can be clean and the screen illegible:
only a laid-out interface knows which stacked surface a glyph landed on.

Counterexample: body copy tokenised against the page surface, placed inside a raised panel
over a tinted band; each pairing was checked in isolation and the composed stack never was.

Remedy: measure at `T2 RENDERED` against the composed background. Where it resolves to no
single value — a gradient, an image, a video — the result is `NEEDS_REVIEW`, never `PASS`.

### Incomplete interaction states

```pds-rule
id: core:interaction-states-incomplete
class: quality
tier: T1
surface: core
enforced-by: both
severity: 3
added: 1.0.0
status: stable
```

An interactive element MUST declare every state the contract lists for its kind. An
element missing a state is not styled conservatively; it is unfinished, and the gap
surfaces only when a user reaches it. This is the most reliable machine tell here: the
resting appearance is what generation is rewarded for; the rest is what nobody screenshots.

Counterexample: a submit control with resting and hover appearances, no pressed and no
disabled, and a loading condition handled by swapping the label — so a slow network shows
a control that looks pressable and is not.

Remedy: enumerate the states in the contract once, then treat a missing state as a missing
requirement, not a styling choice. A state deliberately identical to another MUST be
declared as such, so identical and absent stay distinguishable.

### Fabricated evidence

```pds-rule
id: core:fabricated-evidence
class: quality
tier: T0
surface: core
enforced-by: both
severity: 4
added: 1.0.0
status: stable
```

Numbers, testimonials, customer names, logos, ratings, awards and benchmark results MUST
come from the requester. Anything the brief did not supply and the artifact did not mark
absent is fabricated, whatever its plausibility. A labelled hole is honest; an interface
that invents its own proof has told the reader what its other claims are worth.

Counterexample: a proof strip reading "trusted by 40,000 teams" and "99.9% uptime" in a
build whose brief supplied neither figure.

Remedy: render the slot as a named, visibly unfilled field that keeps the finding open, or
delete the section. A rounder invented number is the same violation.

### Unlabelled inference

```pds-rule
id: core:unlabelled-inference
class: quality
tier: T0
surface: core
enforced-by: both
severity: 3
added: 1.0.0
status: stable
```

Where an artifact fills a gap the brief left open, the filled value MUST be marked as
inferred at the point where it is used. Gap-filling is legitimate; presenting the fill as a
given is not.

The cost lands downstream: a critic, Decider or later implementer cannot tell a constraint
the requester imposed from one an agent supplied, so the invention is defended as binding.

Counterexample: a brief naming no audience, a direction whose rationale rests on three
named user profiles, and a critique round arguing which profile matters most, none of them
asserted by the requester.

Remedy: carry the inference marker on the field itself, not in a preamble. A reviewer
reads the field, not the front matter.

### Text below the legibility floor

```pds-rule
id: core:text-below-legible-floor
class: quality
tier: T1
surface: core
enforced-by: both
severity: 3
added: 1.0.0
status: stable
system-blind: true
```

Text set below the minimum size the surface annex declares is a defect. Being on the
ratified type scale does not exempt it: adding the small step to the scale legalises the
token and changes nothing a reader can do. This is the escape hatch `system-blind` exists to
close, and it is reached for by reflex: shrinking type is the cheapest way to fit a dense
region.

Counterexample: a metadata row two steps below the body size, the value added to the scale
as `text.micro` in the same commit, and the run reported clean because every value now
resolves through a token.

Remedy: reduce what the region says, or give it more room. Where a surface truly requires
smaller text than the floor — dense tabular data is the usual case — that is a scoped
waiver with an expiry and a counter-signature, not a wider scale.

### Motion with no reduced-motion path

```pds-rule
id: core:motion-without-reduced-path
class: quality
tier: T1
surface: core
enforced-by: both
severity: 3
added: 1.0.0
status: stable
sources: [WCAG-2.2-SC-2.2.2, WCAG-2.2-SC-2.3.3]
```

Any motion the interface starts on its own MUST have a declared path for a user who asked
for reduced motion. The path is a real alternative, not a shorter version of the same
movement. SC 2.2.2 is the auto-started case, SC 2.3.3 the interaction-triggered one; this
rule covers both.

Counterexample: entrance animations gated on a reduced-motion preference, and one
auto-advancing region added later that inherits nothing, so the single element the
preference exists to suppress is the one still moving.

Remedy: declare the reduced path beside the motion, so adding motion without it is visible
in review. Functional motion that reports progress may continue; motion that only
decorates collapses to an instant state change.

### Focus indication absent or animated

```pds-rule
id: core:focus-indication
class: quality
tier: T1
surface: core
enforced-by: both
severity: 4
added: 1.0.0
status: stable
sources: [WCAG-2.2-SC-2.4.7, WCAG-2.2-SC-2.4.11]
```

Every element reachable by keyboard MUST show where focus is, the indication MUST appear
in the same frame focus moves, and it MUST NOT be obscured by anything the design put on
top of it. An indicator that fades, grows or slides in is a defect: a user tabbing at
speed outruns it and loses their place.

Counterexample: a focus outline given the same entrance transition as every other state
change, for consistency, so each tab press leaves the position ambiguous for the
transition's length.

Remedy: no transition on the appearance of focus indication, and no reliance on a property
another rule may suppress. Consistency with the motion system is not a reason; focus
indication is not decoration.

## Rules — class `slop`, surface `core`

**The ban list, and what a banned-slop signature is.** PDS §3 G1 fails when two directions
share a banned-slop signature. The ban list is derived from this registry, never written
down twice: exactly the `slop`-class rules whose `tier` is `T0 ARTIFACT`, here and in any
annex — the ones a facilitator decides from the DIRECTION artifacts alone, no model call.

A direction's **banned-slop signature** is the set of ban-list ids that fire against it on
that rule's own stated evidence, each recorded with the declared value that evidenced it: a
Signature phrase, an `effects` entry, a token value. Two directions **share** one when
their sets intersect in two or more ids, or in one id evidenced by the same declared value
in both. An empty signature shares nothing; G1 records one per direction, empty or not.

### Aesthetic guessable from the category

```pds-rule
id: core:category-guessable
class: slop
tier: T0
surface: core
enforced-by: agent-judgement
severity: 3
added: 1.0.0
status: stable
```

A direction predictable from the project's category alone has made no decision, nor has one
predictable from the category plus the brief's anti-goals: avoiding the obvious answer lands
the whole field on the same second answer.

Counterexample: a brief for a developer tool that forbids the generic technical look,
answered by every proposer with the same warm-paper, high-contrast-serif, single-accent
register, each calling it a departure.

Evidence that settles it: the guess is pre-registered. Before reading any direction, a
non-proposer writes down the axis positions it expects from the category alone, and a
second set from the category with the anti-goals subtracted — the **category-plus-avoidance
test** PDS §3 G1 names. The rule fires against a direction matching either guess on a
majority of the declared axes. A guess written after the directions are read is not
evidence.

Remedy: change position on an axis the guess got right, and record why that axis. Being
`slop`, a finding becomes an agreed fix only on independent concurrence (PDS §7); the
pre-registered guess is what makes concurrence mean something.

### Decoration with no motivation

```pds-rule
id: core:decoration-unmotivated
class: slop
tier: T0
surface: core
enforced-by: both
severity: 2
added: 1.0.0
status: stable
```

Every non-informational element MUST name what in the content it is anchored to. An ornament
that could move to any other project without loss has no anchor, and is the strongest
evidence that the surface was assembled rather than designed.

Counterexample: a large numeral in a corner naming no issue, version, chapter or year; a
rule line that separates nothing; a texture that appears once.

Remedy: state the anchor beside the element in the contract — what it refers to, and what
changes about it if the content changes. An element whose anchor takes more than a clause to
write is removed, not defended.

### Effect budget exceeded

```pds-rule
id: core:effect-budget-exceeded
class: slop
tier: T1
surface: core
enforced-by: check
severity: 2
added: 1.0.0
status: stable
```

An effect primitive is a distinct repeatable device carrying no information: a motion
pattern, a surface treatment, an ornamental element class. The contract declares how many
a view may use; absent a declared number the budget is three.

Three is our calibration, not a standard: the first device sets a register, the second
creates a relationship, the third completes a pattern, and from the fourth on nobody
attributes any of them to a decision.

Counterexample: a view with an entrance stagger, a hover lift, a soft glow, a texture
overlay and an animated accent — each defensible alone, none attributable together.

Remedy: cut to the budget before adding anything, and record what was cut. A larger budget
for a surface class is raised in the contract once, with a reason, never exceeded per view.

### Structural sameness

```pds-rule
id: core:structural-sameness
class: slop
tier: T0
surface: core
enforced-by: agent-judgement
severity: 3
added: 1.0.0
status: stable
```

Two artifacts answering materially different briefs MUST NOT share a macro-shape. Visual
difference does not cure it: recolouring one skeleton yields work interchangeable at the only
level a user perceives as a whole — the level the brief was supposed to decide.

Counterexample: two products, different audiences, different anti-goals, the same ordered
sequence of section roles in both, the second described as a redesign because the palette
and copy changed.

Evidence that settles it: the ordered sequence of section roles for each artifact, written
out and compared. The rule fires when the sequences agree on more than half their
positions and the briefs differ in category or audience. The comparison set includes the
deck's own previous outputs, not only the artifacts under review.

Remedy: change the sequence, not the surface. Re-ordering that preserves the sequence's
roles is not a change.

### Signature absent or a mood

```pds-rule
id: core:signature-absent-or-mood
class: slop
tier: T0
surface: core
enforced-by: both
severity: 3
added: 1.0.0
status: stable
```

A direction MUST carry a Signature: one decision, stated so it can be violated. "Warm",
"modern", "confident" and "clean" are moods; they cannot be violated, so they constrain
nothing, and a direction with a mood in the Signature slot never chose.

Counterexample: `Signature: approachable but serious` — under which every proposal in the
round, including the ones that contradict each other, stays compliant.

Evidence that settles it: negate the Signature and ask what in the artifact would have to
change; a Signature whose negation changes nothing is a mood.

Remedy: rewrite the Signature as a commitment with a cost — what this direction does and
therefore gives up — and check that one otherwise attractive option is now closed.

## Rules — class `system`

A `system` rule is meaningless before ratification and binding after it. With no contract
these report `UNJUDGEABLE`; a consumer MUST NOT treat a missing contract as a pass.

### Literal outside the token layer

```pds-rule
id: core:literal-outside-token-layer
class: system
tier: T1
surface: core
enforced-by: check
severity: 3
added: 1.0.0
status: stable
sources: [DTCG-2025.10]
```

Once a contract is ratified, values for the properties it governs MUST resolve through a
token. A literal is not wrong because it is ugly; it is invisible to every other check here,
and a system with holes is a description, not a contract. The drift is not defiance: chosen,
then edited, and by the third pass the surface carries values nobody ratified.

Counterexample: a spacing value written inline during a fix-up because the token was one
step too large, in a file where every other value resolves through the layer.

Remedy: add the step to the scale in the contract and use it, or use the existing token and
change the surrounding layout. Writing the literal is the one option leaving no trace.

### Value off the ratified scale

```pds-rule
id: core:value-off-scale
class: system
tier: T1
surface: core
enforced-by: check
severity: 2
added: 1.0.0
status: stable
```

A token whose value is not a member of its ratified scale defeats it: relationships between
values are decided once, and an off-scale member makes the relationship local.

Counterexample: a type ramp with a declared ratio and one extra size inserted between two
steps because a heading was awkward at both neighbours.

Remedy: choose the nearer step and adjust what surrounds it, or change the ratio in the
contract and regenerate the ramp. An on-scale value can still violate
`core:text-below-legible-floor`, which the scale cannot license.

### Colour outside the ratified ramp

```pds-rule
id: core:colour-off-ramp
class: system
tier: T1
surface: core
enforced-by: check
severity: 3
added: 1.0.0
status: stable
sources: [DTCG-2025.10]
```

Every colour a surface uses MUST be a member of the ratified ramp, and every colour token
MUST declare its colour space and MUST be computable to a value the target can display. The
doctrine does not say which space: prescribing one would prescribe a value, and surfaces
exist with no notion of the fashionable choice.

Two failure modes count: a colour not on the ramp at all, and one added to the ramp that is
indistinguishable from an existing member, which grows the ramp without adding a decision
and makes it unusable as a scale.

Counterexample: two ramp members differing by less than a viewer can perceive under any
lighting, each used in a different component because two passes each needed "the accent".

Remedy: collapse indistinguishable members to one token and re-point every use, or move one
far enough to be a real step. The threshold for "indistinguishable" belongs in the annex.

### Face outside the allowlist

```pds-rule
id: core:face-outside-allowlist
class: system
tier: T1
surface: core
enforced-by: check
severity: 2
added: 1.0.0
status: stable
```

A typeface used but not on the contract's allowlist is unratified. How many faces are
allowed and in what roles is the contract's business; this rule holds it to what it declared.

Counterexample: a contract declaring a display, a text and a mono face, and a build where a
fourth arrives through a component library's default and goes unnoticed because it renders
acceptably.

Remedy: add the face to the allowlist with its role, or remove it. A face arriving through a
dependency is still unratified; whether an allowlisted face is itself a tell is
`web:overused-face`, not this rule.

### Token declared and never used

```pds-rule
id: core:token-declared-unused
class: system
tier: T1
surface: core
enforced-by: check
severity: 1
added: 1.0.0
status: stable
```

A token nobody references was a decision abandoned or never needed. It costs nothing at
runtime and a great deal in review: the next reader treats the declared set as the design.

Counterexample: a semantic layer declaring states for components never built, carried through
three revisions because deleting tokens feels destructive.

Remedy: delete it, or record it in the contract as reserved with the reason it is held.
Severity 1 never blocks; an unused token is the earliest sign that the system and the build
have separated.

### Token used and never declared

```pds-rule
id: core:token-used-undeclared
class: system
tier: T1
surface: core
enforced-by: check
severity: 3
added: 1.0.0
status: stable
```

A reference to a token the contract does not declare resolves to whatever the runtime falls
back to. The surface then has a value nobody chose, differing between environments in ways
that read as rendering bugs.

Counterexample: a reference to a token renamed in an earlier draft of the contract,
surviving in one component because it fell back to something plausible.

Remedy: declare it or fix the reference. Unlike an unused token this MUST be resolved before
a level claiming token integrity is reported clean: the value that ships is undefined.

## Web-surfaced rules

The rule bodies for the ids below live in `WEB-ANNEX.md`, in the same grammar, with
`surface: web`. They are part of the registry and are cited by these ids from any review. A
consumer whose target is not a web interface MUST treat them as out of scope and MUST NOT
report them as passing.

| id | class | what it names |
|---|---|---|
| `web:contrast-ratio` | quality | ratios, large-text boundary |
| `web:target-size` | quality | activation area, no spacing exemption |
| `web:reflow-narrow` | quality | two-dimensional scrolling when narrow |
| `web:gradient-text` | slop | glyphs filled with a gradient |
| `web:accent-footprint` | slop | accent as area, not emphasis |
| `web:edge-stripe` | slop | one thick coloured edge, rounded container |
| `web:overused-face` | slop | faces reached for unprompted, both bands |
| `web:motion-defaults` | slop | default easing, layout animation, overshoot |
| `web:viewport-hero` | slop | full-viewport single-axis opening |
| `web:icon-provenance` | slop | mixed icon sources, emoji as icons |
| `web:arbitrary-utility-value` | system | off-scale values via utility syntax |

A surface annex may add ids under its own prefix. It MUST NOT redefine or weaken a
`core:` id — an annex binds a core rule to a surface, it does not negotiate with it.
