---
spec: PDS/1.0
kind: DIRECTION
handle: ledger
positions:
  density: dense
  structure: flat
---

# Direction: ledger

The frontmatter is an ordinary YAML block mapping, which is outside the canonical subset
§2 rule 5 publishes. The file still declares the spec, so it is a candidate PDS artifact
and is reported as violating that rule — never dropped into not-inspected while the
artifact beside it carries a level claim.
