---
registry: core-rules/9.9.9
spec: PDS/1.0
status: stable
encoding: UTF-8
---

# A registry the parser tests read

Two records, one of them carrying every optional key, so the reader is exercised on the
whole grammar rather than on its happy path.

## Rules

### A rule with the required keys only

```pds-rule
id: core:example-plain
class: slop
tier: T0
surface: core
enforced-by: agent-judgement
severity: 2
added: 1.0.0
status: stable
```

Prose belongs to the rule above and runs until the next heading.

### A rule with the optional keys and a local extension

```pds-rule
id: core:example-full
class: quality
tier: T1
surface: core
enforced-by: check
severity: 4
added: 1.0.0
status: stable
system-blind: true
sources: [WCAG-2.2-SC-1.4.3]
x-local-note: "ignored in silence, because the prefix reserves it"
```

A fence that is not directly under a rule heading is not part of the registry:

```pds-rule
id: core:not-a-rule
```

The reader passes over it, and this file still holds exactly the two rules above.
