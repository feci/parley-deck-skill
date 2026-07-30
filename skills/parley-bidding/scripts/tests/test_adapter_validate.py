from __future__ import annotations

import json
import copy
import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
ROOT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))

from adapter_validate import validate_adapter  # noqa: E402


class AdapterValidationTests(unittest.TestCase):
    def test_shipped_profiles_validate(self) -> None:
        for path in sorted((ROOT / "assets" / "platform-adapters").glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(validate_adapter(data, str(path)), [], path.name)

    def test_weaker_effect_mapping_is_rejected(self) -> None:
        path = Path(__file__).parent / "fixtures" / "invalid-weakened-adapter.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        errors = validate_adapter(data, str(path))
        self.assertTrue(any("state_changing_read must map to E1" in item for item in errors))
        self.assertTrue(any("final_submit must map to E6" in item for item in errors))
        self.assertTrue(any("onboard must map to E8" in item for item in errors))

    def test_research_only_profiles_do_not_claim_observation(self) -> None:
        for name in ("subreport-elvis.json", "cosinex-vmp.nrw.json"):
            data = json.loads(
                (ROOT / "assets" / "platform-adapters" / name).read_text(encoding="utf-8")
            )
            self.assertEqual(data["maturity"], "research-only")
            self.assertEqual(data["observed_capabilities"], [])
            self.assertEqual(data["proof_ceiling"], "P0")

    def test_every_maturity_has_a_universal_proof_ceiling(self) -> None:
        base = json.loads(
            (ROOT / "assets" / "platform-adapters" / "manual.json").read_text(
                encoding="utf-8"
            )
        )
        cases = {
            "research-only": ("P1", True),
            "fixture-validated": ("P2", True),
            "read-only-validated": ("P2", True),
            "demo-submission-validated": ("P3", False),
            "live-submission-validated": ("P3", False),
        }
        for maturity, (ceiling, should_fail) in cases.items():
            adapter = copy.deepcopy(base)
            adapter["id"] = f"synthetic-{maturity}"
            adapter["maturity"] = maturity
            adapter["proof_ceiling"] = ceiling
            adapter["tested_as_of"] = "2030-01-01"
            errors = validate_adapter(adapter)
            if should_fail:
                self.assertTrue(
                    any("maturity caps proof" in item for item in errors),
                    (maturity, errors),
                )
            else:
                self.assertFalse(
                    any("maturity caps proof" in item for item in errors),
                    (maturity, errors),
                )


if __name__ == "__main__":
    unittest.main()
