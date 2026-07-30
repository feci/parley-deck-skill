from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class SkillStructureTests(unittest.TestCase):
    def test_skill_is_concise_and_has_no_template_markers(self) -> None:
        skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        self.assertLessEqual(len(skill.splitlines()), 500)
        self.assertNotIn("[TODO:", skill)
        self.assertRegex(skill, r"(?m)^name: parley-bidding$")
        self.assertIn("Never use it as authorization", skill)

    def test_every_reference_is_linked_directly_from_skill(self) -> None:
        skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        for reference in (ROOT / "references").glob("*.md"):
            self.assertIn(f"references/{reference.name}", skill, reference.name)

    def test_openai_metadata_is_valid(self) -> None:
        metadata = (ROOT / "agents" / "openai.yaml").read_text(encoding="utf-8")
        self.assertIn('display_name: "Parley Bidding"', metadata)
        self.assertIn("$parley-bidding", metadata)

    def test_all_json_assets_parse(self) -> None:
        for path in ROOT.rglob("*.json"):
            json.loads(path.read_text(encoding="utf-8"))

    def test_platform_neutral_files_do_not_leak_platform_or_customer_names(self) -> None:
        allowlist_path = ROOT / "assets" / "core-purity-allowlist.txt"
        allowed = {
            line.strip()
            for line in allowlist_path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#")
        }
        candidates = [
            *ROOT.glob("scripts/*.py"),
            *ROOT.glob("assets/templates/*"),
            *ROOT.glob("assets/schemas/*.json"),
            *ROOT.glob("references/*.md"),
        ]
        forbidden_platform = re.compile(r"\b(?:DTVP|ELViS|Cosinex)\b", re.IGNORECASE)
        forbidden_customer = re.compile(r"\bBYTE\b")
        for path in candidates:
            relative = path.relative_to(ROOT).as_posix()
            content = path.read_text(encoding="utf-8")
            self.assertIsNone(forbidden_customer.search(content), relative)
            if relative not in allowed:
                self.assertIsNone(forbidden_platform.search(content), relative)

    def test_state_schema_and_code_binding_fields_match(self) -> None:
        import sys

        sys.path.insert(0, str(ROOT / "scripts"))
        from init_bid_workspace import BINDING_FIELDS, initial_state

        schema = json.loads(
            (ROOT / "assets" / "schemas" / "bid-state.schema.json").read_text(
                encoding="utf-8"
            )
        )
        schema_fields = set(schema["properties"]["bindings"]["properties"])
        self.assertEqual(schema_fields, set(BINDING_FIELDS))
        state = initial_state("synthetic")
        self.assertEqual(set(state["bindings"]), set(BINDING_FIELDS))
        self.assertEqual(set(state), set(schema["required"]))

    def test_synthetic_engagement_and_origin_fixtures_are_wired(self) -> None:
        fixtures = ROOT / "scripts" / "tests" / "fixtures"
        engagement = json.loads(
            (fixtures / "engagement-profiles.json").read_text(encoding="utf-8")
        )
        kinds = {case["engagement_type"] for case in engagement["cases"]}
        self.assertEqual(
            kinds,
            {
                "custom-software",
                "saas",
                "integration-and-migration",
                "ai-and-data",
                "managed-service",
                "licensing",
            },
        )
        bid_model = (ROOT / "references" / "software-bid-model.md").read_text(
            encoding="utf-8"
        )
        headings = {
            "custom-software": "### Custom development",
            "saas": "### SaaS",
            "integration-and-migration": "### Integration and migration",
            "ai-and-data": "### AI and data",
            "managed-service": "### Managed service and SLA",
            "licensing": "### Licensing",
        }
        for case in engagement["cases"]:
            self.assertIn(headings[case["engagement_type"]], bid_model)
            self.assertTrue(case["active_dimensions"])
        origins = json.loads(
            (fixtures / "discovery-origin-cases.json").read_text(encoding="utf-8")
        )
        blocked = {
            case["id"]
            for case in origins["cases"]
            if case["expected_release_block"]
        }
        self.assertEqual(blocked, {"deadline-divergence", "missing-binding-addendum"})


if __name__ == "__main__":
    unittest.main()
