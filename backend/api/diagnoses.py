"""
DevPulse Diagnoses & Remediation API — /api/diagnoses/*

Surfaces active performance anomalies and provides one-click remediation actions.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Path as PathParam
from pydantic import BaseModel

from backend.db.store import get_diagnoses
from backend.fix_executor import ACTION_REGISTRY, execute_fix_for_diagnosis

logger = logging.getLogger("devpulse.api.diagnoses")

router = APIRouter(prefix="/api/diagnoses", tags=["diagnoses"])


class FixRequest(BaseModel):
    confirm: bool = False


@router.get("")
async def list_diagnoses():
    """Return all active diagnoses evaluated by the diagnostic engine."""
    diagnoses = await get_diagnoses()
    for d in diagnoses:
        cause = d.get("cause_label", "")
        reg_info = ACTION_REGISTRY.get(cause)
        if reg_info:
            d["fix_action"] = reg_info["action"]
            d["fix_label"] = reg_info["label"]
            d["fix_reversible"] = reg_info["reversible"]
        elif d.get("process_key", "").startswith("pid:") or "pid" in d.get("signal_values", {}):
            d["fix_action"] = "kill_process"
            d["fix_label"] = "Terminate process"
            d["fix_reversible"] = False
        else:
            d["fix_action"] = None
            d["fix_label"] = None
            d["fix_reversible"] = False

    return {"diagnoses": diagnoses, "total": len(diagnoses)}


@router.post("/{diagnosis_id}/fix")
async def fix_diagnosis(
    diagnosis_id: str = PathParam(...),
    request: FixRequest | None = None,
):
    """
    Execute or preview remediation for a diagnosis.
    Returns preview when confirm=false, and executes when confirm=true.
    """
    diagnoses = await get_diagnoses()
    target = next((d for d in diagnoses if d["id"] == diagnosis_id), None)

    if not target:
        raise HTTPException(status_code=404, detail=f"Diagnosis '{diagnosis_id}' not found")

    req = request or FixRequest()
    cause = target.get("cause_label", "")
    reg_info = ACTION_REGISTRY.get(cause, {})

    if not req.confirm:
        return {
            "status": "preview",
            "diagnosis_id": diagnosis_id,
            "cause_label": cause,
            "action": reg_info.get("action", "kill_process"),
            "action_label": reg_info.get("label", "Execute remediation"),
            "reversible": reg_info.get("reversible", False),
            "recommendation": target.get("recommendation", ""),
            "signal_values": target.get("signal_values", {}),
        }

    # Execute fix
    result = await execute_fix_for_diagnosis(target)
    return {
        "status": "executed" if result.get("success") else "failed",
        "diagnosis_id": diagnosis_id,
        "cause_label": cause,
        "result": result,
    }
