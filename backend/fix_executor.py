"""
DevPulse Fix Executor — Safe, reversible remediation actions.

Executes controlled remediations for diagnoses such as terminating orphaned/runaway
processes (with PID identity validation), purging whitelisted build caches,
and suspending resource-heavy browser tabs.
"""
from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from typing import Any

import psutil

from backend.browser_bridge.ws_server import send_suspend_command
from backend.config import SAFE_CACHE_PATTERNS
from backend.project_context import detect_project_id

logger = logging.getLogger("devpulse.fix_executor")


def kill_process(pid: int, expected_name: str | None = None) -> dict[str, Any]:
    """
    Safely terminate a process by PID after verifying its name matches expectations
    to prevent accidental kills if the PID was recycled by the OS.
    """
    try:
        proc = psutil.Process(pid)
    except psutil.NoSuchProcess:
        return {"success": False, "message": f"Process {pid} no longer exists"}
    except psutil.AccessDenied:
        return {"success": False, "message": f"Access denied to terminate PID {pid}"}

    current_name = proc.name()

    # Verify identity to prevent PID-reuse race condition
    if expected_name:
        exp_clean = expected_name.lower().replace(".exe", "")
        cur_clean = current_name.lower().replace(".exe", "")
        if exp_clean not in cur_clean and cur_clean not in exp_clean:
            return {
                "success": False,
                "message": f"PID {pid} now belongs to '{current_name}', expected '{expected_name}'. Kill aborted for safety.",
            }

    try:
        mem_rss = proc.memory_info().rss
        reclaimed_mb = round(mem_rss / (1024 * 1024), 1)

        proc.terminate()
        try:
            proc.wait(timeout=3.0)
        except psutil.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=2.0)

        logger.info("Terminated process %s (PID %d), reclaimed ~%s MB", current_name, pid, reclaimed_mb)
        return {
            "success": True,
            "message": f"Terminated process '{current_name}' (PID {pid})",
            "reclaimed_ram_mb": reclaimed_mb,
        }
    except Exception as exc:
        logger.error("Failed to terminate PID %d: %s", pid, exc)
        return {"success": False, "message": f"Failed to terminate process: {exc}"}


def clear_build_cache(path: str) -> dict[str, Any]:
    """
    Safely clear a build cache directory. Only operates on whitelisted cache patterns
    defined in config.SAFE_CACHE_PATTERNS (e.g. node_modules/.cache, .next/cache, __pycache__).
    """
    target = Path(path).resolve()

    # Security check: must match at least one safe pattern
    target_posix = target.as_posix()
    is_safe = False
    for pattern in SAFE_CACHE_PATTERNS:
        pat_posix = pattern.replace("\\", "/")
        if target_posix.endswith(pat_posix) or f"/{pat_posix}" in target_posix:
            is_safe = True
            break

    if not is_safe:
        return {
            "success": False,
            "message": f"Path '{target}' is not in the approved cache whitelist: {SAFE_CACHE_PATTERNS}",
        }

    if not target.exists():
        return {"success": False, "message": f"Cache path does not exist: {target}"}

    cleared_bytes = 0
    try:
        if target.is_file():
            cleared_bytes = target.stat().st_size
            target.unlink()
        elif target.is_dir():
            for item in target.iterdir():
                if item.is_file():
                    cleared_bytes += item.stat().st_size
                    item.unlink()
                elif item.is_dir():
                    for sub in item.rglob("*"):
                        if sub.is_file():
                            cleared_bytes += sub.stat().st_size
                    shutil.rmtree(item)

        cleared_mb = round(cleared_bytes / (1024 * 1024), 2)
        logger.info("Cleared cache directory %s (%s MB)", target, cleared_mb)
        return {
            "success": True,
            "message": f"Cleared cache at {target.name} ({cleared_mb} MB reclaimed)",
            "cleared_bytes": cleared_bytes,
            "reclaimed_mb": cleared_mb,
        }
    except Exception as exc:
        logger.error("Failed to clear cache %s: %s", target, exc)
        return {"success": False, "message": f"Failed to clear cache: {exc}"}


async def suspend_tab(tab_id: int | str) -> dict[str, Any]:
    """Delegate to WebSocket bridge to suspend a browser tab."""
    num_id = None
    if isinstance(tab_id, int):
        num_id = tab_id
    elif isinstance(tab_id, str):
        if tab_id.startswith("tab-"):
            try:
                num_id = int(tab_id.removeprefix("tab-"))
            except ValueError:
                pass
        else:
            try:
                num_id = int(tab_id)
            except ValueError:
                pass

    if num_id is None:
        return {"success": False, "message": f"Invalid tab ID: {tab_id}"}

    sent = await send_suspend_command(num_id)
    if sent:
        return {"success": True, "message": f"Suspended browser tab {num_id}"}
    return {
        "success": False,
        "message": "No Chrome extension connected to receive suspend command",
    }


# Action registry mapping diagnosis cause labels to handler descriptions
ACTION_REGISTRY = {
    "Sustained High CPU": {
        "action": "kill_process",
        "label": "Terminate runaway process",
        "reversible": False,
    },
    "Possible Memory Leak": {
        "action": "kill_process",
        "label": "Restart leaking process",
        "reversible": False,
    },
    "Idle Process with High Memory": {
        "action": "kill_process",
        "label": "Terminate idle background process",
        "reversible": False,
    },
    "Stale Browser Tab": {
        "action": "suspend_tab",
        "label": "Suspend idle tab",
        "reversible": True,
    },
    "Duplicate Browser Tab": {
        "action": "suspend_tab",
        "label": "Suspend duplicate tab",
        "reversible": True,
    },
    "Build Cache Overhead": {
        "action": "clear_build_cache",
        "label": "Purge build cache",
        "reversible": False,
    },
}


async def execute_fix_for_diagnosis(diagnosis: dict[str, Any]) -> dict[str, Any]:
    """Execute the appropriate fix action for a given diagnosis."""
    cause = diagnosis.get("cause_label", "")
    process_key = diagnosis.get("process_key", "")
    signals = diagnosis.get("signal_values", {})

    # Extract PID if present
    pid = None
    if "pid" in signals:
        try:
            pid = int(signals["pid"])
        except (ValueError, TypeError):
            pass
    elif process_key.startswith("pid:"):
        try:
            pid = int(process_key.removeprefix("pid:"))
        except ValueError:
            pass

    name = signals.get("name") or signals.get("process_name")

    # If action is killing process
    if pid is not None:
        return kill_process(pid=pid, expected_name=name)

    # Check for tab action
    if "tab_id" in signals:
        return await suspend_tab(signals["tab_id"])

    # Check for cache action
    if "cache_path" in signals:
        return clear_build_cache(signals["cache_path"])

    # Fallback to finding whitelisted caches in current project
    if "cache" in cause.lower() or "build" in cause.lower():
        project_root = Path(detect_project_id())
        for pat in SAFE_CACHE_PATTERNS:
            candidate = project_root / pat
            if candidate.exists():
                return clear_build_cache(str(candidate))

    return {
        "success": False,
        "message": f"No automatic fix available for diagnosis: {cause}",
    }
