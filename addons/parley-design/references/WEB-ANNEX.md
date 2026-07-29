# PDS web annex — non-normative for every surface that is not a web interface

This annex binds the `core:` rules in `RULES.md` to the web surface, supplies its hard
numbers and defines rules with `surface: web`. A consumer whose target is not a web interface
MUST ignore it rather than report its rules as passing. Grammar, keys, severity anchors and
class authority are `RULES.md`'s; ids here are append-only on the same terms.

## Tier to engine mapping

| tier | engine | what it can decide |
|---|---|---|
| `T0 ARTIFACT` | design artifacts and the DTCG token file | declared pairings and scales, frontmatter, the token graph |
| `T1 SOURCE` | CSS, markup, templates, class attributes | declared values, states and motion — never layout |
| `T2 RENDERED` | computed styles, box geometry, accessibility tree | composed contrast, activation area, overflow, whether a rule matched |
| `T3 PIXEL` | raster of the rendered surface | area proportions, contrast over gradients, images and video |

A consumer shipping only `T0` and `T1` MUST report every `T2` and `T3` rule as
`UNJUDGEABLE`; reporting them `PASS` is a false all-clear, not a partial result. Two limits
follow: a parser with no layout cannot know which background a glyph landed on, so `T1`
contrast findings are advisory; and a background resolves to one colour only when there is
one, so a gradient, image or video is `NEEDS_REVIEW`.

## Blocking numbers

These are WCAG 2.2's published thresholds. They block.

| what | level | threshold | SC |
|---|---|---|---|
| text | AA | 4.5:1 | 1.4.3 |
| large text | AA | 3:1 | 1.4.3 |
| large text means | — | 24 CSS px, or 18.66 CSS px at bold or heavier | 1.4.3 |
| components, meaningful graphics | AA | 3:1 against adjacent colours | 1.4.11 |
| activation area | AA | 24 by 24 CSS px | 2.5.8 |
| no two-dimensional scrolling | AA | at 320 CSS px wide, and 256 CSS px tall | 1.4.10 |
| focus indicator visible, not entirely hidden | AA | — | 2.4.7, 2.4.11 |

**Recorded, not enforced *(informative)*.** SC 1.4.4 (resize to 200%) and SC 1.4.12
(spacing: line height 1.5×, letter 0.12×, word 0.16×, paragraph 2× of font size) are
context, not gates: no rule here enforces them.

**APCA is advisory here and MUST NOT block.** It was removed from the draft that was to
carry it, so it has no normative standing and no stable thresholds. A consumer MAY report an
APCA value beside the ratio, never as what a gate reads.

The two thresholds below are ours, not published, and contestable on evidence.

**Legibility floor.** For `core:text-below-legible-floor`: 14 CSS px for continuous prose and
for text inside an interactive control, 12 CSS px for anything else, metadata, captions and
legal text included. Twelve is a floor, not a preference: below it a hinted glyph's strokes
stop resolving to a whole device pixel.

**Indistinguishable ramp members.** For `core:colour-off-ramp`: two members closer than
ΔE2000 1.0 are one colour and MUST collapse to one token; 1.0 to 2.3 is `NEEDS_REVIEW`,
since 2.3 is the conventional just-noticeable difference and real ramps do place steps
inside that band.

## Overused faces

Our observation, recorded 2026-07-28. Not a standard, and it will rot — which is why
`web:overused-face` is `slop` rather than `quality`.

**Long-standing defaults.** Arial · Helvetica · Inter · Lato · Montserrat · Open Sans ·
Poppins · Roboto.

**The reaction band.** DM Sans · Fraunces · Geist · Instrument Sans · Instrument Serif ·
Mona Sans · Playfair Display · Plus Jakarta Sans · Recoleta · Space Grotesk · Syne.

The second band matters more: it is what "not the first band" collapsed into, so one year's
escape hatch became the next year's tell. Hence the rule forbids a default and never
prescribes a replacement — a prescribed alternative is the next reaction band.

A face enters when it is an unprompted first pick across models sharing no prompt, on briefs
sharing no subject, and leaves when that stops being true. A face is not a tell on the
surface of the organisation that maintains it.

## Rules

### Contrast ratio on this surface

```pds-rule
id: web:contrast-ratio
class: quality
tier: T2
surface: web
enforced-by: both
severity: 4
added: 1.0.0
status: stable
system-blind: true
sources: [WCAG-2.2-SC-1.4.3, WCAG-2.2-SC-1.4.11]
```

The web binding of `core:contrast-applied`: the ratios above, against the composed
background, in every state the element has. A control passing at rest and failing on hover
has failed. Remedy: measure per state at `T2 RENDERED`; where the background resolves to no
single colour report `NEEDS_REVIEW`, never `PASS`.

### Activation area

```pds-rule
id: web:target-size
class: quality
tier: T2
surface: web
enforced-by: check
severity: 3
added: 1.0.0
status: stable
sources: [WCAG-2.2-SC-2.5.8]
```

Every activation area MUST measure at least 24 by 24 CSS px. We do not take the spacing
exemption: an 18 px icon control with nothing near it is still 18 px under a thumb. Remedy:
grow the area, padding the glyph if it must stay small; dense tabular controls are where a
scoped waiver is legitimate.

### Two-dimensional scrolling at narrow width

```pds-rule
id: web:reflow-narrow
class: quality
tier: T2
surface: web
enforced-by: check
severity: 3
added: 1.0.0
status: stable
sources: [WCAG-2.2-SC-1.4.10]
```

At 320 CSS px wide, vertical content MUST NOT require horizontal scrolling. The test is
whether the document's scroll width exceeds its client width — no baseline, no judgement.
The usual cause is a fixed-width table or a content-sized grid track. Remedy: fix the
element that overflows; clipping at the document edge hides the finding and takes sticky
descendants with it.

### Gradient-filled glyphs

```pds-rule
id: web:gradient-text
class: slop
tier: T1
surface: web
enforced-by: check
severity: 2
added: 1.0.0
status: stable
```

Filling glyph shapes with a gradient is the most recognisable generated-headline treatment
here, and it makes contrast unmeasurable: the text has no single foreground colour, so no
ratio describes it. Remedy: one foreground colour on the type; put the gradient where it
carries no reading.

### Accent used as area

```pds-rule
id: web:accent-footprint
class: slop
tier: T3
surface: web
enforced-by: agent-judgement
severity: 2
added: 1.0.0
status: stable
```

An accent works because it is scarce. Once it covers a substantial share of a view it is the
surface colour, and the interface has lost its device for saying which thing matters. Remedy:
reduce the accent to what carries emphasis and let a neutral hold the area. This needs raster
evidence: without `T3 PIXEL` a consumer reports `UNJUDGEABLE`.

### Single thick coloured edge

```pds-rule
id: web:edge-stripe
class: slop
tier: T1
surface: web
enforced-by: check
severity: 2
added: 1.0.0
status: stable
```

A rounded container with one thick chromatic border on a single edge is decoration with no
anchor, and among the most repeated shapes in generated interfaces. Remedy: remove it, or make
the edge carry a real variable — a status, a category, an owner — declared in the contract, at
which point it satisfies `core:decoration-unmotivated` instead of failing it.

### Overused face

```pds-rule
id: web:overused-face
class: slop
tier: T1
surface: web
enforced-by: both
severity: 2
added: 1.0.0
status: stable
```

A face from either band, used as a primary face, is the default rather than a choice. The
claim is not that these faces are bad, but that reaching for one unprompted is evidence no
typographic decision was made. Remedy: record in the contract why this face and not its
nearest alternative; the record, not the name, satisfies the rule.

### Default motion

```pds-rule
id: web:motion-defaults
class: slop
tier: T1
surface: web
enforced-by: check
severity: 2
added: 1.0.0
status: stable
```

Three shapes, all visible in source: a transition declared across every property rather than
named ones; animation of properties that force layout; and easing that overshoots its end
value, where it reads as the control disagreeing with the user. Remedy: name the properties
that transition, animate only properties that do not affect layout, and reserve overshoot for
something meant to feel physical.

### Full-viewport single-axis opening

```pds-rule
id: web:viewport-hero
class: slop
tier: T1
surface: web
enforced-by: both
severity: 2
added: 1.0.0
status: stable
```

An opening region sized to the viewport height with label, headline, supporting line and
action all on one centred axis is the shape produced when no compositional decision was taken,
and it spends the whole first screen on a sentence. Remedy: decide what the first screen is
for and size it to that; any axis but the centre is a decision.

### Icon provenance

```pds-rule
id: web:icon-provenance
class: slop
tier: T1
surface: web
enforced-by: check
severity: 2
added: 1.0.0
status: stable
```

Icons are a typeface. Drawing from more than one source mixes stroke weights, corner
treatments and optical sizes never designed to sit together; using emoji where an icon belongs
hands the drawing to the reader's platform. Remedy: one source per build, declared in the
contract; draw missing glyphs in that idiom.

### Off-scale value through utility syntax

```pds-rule
id: web:arbitrary-utility-value
class: system
tier: T1
surface: web
enforced-by: check
severity: 3
added: 1.0.0
status: stable
```

Utility frameworks provide a syntax for writing a literal value inline. Every use of it on a
property the contract governs is `core:literal-outside-token-layer` wearing a class attribute,
and it evades the token check because it looks like system usage. Remedy: use the scale step,
or add one to the contract. The syntax is not the problem; the unratified value is.

## The deferred sibling

A terminal annex is a planned sibling with its own tier to engine mapping, floors and id
prefix. It is addable without touching `RULES.md` or the core, which is why engine names and
surface numbers live in an annex.
