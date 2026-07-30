from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from common import write_json_atomic  # noqa: E402
from manifest import (  # noqa: E402
    build_deterministic_zip,
    build_manifest,
    diff_manifests,
    diff_zips,
    verify_manifest,
)


class ManifestTests(unittest.TestCase):
    def test_manifest_is_deterministic_and_raw_byte_sensitive(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "release"
            root.mkdir()
            (root / "offer.txt").write_bytes(b"first")
            first = build_manifest(root)
            second = build_manifest(root)
            self.assertEqual(first, second)
            manifest_path = Path(temporary) / "manifest.json"
            write_json_atomic(manifest_path, first)
            self.assertTrue(verify_manifest(root, manifest_path)["match"])

            (root / "offer.txt").write_bytes(b"second")
            result = verify_manifest(root, manifest_path)
            self.assertFalse(result["match"])
            self.assertEqual(result["changed"][0]["path"], "offer.txt")

    def test_manifest_diff_detects_added_removed_and_changed(self) -> None:
        expected = {
            "files": [
                {"path": "a", "size": 1, "sha256": "a"},
                {"path": "b", "size": 1, "sha256": "b"},
            ]
        }
        actual = {
            "files": [
                {"path": "b", "size": 2, "sha256": "c"},
                {"path": "c", "size": 1, "sha256": "d"},
            ]
        }
        result = diff_manifests(expected, actual)
        self.assertEqual(result["removed"], ["a"])
        self.assertEqual(result["added"], ["c"])
        self.assertEqual(result["changed"][0]["path"], "b")

    def test_deterministic_zip_rebuild_and_member_diff(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            release = root / "release"
            release.mkdir()
            (release / "a.txt").write_bytes(b"alpha")
            (release / "b.txt").write_bytes(b"beta")
            first = root / "first.zip"
            second = root / "second.zip"
            build_deterministic_zip(release, first)
            build_deterministic_zip(release, second)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            self.assertTrue(diff_zips(first, second)["match"])

            (release / "b.txt").write_bytes(b"changed")
            (release / "c.txt").write_bytes(b"added")
            third = root / "third.zip"
            build_deterministic_zip(release, third)
            result = diff_zips(first, third)
            self.assertFalse(result["match"])
            self.assertEqual(result["added"], ["c.txt"])
            self.assertEqual(result["changed"][0]["path"], "b.txt")


if __name__ == "__main__":
    unittest.main()
