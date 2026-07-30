#!/usr/bin/env python3
"""Validate declarative platform profiles without accessing a portal."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from common import load_json

MATURITIES = {
    "research-only",
    "fixture-validated",
    "read-only-validated",
    "demo-submission-validated",
    "live-submission-validated",
}
PROOF_LEVELS = {"P0", "P1", "P2", "P3"}
PROOF_ORDER = ["P0", "P1", "P2", "P3"]
MATURITY_PROOF_CEILING = {
    "research-only": "P0",
    "fixture-validated": "P1",
    "read-only-validated": "P1",
    "demo-submission-validated": "P3",
    "live-submission-validated": "P3",
}
REQUIRED_EFFECTS = {
    "state_changing_read": "E1",
    "send_message": "E3a",
    "edit_field": "E4",
    "stage_upload": "E5",
    "final_submit": "E6",
    "withdraw": "E7",
    "amend": "E7",
    "onboard": "E8",
}
REQUIRED_FIELDS = {
    "schema_version",
    "id",
    "platform_family",
    "deployment",
    "official_base_url",
    "maturity",
    "tested_as_of",
    "validation_scope",
    "proof_ceiling",
    "live_effects_authorized",
    "documented_capabilities",
    "observed_capabilities",
    "operation_effects",
    "operation_effect_semantics",
    "stop_conditions",
}
FORBIDDEN_KEY_FRAGMENTS = {"selector", "password", "cookie", "token", "private_key"}


def _walk_keys(value: Any, prefix: str = "") -> list[str]:
    keys: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            location = f"{prefix}.{key}" if prefix else key
            keys.append(location)
            keys.extend(_walk_keys(child, location))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            keys.extend(_walk_keys(child, f"{prefix}[{index}]"))
    return keys


def validate_adapter(data: dict[str, Any], source: str = "<memory>") -> list[str]:
    errors: list[str] = []
    missing = sorted(REQUIRED_FIELDS - set(data))
    if missing:
        errors.append(f"missing required fields: {', '.join(missing)}")
    if data.get("schema_version") != 1:
        errors.append("schema_version must be 1")
    if data.get("maturity") not in MATURITIES:
        errors.append(f"unknown maturity: {data.get('maturity')!r}")
    if data.get("proof_ceiling") not in PROOF_LEVELS:
        errors.append(f"unknown proof ceiling: {data.get('proof_ceiling')!r}")
    maturity = data.get("maturity")
    ceiling = data.get("proof_ceiling")
    if maturity in MATURITY_PROOF_CEILING and ceiling in PROOF_LEVELS:
        maturity_cap = MATURITY_PROOF_CEILING[maturity]
        if PROOF_ORDER.index(ceiling) > PROOF_ORDER.index(maturity_cap):
            errors.append(
                f"{maturity} maturity caps proof at {maturity_cap}; got {ceiling}"
            )
    if data.get("live_effects_authorized") is not False:
        errors.append("live_effects_authorized must be false; profiles never grant permission")
    effects = data.get("operation_effects")
    if not isinstance(effects, dict):
        errors.append("operation_effects must be an object")
    else:
        for operation, required in REQUIRED_EFFECTS.items():
            actual = effects.get(operation)
            if actual != required:
                errors.append(
                    f"{operation} must map to {required}; got {actual!r}"
                )
        unknown = sorted(set(effects) - set(REQUIRED_EFFECTS))
        if unknown:
            errors.append(f"unknown operation effect mappings: {', '.join(unknown)}")
    if (
        data.get("operation_effect_semantics")
        != "minimum-hitl-class-if-operation-is-performed"
    ):
        errors.append(
            "operation_effect_semantics must declare mappings as minimum HITL classes"
        )
    for field in ("documented_capabilities", "observed_capabilities", "stop_conditions"):
        if not isinstance(data.get(field), list) or not all(
            isinstance(item, str) and item for item in data.get(field, [])
        ):
            errors.append(f"{field} must be a list of non-empty strings")
    if data.get("maturity") == "research-only" and data.get("observed_capabilities"):
        errors.append("research-only profiles cannot claim observed capabilities")
    if data.get("id") == "manual" and data.get("proof_ceiling") != "P0":
        errors.append("manual profile proof ceiling must be P0")
    if data.get("id") == "manual" and data.get("tested_as_of") != "not-applicable":
        errors.append("manual profile tested_as_of must be not-applicable")
    if data.get("id") in {"subreport-elvis", "cosinex-vmp.nrw"}:
        if data.get("maturity") != "research-only":
            errors.append(f"{data.get('id')} must initially remain research-only")
        if data.get("proof_ceiling") != "P0":
            errors.append(f"{data.get('id')} must initially remain capped at P0")
    if data.get("id") == "cosinex-vmp.dtvp":
        if data.get("maturity") != "live-submission-validated":
            errors.append("DTVP profile maturity must match the dated validation record")
        if data.get("tested_as_of") != "2026-07-22":
            errors.append("DTVP tested_as_of must preserve the observed validation date")
    if data.get("id") == "subreport-elvis" and data.get("platform_family") != "subreport":
        errors.append("ELViS platform_family must be subreport")
    for key in _walk_keys(data):
        normalized = key.lower()
        if any(fragment in normalized for fragment in FORBIDDEN_KEY_FRAGMENTS):
            errors.append(f"forbidden credential/selector-shaped key: {key}")
    if not isinstance(data.get("validation_scope"), str) or not data.get(
        "validation_scope", ""
    ).strip():
        errors.append("validation_scope must be non-empty")
    if not isinstance(data.get("tested_as_of"), str) or not data.get(
        "tested_as_of", ""
    ).strip():
        errors.append("tested_as_of must be non-empty")
    return [f"{source}: {error}" for error in errors]


def _targets(path: Path) -> list[Path]:
    if path.is_dir():
        return sorted(path.glob("*.json"))
    return [path]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    errors: list[str] = []
    checked: list[str] = []
    try:
        for target in _targets(args.path):
            data = load_json(target)
            errors.extend(validate_adapter(data, str(target)))
            checked.append(str(target))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        errors.append(str(error))
    report = {"ok": not errors, "checked": checked, "errors": errors}
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
