---
spec: PDS/1.0
kind: VERDICT
outcome: {winner: ledger}
grafts: [{from: atrium, part: "the empty-state slot", as: space.gap.lg}]
tokens-digest: 80f03f57a042
answers: [{rule-id: core:interaction-states-incomplete, disposition: accepted}]
dissent: ["codex-1: a flat structure will not survive the settings surface"]
decided-by: human:tomas
gates:
  - {id: G1, outcome: pass, at: "between round-01 and round-02"}
  - {id: G2, outcome: pass, at: "after the graft, before the contract"}
  - {id: G3, outcome: pass, at: "at token ratification"}
g1-signatures:
  - {direction: ledger, fires: []}
  - {direction: atrium, fires: ["core:decoration-unmotivated=the corner numeral"]}
---

# Verdict

One direction wins whole. The graft is re-expressed in a token the winner already declares,
and `tokens-digest` pins the winner's token file as ratified, so G2 can show the file is
untouched rather than take the claim on trust.

G1 records a banned-slop signature for each direction, empty or not. The two sets do not
intersect in two ids, and no id is evidenced by the same declared value in both, so the set
does not share a signature.
