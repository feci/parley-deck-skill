#!/usr/bin/env python3
"""Manage bid lifecycle, bindings, approvals, release freeze, proof, and recovery."""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any

from common import canonical_sha256, load_json, now_utc, sha256_file, write_json_atomic
from init_bid_workspace import BINDING_FIELDS, initial_state
from manifest import build_manifest, verify_manifest

MATURITY = [
    "research-only",
    "fixture-validated",
    "read-only-validated",
    "demo-submission-validated",
    "live-submission-validated",
]
MATURITY_PROOF_CEILING = {
    "research-only": "P0",
    "fixture-validated": "P1",
    "read-only-validated": "P1",
    "demo-submission-validated": "P3",
    "live-submission-validated": "P3",
}
PROOF = ["P0", "P1", "P2", "P3"]
PROOF_LABEL = {
    "P0": "operator-attested",
    "P1": "portal-visible",
    "P2": "submission-confirmed",
    "P3": "content-verified",
}
EFFECTS = {"E0", "E1", "E2", "E3a", "E3b", "E4", "E5", "E6", "E7", "E8"}
PAYLOAD_REQUIRED = {"E3a", "E3b", "E4", "E5", "E6", "E7", "E8"}
APPROVER_ROLES = {
    "operator",
    "bid-lead",
    "release-approver",
    "click-approver",
    "commercial-approver",
    "declarant-signatory",
    "authority-owner",
    "legal",
    "security",
}
CORE_BINDINGS = {"deployment", "account", "bidder", "procedure", "visible_target"}
FINAL_BINDINGS = CORE_BINDINGS | {
    "lot_offer",
    "deadline",
    "signature_regime",
    "price_digest",
    "declarant_signatory",
    "authority_basis",
    "click_approver",
    "commercial_approver",
    "declarations_digest",
    "first_offer_risk_acknowledged",
}
ACTIVE_FINAL_STATES = {"awaiting-final-approval", "submitting"}
PRE_SUBMISSION_RELEASE_STATES = {
    "release-frozen",
    "platform-bound",
    "staging",
    "staged",
    "pre-submit-checked",
    "awaiting-final-approval",
}
TERMINAL_STATES = {
    "declined",
    "failed-before-submit",
    "submission-recorded",
    "withdrawn",
    "verification-failed",
}


class StateMutationError(ValueError):
    """A failure that intentionally changed auditable state and must be persisted."""


TRANSITIONS: dict[str, set[str]] = {
    "candidate": {"triaged", "blocked"},
    "triaged": {"qualified", "declined", "blocked"},
    "qualified": {"acquired", "declined", "blocked"},
    "acquired": {"inventoried", "blocked"},
    "inventoried": {"reconciled", "blocked"},
    "reconciled": {"analyzed", "blocked"},
    "analyzed": {"drafting", "blocked"},
    "drafting": {"challenged", "blocked"},
    "challenged": {"release-candidate", "blocked"},
    "release-candidate": {"release-frozen", "blocked"},
    "release-frozen": {"platform-bound", "blocked"},
    "platform-bound": {"staging", "blocked", "session-lost"},
    "staging": {"staged", "blocked", "session-lost"},
    "staged": {"pre-submit-checked", "blocked", "session-lost"},
    "pre-submit-checked": {"awaiting-final-approval", "blocked", "session-lost"},
    "awaiting-final-approval": {"submitting", "blocked", "session-lost"},
    "submitting": {
        "submission-recorded",
        "unknown-possibly-submitted",
    },
    "submission-recorded": {
        "amendment-pending",
        "withdrawn",
    },
    "amendment-pending": {"release-candidate", "withdrawn", "blocked"},
    "session-lost": set(),
}
TARGET_EFFECT = {
    "release-frozen": "E2",
    "staged": "E5",
    "submitting": "E6",
    "amendment-pending": "E7",
    "withdrawn": "E7",
}


def _save(path: Path, state: dict[str, Any]) -> None:
    write_json_atomic(path, state)


def _history(state: dict[str, Any], event: str, details: dict[str, Any]) -> None:
    state["history"].append({"event": event, "at": now_utc(), "details": details})


def _payload_digest(path: Path | None) -> str | None:
    if path is None:
        return None
    if not path.is_file():
        raise ValueError(f"approval payload does not exist: {path}")
    return sha256_file(path)


def _active_freeze(state: dict[str, Any]) -> dict[str, Any]:
    freeze = state.get("freeze")
    if not isinstance(freeze, dict) or freeze.get("stale"):
        raise ValueError("an active release freeze is required")
    if not freeze.get("manifest_sha256") or not freeze.get("release_id"):
        raise ValueError("release freeze is incomplete")
    return freeze


def _approval_material(
    state: dict[str, Any],
    action_id: str,
    effect: str,
    payload_digest: str | None,
) -> dict[str, Any]:
    freeze = state.get("freeze") or {}
    return {
        "action_id": action_id,
        "effect": effect,
        "payload_digest": payload_digest,
        "lifecycle_state": state["lifecycle_state"],
        "adapter_maturity": state["adapter_maturity"],
        "frozen_release_id": freeze.get("release_id"),
        "frozen_manifest_sha256": freeze.get("manifest_sha256"),
        "bindings": copy.deepcopy(state["bindings"]),
    }


def _stale_active(state: dict[str, Any], reason: str) -> None:
    timestamp = now_utc()
    for approval in state["approvals"]:
        if approval.get("status") != "approved":
            continue
        approval["status"] = "stale"
        approval["stale_at"] = timestamp
        approval["stale_reason"] = reason


def _mark_freeze_stale(
    state: dict[str, Any],
    reason: str,
    workstreams: set[str] | None = None,
    regress: bool = True,
    force_open: bool = False,
) -> None:
    freeze = state.get("freeze")
    if isinstance(freeze, dict) and not freeze.get("stale"):
        freeze["stale"] = True
        freeze["stale_at"] = now_utc()
        freeze["stale_reason"] = reason
    if force_open or isinstance(freeze, dict):
        for stream in sorted(workstreams or {"release"}):
            if stream not in state["open_workstreams"]:
                state["open_workstreams"].append(stream)
    if regress and state.get("lifecycle_state") in PRE_SUBMISSION_RELEASE_STATES:
        previous = state["lifecycle_state"]
        state["lifecycle_state"] = "release-candidate"
        _history(
            state,
            "release-freeze-invalidated",
            {"from": previous, "to": "release-candidate", "reason": reason},
        )


def _validate_bindings(state: dict[str, Any], effect: str) -> None:
    if effect not in {"E4", "E5", "E6", "E7"}:
        return
    required = FINAL_BINDINGS if effect in {"E5", "E6", "E7"} else CORE_BINDINGS
    missing = sorted(field for field in required if state["bindings"].get(field) in (None, ""))
    if missing:
        raise ValueError(
            f"{effect} requires complete target bindings: {', '.join(missing)}"
        )
    if effect in {"E5", "E6", "E7"}:
        acknowledged = state["bindings"].get("first_offer_risk_acknowledged")
        if acknowledged not in (True, "true", "True", "acknowledged"):
            raise ValueError(f"{effect} requires first-offer risk acknowledgement")
        _active_freeze(state)


def _validate_effect_role(
    state: dict[str, Any], effect: str, approver: str, role: str
) -> None:
    if role not in APPROVER_ROLES:
        raise ValueError(f"unknown approver role: {role}")
    if effect in {"E5", "E6", "E7"}:
        if role != "click-approver":
            raise ValueError(f"{effect} requires the click-approver role")
        expected = state["bindings"].get("click_approver")
        if expected and approver != expected:
            raise ValueError(
                f"{effect} approver does not match bound click approver: "
                f"{approver!r} != {expected!r}"
            )


def approve(
    state: dict[str, Any],
    action_id: str,
    effect: str,
    approver: str,
    role: str,
    payload: Path | None,
) -> dict[str, Any]:
    action_id = action_id.strip()
    approver = approver.strip()
    if not action_id or not approver:
        raise ValueError("approval action ID and approver must be non-empty")
    if effect not in EFFECTS:
        raise ValueError(f"unknown effect class: {effect}")
    if effect in PAYLOAD_REQUIRED and payload is None:
        raise ValueError(f"{effect} approval requires an exact payload file")
    if any(
        item.get("action_id") == action_id and item.get("status") == "approved"
        for item in state["approvals"]
    ):
        raise ValueError(f"active approval action ID already exists: {action_id}")
    _validate_bindings(state, effect)
    _validate_effect_role(state, effect, approver, role)
    digest = _payload_digest(payload)
    if effect in {"E5", "E6", "E7"}:
        freeze = _active_freeze(state)
        if digest != freeze["manifest_sha256"]:
            raise ValueError(f"{effect} payload must be the exact frozen manifest")
    material = _approval_material(state, action_id, effect, digest)
    record = {
        **material,
        "fingerprint": canonical_sha256(material),
        "approved_by": approver,
        "approver_role": role,
        "approved_at": now_utc(),
        "status": "approved",
    }
    state["approvals"].append(record)
    _history(
        state,
        "approval-recorded",
        {
            "action_id": action_id,
            "effect": effect,
            "approver_role": role,
            "fingerprint": record["fingerprint"],
        },
    )
    return record


def consume(
    state: dict[str, Any], action_id: str, effect: str, payload: Path | None
) -> dict[str, Any]:
    matches = [
        item
        for item in state["approvals"]
        if item.get("action_id") == action_id and item.get("effect") == effect
    ]
    if not matches:
        raise ValueError(f"no approval found for {action_id}/{effect}")
    approval = matches[-1]
    if approval.get("status") != "approved":
        raise ValueError(
            f"approval {action_id}/{effect} is not active: {approval.get('status')}"
        )
    digest = _payload_digest(payload)
    material = _approval_material(state, action_id, effect, digest)
    fingerprint = canonical_sha256(material)
    if fingerprint != approval.get("fingerprint"):
        approval["status"] = "stale"
        approval["stale_at"] = now_utc()
        approval["stale_reason"] = "approval fingerprint no longer matches current state"
        raise StateMutationError(
            f"approval fingerprint mismatch for {action_id}/{effect}"
        )
    approval["status"] = "consumed"
    approval["consumed_at"] = now_utc()
    _history(
        state,
        "approval-consumed",
        {"action_id": action_id, "effect": effect, "fingerprint": fingerprint},
    )
    return approval


def _enforce_single_active(state_path: Path, portfolio_root: Path | None) -> None:
    if portfolio_root is None:
        raise ValueError(
            "an explicit --portfolio-root is required for the irreversible window"
        )
    root = portfolio_root.resolve()
    current = state_path.resolve()
    if not root.is_dir() or root == current.parent or root not in current.parents:
        raise ValueError(
            f"portfolio root must be an existing ancestor above the bid workspace: {root}"
        )
    conflicts: list[str] = []
    state_files = list(root.rglob("bid-state.json"))
    if current not in [item.resolve() for item in state_files]:
        raise ValueError("portfolio root does not contain the current bid-state.json")
    for candidate in state_files:
        if candidate.resolve() == current:
            continue
        try:
            other = load_json(candidate)
        except (OSError, ValueError, json.JSONDecodeError) as error:
            raise ValueError(
                f"cannot prove single-active-final-submit because {candidate} is unreadable: {error}"
            ) from error
        if other.get("lifecycle_state") in ACTIVE_FINAL_STATES:
            conflicts.append(
                f"{other.get('bid_id', candidate.parent.name)}:{other.get('lifecycle_state')}"
            )
    if conflicts:
        raise ValueError(
            "another opportunity is already in the irreversible window: "
            + ", ".join(sorted(conflicts))
        )


def _freeze_release(
    state: dict[str, Any],
    release_id: str | None,
    manifest_path: Path | None,
    approval: dict[str, Any],
) -> None:
    if not release_id or not release_id.strip():
        raise ValueError("release freeze requires a non-empty release ID")
    if state.get("open_workstreams"):
        raise ValueError(
            "release freeze blocked by open workstreams: "
            + ", ".join(sorted(state["open_workstreams"]))
        )
    if manifest_path is None or not manifest_path.is_file():
        raise ValueError("release freeze requires an exact manifest file")
    if approval.get("approver_role") != "commercial-approver":
        raise ValueError("release freeze requires an E2 commercial-approver approval")
    expected = state["bindings"].get("commercial_approver")
    if approval.get("approved_by") != expected:
        raise ValueError(
            "release-freeze approver does not match the bound commercial approver"
        )
    missing = sorted(
        field for field in FINAL_BINDINGS if state["bindings"].get(field) in (None, "")
    )
    if missing:
        raise ValueError(
            "release freeze requires complete bindings: " + ", ".join(missing)
        )
    acknowledged = state["bindings"].get("first_offer_risk_acknowledged")
    if acknowledged not in (True, "true", "True", "acknowledged"):
        raise ValueError("release freeze requires first-offer risk acknowledgement")
    manifest = load_json(manifest_path)
    if manifest.get("algorithm") != "sha256" or not isinstance(manifest.get("files"), list):
        raise ValueError("release freeze manifest is not a raw SHA-256 manifest")
    release_id = release_id.strip()
    manifest_digest = sha256_file(manifest_path)
    bindings_fingerprint = canonical_sha256(state["bindings"])
    release_identity = {
        "release_id": release_id,
        "manifest_sha256": manifest_digest,
        "bindings_fingerprint": bindings_fingerprint,
        "adapter_maturity": state["adapter_maturity"],
    }
    for prior in state.get("release_history", []):
        if prior.get("release_id") != release_id:
            continue
        prior_identity = {
            key: prior.get(key)
            for key in (
                "release_id",
                "manifest_sha256",
                "bindings_fingerprint",
                "adapter_maturity",
            )
        }
        if prior_identity != release_identity:
            raise ValueError(
                f"release ID {release_id!r} is already bound to different frozen inputs"
            )
    frozen_at = now_utc()
    state["freeze"] = {
        "release_id": release_id,
        "manifest_path": str(manifest_path.resolve()),
        "manifest_sha256": manifest_digest,
        "bindings_fingerprint": bindings_fingerprint,
        "adapter_maturity": state["adapter_maturity"],
        "frozen_at": frozen_at,
        "stale": False,
    }
    state.setdefault("release_history", []).append(
        {**release_identity, "frozen_at": frozen_at}
    )


def transition(
    state_path: Path,
    state: dict[str, Any],
    target: str,
    portfolio_root: Path | None,
    approval_action: str | None,
    payload: Path | None,
    release_id: str | None = None,
) -> None:
    current = state["lifecycle_state"]
    if target not in TRANSITIONS.get(current, set()):
        raise ValueError(f"transition not allowed: {current} -> {target}")
    if target in ACTIVE_FINAL_STATES:
        _enforce_single_active(state_path, portfolio_root)
    if current == "release-frozen" and target == "platform-bound":
        _active_freeze(state)
    effect = TARGET_EFFECT.get(target)
    approval = None
    if effect:
        if not approval_action:
            raise ValueError(f"{current} -> {target} requires a fresh {effect} approval")
        approval = consume(state, approval_action, effect, payload)
    if target == "release-frozen":
        assert approval is not None
        _freeze_release(state, release_id, payload, approval)
    if target in {"blocked", "session-lost"}:
        state["exception_context"] = {
            "kind": target,
            "from_state": current,
            "entered_at": now_utc(),
        }
    if current == "amendment-pending" and target == "release-candidate":
        _mark_freeze_stale(
            state,
            "amendment requires a new immutable release",
            {"qualification", "requirements", "commercial", "release"},
            regress=False,
        )
    state["lifecycle_state"] = target
    _stale_active(state, f"lifecycle changed from {current} to {target}")
    _history(state, "lifecycle-transition", {"from": current, "to": target})


def _effective_proof_ceiling(
    state: dict[str, Any], adapter: dict[str, Any]
) -> str:
    adapter_maturity = adapter.get("maturity")
    if adapter_maturity not in MATURITY_PROOF_CEILING:
        raise ValueError(f"adapter has invalid maturity: {adapter_maturity!r}")
    if state.get("adapter_maturity") != adapter_maturity:
        raise ValueError(
            "state adapter maturity does not match the selected adapter profile"
        )
    declared = adapter.get("proof_ceiling")
    if declared not in PROOF:
        raise ValueError(f"adapter has invalid proof ceiling: {declared!r}")
    maturity_cap = MATURITY_PROOF_CEILING[adapter_maturity]
    return PROOF[min(PROOF.index(declared), PROOF.index(maturity_cap))]


def _build_proof(
    state: dict[str, Any],
    level: str,
    adapter_path: Path,
    evidence: Path | None,
    attestation: str | None,
    release_manifest: Path | None,
    submitted_root: Path | None,
) -> dict[str, Any]:
    if level not in PROOF:
        raise ValueError(f"unknown proof level: {level}")
    adapter = load_json(adapter_path)
    ceiling = _effective_proof_ceiling(state, adapter)
    if PROOF.index(level) > PROOF.index(ceiling):
        raise ValueError(f"{level} exceeds effective adapter proof ceiling {ceiling}")
    records: list[dict[str, Any]] = []
    proof: dict[str, Any] = {
        "level": level,
        "label": PROOF_LABEL[level],
        "adapter_id": adapter.get("id"),
        "adapter_maturity": adapter.get("maturity"),
        "effective_ceiling": ceiling,
        "evidence": records,
    }
    if level == "P0":
        if not attestation or not attestation.strip():
            raise ValueError("P0 requires a human operator attestation")
        records.append({"kind": "operator-attestation", "value": attestation.strip()})
    elif level in {"P1", "P2"}:
        if evidence is None or not evidence.is_file():
            raise ValueError(f"{level} requires a durable evidence file")
        records.append(
            {
                "kind": "portal-observation" if level == "P1" else "submission-receipt",
                "path": str(evidence.resolve()),
                "sha256": sha256_file(evidence),
            }
        )
    else:
        freeze = _active_freeze(state)
        if release_manifest is None or submitted_root is None:
            raise ValueError("P3 requires release manifest and submitted-content root")
        manifest_digest = sha256_file(release_manifest)
        if manifest_digest != freeze["manifest_sha256"]:
            raise ValueError("P3 manifest does not match the stored frozen manifest digest")
        result = verify_manifest(submitted_root, release_manifest)
        if not result["match"]:
            previous = state["lifecycle_state"]
            state["lifecycle_state"] = "verification-failed"
            state["exception_context"] = {
                "kind": "verification-failed",
                "from_state": previous,
                "entered_at": now_utc(),
                "expected_manifest_sha256": manifest_digest,
                "submitted_root": str(submitted_root.resolve()),
                "diff": {
                    "added": result["added"],
                    "removed": result["removed"],
                    "changed": result["changed"],
                },
            }
            _history(state, "content-verification-failed", state["exception_context"])
            raise RuntimeError("submitted content does not match the frozen manifest")
        submitted_manifest = build_manifest(submitted_root)
        proof["manifest_sha256"] = manifest_digest
        proof["submitted_root"] = str(submitted_root.resolve())
        proof["submitted_manifest_sha256"] = canonical_sha256(submitted_manifest)
        records.extend(
            [
                {
                    "kind": "frozen-release-manifest",
                    "path": str(release_manifest.resolve()),
                    "sha256": manifest_digest,
                },
                {
                    "kind": "submitted-content-root",
                    "path": str(submitted_root.resolve()),
                    "manifest_sha256": proof["submitted_manifest_sha256"],
                },
            ]
        )
    return proof


def record_proof(
    state: dict[str, Any],
    level: str,
    adapter_path: Path,
    evidence: Path | None,
    attestation: str | None,
    release_manifest: Path | None,
    submitted_root: Path | None,
) -> None:
    if state["lifecycle_state"] != "submission-recorded":
        raise ValueError("proof may be recorded only for submission-recorded")
    existing = state.get("proof")
    if existing and PROOF.index(existing["level"]) > PROOF.index(level):
        raise ValueError(f"refusing to downgrade proof from {existing['level']} to {level}")
    state["proof"] = _build_proof(
        state,
        level,
        adapter_path,
        evidence,
        attestation,
        release_manifest,
        submitted_root,
    )
    _history(state, "proof-recorded", copy.deepcopy(state["proof"]))


def _guarded_exception_resolution(
    state: dict[str, Any],
    expected_source: str,
    target: str,
    reason: str,
) -> None:
    if state["lifecycle_state"] != expected_source:
        raise ValueError(
            f"guarded resolution requires {expected_source}; "
            f"got {state['lifecycle_state']}"
        )
    if target not in {"submission-recorded", "failed-before-submit"}:
        raise ValueError(f"unsupported exception-resolution target: {target}")
    _stale_active(state, reason)
    state["lifecycle_state"] = target


def reconcile_ambiguous(
    state: dict[str, Any],
    outcome: str,
    evidence_file: Path,
    reconciled_by: str,
    level: str | None = None,
    adapter_path: Path | None = None,
    attestation: str | None = None,
    release_manifest: Path | None = None,
    submitted_root: Path | None = None,
) -> None:
    if state["lifecycle_state"] != "unknown-possibly-submitted":
        raise ValueError("reconciliation requires unknown-possibly-submitted state")
    if not evidence_file.is_file():
        raise ValueError(f"reconciliation evidence missing: {evidence_file}")
    evidence_record = {
        "path": str(evidence_file.resolve()),
        "sha256": sha256_file(evidence_file),
        "reconciled_by": reconciled_by,
    }
    if outcome == "submitted":
        if not level or adapter_path is None:
            raise ValueError(
                "submitted reconciliation requires an inline proof level and adapter"
            )
        proof_evidence = evidence_file if level in {"P1", "P2"} else None
        state["proof"] = _build_proof(
            state,
            level,
            adapter_path,
            proof_evidence,
            attestation,
            release_manifest,
            submitted_root,
        )
        _guarded_exception_resolution(
            state,
            "unknown-possibly-submitted",
            "submission-recorded",
            "ambiguous outcome reconciled as submitted",
        )
    else:
        if level is not None:
            raise ValueError("not-submitted reconciliation must not claim submission proof")
        state["proof"] = None
        _guarded_exception_resolution(
            state,
            "unknown-possibly-submitted",
            "failed-before-submit",
            "ambiguous outcome reconciled as not submitted",
        )
    state["exception_context"] = {
        "kind": "ambiguous-outcome-reconciled",
        "outcome": outcome,
        "evidence": evidence_record,
        "resolved_at": now_utc(),
    }
    _history(state, "ambiguous-outcome-reconciled", copy.deepcopy(state["exception_context"]))


def resolve_blocked(
    state_path: Path,
    state: dict[str, Any],
    evidence_file: Path,
    reconciled_by: str,
    portfolio_root: Path | None,
) -> None:
    if state["lifecycle_state"] != "blocked":
        raise ValueError("resolve-blocked requires blocked state")
    context = state.get("exception_context") or {}
    target = context.get("from_state")
    if not target or target in TERMINAL_STATES or target == "submitting":
        raise ValueError("blocked state has no safe recoverable predecessor")
    if target in ACTIVE_FINAL_STATES:
        _enforce_single_active(state_path, portfolio_root)
    if not evidence_file.is_file():
        raise ValueError(f"resolution evidence missing: {evidence_file}")
    previous = state["lifecycle_state"]
    state["lifecycle_state"] = target
    state["exception_context"] = {
        **context,
        "resolved_at": now_utc(),
        "resolved_by": reconciled_by,
        "resolution_evidence": {
            "path": str(evidence_file.resolve()),
            "sha256": sha256_file(evidence_file),
        },
    }
    _history(state, "blocked-resolved", {"from": previous, "to": target})


def reconcile_session(
    state_path: Path,
    state: dict[str, Any],
    evidence_file: Path,
    reconciled_by: str,
    portfolio_root: Path | None,
) -> None:
    if state["lifecycle_state"] != "session-lost":
        raise ValueError("reconcile-session requires session-lost state")
    context = state.get("exception_context") or {}
    target = context.get("from_state")
    if target not in {"platform-bound", "staging", "staged", "pre-submit-checked", "awaiting-final-approval"}:
        raise ValueError("session loss has no safe pre-submit predecessor")
    if target in ACTIVE_FINAL_STATES:
        _enforce_single_active(state_path, portfolio_root)
    if not evidence_file.is_file():
        raise ValueError(f"session reconciliation evidence missing: {evidence_file}")
    state["lifecycle_state"] = target
    state["exception_context"] = {
        **context,
        "resolved_at": now_utc(),
        "resolved_by": reconciled_by,
        "no_submission_evidence": {
            "path": str(evidence_file.resolve()),
            "sha256": sha256_file(evidence_file),
        },
    }
    _stale_active(state, "session was lost and read-only reconciliation was required")
    _history(state, "session-reconciled", {"to": target})


def reopen_for_binding_update(
    state: dict[str, Any], evidence_file: Path, updated_by: str
) -> None:
    current = state["lifecycle_state"]
    if current in TERMINAL_STATES | {
        "submitting",
        "unknown-possibly-submitted",
        "blocked",
        "session-lost",
    }:
        raise ValueError("binding update cannot reopen this lifecycle state")
    if not evidence_file.is_file():
        raise ValueError(f"binding-update evidence missing: {evidence_file}")
    previous = current
    _mark_freeze_stale(
        state,
        "new buyer binding publication or addendum",
        {"qualification", "requirements", "commercial", "release"},
        regress=False,
        force_open=True,
    )
    release_phase_states = {"release-candidate"} | PRE_SUBMISSION_RELEASE_STATES | {
        "amendment-pending"
    }
    target = "release-candidate" if current in release_phase_states else current
    state["lifecycle_state"] = target
    _stale_active(state, "new buyer binding publication or addendum")
    _history(
        state,
        "binding-update-reopened",
        {
            "from": previous,
            "to": target,
            "updated_by": updated_by,
            "evidence": {
                "path": str(evidence_file.resolve()),
                "sha256": sha256_file(evidence_file),
            },
            "open_workstreams": copy.deepcopy(state["open_workstreams"]),
        },
    )


def close_workstream(
    state: dict[str, Any],
    stream: str,
    evidence_file: Path,
    closed_by: str,
) -> None:
    if stream not in {"qualification", "requirements", "commercial", "release"}:
        raise ValueError(f"unknown workstream: {stream}")
    if stream not in state.get("open_workstreams", []):
        raise ValueError(f"workstream is not open: {stream}")
    if not evidence_file.is_file():
        raise ValueError(f"workstream closure evidence missing: {evidence_file}")
    closure = {
        "stream": stream,
        "closed_at": now_utc(),
        "closed_by": closed_by,
        "evidence": {
            "path": str(evidence_file.resolve()),
            "sha256": sha256_file(evidence_file),
        },
    }
    state["open_workstreams"].remove(stream)
    state.setdefault("workstream_closures", []).append(closure)
    _history(state, "workstream-closed", copy.deepcopy(closure))


def record_verification_failure(
    state: dict[str, Any],
    expected_file: Path,
    observed_file: Path,
    recorded_by: str,
) -> None:
    if state["lifecycle_state"] not in {"submitting", "submission-recorded"}:
        raise ValueError(
            "verification failure may be recorded only during or after submission"
        )
    if not expected_file.is_file() or not observed_file.is_file():
        raise ValueError("verification failure requires expected and observed artifacts")
    previous = state["lifecycle_state"]
    state["lifecycle_state"] = "verification-failed"
    state["exception_context"] = {
        "kind": "verification-failed",
        "from_state": previous,
        "entered_at": now_utc(),
        "recorded_by": recorded_by,
        "expected": {
            "path": str(expected_file.resolve()),
            "sha256": sha256_file(expected_file),
        },
        "observed": {
            "path": str(observed_file.resolve()),
            "sha256": sha256_file(observed_file),
        },
    }
    _history(state, "verification-failure-recorded", copy.deepcopy(state["exception_context"]))


def set_maturity(
    state: dict[str, Any],
    maturity: str,
    evidence_file: Path,
    authorized_by: str,
) -> bool:
    if maturity not in MATURITY:
        raise ValueError(f"unknown adapter maturity: {maturity}")
    if not evidence_file.is_file():
        raise ValueError(f"maturity evidence file missing: {evidence_file}")
    old = state["adapter_maturity"]
    if old == maturity:
        return False
    state["adapter_maturity"] = maturity
    _mark_freeze_stale(state, "adapter maturity changed", {"release"})
    _stale_active(state, "adapter maturity changed")
    _history(
        state,
        "adapter-maturity-set",
        {
            "old": old,
            "new": maturity,
            "evidence": {
                "path": str(evidence_file.resolve()),
                "sha256": sha256_file(evidence_file),
            },
            "authorized_by": authorized_by,
        },
    )
    return True


def _binding_value(field: str, value: str) -> Any:
    if field == "first_offer_risk_acknowledged":
        normalized = value.strip().lower()
        if normalized not in {"true", "false"}:
            raise ValueError(f"{field} must be true or false")
        return normalized == "true"
    return value.strip()


def set_binding(state: dict[str, Any], field: str, value: str) -> bool:
    if field not in BINDING_FIELDS:
        raise ValueError(f"unknown binding field: {field}")
    new_value = _binding_value(field, value)
    if new_value in ("", None):
        raise ValueError(f"binding {field} must not be empty")
    old = state["bindings"].get(field)
    if old == new_value:
        return False
    state["bindings"][field] = new_value
    workstreams = {"release"}
    if field == "price_digest":
        workstreams.add("commercial")
    if field in {
        "declarant_signatory",
        "authority_basis",
        "click_approver",
        "declarations_digest",
    }:
        workstreams.add("qualification")
    _mark_freeze_stale(state, f"binding {field} changed", workstreams)
    _stale_active(state, f"binding {field} changed")
    _history(
        state,
        "binding-changed",
        {"field": field, "old": old, "new": new_value},
    )
    return True


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init")
    init.add_argument("--state", type=Path, required=True)
    init.add_argument("--bid-id", required=True)

    show = sub.add_parser("show")
    show.add_argument("--state", type=Path, required=True)

    bind = sub.add_parser("bind")
    bind.add_argument("--state", type=Path, required=True)
    bind.add_argument("--field", choices=BINDING_FIELDS, required=True)
    bind.add_argument("--value", required=True)

    maturity = sub.add_parser("set-maturity")
    maturity.add_argument("--state", type=Path, required=True)
    maturity.add_argument("--maturity", choices=MATURITY, required=True)
    maturity.add_argument("--evidence-file", type=Path, required=True)
    maturity.add_argument("--authorized-by", required=True)

    approval = sub.add_parser("approve")
    approval.add_argument("--state", type=Path, required=True)
    approval.add_argument("--action-id", required=True)
    approval.add_argument("--effect", choices=sorted(EFFECTS), required=True)
    approval.add_argument("--approver", required=True)
    approval.add_argument("--role", choices=sorted(APPROVER_ROLES), required=True)
    approval.add_argument("--payload-file", type=Path)

    consume_parser = sub.add_parser("consume")
    consume_parser.add_argument("--state", type=Path, required=True)
    consume_parser.add_argument("--action-id", required=True)
    consume_parser.add_argument("--effect", choices=sorted(EFFECTS), required=True)
    consume_parser.add_argument("--payload-file", type=Path)

    move = sub.add_parser("transition")
    move.add_argument("--state", type=Path, required=True)
    move.add_argument("--to", required=True)
    move.add_argument("--portfolio-root", type=Path)
    move.add_argument("--approval-action")
    move.add_argument("--payload-file", type=Path)
    move.add_argument("--release-id")

    proof = sub.add_parser("record-proof")
    proof.add_argument("--state", type=Path, required=True)
    proof.add_argument("--level", choices=PROOF, required=True)
    proof.add_argument("--adapter", type=Path, required=True)
    proof.add_argument("--evidence-file", type=Path)
    proof.add_argument("--attestation")
    proof.add_argument("--release-manifest", type=Path)
    proof.add_argument("--submitted-root", type=Path)

    recover = sub.add_parser("reconcile-ambiguous")
    recover.add_argument("--state", type=Path, required=True)
    recover.add_argument("--outcome", choices=["submitted", "not-submitted"], required=True)
    recover.add_argument("--evidence-file", type=Path, required=True)
    recover.add_argument("--reconciled-by", required=True)
    recover.add_argument("--level", choices=PROOF)
    recover.add_argument("--adapter", type=Path)
    recover.add_argument("--attestation")
    recover.add_argument("--release-manifest", type=Path)
    recover.add_argument("--submitted-root", type=Path)

    blocked = sub.add_parser("resolve-blocked")
    blocked.add_argument("--state", type=Path, required=True)
    blocked.add_argument("--evidence-file", type=Path, required=True)
    blocked.add_argument("--reconciled-by", required=True)
    blocked.add_argument("--portfolio-root", type=Path)

    session = sub.add_parser("reconcile-session")
    session.add_argument("--state", type=Path, required=True)
    session.add_argument("--evidence-file", type=Path, required=True)
    session.add_argument("--reconciled-by", required=True)
    session.add_argument("--portfolio-root", type=Path)

    update = sub.add_parser("reopen-binding-update")
    update.add_argument("--state", type=Path, required=True)
    update.add_argument("--evidence-file", type=Path, required=True)
    update.add_argument("--updated-by", required=True)

    close = sub.add_parser("close-workstream")
    close.add_argument("--state", type=Path, required=True)
    close.add_argument(
        "--stream",
        choices=["qualification", "requirements", "commercial", "release"],
        required=True,
    )
    close.add_argument("--evidence-file", type=Path, required=True)
    close.add_argument("--closed-by", required=True)

    failed = sub.add_parser("record-verification-failure")
    failed.add_argument("--state", type=Path, required=True)
    failed.add_argument("--expected-file", type=Path, required=True)
    failed.add_argument("--observed-file", type=Path, required=True)
    failed.add_argument("--recorded-by", required=True)
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        if args.command == "init":
            if args.state.exists():
                raise ValueError(f"refusing to overwrite existing state: {args.state}")
            state = initial_state(args.bid_id)
            _save(args.state, state)
            print(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True))
            return 0
        state = load_json(args.state)
        if args.command == "show":
            print(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True))
            return 0
        if args.command == "bind":
            set_binding(state, args.field, args.value)
        elif args.command == "set-maturity":
            set_maturity(
                state, args.maturity, args.evidence_file, args.authorized_by
            )
        elif args.command == "approve":
            approve(
                state,
                args.action_id,
                args.effect,
                args.approver,
                args.role,
                args.payload_file,
            )
        elif args.command == "consume":
            consume(state, args.action_id, args.effect, args.payload_file)
        elif args.command == "transition":
            transition(
                args.state,
                state,
                args.to,
                args.portfolio_root,
                args.approval_action,
                args.payload_file,
                args.release_id,
            )
        elif args.command == "record-proof":
            try:
                record_proof(
                    state,
                    args.level,
                    args.adapter,
                    args.evidence_file,
                    args.attestation,
                    args.release_manifest,
                    args.submitted_root,
                )
            except RuntimeError:
                _save(args.state, state)
                raise
        elif args.command == "reconcile-ambiguous":
            try:
                reconcile_ambiguous(
                    state,
                    args.outcome,
                    args.evidence_file,
                    args.reconciled_by,
                    args.level,
                    args.adapter,
                    args.attestation,
                    args.release_manifest,
                    args.submitted_root,
                )
            except RuntimeError:
                _save(args.state, state)
                raise
        elif args.command == "resolve-blocked":
            resolve_blocked(
                args.state,
                state,
                args.evidence_file,
                args.reconciled_by,
                args.portfolio_root,
            )
        elif args.command == "reconcile-session":
            reconcile_session(
                args.state,
                state,
                args.evidence_file,
                args.reconciled_by,
                args.portfolio_root,
            )
        elif args.command == "reopen-binding-update":
            reopen_for_binding_update(state, args.evidence_file, args.updated_by)
        elif args.command == "close-workstream":
            close_workstream(
                state, args.stream, args.evidence_file, args.closed_by
            )
        elif args.command == "record-verification-failure":
            record_verification_failure(
                state, args.expected_file, args.observed_file, args.recorded_by
            )
        _save(args.state, state)
        print(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    except StateMutationError as error:
        if "state" in locals() and "args" in locals() and args.command != "init":
            _save(args.state, state)
        print(json.dumps({"ok": False, "error": str(error)}, sort_keys=True), file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError, json.JSONDecodeError, RuntimeError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, sort_keys=True), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
