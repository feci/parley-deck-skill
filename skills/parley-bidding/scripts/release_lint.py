#!/usr/bin/env python3
"""Read-only release hygiene, allowlist, marker, secret, and manifest checks."""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path
from typing import Iterable

from common import load_json, relative_posix
from manifest import verify_manifest

TEXT_EXTENSIONS = {
    ".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".yaml", ".yml",
    ".html", ".htm", ".rtf", ".ini", ".cfg",
}
OFFICE_EXTENSIONS = {".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp"}
UNSAFE_MARKERS = {
    "todo-marker": re.compile(r"\bTODO\b", re.IGNORECASE),
    "tbd-marker": re.compile(r"\bTBD\b", re.IGNORECASE),
    "placeholder-marker": re.compile(r"\bPLACEHOLDER\b", re.IGNORECASE),
    "internal-only-marker": re.compile(r"\bINTERNAL\s+ONLY\b", re.IGNORECASE),
}
SECRET_PATTERNS = {
    "private-key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "aws-access-key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "bearer-token": re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}\b"),
    "client-secret-assignment": re.compile(
        r"\bclient[_-]?secret\s*[:=]\s*[\"']?[^\s\"']{8,}", re.IGNORECASE
    ),
    "password-assignment": re.compile(
        r"\bpassword\s*[:=]\s*[\"']?[^\s\"']{8,}", re.IGNORECASE
    ),
}
TEMP_PATTERNS = (
    re.compile(r"^~\$"),
    re.compile(r"\.(?:tmp|temp|bak|swp|lock)$", re.IGNORECASE),
    re.compile(r"^\.DS_Store$"),
)


def _read_allowlist(path: Path | None) -> set[str] | None:
    if path is None:
        return None
    if not path.is_file():
        raise ValueError(f"allowlist does not exist: {path}")
    return {
        line.strip().replace("\\", "/")
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def _marker_patterns(jurisdiction_path: Path | None) -> dict[str, re.Pattern[str]]:
    patterns = dict(UNSAFE_MARKERS)
    if jurisdiction_path is None:
        return patterns
    profile = load_json(jurisdiction_path)
    markers = profile.get("release_markers", [])
    if not isinstance(markers, list) or not all(
        isinstance(marker, str) and marker for marker in markers
    ):
        raise ValueError("jurisdiction release_markers must be non-empty strings")
    for index, marker in enumerate(markers):
        patterns[f"jurisdiction-marker-{index + 1}"] = re.compile(
            re.escape(marker), re.IGNORECASE
        )
    return patterns


def _scan_text(
    text: str, location: str, marker_patterns: dict[str, re.Pattern[str]]
) -> list[dict]:
    findings: list[dict] = []
    for name, pattern in marker_patterns.items():
        if pattern.search(text):
            findings.append({"code": name, "path": location})
    for name, pattern in SECRET_PATTERNS.items():
        if pattern.search(text):
            findings.append({"code": name, "path": location})
    return findings


def _office_content(
    path: Path,
    relative: str,
    marker_patterns: dict[str, re.Pattern[str]],
) -> tuple[list[dict], list[str]]:
    findings: list[dict] = []
    errors: list[str] = []
    try:
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            for name in names:
                normalized = name.lower()
                if re.search(r"/(?:threaded)?comments\d*\.xml$", normalized):
                    findings.append(
                        {"code": "office-comments-present", "path": relative, "part": name}
                    )
                if not normalized.endswith((".xml", ".rels", ".txt")):
                    continue
                try:
                    text = archive.read(name).decode("utf-8", errors="ignore")
                except (KeyError, OSError) as error:
                    errors.append(f"{relative}!{name}: {error}")
                    continue
                findings.extend(
                    _scan_text(text, f"{relative}!{name}", marker_patterns)
                )
    except zipfile.BadZipFile:
        errors.append(f"{relative}: invalid Office/ODF ZIP container")
    return findings, errors


def lint_release(
    release_dir: Path,
    manifest_path: Path | None = None,
    allowlist_path: Path | None = None,
    adapter_path: Path | None = None,
    jurisdiction_path: Path | None = None,
) -> dict:
    release_dir = release_dir.resolve()
    if not release_dir.is_dir():
        raise ValueError(f"release directory does not exist: {release_dir}")
    allowlist = _read_allowlist(allowlist_path)
    findings: list[dict] = []
    errors: list[str] = []
    warnings: list[str] = []
    files: list[str] = []
    casefold_paths: dict[str, str] = {}
    max_file_size = None
    marker_patterns = _marker_patterns(jurisdiction_path)
    if adapter_path:
        adapter = load_json(adapter_path)
        max_file_size = adapter.get("max_file_size_bytes")

    for path in sorted(release_dir.rglob("*"), key=lambda item: item.as_posix()):
        relative = relative_posix(path, release_dir)
        if path.is_symlink():
            findings.append({"code": "symlink-not-allowed", "path": relative})
            continue
        if path.is_dir():
            continue
        files.append(relative)
        folded = relative.casefold()
        if folded in casefold_paths and casefold_paths[folded] != relative:
            findings.append(
                {
                    "code": "case-insensitive-path-collision",
                    "path": relative,
                    "other": casefold_paths[folded],
                }
            )
        else:
            casefold_paths[folded] = relative
        if any(part.startswith(".") for part in Path(relative).parts):
            findings.append({"code": "hidden-path", "path": relative})
        if any(pattern.search(path.name) for pattern in TEMP_PATTERNS):
            findings.append({"code": "temporary-or-lock-file", "path": relative})
        if path.stat().st_size == 0:
            findings.append({"code": "empty-file", "path": relative})
        if isinstance(max_file_size, int) and path.stat().st_size > max_file_size:
            findings.append(
                {
                    "code": "platform-file-size-exceeded",
                    "path": relative,
                    "size": path.stat().st_size,
                    "limit": max_file_size,
                }
            )
        if allowlist is not None and relative not in allowlist:
            findings.append({"code": "file-not-in-release-allowlist", "path": relative})
        suffix = path.suffix.lower()
        if suffix in TEXT_EXTENSIONS:
            text = path.read_text(encoding="utf-8", errors="ignore")
            findings.extend(_scan_text(text, relative, marker_patterns))
        elif suffix in OFFICE_EXTENSIONS:
            office_findings, office_errors = _office_content(
                path, relative, marker_patterns
            )
            findings.extend(office_findings)
            errors.extend(office_errors)

    if not files:
        findings.append({"code": "release-is-empty", "path": "."})
    if allowlist is not None:
        for missing in sorted(allowlist - set(files)):
            findings.append({"code": "allowlisted-file-missing", "path": missing})
    manifest_result = None
    if manifest_path:
        manifest_result = verify_manifest(release_dir, manifest_path)
        if not manifest_result["match"]:
            findings.append(
                {
                    "code": "manifest-mismatch",
                    "path": str(manifest_path),
                    "details": {
                        "added": manifest_result["added"],
                        "removed": manifest_result["removed"],
                        "changed": manifest_result["changed"],
                    },
                }
            )
    else:
        warnings.append("no manifest supplied; exact release identity was not checked")
    return {
        "ok": not findings and not errors,
        "release_dir": str(release_dir),
        "file_count": len(files),
        "findings": findings,
        "errors": errors,
        "warnings": warnings,
        "manifest_result": manifest_result,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("release_dir", type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--allowlist", type=Path)
    parser.add_argument("--adapter", type=Path)
    parser.add_argument("--jurisdiction", type=Path)
    parser.add_argument("--json-output", type=Path)
    args = parser.parse_args()
    try:
        report = lint_release(
            args.release_dir,
            args.manifest,
            args.allowlist,
            args.adapter,
            args.jurisdiction,
        )
        payload = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
        if args.json_output:
            args.json_output.parent.mkdir(parents=True, exist_ok=True)
            args.json_output.write_text(payload + "\n", encoding="utf-8")
        print(payload)
        return 0 if report["ok"] else 1
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, sort_keys=True), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
