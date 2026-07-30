from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
ROOT = SCRIPTS.parent
import sys

sys.path.insert(0, str(SCRIPTS))

from init_bid_workspace import initialize, procedure_stub  # noqa: E402


class WorkspaceInitializationTests(unittest.TestCase):
    def test_repeated_initialization_gap_fills_without_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary) / "bid"
            initialize(workspace, "SYNTH-INIT", ROOT)
            bid_book = workspace / "work" / "bid-book.md"
            bid_book.write_text("protected user work", encoding="utf-8")
            missing = workspace / "work" / "qualification-brief.md"
            missing.unlink()
            initialize(workspace, "SYNTH-INIT", ROOT)
            self.assertEqual(
                bid_book.read_text(encoding="utf-8"), "protected user work"
            )
            self.assertTrue(missing.is_file())

    def test_bid_id_mismatch_and_empty_id_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary) / "bid"
            initialize(workspace, "SYNTH-ONE", ROOT)
            with self.assertRaises(ValueError):
                initialize(workspace, "SYNTH-TWO", ROOT)
            with self.assertRaises(ValueError):
                initialize(Path(temporary) / "empty", "  ", ROOT)

    def test_procedure_stub_matches_schema_nullable_incomplete_fields(self) -> None:
        stub = procedure_stub("SYNTH-STUB")
        schema = json.loads(
            (ROOT / "assets" / "schemas" / "procedure-profile.schema.json").read_text(
                encoding="utf-8"
            )
        )
        for field in ("procedure_id", "deadline", "timezone"):
            self.assertIsNone(stub[field])
            self.assertIn("null", schema["properties"][field]["type"])


if __name__ == "__main__":
    unittest.main()
