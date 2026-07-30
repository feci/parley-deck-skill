#!/usr/bin/env python3
"""Create a protected, auditable software-bid workspace."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from common import now_utc, write_json_atomic

BINDING_FIELDS = (
    "deployment",
    "account",
    "bidder",
    "procedure",
    "lot_offer",
    "deadline",
    "signature_regime",
    "price_digest",
    "visible_target",
    "declarant_signatory",
    "authority_basis",
    "click_approver",
    "commercial_approver",
    "declarations_digest",
    "first_offer_risk_acknowledged",
)


def initial_state(bid_id: str) -> dict:
    bid_id = bid_id.strip()
    if not bid_id:
        raise ValueError("bid ID must not be empty")
    timestamp = now_utc()
    return {
        "schema_version": 1,
        "bid_id": bid_id,
        "lifecycle_state": "candidate",
        "adapter_maturity": "research-only",
        "proof": None,
        "freeze": None,
        "release_history": [],
        "exception_context": None,
        "open_workstreams": [],
        "workstream_closures": [],
        "bindings": {field: None for field in BINDING_FIELDS},
        "approvals": [],
        "history": [
            {
                "event": "workspace-initialized",
                "at": timestamp,
                "details": {"bid_id": bid_id},
            }
        ],
    }


def procedure_stub(bid_id: str) -> dict:
    return {
        "schema_version": 1,
        "bid_id": bid_id,
        "discovery_source": {"id": "", "notice_id": "", "url": "", "observed_at": ""},
        "authoritative_origin": {"procedure_id": "", "url": "", "observed_at": ""},
        "submission_platform": {"profile_id": "", "url": ""},
        "portal_binding": {"account": "", "bidder": "", "visible_target": ""},
        "authority": {
            "declarant_signatory": "",
            "authority_basis": "",
            "click_approver": "",
            "commercial_approver": "",
            "declarations_digest": "",
        },
        "procedure_id": None,
        "lot_offer": None,
        "deadline": None,
        "timezone": None,
        "signature_regime": None,
        "qualification_decision": "pursue-with-conditions",
        "qualification_conditions_closed": False,
        "negotiation_guaranteed": False,
        "first_offer_risk_acknowledged": False,
        "origin_conflicts": [],
        "mandatory_documents": [],
    }


def initialize(target: Path, bid_id: str, skill_root: Path) -> None:
    bid_id = bid_id.strip()
    if not bid_id:
        raise ValueError("bid ID must not be empty")
    for protected_name in ("bid-state.json", "procedure-profile.json"):
        protected = target / protected_name
        if not protected.exists():
            continue
        try:
            existing = json.loads(protected.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise ValueError(f"protected file is not valid JSON: {protected}") from error
        if existing.get("bid_id") != bid_id:
            raise ValueError(
                f"bid ID mismatch in protected file {protected}: "
                f"{existing.get('bid_id')!r} != {bid_id!r}"
            )
    target.mkdir(parents=True, exist_ok=True)
    for directory in (
        "source/original",
        "source/communications",
        "evidence",
        "work",
        "release/candidate",
        "release/frozen",
        "portal",
        "archive",
        "logs",
    ):
        (target / directory).mkdir(parents=True, exist_ok=True)
    templates = skill_root / "assets" / "templates"
    mapping = {
        "bid-book.md": target / "work" / "bid-book.md",
        "qualification-brief.md": target / "work" / "qualification-brief.md",
        "requirements-register.csv": target / "work" / "requirements-register.csv",
        "pricing-worksheet.csv": target / "work" / "pricing-worksheet.csv",
    }
    for source_name, destination in mapping.items():
        if not destination.exists():
            shutil.copyfile(templates / source_name, destination)
    state_path = target / "bid-state.json"
    if not state_path.exists():
        write_json_atomic(state_path, initial_state(bid_id))
    procedure_path = target / "procedure-profile.json"
    if not procedure_path.exists():
        write_json_atomic(procedure_path, procedure_stub(bid_id))
    allowlist = target / "release" / "allowlist.txt"
    if not allowlist.exists():
        allowlist.write_text("", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace", type=Path)
    parser.add_argument("--bid-id", required=True)
    args = parser.parse_args()
    try:
        skill_root = Path(__file__).resolve().parent.parent
        initialize(args.workspace, args.bid_id.strip(), skill_root)
        print(
            json.dumps(
                {
                    "ok": True,
                    "workspace": str(args.workspace.resolve()),
                    "bid_id": args.bid_id.strip(),
                },
                sort_keys=True,
            )
        )
        return 0
    except (OSError, ValueError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, sort_keys=True), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
