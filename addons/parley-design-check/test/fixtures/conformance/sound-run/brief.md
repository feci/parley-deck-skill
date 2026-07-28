---
spec: PDS/1.0
kind: DESIGN-BRIEF
run-id: conformance-sound-run
axes: {density: [sparse, dense], structure: [flat, layered]}
primary-axis: structure
anti-goals: ["reads as a template", "the reader cannot tell one record from another"]
targets: [web]
level: L3
decider: human:tomas
---

# Design brief

Two proposers, two materially distinct positions on the primary axis, and anti-goals that
can be shown false.

The run-id is what §4 rule 2 hashes. Sorted, the primary positions read `flat, layered`;
the seeded rotation for this run-id leaves them in that order and maps them to the sorted
proposer ids `claude-1, codex-1`, which is what each DIRECTION records as `assigned`.
