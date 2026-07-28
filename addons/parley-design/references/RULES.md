---
registry: core-rules/1.0.0
spec: PDS/1.0
status: stable
encoding: UTF-8
---

# PDS core rule registry

This file is the single source of truth for PDS rules. The fenced YAML blocks are the
only machine source; the prose beside each block is the only human source. There is no
generated catalogue, no exported JSON, no copy bundled inside a checker — a second
representation is a thing that can go stale, so PDS does not have one.

Rule identifiers are append-only. An id never changes meaning. Re-classifying a rule, or
widening what it covers, requires a spec version bump, so a review recorded against an
older registry stays interpretable.

## Extraction grammar (frozen)

A consumer reads this file, and any surface annex, with exactly these rules.

- A rule begins at an H3 heading. The heading text is the rule name.
- Immediately beneath the heading, with no prose between, there is exactly one fenced
  block tagged `pds-rule` containing YAML.
- Everything from the close of that fence to the next heading is the rule's prose: why
  the thing it names reads as machine-made or is broken, a concrete counterexample, and
  the remedy.
- The file is UTF-8.
- Duplicate ids are fatal. A consumer that finds one MUST abort and name both sites.
- An unknown key warns, unless it is prefixed `x-`, which is reserved for local use and
  is ignored silently.
- A rule id a consumer does not know MUST be reported `UNJUDGEABLE` and MUST NOT crash
  the run.
- A `pds-rule` fence that is not directly under an H3 is not part of the registry.

## Keys

| key | required | meaning |
|---|---|---|
| `id` | yes | `core:<slug>` here, `<surface>:<slug>` in an annex. The `core:` prefix is reserved for this registry; a project's own rules use `<project>:<slug>`. |
| `class` | yes | `quality`, `slop` or `system`. Sets the burden of proof, not the impact — PDS §7. |
| `tier` | yes | Lowest evidence tier at which the rule can be decided: `T0 ARTIFACT`, `T1 SOURCE`, `T2 RENDERED`, `T3 PIXEL`. A finding raised below its rule's tier is `UNJUDGEABLE`, never `PASS`. |
| `surface` | yes | `core` holds on every surface. `web` holds only where the target is a web interface. |
| `enforced-by` | yes | `check`, `agent-judgement`, or `both`. A rule marked `check` for which a consumer has no detector is `UNJUDGEABLE`, never silently passed. |
| `severity` | yes | 0–4. Impact only. |
| `added` | yes | Registry version that introduced the id. |
| `status` | yes | `stable`, `draft` or `deprecated`. A deprecated rule keeps validating for at least one minor version. |
| `system-blind` | no | The rule cannot be satisfied by changing the ratified system, and no waiver may claim otherwise. |
| `sources` | no | The external standard a threshold is taken from. Absence means the calibration is ours, and is contestable on evidence rather than on preference. |

## Severity anchors

Severity states what the defect costs a user, on the usability-inspection scale in
common use: 0 nothing, 1 cosmetic, 2 minor, 3 major, 4 unusable for somebody. Only
severity 4, and at the Decider's discretion severity 3, may block.

Severity and class are independent. A `slop` rule at severity 3 still never blocks
unilaterally, because what limits it is its burden of proof and not its impact.

## Contesting a threshold (informative)

Every number here that carries no `sources` key was calibrated by us and will be wrong
somewhere. The route is a waiver for the instance (PDS §8) and a registry change for the
class (PDS §11) — not a local reinterpretation, and not a quiet edit to the ratified
system, which for `system-blind` rules is void by construction.

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

Every foreground/background pairing that the token contract declares as text-bearing
MUST meet the legibility floor its surface annex sets. This is decidable from the token
graph alone, before a line of implementation exists.

The failure this closes is not a low ratio; it is the repair. An implementer whose text
fails the floor edits the ramp until the pairing becomes legal, and the system then
certifies its own defect. `system-blind` means precisely this: widening the ramp, adding
a step, or re-pointing the pairing at a new token is not a remedy.

Counterexample: helper text declared as `text.muted` on `surface.raised` computes to
3.9:1 against a 4.5:1 floor; the next revision adds `surface.raised.alt`, two steps
lighter, and re-points the pairing. Nothing a reader experiences has changed.

Remedy: move the foreground until the pairing clears the floor, or stop declaring that
pairing as text-bearing and give the text a different surface.

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

Text in the built interface MUST clear the floor against the background actually behind
it, not the one its token nominally sits on. A contract can be clean and the screen
still illegible, because only a laid-out interface knows which of several stacked
surfaces a glyph landed on.

Counterexample: body copy tokenised correctly against the page surface, placed inside a
raised panel that sits over a tinted band; each pairing was checked in isolation and the
composed stack never was.

Remedy: measure at `T2 RENDERED` against the composed background. Where that background
resolves to no single value — a gradient, an image, a video — the result is
`NEEDS_REVIEW`, never `PASS`; that is the exact case where a silent pass ships
unreadable text.

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
resting appearance is the part generation is rewarded for, and the other states are the
part nobody screenshots.

Counterexample: a submit control with a resting and a hover appearance, no pressed and
no disabled appearance, and a loading condition handled by swapping the label — so a
slow network shows a control that looks pressable and is not.

Remedy: enumerate the states in the contract once, then treat a missing state as a
missing requirement rather than a styling choice. A state deliberately identical to
another MUST be declared as such, so that identical and absent stay distinguishable.

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
come from the requester. Anything of that kind which the brief did not supply and the
artifact did not mark as absent is fabricated, whatever its plausibility.

A labelled hole is honest. A confident number is not, and an interface that invents its
own proof has told the reader exactly how much its other claims are worth.

Counterexample: a proof strip reading "trusted by 40,000 teams" and "99.9% uptime" in a
build whose brief supplied neither figure, chosen because those magnitudes read well at
that width.

Remedy: render the slot as a named, visibly unfilled field that keeps the finding open
until the requester supplies a value, or delete the section. Substituting a rounder
invented number is the same violation.

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
inferred at the point where it is used. Gap-filling itself is legitimate and often
necessary; presenting the fill as a given is not.

The cost lands downstream. A critic, a Decider, or a later implementer cannot tell a
constraint the requester imposed from one an agent supplied, so the invented constraint
is defended as if it were binding and the real question is never asked.

Counterexample: a brief that names no audience, a direction whose rationale rests on
three named user profiles, and a critique round that argues about which profile matters
most — none of which the requester ever asserted.

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
token and changes nothing a reader can do.

This is the escape hatch the `system-blind` flag exists to close, and it is reached for
by reflex, because shrinking type is the cheapest way to make a dense region fit.

Counterexample: a metadata row set two steps below the body size, the value added to the
scale as `text.micro` in the same commit, and the run reported clean because every value
now resolves through a token.

Remedy: reduce what the region says, or give it more room. Where a surface genuinely
requires smaller text than the floor — dense tabular data is the usual case — that is a
scoped waiver with an expiry and a counter-signature, not a wider scale.

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
sources: [WCAG-2.2-SC-2.3.3]
```

Any motion the interface starts on its own MUST have a declared path for a user who has
asked for reduced motion. The path is a real alternative, not a shorter version of the
same movement.

Counterexample: a set of entrance animations gated on a reduced-motion preference, and
one auto-advancing region that was added later and inherits nothing, so the single
element the preference exists to suppress is the one still moving.

Remedy: declare the reduced path beside the motion, in the same place, so adding motion
without it is visible in review. Functional motion that reports progress may continue;
motion that only decorates collapses to an instant state change.

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
speed outruns it and loses their place, which is the exact failure the indicator exists
to prevent.

Counterexample: a focus outline given the same entrance transition as every other state
change for visual consistency, so each tab press leaves the position ambiguous for the
length of the transition.

Remedy: no transition on the appearance of focus indication, and no reliance on a
property another rule may suppress. Consistency with the rest of the motion system is
not a reason; focus indication is not decoration.

## Rules — class `slop`, surface `core`

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

A direction that can be predicted from the project's category alone has made no
decision. So has one that can be predicted from the category plus the brief's
anti-goals — avoiding the obvious answer lands the whole field on the same second
answer, and the reaction against a default becomes the next default.

Counterexample: a brief for a developer tool that forbids the generic technical look,
answered by every proposer with the same warm-paper, high-contrast-serif, single-accent
register, each arriving there independently and each describing it as a departure.

Evidence that settles it: the guess is pre-registered. Before reading any direction, a
non-proposer writes down the axis positions it expects from the category alone, and a
second set from the category with the anti-goals subtracted. The rule fires against a
direction matching either guess on a majority of the declared axes. A guess written
after the directions are read is not evidence.

Remedy: change position on an axis the guess got right, and record why that axis. This
is `slop` class, so a finding becomes an agreed fix only on independent concurrence
(PDS §7); the pre-registered guess is what makes concurrence mean something.

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

Every non-informational element MUST name what in the content it is anchored to. An
ornament that could be moved to any other project without loss has no anchor, and its
presence is the strongest available evidence that the surface was assembled rather than
designed.

Counterexample: a large numeral in a corner that names no issue, version, chapter or
year; a rule line that separates nothing; a texture that appears once.

Remedy: state the anchor beside the element in the contract — what it refers to, and
what changes about it if the content changes. An element whose anchor cannot be written
in one clause is removed, not defended.

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

An effect primitive is a distinct repeatable device that carries no information: a
motion pattern, a surface treatment, an ornamental element class. The contract declares
how many a view may use. Absent a declared number the budget is three.

Three is our calibration, not a standard. The first device sets a register, the second
creates a relationship, the third can complete a pattern; from the fourth on no viewer
attributes any of them to a decision and the set reads as accumulation. A budget never
reached is not a budget, which is why the number is low enough to bind.

Counterexample: a view carrying an entrance stagger, a hover lift, a soft glow, a
texture overlay and an animated accent — each defensible alone, none attributable to
intent together.

Remedy: cut to the budget before adding anything, and record what was cut. A larger
budget for a whole surface class is raised in the contract once, with a reason, never
exceeded per view.

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

Two artifacts answering materially different briefs MUST NOT share a macro-shape.
Visual difference does not cure it: recolouring one skeleton yields work that is
interchangeable at the only level a user perceives as a whole — the level the brief was
supposed to decide.

This is also the failure a global tell registry structurally cannot see. A deck can pass
every rule here and still ship a set of surfaces that are one surface, because sameness
is a relation between outputs and no single output carries the evidence.

Counterexample: two products, different audiences, different anti-goals, the same
ordered sequence of section roles in both, and the second described as a redesign
because the palette and copy changed.

Evidence that settles it: the ordered sequence of section roles for each artifact,
written out and compared. The rule fires when the sequences agree on more than half of
their positions and the briefs differ in category or audience. The comparison set
includes the deck's own previous outputs, not only the artifacts under review.

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

A direction MUST carry a Signature: one decision, stated so that it can be violated.
"Warm", "modern", "confident" and "clean" are moods. They cannot be violated, so they
constrain nothing, and a direction with a mood in the Signature slot is a direction that
never chose.

Counterexample: `Signature: approachable but serious` — under which every proposal in
the round, including the ones that contradict each other, remains compliant.

Evidence that settles it: negate the Signature and ask what in the artifact would have
to change. A Signature whose negation changes nothing is a mood. A second test is
whether the Signature names something the direction refuses; a decision that forbids
nothing was not a decision.

Remedy: rewrite the Signature as a commitment with a cost — the thing this direction
does and therefore the thing it gives up — and check that at least one otherwise
attractive option is now closed.

## Rules — class `system`

A `system` rule is meaningless before ratification and binding after it. With no
contract these report `UNJUDGEABLE`; a consumer MUST NOT treat a missing contract as a
pass.

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
token. A literal is not wrong because it is ugly; it is wrong because it is invisible to
every other check here, and a system with holes in it is a description rather than a
contract. The characteristic sequence is drift, not defiance: the system is chosen, then
edited, and by the third pass the surface carries values nobody ratified or can name.

Counterexample: a spacing value written inline during a fix-up because the token was one
step too large, in a file where every other value resolves through the layer.

Remedy: add the step to the scale in the contract and use it, or use the existing token
and change the surrounding layout. Writing the literal is the one option that leaves no
trace for review.

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

A token whose value is not a member of its ratified scale defeats the scale. Scales
exist so that the relationships between values are decided once; an off-scale member
makes the relationship local and unrepeatable.

Counterexample: a type ramp with a declared ratio and one extra size inserted between
two steps because a heading was awkward at both neighbours.

Remedy: choose the nearer step and adjust what surrounds it, or change the ratio in the
contract and regenerate the ramp. Note that a value can be on-scale and still violate
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

Every colour a surface uses MUST be a member of the ratified ramp, and every colour
token MUST declare its colour space and MUST be computable to a value the target can
display. The doctrine does not say which colour space to use — prescribing one would be
prescribing a value, and surfaces exist that have no notion of the fashionable choice.

Two failure modes count. A colour not on the ramp at all, and a colour added to the ramp
that is indistinguishable from an existing member — which grows the ramp without adding
a decision and makes it unusable as a scale.

Counterexample: two ramp members differing by less than a viewer can perceive under any
lighting, each used in a different component because two passes each needed "the
accent".

Remedy: collapse indistinguishable members to one token and re-point every use, or move
one of them far enough to be a real step. A per-surface threshold for
"indistinguishable" belongs in that surface's annex.

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
allowed and in what roles is the contract's business; this rule only holds it to what it
declared.

Counterexample: a contract declaring a display, a text and a mono face, and a build in
which a fourth arrives through a component library's default and goes unnoticed because
it renders acceptably.

Remedy: add the face to the allowlist with its role, or remove it. A face arriving
through a dependency is still unratified. Whether an allowlisted face is itself a tell
is `web:overused-face` on the web surface, not this rule.

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

A token nobody references was a decision either abandoned or never needed. It costs
nothing at runtime and a great deal in review, because the next reader treats the
declared set as the design and reasons about members that do not exist.

Counterexample: a semantic layer declaring states for components that were never built,
carried through three revisions because deleting tokens feels destructive.

Remedy: delete it, or record it in the contract as reserved with the reason it is held.
Severity 1 never blocks; it is here because an unused token is the earliest visible sign
that the system and the build have separated.

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

A reference to a token the contract does not declare resolves to whatever the runtime
falls back to. The surface then has a value nobody chose, and it will differ between
environments in ways that read as rendering bugs.

Counterexample: a reference to a token from an earlier draft of the contract that was
renamed, surviving in one component because it fell back to something plausible.

Remedy: declare it or fix the reference. Unlike an unused token this MUST be resolved
before the level that claims token integrity can be reported clean, because the value
that ships is undefined.

## Web-surfaced rules

The rule bodies for the ids below live in `WEB-ANNEX.md`, in the same grammar, with
`surface: web`. They are part of the registry and are cited by these ids from any
review. A consumer whose target is not a web interface MUST treat them as out of scope
and MUST NOT report them as passing.

| id | class | what it names |
|---|---|---|
| `web:contrast-ratio` | quality | blocking ratios and the large-text boundary |
| `web:target-size` | quality | minimum activation area, no spacing exemption |
| `web:reflow-narrow` | quality | two-dimensional scrolling at the narrow width |
| `web:gradient-text` | slop | glyphs filled with a gradient |
| `web:accent-footprint` | slop | accent used as area, not as emphasis |
| `web:edge-stripe` | slop | one thick coloured edge on a rounded container |
| `web:overused-face` | slop | faces reached for unprompted, in both bands |
| `web:motion-defaults` | slop | default easing, layout animation, overshoot |
| `web:viewport-hero` | slop | the full-viewport single-axis opening |
| `web:icon-provenance` | slop | mixed icon sources, emoji as icons |
| `web:arbitrary-utility-value` | system | off-scale values via utility syntax |

A surface annex may add ids under its own prefix. It MUST NOT redefine or weaken a
`core:` id — an annex binds a core rule to a surface, it does not negotiate with it.
