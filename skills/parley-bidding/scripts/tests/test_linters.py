from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
ROOT = SCRIPTS.parent
import sys

sys.path.insert(0, str(SCRIPTS))

from common import sha256_file, write_json_atomic  # noqa: E402
from completeness_lint import lint_completeness, price_digest_from_rows  # noqa: E402
from init_bid_workspace import initialize  # noqa: E402
from manifest import build_manifest  # noqa: E402
from release_lint import lint_release  # noqa: E402

REQUIREMENT_FIELDS = [
    "requirement_id", "source_id", "source_location", "authority",
    "classification", "requirement_text", "response", "claim_provenance",
    "proven_scope", "owner", "delivery_strategy", "evidence_ref",
    "verification_method", "work_package", "price_impact", "dependency",
    "acceptance_proof", "status", "confidence", "blocker_level",
    "release_disposition",
]
PRICE_FIELDS = [
    "price_id", "lot", "category", "description", "quantity", "unit",
    "unit_price_net", "line_total_net", "currency", "tax_rate",
    "price_period", "assumption", "dependency", "supplier_evidence",
    "commercial_owner", "status",
]


class LinterTests(unittest.TestCase):
    def _ready_workspace(
        self, temporary: str
    ) -> tuple[Path, Path, Path, Path, Path]:
        workspace = Path(temporary) / "bid"
        initialize(workspace, "SYNTH-1", ROOT)
        release = workspace / "release" / "frozen"
        offer = release / "offer.txt"
        offer.write_text("Synthetic final offer", encoding="utf-8")
        procedure_path = workspace / "procedure-profile.json"
        procedure = json.loads(procedure_path.read_text(encoding="utf-8"))
        procedure.update(
            {
                "discovery_source": {
                    "id": "eu-ted",
                    "notice_id": "SYNTH-NOTICE",
                    "url": "https://example.invalid/notice",
                    "observed_at": "2026-07-27T10:00:00+02:00",
                },
                "authoritative_origin": {
                    "procedure_id": "SYNTH-PROC",
                    "url": "https://example.invalid/origin",
                    "observed_at": "2026-07-27T10:01:00+02:00",
                },
                "submission_platform": {
                    "profile_id": "manual",
                    "url": "https://example.invalid/portal",
                },
                "portal_binding": {
                    "account": "operator@example.invalid",
                    "bidder": "Synthetic Bidder",
                    "visible_target": "SYNTH-PROC/main-offer",
                },
                "authority": {
                    "declarant_signatory": "Synthetic Signatory",
                    "authority_basis": "documented-authority",
                    "click_approver": "Synthetic Operator",
                    "commercial_approver": "Commercial Lead",
                    "declarations_digest": "sha256:declarations",
                },
                "procedure_id": "SYNTH-PROC",
                "lot_offer": "main-offer",
                "deadline": "2030-01-01T12:00:00+01:00",
                "timezone": "Europe/Berlin",
                "signature_regime": "text-form",
                "qualification_decision": "pursue",
                "qualification_conditions_closed": True,
                "negotiation_guaranteed": False,
                "first_offer_risk_acknowledged": True,
                "mandatory_documents": [
                    {
                        "path": "offer.txt",
                        "required": True,
                        "sha256": sha256_file(offer),
                        "signature_required": False,
                        "signature_confirmed": False,
                        "released_version": "1",
                        "buyer_current_version": "1",
                        "current_version_evidence": "evidence/current-index.txt",
                        "current_version_observed_at": "2026-07-27T10:02:00+02:00",
                    }
                ],
            }
        )
        write_json_atomic(procedure_path, procedure)

        requirements = workspace / "work" / "requirements-register.csv"
        with requirements.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=REQUIREMENT_FIELDS)
            writer.writeheader()
            writer.writerow(
                {
                    "requirement_id": "R1",
                    "source_id": "SPEC-1",
                    "source_location": "p.1",
                    "authority": "buyer-current",
                    "classification": "must",
                    "requirement_text": "Provide the synthetic service.",
                    "response": "Comply.",
                    "claim_provenance": "bidder-evidence",
                    "proven_scope": "offered-service",
                    "owner": "Solution Lead",
                    "delivery_strategy": "comply",
                    "evidence_ref": "evidence/R1",
                    "verification_method": "document-inspection",
                    "work_package": "WP1",
                    "price_impact": "included",
                    "dependency": "none",
                    "acceptance_proof": "acceptance-test",
                    "status": "evidenced",
                    "confidence": "high",
                    "blocker_level": "",
                    "release_disposition": "included",
                }
            )

        pricing = workspace / "work" / "pricing-worksheet.csv"
        price_row = {
            "price_id": "P1",
            "lot": "main-offer",
            "category": "implementation",
            "description": "Synthetic implementation",
            "quantity": "2",
            "unit": "day",
            "unit_price_net": "1000.00",
            "line_total_net": "2000.00",
            "currency": "EUR",
            "tax_rate": "0.19",
            "price_period": "one-time",
            "assumption": "synthetic",
            "dependency": "none",
            "supplier_evidence": "n/a",
            "commercial_owner": "Commercial Lead",
            "status": "approved",
        }
        with pricing.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=PRICE_FIELDS)
            writer.writeheader()
            writer.writerow(price_row)

        state_path = workspace / "bid-state.json"
        state = json.loads(state_path.read_text(encoding="utf-8"))
        state["bindings"].update(
            {
                "deployment": "unsupported-platform",
                "account": "operator@example.invalid",
                "bidder": "Synthetic Bidder",
                "procedure": "SYNTH-PROC",
                "lot_offer": "main-offer",
                "deadline": "2030-01-01T12:00:00+01:00",
                "signature_regime": "text-form",
                "price_digest": price_digest_from_rows([price_row]),
                "visible_target": "SYNTH-PROC/main-offer",
                "declarant_signatory": "Synthetic Signatory",
                "authority_basis": "documented-authority",
                "click_approver": "Synthetic Operator",
                "commercial_approver": "Commercial Lead",
                "declarations_digest": "sha256:declarations",
                "first_offer_risk_acknowledged": True,
            }
        )
        write_json_atomic(state_path, state)
        return workspace, procedure_path, release, requirements, pricing

    def test_ready_synthetic_workspace_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace, procedure, release, _, _ = self._ready_workspace(temporary)
            adapter = ROOT / "assets" / "platform-adapters" / "manual.json"
            report = lint_completeness(workspace, procedure, adapter)
            self.assertTrue(report["ok"], report)

            manifest_path = workspace / "archive" / "manifest.json"
            write_json_atomic(manifest_path, build_manifest(release))
            release_report = lint_release(release, manifest_path)
            self.assertTrue(release_report["ok"], release_report)

    def test_stale_buyer_version_and_binding_mismatch_block(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace, procedure_path, _, _, _ = self._ready_workspace(temporary)
            procedure = json.loads(procedure_path.read_text(encoding="utf-8"))
            procedure["mandatory_documents"][0]["buyer_current_version"] = "2"
            procedure["portal_binding"]["account"] = "different@example.invalid"
            procedure["portal_binding"]["bidder"] = "Different Bidder"
            procedure["portal_binding"]["visible_target"] = "DIFFERENT/target"
            write_json_atomic(procedure_path, procedure)
            report = lint_completeness(
                workspace,
                procedure_path,
                ROOT / "assets" / "platform-adapters" / "manual.json",
            )
            codes = {item["code"] for item in report["errors"]}
            self.assertIn("stale-buyer-document-version", codes)
            mismatches = {
                item["detail"]
                for item in report["errors"]
                if item["code"] == "state-binding-mismatch"
            }
            self.assertTrue({"account", "bidder", "visible_target"} <= mismatches)

    def test_discovery_origin_fixture_drives_real_linter_outcomes(self) -> None:
        fixture = json.loads(
            (
                ROOT
                / "scripts"
                / "tests"
                / "fixtures"
                / "discovery-origin-cases.json"
            ).read_text(encoding="utf-8")
        )
        for case in fixture["cases"]:
            with self.subTest(case=case["id"]), tempfile.TemporaryDirectory() as temporary:
                workspace, procedure_path, _, _, _ = self._ready_workspace(temporary)
                procedure = json.loads(procedure_path.read_text(encoding="utf-8"))
                procedure["origin_conflicts"] = [
                    {
                        key: value
                        for key, value in case.items()
                        if key
                        in {
                            "field",
                            "material",
                            "resolved",
                            "substantive_equivalence_evidence",
                        }
                    }
                ]
                write_json_atomic(procedure_path, procedure)
                report = lint_completeness(
                    workspace,
                    procedure_path,
                    ROOT / "assets" / "platform-adapters" / "manual.json",
                )
                origin_errors = {
                    item["code"]
                    for item in report["errors"]
                    if "origin-conflict" in item["code"]
                }
                self.assertEqual(bool(origin_errors), case["expected_release_block"])
                if case["id"] == "benign-title-punctuation":
                    self.assertTrue(
                        any(
                            item["code"] == "evidenced-nonmaterial-origin-conflict"
                            for item in report["warnings"]
                        )
                    )

    def test_nonmaterial_origin_conflict_needs_equivalence_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace, procedure_path, _, _, _ = self._ready_workspace(temporary)
            procedure = json.loads(procedure_path.read_text(encoding="utf-8"))
            procedure["origin_conflicts"] = [
                {"field": "title", "material": False, "resolved": False}
            ]
            write_json_atomic(procedure_path, procedure)
            adapter = ROOT / "assets" / "platform-adapters" / "manual.json"
            report = lint_completeness(workspace, procedure_path, adapter)
            self.assertTrue(
                any(
                    item["code"] == "nonmaterial-origin-conflict-unproven"
                    for item in report["errors"]
                )
            )
            procedure["origin_conflicts"][0][
                "substantive_equivalence_evidence"
            ] = "evidence/title-comparison.txt"
            write_json_atomic(procedure_path, procedure)
            report = lint_completeness(workspace, procedure_path, adapter)
            self.assertTrue(report["ok"], report)
            self.assertTrue(
                any(
                    item["code"] == "evidenced-nonmaterial-origin-conflict"
                    for item in report["warnings"]
                )
            )

    def test_inference_cannot_close_mandatory_requirement(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace, procedure, _, requirements, _ = self._ready_workspace(temporary)
            rows = list(csv.DictReader(requirements.read_text(encoding="utf-8").splitlines()))
            rows[0]["claim_provenance"] = "model-inference"
            with requirements.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=REQUIREMENT_FIELDS)
                writer.writeheader()
                writer.writerows(rows)
            report = lint_completeness(
                workspace,
                procedure,
                ROOT / "assets" / "platform-adapters" / "manual.json",
            )
            self.assertTrue(
                any(
                    item["code"] == "mandatory-claim-closed-by-inference"
                    for item in report["errors"]
                )
            )

    def test_nonfinite_price_and_missing_commercial_owner_block(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace, procedure, _, _, pricing = self._ready_workspace(temporary)
            rows = list(csv.DictReader(pricing.read_text(encoding="utf-8").splitlines()))
            rows[0]["unit_price_net"] = "NaN"
            rows[0]["commercial_owner"] = ""
            with pricing.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=PRICE_FIELDS)
                writer.writeheader()
                writer.writerows(rows)
            report = lint_completeness(
                workspace,
                procedure,
                ROOT / "assets" / "platform-adapters" / "manual.json",
            )
            codes = {item["code"] for item in report["errors"]}
            self.assertIn("invalid-price-number", codes)
            self.assertIn("commercial-owner-missing", codes)

    def test_large_finite_prices_return_structured_errors(self) -> None:
        for field, value in (
            ("unit_price_net", "999999999999999999999999999"),
            ("tax_rate", "1E+9999999999"),
        ):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as temporary:
                workspace, procedure, _, _, pricing = self._ready_workspace(
                    temporary
                )
                rows = list(
                    csv.DictReader(pricing.read_text(encoding="utf-8").splitlines())
                )
                rows[0][field] = value
                with pricing.open("w", encoding="utf-8", newline="") as handle:
                    writer = csv.DictWriter(handle, fieldnames=PRICE_FIELDS)
                    writer.writeheader()
                    writer.writerows(rows)
                report = lint_completeness(
                    workspace,
                    procedure,
                    ROOT / "assets" / "platform-adapters" / "manual.json",
                )
                self.assertFalse(report["ok"])
                self.assertTrue(
                    any(
                        item["code"] == "invalid-price-number"
                        for item in report["errors"]
                    )
                )

    def test_pricing_register_is_unconditionally_required(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace, procedure, _, _, pricing = self._ready_workspace(temporary)
            pricing.write_text(",".join(PRICE_FIELDS) + "\n", encoding="utf-8")
            report = lint_completeness(
                workspace,
                procedure,
                ROOT / "assets" / "platform-adapters" / "manual.json",
            )
            self.assertFalse(report["ok"])
            self.assertTrue(
                any(
                    item["code"] == "pricing-register-empty"
                    for item in report["errors"]
                )
            )

    def test_pricing_row_wider_than_header_returns_structured_error(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace, procedure, _, _, pricing = self._ready_workspace(temporary)
            header = ",".join(PRICE_FIELDS)
            values = [
                "P1",
                "main-offer",
                "implementation",
                "Synthetic",
                "description-with-stray-comma",
                "2",
                "day",
                "1000.00",
                "2000.00",
                "EUR",
                "0.19",
                "one-time",
                "synthetic",
                "none",
                "n/a",
                "Commercial Lead",
                "approved",
            ]
            pricing.write_text(
                header + "\n" + ",".join(values) + "\n",
                encoding="utf-8",
            )
            report = lint_completeness(
                workspace,
                procedure,
                ROOT / "assets" / "platform-adapters" / "manual.json",
            )
            self.assertFalse(report["ok"])
            self.assertTrue(
                any(
                    item["code"] == "malformed-price-row"
                    for item in report["errors"]
                )
            )

    def test_requirements_row_wider_than_header_returns_structured_error(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace, procedure, _, requirements, _ = self._ready_workspace(
                temporary
            )
            with requirements.open("a", encoding="utf-8", newline="") as handle:
                handle.write(
                    ",".join(
                        [
                            "R2",
                            "SPEC-2",
                            "p.2",
                            "buyer-current",
                            "must",
                            "Provide another service.",
                            "Comply.",
                            "bidder-evidence",
                            "offered-service",
                            "Solution Lead",
                            "comply",
                            "evidence/R2",
                            "document-inspection",
                            "WP2",
                            "included",
                            "none",
                            "acceptance-test",
                            "evidenced",
                            "high",
                            "",
                            "included",
                            "surplus",
                        ]
                    )
                    + "\n"
                )
            report = lint_completeness(
                workspace,
                procedure,
                ROOT / "assets" / "platform-adapters" / "manual.json",
            )
            self.assertFalse(report["ok"])
            self.assertTrue(
                any(
                    item["code"] == "malformed-requirement-row"
                    for item in report["errors"]
                )
            )

    def test_rows_narrower_than_header_return_structured_errors(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace, procedure, _, requirements, pricing = self._ready_workspace(
                temporary
            )
            requirements.write_text(
                ",".join(REQUIREMENT_FIELDS) + "\nR1,SPEC-1,p.1,buyer-current,must\n",
                encoding="utf-8",
            )
            report = lint_completeness(
                workspace,
                procedure,
                ROOT / "assets" / "platform-adapters" / "manual.json",
            )
            self.assertTrue(
                any(
                    item["code"] == "mandatory-requirement-field-missing"
                    for item in report["errors"]
                )
            )

            pricing.write_text(
                ",".join(PRICE_FIELDS) + "\nP1,main-offer,implementation\n",
                encoding="utf-8",
            )
            report = lint_completeness(
                workspace,
                procedure,
                ROOT / "assets" / "platform-adapters" / "manual.json",
            )
            codes = {item["code"] for item in report["errors"]}
            self.assertIn("commercial-owner-missing", codes)
            self.assertIn("invalid-price-number", codes)

    def test_first_offer_negative_path_and_null_signature_block(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace, procedure_path, _, _, _ = self._ready_workspace(temporary)
            procedure = json.loads(procedure_path.read_text(encoding="utf-8"))
            procedure["first_offer_risk_acknowledged"] = False
            procedure["signature_regime"] = None
            write_json_atomic(procedure_path, procedure)
            report = lint_completeness(
                workspace,
                procedure_path,
                ROOT / "assets" / "platform-adapters" / "manual.json",
            )
            codes = {item["code"] for item in report["errors"]}
            self.assertIn("first-offer-risk-unacknowledged", codes)
            self.assertIn("signature-regime-unresolved", codes)

    def test_matching_signature_variants_are_reconciled_not_inferred(self) -> None:
        for variant in ("text-form", "advanced-electronic", "qualified-electronic"):
            with self.subTest(variant=variant), tempfile.TemporaryDirectory() as temporary:
                workspace, procedure_path, _, _, _ = self._ready_workspace(temporary)
                procedure = json.loads(procedure_path.read_text(encoding="utf-8"))
                procedure["signature_regime"] = variant
                write_json_atomic(procedure_path, procedure)
                state_path = workspace / "bid-state.json"
                state = json.loads(state_path.read_text(encoding="utf-8"))
                state["bindings"]["signature_regime"] = variant
                write_json_atomic(state_path, state)
                report = lint_completeness(
                    workspace,
                    procedure_path,
                    ROOT / "assets" / "platform-adapters" / "manual.json",
                )
                self.assertTrue(report["ok"], report)

    def test_valid_price_change_changes_digest_and_stales_binding(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace, procedure, _, _, pricing = self._ready_workspace(temporary)
            rows = list(csv.DictReader(pricing.read_text(encoding="utf-8").splitlines()))
            rows[0]["unit_price_net"] = "1100.00"
            rows[0]["line_total_net"] = "2200.00"
            with pricing.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=PRICE_FIELDS)
                writer.writeheader()
                writer.writerows(rows)
            report = lint_completeness(
                workspace,
                procedure,
                ROOT / "assets" / "platform-adapters" / "manual.json",
            )
            self.assertTrue(
                any(
                    item["code"] == "state-binding-mismatch"
                    and item["detail"] == "price_digest"
                    for item in report["errors"]
                )
            )

    def test_release_marker_is_jurisdiction_specific_and_manifest_drift_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            release = Path(temporary) / "release"
            release.mkdir()
            document = release / "offer.txt"
            document.write_text("Clean", encoding="utf-8")
            manifest_path = Path(temporary) / "manifest.json"
            write_json_atomic(manifest_path, build_manifest(release))
            document.write_text("[UNSICHER]", encoding="utf-8")
            neutral = lint_release(release, manifest_path)
            self.assertFalse(
                any(
                    item["code"].startswith("jurisdiction-marker")
                    for item in neutral["findings"]
                )
            )
            report = lint_release(
                release,
                manifest_path,
                jurisdiction_path=ROOT / "assets" / "jurisdiction-profiles" / "de.json",
            )
            codes = {item["code"] for item in report["findings"]}
            self.assertIn("jurisdiction-marker-1", codes)
            self.assertIn("manifest-mismatch", codes)


if __name__ == "__main__":
    unittest.main()
