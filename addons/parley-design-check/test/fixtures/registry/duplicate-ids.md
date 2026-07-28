---
registry: core-rules/9.9.9
spec: PDS/1.0
---

# A registry that declares one id twice

### The first site

```pds-rule
id: core:example-plain
class: slop
tier: T0
surface: core
enforced-by: check
severity: 2
added: 1.0.0
status: stable
```

### The second site

```pds-rule
id: core:example-plain
class: quality
tier: T1
surface: core
enforced-by: check
severity: 4
added: 1.0.0
status: stable
```

A consumer that finds this aborts and names both sites.
