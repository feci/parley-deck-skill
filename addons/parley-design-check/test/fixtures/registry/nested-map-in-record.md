---
registry: core-rules/9.9.9
spec: PDS/1.0
---

# A registry whose record leaves the subset

### A rule with a nested map in its record

```pds-rule
id: core:example-nested
class: quality
tier: T1
surface: core
enforced-by: check
severity: 3
added: 1.0.0
status: stable
thresholds: {text: 4.5, large: 3}
```

A record is flat key/value. The reader raises rather than guessing at a construct it does
not implement.
