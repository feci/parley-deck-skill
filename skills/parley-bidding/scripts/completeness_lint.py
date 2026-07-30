#!/usr/bin/env python3
"""Read-only buyer, requirement, price, binding, and platform completeness checks."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from decimal import Decimal, DecimalException, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any

from adapter_validate import validate_adapter
from common import canonical_sha256, load_json, sha256_file

MANDATORY_CLASSES = {"must", "muss", "mandatory", "required"}
READY_STATUSES = {"evidenced", "ready", "compliant"}
OPEN_BLOCKERS = {"p0", "critical", "blocker"}
INFERENCE_PROVENANCE = {
    "",
    "unknown",
    "inference",
    "model-inference",
    "reasoned-inference",
    "assumption",
}
MONEY_QUANTUM = Decimal("0.01")


def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return [
            {
                key: "" if value is None else value
                for key, value in row.items()
            }
            for row in csv.DictReader(handle)
        ]


def _error(errors: list[dict], code: str, detail: str, **extra: object) -> None:
    item = {"code": code, "detail": detail}
    item.update(extra)
    errors.append(item)


def _row_shape_error(row: dict, index: int, register: str) -> str | None:
    if None in row:
        return f"malformed {register} row {index}: more values than header columns"
    if any(
        not isinstance(key, str) or not isinstance(value, str)
        for key, value in row.items()
    ):
        return f"malformed {register} row {index}: non-text key or value"
    return None


def _finite_decimal(value: str) -> Decimal:
    number = Decimal(value)
    if not number.is_finite():
        raise InvalidOperation("non-finite decimal")
    return number


def _canonical_decimal(number: Decimal, money: bool = False) -> str:
    if money:
        return format(number.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP), "f")
    normalized = number.normalize()
    return str(normalized)


def price_digest_from_rows(rows: list[dict[str, str]]) -> str:
    """Hash normalized, sorted pricing rows without deciding price adequacy."""
    normalized: list[dict[str, str]] = []
    for index, row in enumerate(rows, start=2):
        shape_error = _row_shape_error(row, index, "pricing")
        if shape_error:
            raise ValueError(shape_error)
        item = {key: (value or "").strip() for key, value in sorted(row.items())}
        for field in ("quantity", "tax_rate"):
            if item.get(field):
                item[field] = _canonical_decimal(_finite_decimal(item[field]))
        for field in ("unit_price_net", "line_total_net"):
            if item.get(field):
                item[field] = _canonical_decimal(
                    _finite_decimal(item[field]), money=True
                )
        if item.get("currency"):
            item["currency"] = item["currency"].upper()
        normalized.append(item)
    normalized.sort(key=lambda row: (row.get("price_id", ""), canonical_sha256(row)))
    return f"sha256:{canonical_sha256(normalized)}"


def _nested_value(data: dict[str, Any], *path: str) -> Any:
    current: Any = data
    for part in path:
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def lint_completeness(
    workspace: Path,
    procedure_path: Path,
    adapter_path: Path,
    release_dir: Path | None = None,
    requirements_path: Path | None = None,
    pricing_path: Path | None = None,
    state_path: Path | None = None,
) -> dict:
    workspace = workspace.resolve()
    release_dir = (release_dir or workspace / "release" / "frozen").resolve()
    requirements_path = requirements_path or workspace / "work" / "requirements-register.csv"
    pricing_path = pricing_path or workspace / "work" / "pricing-worksheet.csv"
    state_path = state_path or workspace / "bid-state.json"
    procedure = load_json(procedure_path)
    adapter = load_json(adapter_path)
    state = load_json(state_path)
    errors: list[dict] = []
    warnings: list[dict] = []

    for adapter_error in validate_adapter(adapter, str(adapter_path)):
        _error(errors, "invalid-adapter", adapter_error)
    if not release_dir.is_dir():
        _error(errors, "missing-release-directory", str(release_dir))
    if state.get("bid_id") != procedure.get("bid_id"):
        _error(
            errors,
            "bid-id-mismatch",
            "state and procedure profile refer to different bids",
            state=state.get("bid_id"),
            procedure=procedure.get("bid_id"),
        )

    for field in (
        "bid_id",
        "discovery_source",
        "authoritative_origin",
        "submission_platform",
        "portal_binding",
        "authority",
        "procedure_id",
        "deadline",
        "timezone",
        "qualification_decision",
        "negotiation_guaranteed",
        "first_offer_risk_acknowledged",
    ):
        if field not in procedure or procedure[field] in ("", None):
            _error(errors, "missing-procedure-field", field)
    if procedure.get("qualification_decision") == "decline":
        _error(errors, "qualification-declined", "The bid is explicitly declined.")
    if (
        procedure.get("qualification_decision") == "pursue-with-conditions"
        and not procedure.get("qualification_conditions_closed", False)
    ):
        _error(
            errors,
            "qualification-conditions-open",
            "Qualification conditions remain open.",
        )
    if (
        procedure.get("negotiation_guaranteed") is False
        and not procedure.get("first_offer_risk_acknowledged")
    ):
        _error(
            errors,
            "first-offer-risk-unacknowledged",
            "Negotiation is not guaranteed.",
        )
    if (
        procedure.get("qualification_decision") != "decline"
        and not procedure.get("signature_regime")
    ):
        _error(
            errors,
            "signature-regime-unresolved",
            "A submission is expected but the required signature regime is empty.",
        )

    profile_id = _nested_value(procedure, "submission_platform", "profile_id")
    if profile_id and profile_id != adapter.get("id"):
        _error(
            errors,
            "platform-profile-mismatch",
            "procedure profile and selected adapter differ",
            expected=profile_id,
            actual=adapter.get("id"),
        )
    if state.get("adapter_maturity") != adapter.get("maturity"):
        _error(
            errors,
            "adapter-maturity-mismatch",
            "state maturity and selected adapter differ",
            expected=adapter.get("maturity"),
            actual=state.get("adapter_maturity"),
        )

    for conflict in procedure.get("origin_conflicts", []):
        if conflict.get("resolved"):
            continue
        if conflict.get("material"):
            _error(
                errors,
                "material-origin-conflict",
                conflict.get("field", "unknown field"),
                evidence=conflict.get("evidence", ""),
            )
        elif not conflict.get("substantive_equivalence_evidence"):
            _error(
                errors,
                "nonmaterial-origin-conflict-unproven",
                conflict.get("field", "unknown field"),
            )
        else:
            warnings.append(
                {
                    "code": "evidenced-nonmaterial-origin-conflict",
                    "detail": conflict.get("field", "unknown field"),
                    "evidence": conflict.get("substantive_equivalence_evidence"),
                }
            )

    for document in procedure.get("mandatory_documents", []):
        if not document.get("required", False):
            continue
        relative = document.get("path", "")
        target = release_dir / relative
        if not target.is_file():
            _error(errors, "mandatory-document-missing", relative)
            continue
        expected_hash = document.get("sha256")
        if expected_hash and sha256_file(target) != expected_hash:
            _error(errors, "mandatory-document-hash-mismatch", relative)
        released = document.get("released_version")
        current = document.get("buyer_current_version")
        if not released or not current:
            _error(errors, "mandatory-document-version-unproven", relative)
        elif released != current:
            _error(
                errors,
                "stale-buyer-document-version",
                relative,
                released=released,
                buyer_current=current,
            )
        if not document.get("current_version_evidence") or not document.get(
            "current_version_observed_at"
        ):
            _error(errors, "buyer-current-version-evidence-missing", relative)
        if document.get("signature_required") and not document.get(
            "signature_confirmed"
        ):
            _error(errors, "required-signature-unconfirmed", relative)

    requirements = _read_csv(requirements_path)
    if not requirements:
        _error(errors, "requirements-register-empty", str(requirements_path))
    for index, row in enumerate(requirements, start=2):
        shape_error = _row_shape_error(row, index, "requirements")
        if shape_error:
            _error(errors, "malformed-requirement-row", shape_error)
            continue
        classification = row.get("classification", "").strip().lower()
        mandatory = classification in MANDATORY_CLASSES
        requirement_id = row.get("requirement_id", "").strip() or f"row-{index}"
        required_fields = (
            "source_id",
            "authority",
            "requirement_text",
            "response",
            "claim_provenance",
            "proven_scope",
            "owner",
            "delivery_strategy",
            "verification_method",
            "status",
            "confidence",
            "release_disposition",
        )
        if mandatory:
            for field in required_fields:
                if not row.get(field, "").strip():
                    _error(
                        errors,
                        "mandatory-requirement-field-missing",
                        f"{requirement_id}: {field}",
                    )
            status = row.get("status", "").strip().lower()
            if status not in READY_STATUSES:
                _error(
                    errors,
                    "mandatory-requirement-not-ready",
                    f"{requirement_id}: {row.get('status', '')}",
                )
            if not row.get("evidence_ref", "").strip():
                _error(errors, "mandatory-requirement-evidence-missing", requirement_id)
            provenance = row.get("claim_provenance", "").strip().lower()
            scope = row.get("proven_scope", "").strip().lower()
            confidence = row.get("confidence", "").strip().lower()
            if status in READY_STATUSES and (
                provenance in INFERENCE_PROVENANCE
                or scope in {"", "unknown", "inferred"}
                or confidence in {"", "unknown"}
            ):
                _error(
                    errors,
                    "mandatory-claim-closed-by-inference",
                    requirement_id,
                    provenance=provenance,
                    proven_scope=scope,
                    confidence=confidence,
                )
        if row.get("blocker_level", "").strip().lower() in OPEN_BLOCKERS:
            _error(errors, "open-requirement-blocker", requirement_id)

    prices = _read_csv(pricing_path)
    if not prices:
        _error(errors, "pricing-register-empty", str(pricing_path))
    currencies: set[str] = set()
    price_digest: str | None = None
    malformed_price_rows = {
        index: shape_error
        for index, row in enumerate(prices, start=2)
        if (shape_error := _row_shape_error(row, index, "pricing"))
    }
    for shape_error in malformed_price_rows.values():
        _error(errors, "malformed-price-row", shape_error)
    if not malformed_price_rows:
        try:
            price_digest = price_digest_from_rows(prices) if prices else None
        except DecimalException:
            _error(
                errors,
                "invalid-price-number",
                "price digest contains invalid or out-of-range numeric data",
            )
        except (ValueError, TypeError, AttributeError) as error:
            _error(errors, "malformed-price-row", str(error))
    for index, row in enumerate(prices, start=2):
        if index in malformed_price_rows:
            continue
        price_id = row.get("price_id", "").strip() or f"row-{index}"
        if not row.get("commercial_owner", "").strip():
            _error(errors, "commercial-owner-missing", price_id)
        try:
            quantity = _finite_decimal(row.get("quantity", ""))
            unit_price = _finite_decimal(row.get("unit_price_net", ""))
            line_total = _finite_decimal(row.get("line_total_net", ""))
            rounded_unit = unit_price.quantize(
                MONEY_QUANTUM, rounding=ROUND_HALF_UP
            )
            rounded_total = line_total.quantize(
                MONEY_QUANTUM, rounding=ROUND_HALF_UP
            )
            expected_total = (quantity * rounded_unit).quantize(
                MONEY_QUANTUM, rounding=ROUND_HALF_UP
            )
        except DecimalException:
            _error(errors, "invalid-price-number", price_id)
            continue
        if unit_price != rounded_unit or line_total != rounded_total:
            _error(errors, "price-fractional-cent", price_id)
        if rounded_total != expected_total:
            _error(
                errors,
                "price-arithmetic-mismatch",
                price_id,
                expected=format(expected_total, "f"),
                actual=format(rounded_total, "f"),
            )
        currency = row.get("currency", "").strip().upper()
        if currency:
            currencies.add(currency)
        else:
            _error(errors, "price-currency-missing", price_id)
        if row.get("status", "").strip().lower() not in {"approved", "ready"}:
            _error(errors, "price-row-not-approved", price_id)
    if len(currencies) > 1:
        _error(errors, "mixed-currencies", ", ".join(sorted(currencies)))

    bindings = state.get("bindings", {})
    portal_binding = procedure.get("portal_binding") or {}
    authority = procedure.get("authority") or {}
    expected_bindings = {
        "deployment": adapter.get("deployment"),
        "account": portal_binding.get("account"),
        "bidder": portal_binding.get("bidder"),
        "procedure": procedure.get("procedure_id"),
        "lot_offer": procedure.get("lot_offer"),
        "deadline": procedure.get("deadline"),
        "signature_regime": procedure.get("signature_regime"),
        "price_digest": price_digest,
        "visible_target": portal_binding.get("visible_target"),
        "declarant_signatory": authority.get("declarant_signatory"),
        "authority_basis": authority.get("authority_basis"),
        "click_approver": authority.get("click_approver"),
        "commercial_approver": authority.get("commercial_approver"),
        "declarations_digest": authority.get("declarations_digest"),
        "first_offer_risk_acknowledged": procedure.get(
            "first_offer_risk_acknowledged"
        ),
    }
    for field, expected in expected_bindings.items():
        if expected in (None, ""):
            _error(errors, "binding-source-missing", field)
            continue
        if bindings.get(field) != expected:
            _error(
                errors,
                "state-binding-mismatch",
                field,
                expected=expected,
                actual=bindings.get(field),
            )

    limit = adapter.get("max_file_size_bytes")
    if isinstance(limit, int) and release_dir.is_dir():
        for path in release_dir.rglob("*"):
            if path.is_file() and path.stat().st_size > limit:
                _error(
                    errors,
                    "platform-file-size-exceeded",
                    path.relative_to(release_dir).as_posix(),
                    size=path.stat().st_size,
                    limit=limit,
                )
    return {
        "ok": not errors,
        "workspace": str(workspace),
        "release_dir": str(release_dir),
        "requirements_count": len(requirements),
        "price_row_count": len(prices),
        "price_digest": price_digest,
        "errors": errors,
        "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--procedure", type=Path, required=True)
    parser.add_argument("--adapter", type=Path, required=True)
    parser.add_argument("--release-dir", type=Path)
    parser.add_argument("--requirements", type=Path)
    parser.add_argument("--pricing", type=Path)
    parser.add_argument("--state", type=Path)
    parser.add_argument("--json-output", type=Path)
    args = parser.parse_args()
    try:
        report = lint_completeness(
            args.workspace,
            args.procedure,
            args.adapter,
            args.release_dir,
            args.requirements,
            args.pricing,
            args.state,
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
