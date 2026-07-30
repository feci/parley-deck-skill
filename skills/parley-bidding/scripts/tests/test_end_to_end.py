from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(SCRIPTS))

from bid_state import approve, close_workstream, transition  # noqa: E402
from common import write_json_atomic  # noqa: E402
from init_bid_workspace import initial_state  # noqa: E402
from manifest import build_manifest  # noqa: E402


def ready_candidate() -> dict:
    state = initial_state("SYNTH-E2E")
    state["adapter_maturity"] = "live-submission-validated"
    state["bindings"].update(
        {
            "deployment": "synthetic-live",
            "account": "operator@example.invalid",
            "bidder": "Synthetic Bidder",
            "procedure": "PROC-E2E",
            "lot_offer": "offer-1",
            "deadline": "2030-01-01T12:00:00+01:00",
            "signature_regime": "text-form",
            "price_digest": "sha256:price",
            "visible_target": "PROC-E2E/offer-1",
            "declarant_signatory": "Authorized Signatory",
            "authority_basis": "documented-authority",
            "click_approver": "Portal Operator",
            "commercial_approver": "Commercial Lead",
            "declarations_digest": "sha256:declarations",
            "first_offer_risk_acknowledged": True,
        }
    )
    return state


class EndToEndTests(unittest.TestCase):
    def test_candidate_to_submission_recorded_uses_three_distinct_human_gates(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            portfolio = Path(temporary)
            workspace = portfolio / "bid"
            workspace.mkdir()
            release = workspace / "release"
            release.mkdir()
            (release / "offer.txt").write_text("offer", encoding="utf-8")
            manifest = workspace / "manifest.json"
            write_json_atomic(manifest, build_manifest(release))
            state_path = workspace / "bid-state.json"
            state = ready_candidate()
            write_json_atomic(state_path, state)

            for target in (
                "triaged",
                "qualified",
                "acquired",
                "inventoried",
                "reconciled",
                "analyzed",
                "drafting",
                "challenged",
                "release-candidate",
            ):
                transition(state_path, state, target, None, None, None)

            approve(
                state,
                "freeze-r1",
                "E2",
                "Commercial Lead",
                "commercial-approver",
                manifest,
            )
            transition(
                state_path,
                state,
                "release-frozen",
                None,
                "freeze-r1",
                manifest,
                "R1",
            )
            transition(state_path, state, "platform-bound", None, None, None)
            transition(state_path, state, "staging", None, None, None)
            approve(
                state,
                "stage-r1",
                "E5",
                "Portal Operator",
                "click-approver",
                manifest,
            )
            transition(
                state_path, state, "staged", None, "stage-r1", manifest
            )
            transition(state_path, state, "pre-submit-checked", None, None, None)
            transition(
                state_path,
                state,
                "awaiting-final-approval",
                portfolio,
                None,
                None,
            )
            approve(
                state,
                "submit-r1",
                "E6",
                "Portal Operator",
                "click-approver",
                manifest,
            )
            transition(
                state_path,
                state,
                "submitting",
                portfolio,
                "submit-r1",
                manifest,
            )
            transition(
                state_path, state, "submission-recorded", None, None, None
            )
            self.assertEqual(state["lifecycle_state"], "submission-recorded")
            action_ids = [approval["action_id"] for approval in state["approvals"]]
            self.assertEqual(action_ids, ["freeze-r1", "stage-r1", "submit-r1"])
            self.assertEqual(len(set(action_ids)), 3)
            self.assertLessEqual(len(action_ids), 10)

    def test_amendment_requires_e7_then_new_freeze_and_fresh_e6(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            portfolio = Path(temporary)
            workspace = portfolio / "bid"
            workspace.mkdir()
            release = workspace / "release"
            release.mkdir()
            (release / "offer.txt").write_text("old", encoding="utf-8")
            old_manifest = workspace / "old-manifest.json"
            write_json_atomic(old_manifest, build_manifest(release))
            state = ready_candidate()
            state["lifecycle_state"] = "release-candidate"
            state_path = workspace / "bid-state.json"
            approve(
                state,
                "freeze-old",
                "E2",
                "Commercial Lead",
                "commercial-approver",
                old_manifest,
            )
            transition(
                state_path,
                state,
                "release-frozen",
                None,
                "freeze-old",
                old_manifest,
                "R1",
            )
            state["lifecycle_state"] = "submission-recorded"
            approve(
                state,
                "wrong-effect",
                "E6",
                "Portal Operator",
                "click-approver",
                old_manifest,
            )
            with self.assertRaises(ValueError):
                transition(
                    state_path,
                    state,
                    "amendment-pending",
                    None,
                    "wrong-effect",
                    old_manifest,
                )
            approve(
                state,
                "amend-old",
                "E7",
                "Portal Operator",
                "click-approver",
                old_manifest,
            )
            transition(
                state_path,
                state,
                "amendment-pending",
                None,
                "amend-old",
                old_manifest,
            )
            transition(
                state_path, state, "release-candidate", None, None, None
            )
            self.assertTrue(state["freeze"]["stale"])

            (release / "offer.txt").write_text("new", encoding="utf-8")
            new_manifest = workspace / "new-manifest.json"
            write_json_atomic(new_manifest, build_manifest(release))
            closure = workspace / "closure.txt"
            closure.write_text("workstream review complete", encoding="utf-8")
            for stream in list(state["open_workstreams"]):
                close_workstream(state, stream, closure, "Workstream Owner")
            approve(
                state,
                "freeze-new",
                "E2",
                "Commercial Lead",
                "commercial-approver",
                new_manifest,
            )
            transition(
                state_path,
                state,
                "release-frozen",
                None,
                "freeze-new",
                new_manifest,
                "R2",
            )
            self.assertEqual(state["freeze"]["release_id"], "R2")
            self.assertFalse(state["freeze"]["stale"])
            transition(state_path, state, "platform-bound", None, None, None)
            transition(state_path, state, "staging", None, None, None)
            approve(
                state,
                "stage-r2",
                "E5",
                "Portal Operator",
                "click-approver",
                new_manifest,
            )
            transition(
                state_path, state, "staged", None, "stage-r2", new_manifest
            )
            transition(state_path, state, "pre-submit-checked", None, None, None)
            write_json_atomic(state_path, state)
            transition(
                state_path,
                state,
                "awaiting-final-approval",
                portfolio,
                None,
                None,
            )
            approve(
                state,
                "submit-r2",
                "E6",
                "Portal Operator",
                "click-approver",
                new_manifest,
            )
            transition(
                state_path,
                state,
                "submitting",
                portfolio,
                "submit-r2",
                new_manifest,
            )
            self.assertEqual(state["lifecycle_state"], "submitting")


if __name__ == "__main__":
    unittest.main()
