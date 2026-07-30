from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
ROOT = SCRIPTS.parent
import sys

sys.path.insert(0, str(SCRIPTS))

from bid_state import (  # noqa: E402
    approve,
    close_workstream,
    consume,
    reconcile_ambiguous,
    reconcile_session,
    record_proof,
    record_verification_failure,
    reopen_for_binding_update,
    resolve_blocked,
    set_binding,
    set_maturity,
    transition,
)
from common import canonical_sha256, sha256_file, write_json_atomic  # noqa: E402
from init_bid_workspace import initial_state  # noqa: E402
from manifest import build_manifest  # noqa: E402


def bound_state(
    bid_id: str,
    lifecycle: str,
    maturity: str = "live-submission-validated",
) -> dict:
    state = initial_state(bid_id)
    state["lifecycle_state"] = lifecycle
    state["adapter_maturity"] = maturity
    state["bindings"].update(
        {
            "deployment": "test-deployment",
            "account": "operator@example.invalid",
            "bidder": "Example Bidder",
            "procedure": "PROC-1",
            "lot_offer": "main-offer",
            "deadline": "2030-01-01T12:00:00+01:00",
            "signature_regime": "text-form",
            "price_digest": "sha256:price",
            "visible_target": "PROC-1/main-offer",
            "declarant_signatory": "Authorized Signatory",
            "authority_basis": "joint-commercial-register-authority",
            "click_approver": "Portal Operator",
            "commercial_approver": "Commercial Lead",
            "declarations_digest": "sha256:declarations",
            "first_offer_risk_acknowledged": True,
        }
    )
    return state


def set_freeze(state: dict, manifest_path: Path, release_id: str = "R1") -> None:
    state["freeze"] = {
        "release_id": release_id,
        "manifest_path": str(manifest_path.resolve()),
        "manifest_sha256": sha256_file(manifest_path),
        "bindings_fingerprint": canonical_sha256(state["bindings"]),
        "adapter_maturity": state["adapter_maturity"],
        "frozen_at": "2030-01-01T00:00:00Z",
        "stale": False,
    }


def make_manifest(root: Path, content: bytes = b"same bytes") -> tuple[Path, Path]:
    release = root / "release"
    release.mkdir(parents=True)
    (release / "offer.bin").write_bytes(content)
    manifest_path = root / "manifest.json"
    write_json_atomic(manifest_path, build_manifest(release))
    return release, manifest_path


class BidStateTests(unittest.TestCase):
    def test_release_freeze_requires_commercial_approval_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            _, manifest = make_manifest(root)
            state = bound_state("bid-a", "release-candidate")
            approve(
                state,
                "freeze-1",
                "E2",
                "Commercial Lead",
                "commercial-approver",
                manifest,
            )
            state_path = root / "bid-state.json"
            transition(
                state_path,
                state,
                "release-frozen",
                None,
                "freeze-1",
                manifest,
                "R1",
            )
            self.assertEqual(state["lifecycle_state"], "release-frozen")
            self.assertEqual(state["freeze"]["manifest_sha256"], sha256_file(manifest))

    def test_upload_approval_cannot_authorize_submission(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            portfolio = Path(temporary)
            workspace = portfolio / "bid-a"
            workspace.mkdir()
            state_path = workspace / "bid-state.json"
            _, manifest = make_manifest(workspace)
            state = bound_state("bid-a", "staging")
            set_freeze(state, manifest)
            write_json_atomic(state_path, state)
            e5 = approve(
                state, "stage-1", "E5", "Portal Operator", "click-approver", manifest
            )
            transition(state_path, state, "staged", portfolio, "stage-1", manifest)
            transition(state_path, state, "pre-submit-checked", None, None, None)
            transition(
                state_path,
                state,
                "awaiting-final-approval",
                portfolio,
                None,
                None,
            )
            with self.assertRaises(ValueError):
                transition(
                    state_path, state, "submitting", portfolio, "stage-1", manifest
                )
            approve(
                state, "submit-1", "E6", "Portal Operator", "click-approver", manifest
            )
            transition(
                state_path, state, "submitting", portfolio, "submit-1", manifest
            )
            self.assertEqual(state["lifecycle_state"], "submitting")
            self.assertEqual(e5["status"], "consumed")

    def test_authority_change_invalidates_e6_approval_fingerprint(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            _, manifest = make_manifest(root)
            state = bound_state("bid-a", "awaiting-final-approval")
            set_freeze(state, manifest)
            approve(
                state, "submit-1", "E6", "Portal Operator", "click-approver", manifest
            )
            state["bindings"]["authority_basis"] = "new-power-of-attorney"
            with self.assertRaises(ValueError):
                consume(state, "submit-1", "E6", manifest)
            self.assertEqual(state["approvals"][-1]["status"], "stale")

    def test_single_active_final_window_requires_explicit_plausible_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            portfolio = Path(temporary)
            first = portfolio / "first"
            second = portfolio / "second"
            first.mkdir()
            second.mkdir()
            write_json_atomic(
                first / "bid-state.json",
                bound_state("first", "awaiting-final-approval"),
            )
            second_state = bound_state("second", "pre-submit-checked")
            second_path = second / "bid-state.json"
            write_json_atomic(second_path, second_state)
            with self.assertRaises(ValueError):
                transition(
                    second_path,
                    second_state,
                    "awaiting-final-approval",
                    portfolio,
                    None,
                    None,
                )
            with self.assertRaises(ValueError):
                transition(
                    second_path,
                    second_state,
                    "awaiting-final-approval",
                    None,
                    None,
                    None,
                )

    def test_p3_requires_stored_frozen_manifest_and_exact_submitted_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            release, manifest = make_manifest(root)
            submitted = root / "submitted"
            submitted.mkdir()
            (submitted / "offer.bin").write_bytes(b"same bytes")
            state = bound_state("bid-a", "submission-recorded")
            set_freeze(state, manifest)
            adapter = ROOT / "assets" / "platform-adapters" / "cosinex-vmp.dtvp.json"
            record_proof(state, "P3", adapter, None, None, manifest, submitted)
            self.assertEqual(state["proof"]["level"], "P3")
            self.assertEqual(state["proof"]["manifest_sha256"], sha256_file(manifest))

            swapped = root / "swapped.json"
            write_json_atomic(swapped, build_manifest(release))
            swapped.write_text(swapped.read_text(encoding="utf-8") + " ", encoding="utf-8")
            with self.assertRaises(ValueError):
                record_proof(state, "P3", adapter, None, None, swapped, submitted)

            (submitted / "offer.bin").write_bytes(b"different")
            failed = bound_state("bid-b", "submission-recorded")
            set_freeze(failed, manifest)
            with self.assertRaises(RuntimeError):
                record_proof(failed, "P3", adapter, None, None, manifest, submitted)
            self.assertEqual(failed["lifecycle_state"], "verification-failed")

    def test_research_only_profile_cannot_record_p1(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            evidence = Path(temporary) / "screen.txt"
            evidence.write_text("visible", encoding="utf-8")
            state = bound_state(
                "bid-a", "submission-recorded", maturity="research-only"
            )
            adapter = ROOT / "assets" / "platform-adapters" / "cosinex-vmp.nrw.json"
            with self.assertRaises(ValueError):
                record_proof(state, "P1", adapter, evidence, None, None, None)

    def test_ambiguous_reconciliation_requires_inline_proof(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            evidence = Path(temporary) / "receipt.txt"
            evidence.write_text("receipt", encoding="utf-8")
            state = bound_state("bid-a", "unknown-possibly-submitted")
            adapter = ROOT / "assets" / "platform-adapters" / "cosinex-vmp.dtvp.json"
            with self.assertRaises(ValueError):
                reconcile_ambiguous(
                    state, "submitted", evidence, "Reconciler", None, adapter
                )
            reconcile_ambiguous(
                state, "submitted", evidence, "Reconciler", "P2", adapter
            )
            self.assertEqual(state["lifecycle_state"], "submission-recorded")
            self.assertEqual(state["proof"]["level"], "P2")

    def test_ambiguous_reconciliation_enforces_ceiling_p3_and_no_retry(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            evidence = root / "evidence.txt"
            evidence.write_text("portal evidence", encoding="utf-8")
            state_path = root / "bid-state.json"
            research = bound_state(
                "bid-a", "unknown-possibly-submitted", maturity="research-only"
            )
            with self.assertRaises(ValueError):
                reconcile_ambiguous(
                    research,
                    "submitted",
                    evidence,
                    "Reconciler",
                    "P1",
                    ROOT / "assets" / "platform-adapters" / "manual.json",
                )
            with self.assertRaises(ValueError):
                transition(
                    state_path,
                    research,
                    "submitting",
                    root,
                    None,
                    None,
                )

            release, manifest = make_manifest(root / "p3")
            submitted = root / "submitted"
            submitted.mkdir()
            (submitted / "offer.bin").write_bytes(b"different")
            p3 = bound_state("bid-b", "unknown-possibly-submitted")
            set_freeze(p3, manifest)
            with self.assertRaises(RuntimeError):
                reconcile_ambiguous(
                    p3,
                    "submitted",
                    evidence,
                    "Reconciler",
                    "P3",
                    ROOT / "assets" / "platform-adapters" / "cosinex-vmp.dtvp.json",
                    release_manifest=manifest,
                    submitted_root=submitted,
                )
            self.assertEqual(p3["lifecycle_state"], "verification-failed")

    def test_not_submitted_reconciliation_preserves_evidence_and_no_proof(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            evidence = Path(temporary) / "empty-history.txt"
            evidence.write_text("no submission", encoding="utf-8")
            state = bound_state("bid-a", "unknown-possibly-submitted")
            reconcile_ambiguous(
                state, "not-submitted", evidence, "Reconciler"
            )
            self.assertEqual(state["lifecycle_state"], "failed-before-submit")
            self.assertIsNone(state["proof"])
            self.assertEqual(
                state["exception_context"]["evidence"]["sha256"],
                sha256_file(evidence),
            )

    def test_blocked_and_session_lost_are_evidence_recoverable(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            evidence = root / "evidence.txt"
            evidence.write_text("read-only resolution", encoding="utf-8")
            state_path = root / "bid-state.json"

            blocked = bound_state("bid-a", "drafting")
            transition(state_path, blocked, "blocked", None, None, None)
            resolve_blocked(state_path, blocked, evidence, "Bid Lead", None)
            self.assertEqual(blocked["lifecycle_state"], "drafting")

            session = bound_state("bid-b", "staged")
            transition(state_path, session, "session-lost", None, None, None)
            reconcile_session(state_path, session, evidence, "Portal Operator", None)
            self.assertEqual(session["lifecycle_state"], "staged")

    def test_recovery_cannot_restore_second_bid_into_final_window(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            portfolio = Path(temporary)
            active_workspace = portfolio / "active"
            recovering_workspace = portfolio / "recovering"
            active_workspace.mkdir()
            recovering_workspace.mkdir()
            write_json_atomic(
                active_workspace / "bid-state.json",
                bound_state("active", "awaiting-final-approval"),
            )
            evidence = recovering_workspace / "evidence.txt"
            evidence.write_text("read-only reconciliation", encoding="utf-8")

            blocked_path = recovering_workspace / "bid-state.json"
            blocked = bound_state("recovering", "awaiting-final-approval")
            transition(blocked_path, blocked, "blocked", None, None, None)
            write_json_atomic(blocked_path, blocked)
            with self.assertRaises(ValueError):
                resolve_blocked(
                    blocked_path, blocked, evidence, "Bid Lead", portfolio
                )
            self.assertEqual(blocked["lifecycle_state"], "blocked")

            session_lost = bound_state("recovering", "awaiting-final-approval")
            transition(
                blocked_path, session_lost, "session-lost", None, None, None
            )
            write_json_atomic(blocked_path, session_lost)
            with self.assertRaises(ValueError):
                reconcile_session(
                    blocked_path,
                    session_lost,
                    evidence,
                    "Portal Operator",
                    portfolio,
                )
            self.assertEqual(session_lost["lifecycle_state"], "session-lost")

    def test_binding_update_stales_freeze_and_reopens_four_workstreams(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            _, manifest = make_manifest(root)
            addendum = root / "addendum.txt"
            addendum.write_text("binding update", encoding="utf-8")
            state = bound_state("bid-a", "staged")
            set_freeze(state, manifest)
            reopen_for_binding_update(state, addendum, "Bid Lead")
            self.assertEqual(state["lifecycle_state"], "release-candidate")
            self.assertTrue(state["freeze"]["stale"])
            self.assertEqual(
                set(state["open_workstreams"]),
                {"qualification", "requirements", "commercial", "release"},
            )

    def test_binding_update_never_skips_early_or_exception_lifecycle(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            evidence = Path(temporary) / "addendum.txt"
            evidence.write_text("addendum", encoding="utf-8")
            for lifecycle in ("candidate", "triaged", "qualified", "drafting"):
                with self.subTest(lifecycle=lifecycle):
                    state = bound_state("bid-a", lifecycle)
                    reopen_for_binding_update(state, evidence, "Bid Lead")
                    self.assertEqual(state["lifecycle_state"], lifecycle)
                    self.assertEqual(
                        set(state["open_workstreams"]),
                        {"qualification", "requirements", "commercial", "release"},
                    )
            for lifecycle in ("blocked", "session-lost"):
                with self.subTest(lifecycle=lifecycle):
                    state = bound_state("bid-a", lifecycle)
                    with self.assertRaises(ValueError):
                        reopen_for_binding_update(state, evidence, "Bid Lead")

    def test_open_workstreams_block_refreeze_until_evidence_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            _, manifest = make_manifest(root)
            evidence = root / "evidence.txt"
            evidence.write_text("review complete", encoding="utf-8")
            state = bound_state("bid-a", "staged")
            set_freeze(state, manifest)
            reopen_for_binding_update(state, evidence, "Bid Lead")
            approve(
                state,
                "freeze-2",
                "E2",
                "Commercial Lead",
                "commercial-approver",
                manifest,
            )
            with self.assertRaises(ValueError):
                transition(
                    root / "bid-state.json",
                    state,
                    "release-frozen",
                    None,
                    "freeze-2",
                    manifest,
                    "R2",
                )
            for stream in list(state["open_workstreams"]):
                close_workstream(state, stream, evidence, "Workstream Owner")
            approve(
                state,
                "freeze-3",
                "E2",
                "Commercial Lead",
                "commercial-approver",
                manifest,
            )
            transition(
                root / "bid-state.json",
                state,
                "release-frozen",
                None,
                "freeze-3",
                manifest,
                "R2",
            )
            self.assertEqual(state["open_workstreams"], [])
            self.assertEqual(len(state["workstream_closures"]), 4)

    def test_release_id_cannot_be_reused_for_changed_frozen_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            release, first_manifest = make_manifest(root, b"first")
            state = bound_state("bid-a", "release-candidate")
            approve(
                state,
                "freeze-1",
                "E2",
                "Commercial Lead",
                "commercial-approver",
                first_manifest,
            )
            transition(
                root / "bid-state.json",
                state,
                "release-frozen",
                None,
                "freeze-1",
                first_manifest,
                "R1",
            )
            state["lifecycle_state"] = "release-candidate"
            state["freeze"]["stale"] = True
            (release / "offer.bin").write_bytes(b"second")
            second_manifest = root / "second-manifest.json"
            write_json_atomic(second_manifest, build_manifest(release))
            approve(
                state,
                "freeze-2",
                "E2",
                "Commercial Lead",
                "commercial-approver",
                second_manifest,
            )
            with self.assertRaises(ValueError):
                transition(
                    root / "bid-state.json",
                    state,
                    "release-frozen",
                    None,
                    "freeze-2",
                    second_manifest,
                    "R1",
                )

    def test_material_binding_change_stales_freeze_and_regresses_release(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            _, manifest = make_manifest(root)
            state = bound_state("bid-a", "staged")
            set_freeze(state, manifest)
            set_binding(state, "price_digest", "sha256:new-price")
            self.assertEqual(state["lifecycle_state"], "release-candidate")
            self.assertTrue(state["freeze"]["stale"])
            self.assertIn("commercial", state["open_workstreams"])

    def test_set_maturity_noop_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            evidence = Path(temporary) / "scope.txt"
            evidence.write_text("scope", encoding="utf-8")
            state = bound_state("bid-a", "candidate")
            before = list(state["history"])
            changed = set_maturity(
                state, "live-submission-validated", evidence, "Owner"
            )
            self.assertFalse(changed)
            self.assertEqual(state["history"], before)

    def test_verification_failure_requires_and_preserves_both_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            expected = root / "expected.txt"
            observed = root / "observed.txt"
            expected.write_text("expected receipt", encoding="utf-8")
            observed.write_text("missing receipt", encoding="utf-8")
            state = bound_state("bid-a", "submission-recorded")
            record_verification_failure(
                state, expected, observed, "Verification Owner"
            )
            self.assertEqual(state["lifecycle_state"], "verification-failed")
            self.assertEqual(
                state["exception_context"]["expected"]["sha256"],
                sha256_file(expected),
            )
            self.assertEqual(
                state["exception_context"]["observed"]["sha256"],
                sha256_file(observed),
            )

    def test_ambiguous_reconciliation_stales_prior_approvals(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            _, manifest = make_manifest(root)
            receipt = root / "receipt.txt"
            receipt.write_text("receipt", encoding="utf-8")
            state = bound_state("bid-a", "unknown-possibly-submitted")
            set_freeze(state, manifest)
            approve(
                state,
                "amend-premature",
                "E7",
                "Portal Operator",
                "click-approver",
                manifest,
            )
            reconcile_ambiguous(
                state,
                "submitted",
                receipt,
                "Reconciler",
                "P2",
                ROOT / "assets" / "platform-adapters" / "cosinex-vmp.dtvp.json",
            )
            self.assertEqual(state["approvals"][-1]["status"], "stale")

    def test_cli_persists_fingerprint_mismatch_as_stale(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            _, manifest = make_manifest(root)
            state_path = root / "bid-state.json"
            state = bound_state("bid-a", "awaiting-final-approval")
            set_freeze(state, manifest)
            approve(
                state,
                "submit-1",
                "E6",
                "Portal Operator",
                "click-approver",
                manifest,
            )
            state["bindings"]["authority_basis"] = "changed-outside-cli"
            write_json_atomic(state_path, state)
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "bid_state.py"),
                    "consume",
                    "--state",
                    str(state_path),
                    "--action-id",
                    "submit-1",
                    "--effect",
                    "E6",
                    "--payload-file",
                    str(manifest),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            persisted = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual(persisted["approvals"][-1]["status"], "stale")


if __name__ == "__main__":
    unittest.main()
