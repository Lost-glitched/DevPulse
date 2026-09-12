"""
DevPulse Shadow Repository Diff Engine.

Calculates unified diffs between shadow commits and correlates
failed executions with code changes since the last passing state.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from git import Repo

from backend.db.store import query_events
from backend.shadow_repo.repo import init_shadow_repo

logger = logging.getLogger("devpulse.shadow_repo.diff")


def diff(shadow_repo_path: str, commit_a: str, commit_b: str) -> dict[str, Any]:
    """
    Produce structured unified diff between commit_a and commit_b in the shadow repo.
    Returns: { "files": [{ "file_path", "unified_diff", "lines_added", "lines_removed" }] }
    """
    try:
        repo = Repo(shadow_repo_path)
    except Exception as exc:
        logger.error("Failed to open shadow repo at %s: %s", shadow_repo_path, exc)
        return {"files": []}

    try:
        # Commit a to commit b diff
        raw_diff = repo.git.diff(commit_a, commit_b, unified=3)
    except Exception as exc:
        logger.error("Git diff failed (%s..%s): %s", commit_a, commit_b, exc)
        return {"files": []}

    file_diffs: list[dict[str, Any]] = []
    current_file: str | None = None
    current_lines: list[str] = []
    added = 0
    removed = 0

    def _flush():
        nonlocal current_file, current_lines, added, removed
        if current_file:
            file_diffs.append({
                "file_path": current_file,
                "unified_diff": "\n".join(current_lines),
                "lines_added": added,
                "lines_removed": removed,
            })
        current_file = None
        current_lines = []
        added = 0
        removed = 0

    for line in raw_diff.splitlines():
        if line.startswith("diff --git "):
            _flush()
            parts = line.split(" ")
            if len(parts) >= 4:
                # b/path
                current_file = parts[3].removeprefix("b/")
            else:
                current_file = "unknown"
            current_lines.append(line)
        elif current_file is not None:
            current_lines.append(line)
            if line.startswith("+") and not line.startswith("+++"):
                added += 1
            elif line.startswith("-") and not line.startswith("---"):
                removed += 1

    _flush()
    return {"files": file_diffs}


async def diff_since_last_pass(execution_result_id: str) -> dict[str, Any]:
    """
    Finds the execution_result event, retrieves the last passing execution,
    and produces a diff between the passing snapshot and the failing snapshot.
    """
    events = await query_events(event_type="execution_result", limit=200)
    target_event = next((e for e in events if e["id"] == execution_result_id), None)

    if not target_event:
        return {"error": f"Execution result '{execution_result_id}' not found", "files": []}

    target_payload = target_event.get("payload", {})
    target_commit = target_payload.get("preceding_shadow_commit_hash")
    target_ts = target_event.get("timestamp", "")
    project_id = target_event.get("project_id")

    # If no commit attached to payload, find shadow_commit prior to execution
    if not target_commit:
        shadow_events = await query_events(
            end=target_ts,
            event_type="shadow_commit",
            project_id=project_id,
            limit=1,
        )
        if shadow_events:
            target_commit = shadow_events[0].get("payload", {}).get("shadow_commit_hash")

    if not target_commit:
        return {"error": "No shadow commit found for target execution", "files": []}

    # Find the most recent passing execution prior to this one
    prior_passing = None
    for e in events:
        if e.get("timestamp", "") < target_ts:
            p = e.get("payload", {})
            if p.get("passed") is True:
                prior_passing = e
                break

    passing_commit = None
    if prior_passing:
        passing_commit = prior_passing.get("payload", {}).get("preceding_shadow_commit_hash")
        if not passing_commit:
            p_ts = prior_passing.get("timestamp", "")
            shadow_events = await query_events(
                end=p_ts,
                event_type="shadow_commit",
                project_id=project_id,
                limit=1,
            )
            if shadow_events:
                passing_commit = shadow_events[0].get("payload", {}).get("shadow_commit_hash")

    shadow_path = init_shadow_repo(project_root=project_id)

    # If no prior passing execution, diff against the parent of target_commit
    if not passing_commit:
        try:
            repo = Repo(shadow_path)
            commit_obj = repo.commit(target_commit)
            if commit_obj.parents:
                passing_commit = commit_obj.parents[0].hexsha
            else:
                passing_commit = target_commit
        except Exception:
            passing_commit = target_commit

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, diff, shadow_path, passing_commit, target_commit)
    result["failing_commit"] = target_commit
    result["passing_commit"] = passing_commit
    result["failing_command"] = target_payload.get("command", "")
    result["exit_code"] = target_payload.get("exit_code")
    result["stderr_tail"] = target_payload.get("stderr_tail", "")
    result["stdout_tail"] = target_payload.get("stdout_tail", "")
    return result
