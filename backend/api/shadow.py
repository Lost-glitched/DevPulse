"""
DevPulse Shadow Timeline API — /api/timeline/snapshots, /api/timeline/failure/*, /api/timeline/revert/*

Provides timeline snapshot history, failure diffs with culprit analysis,
and safe snapshot reversion.
"""
from __future__ import annotations

import asyncio
import logging
import shutil
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from git import Repo
from pydantic import BaseModel

from backend.db.store import query_events
from backend.project_context import detect_project_id
from backend.shadow_repo.culprit import likely_culprit_hunks
from backend.shadow_repo.diff import diff, diff_since_last_pass
from backend.shadow_repo.repo import init_shadow_repo, snapshot

logger = logging.getLogger("devpulse.api.shadow")

router = APIRouter(prefix="/api/timeline", tags=["shadow_timeline"])


class RevertRequest(BaseModel):
    confirm: bool = False
    force: bool = False


@router.get("/snapshots")
async def get_snapshots(
    range: str | None = Query(None, description="Time range or filter"),
    limit: int = Query(50, ge=1, le=200),
):
    """List recent shadow commits with linked execution results."""
    project_id = detect_project_id()

    shadow_events = await query_events(
        event_type="shadow_commit",
        project_id=project_id,
        limit=limit,
    )
    exec_events = await query_events(
        event_type="execution_result",
        project_id=project_id,
        limit=limit * 2,
    )

    # Map commit_hash -> execution_result
    exec_map: dict[str, dict[str, Any]] = {}
    for ee in exec_events:
        ep = ee.get("payload", {})
        c_hash = ep.get("preceding_shadow_commit_hash")
        if c_hash and c_hash not in exec_map:
            exec_map[c_hash] = {
                "id": ee["id"],
                "command": ep.get("command", ""),
                "passed": ep.get("passed", False),
                "exit_code": ep.get("exit_code", 0),
                "timestamp": ee["timestamp"],
            }

    snapshots = []
    for se in shadow_events:
        sp = se.get("payload", {})
        c_hash = sp.get("shadow_commit_hash", "")
        snapshots.append({
            "id": se["id"],
            "timestamp": se["timestamp"],
            "shadow_commit_hash": c_hash,
            "trigger": sp.get("trigger", "unknown"),
            "real_git_head": sp.get("real_git_head"),
            "execution": exec_map.get(c_hash),
        })

    return {"snapshots": snapshots, "total": len(snapshots)}


@router.get("/failure/{execution_result_id}/diff")
async def get_failure_diff(execution_result_id: str):
    """
    Produce unified diff between the state prior to this failure and the last
    known passing execution, plus culprit hunks ranked by blame probability.
    """
    diff_data = await diff_since_last_pass(execution_result_id)
    if "error" in diff_data and not diff_data.get("files"):
        raise HTTPException(status_code=404, detail=diff_data["error"])

    err_msg = diff_data.get("stderr_tail", "")
    stdout = diff_data.get("stdout_tail", "")
    culprits = likely_culprit_hunks(diff_data, error_message=err_msg, stack_trace=stdout)
    diff_data["culprits"] = culprits
    return diff_data


@router.post("/revert/{shadow_commit_id}")
async def revert_to_snapshot(
    shadow_commit_id: str,
    mode: str = Query("preview", pattern="^(preview|apply)$"),
    body: RevertRequest | None = None,
):
    """
    Preview or apply a workspace reversion to a specific shadow commit.
    """
    project_root = Path(detect_project_id()).resolve()
    shadow_path = Path(init_shadow_repo(str(project_root)))

    try:
        shadow_repo = Repo(str(shadow_path))
        target_commit = shadow_repo.commit(shadow_commit_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Shadow commit '{shadow_commit_id}' not found: {exc}")

    # First take a snapshot of current state to ensure current state is not lost
    current_snapshot = await snapshot(project_root=str(project_root), trigger="pre_revert")

    loop = asyncio.get_event_loop()
    preview_diff = await loop.run_in_executor(
        None, diff, str(shadow_path), current_snapshot, target_commit.hexsha
    )

    if mode == "preview":
        return {
            "mode": "preview",
            "target_commit": target_commit.hexsha,
            "current_snapshot": current_snapshot,
            "files_affected": len(preview_diff.get("files", [])),
            "diff": preview_diff,
        }

    # mode == "apply"
    req = body or RevertRequest()
    if not req.confirm:
        raise HTTPException(
            status_code=400,
            detail="Reversion requires explicit confirmation: {'confirm': true}",
        )

    # Check for uncommitted git changes in real repo if not force
    if not req.force:
        try:
            real_repo = Repo(str(project_root), search_parent_directories=False)
            if real_repo.is_dirty(untracked_files=True):
                raise HTTPException(
                    status_code=409,
                    detail="Active git repository has uncommitted changes. Pass 'force: true' to overwrite.",
                )
        except HTTPException:
            raise
        except Exception:
            pass

    # Apply checkout of target commit's tree into project_root
    def _apply_revert():
        # Checkout files from target commit to shadow working directory
        shadow_repo.git.checkout(target_commit.hexsha, force=True)

        # Copy non-git files back to project_root
        for current_dir, dirs, files in os.walk(str(shadow_path)):
            if ".git" in dirs:
                dirs.remove(".git")
            rel_dir = Path(current_dir).relative_to(shadow_path)
            for f in files:
                rel_path = rel_dir / f if rel_dir != Path(".") else Path(f)
                dst = project_root / rel_path
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(shadow_path / rel_path, dst)

    import os
    await loop.run_in_executor(None, _apply_revert)

    # Take post_revert snapshot
    new_snapshot = await snapshot(project_root=str(project_root), trigger="post_revert")

    return {
        "status": "success",
        "reverted_to": target_commit.hexsha,
        "post_revert_snapshot": new_snapshot,
    }
