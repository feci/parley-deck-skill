#!/usr/bin/env python3
"""Build, verify, and compare deterministic raw-byte SHA-256 manifests."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path
from typing import Any, Iterable

from common import load_json, relative_posix, sha256_file, write_json_atomic

ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
ZIP_FILE_MODE = 0o100644


def _excluded_relative(root: Path, excluded: Iterable[Path]) -> set[str]:
    result: set[str] = set()
    resolved_root = root.resolve()
    for candidate in excluded:
        try:
            result.add(candidate.resolve().relative_to(resolved_root).as_posix())
        except ValueError:
            continue
    return result


def build_manifest(root: Path, excluded: Iterable[Path] = ()) -> dict[str, Any]:
    root = root.resolve()
    if not root.is_dir():
        raise ValueError(f"release directory does not exist: {root}")
    excluded_paths = _excluded_relative(root, excluded)
    files: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*"), key=lambda item: item.as_posix()):
        relative = relative_posix(path, root)
        if relative in excluded_paths:
            continue
        if path.is_symlink():
            raise ValueError(f"symlinks are not allowed in release manifests: {relative}")
        if path.is_dir():
            continue
        if not path.is_file():
            raise ValueError(f"unsupported filesystem entry: {relative}")
        files.append(
            {
                "path": relative,
                "size": path.stat().st_size,
                "sha256": sha256_file(path),
            }
        )
    return {
        "schema_version": 1,
        "algorithm": "sha256",
        "root": ".",
        "files": files,
    }


def diff_manifests(expected: dict[str, Any], actual: dict[str, Any]) -> dict[str, Any]:
    expected_by_path = {entry["path"]: entry for entry in expected.get("files", [])}
    actual_by_path = {entry["path"]: entry for entry in actual.get("files", [])}
    expected_paths = set(expected_by_path)
    actual_paths = set(actual_by_path)
    changed = []
    for path in sorted(expected_paths & actual_paths):
        before = expected_by_path[path]
        after = actual_by_path[path]
        if before.get("size") != after.get("size") or before.get("sha256") != after.get(
            "sha256"
        ):
            changed.append({"path": path, "expected": before, "actual": after})
    return {
        "added": sorted(actual_paths - expected_paths),
        "removed": sorted(expected_paths - actual_paths),
        "changed": changed,
        "match": not (
            actual_paths - expected_paths or expected_paths - actual_paths or changed
        ),
    }


def verify_manifest(root: Path, manifest_path: Path) -> dict[str, Any]:
    expected = load_json(manifest_path)
    actual = build_manifest(root, excluded=[manifest_path])
    result = diff_manifests(expected, actual)
    result["root"] = str(root.resolve())
    result["manifest"] = str(manifest_path.resolve())
    return result


def build_deterministic_zip(root: Path, output: Path) -> dict[str, Any]:
    """Create a byte-reproducible ZIP from regular files under *root*."""
    root = root.resolve()
    output_resolved = output.resolve()
    if not root.is_dir():
        raise ValueError(f"release directory does not exist: {root}")
    members: list[Path] = []
    for path in sorted(root.rglob("*"), key=lambda item: item.as_posix()):
        if path.resolve() == output_resolved:
            continue
        relative = relative_posix(path, root)
        if path.is_symlink():
            raise ValueError(f"symlinks are not allowed in deterministic ZIPs: {relative}")
        if path.is_dir():
            continue
        if not path.is_file():
            raise ValueError(f"unsupported filesystem entry: {relative}")
        members.append(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(
        output,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
        strict_timestamps=True,
    ) as archive:
        for path in members:
            relative = relative_posix(path, root)
            info = zipfile.ZipInfo(relative, ZIP_TIMESTAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = ZIP_FILE_MODE << 16
            info.flag_bits = 0
            archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    return inspect_zip(output)


def inspect_zip(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise ValueError(f"ZIP does not exist: {path}")
    files: list[dict[str, Any]] = []
    seen: set[str] = set()
    try:
        with zipfile.ZipFile(path) as archive:
            for info in sorted(archive.infolist(), key=lambda item: item.filename):
                if info.is_dir():
                    continue
                if info.filename in seen:
                    raise ValueError(f"duplicate ZIP member: {info.filename}")
                seen.add(info.filename)
                content = archive.read(info)
                files.append(
                    {
                        "path": info.filename,
                        "size": len(content),
                        "sha256": hashlib.sha256(content).hexdigest(),
                    }
                )
    except zipfile.BadZipFile as error:
        raise ValueError(f"invalid ZIP archive: {path}") from error
    return {
        "schema_version": 1,
        "algorithm": "sha256",
        "archive": str(path.resolve()),
        "archive_sha256": sha256_file(path),
        "files": files,
    }


def diff_zips(expected: Path, actual: Path) -> dict[str, Any]:
    result = diff_manifests(inspect_zip(expected), inspect_zip(actual))
    result["expected_archive"] = str(expected.resolve())
    result["actual_archive"] = str(actual.resolve())
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)

    build = subcommands.add_parser("build", help="build a deterministic manifest")
    build.add_argument("root", type=Path)
    build.add_argument("--output", type=Path, required=True)

    verify = subcommands.add_parser("verify", help="verify a directory against a manifest")
    verify.add_argument("root", type=Path)
    verify.add_argument("--manifest", type=Path, required=True)

    diff = subcommands.add_parser("diff", help="compare two manifest files")
    diff.add_argument("expected", type=Path)
    diff.add_argument("actual", type=Path)

    zip_build = subcommands.add_parser(
        "zip-build", help="build a deterministic release ZIP"
    )
    zip_build.add_argument("root", type=Path)
    zip_build.add_argument("--output", type=Path, required=True)

    zip_diff = subcommands.add_parser(
        "zip-diff", help="compare ZIP members by path, size, and raw SHA-256"
    )
    zip_diff.add_argument("expected", type=Path)
    zip_diff.add_argument("actual", type=Path)
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        if args.command == "build":
            manifest = build_manifest(args.root, excluded=[args.output])
            write_json_atomic(args.output, manifest)
            print(
                json.dumps(
                    {
                        "ok": True,
                        "files": len(manifest["files"]),
                        "manifest": str(args.output),
                        "manifest_sha256": sha256_file(args.output),
                    },
                    sort_keys=True,
                )
            )
            return 0
        if args.command == "verify":
            result = verify_manifest(args.root, args.manifest)
        elif args.command == "diff":
            result = diff_manifests(load_json(args.expected), load_json(args.actual))
        elif args.command == "zip-build":
            result = build_deterministic_zip(args.root, args.output)
            result["ok"] = True
            print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
            return 0
        else:
            result = diff_zips(args.expected, args.actual)
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return 0 if result["match"] else 1
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, sort_keys=True), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
