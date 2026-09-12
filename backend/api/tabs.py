"""
Tab API Routes — /api/tabs/*

Since we don't have a Chrome extension, this derives tab data from
browser process detection and provides simulated tab classification.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Path as PathParam
from pydantic import BaseModel

from backend.db.store import query_events

router = APIRouter(prefix="/api/tabs", tags=["tabs"])

# In-memory state for tab suspend/restore (simulated)
_suspended_tabs: set[str] = set()


class BulkSuspendRequest(BaseModel):
    tab_ids: list[str]


def _detect_browser_tabs(events: list[dict]) -> dict[str, Any]:
    """
    Build tab data from browser process events.
    Returns { activeTabs, duplicateGroups, staleTabs }.
    """
    # Get unique browser processes from recent events
    browser_procs: dict[str, dict] = {}
    for e in events:
        p = e["payload"]
        if p.get("subsystem") != "browser":
            continue
        pid_key = str(p.get("pid", ""))
        if pid_key and pid_key not in browser_procs:
            browser_procs[pid_key] = p

    active_tabs: list[dict] = []
    for pid_key, proc in browser_procs.items():
        tab_id = f"tab-{pid_key}"
        name = proc.get("name", "Browser Tab")
        ram_mb = int(proc.get("ram_gb", 0) * 1024)
        cpu_pct = proc.get("cpu_percent", 0)

        # Determine tab category based on resource usage
        is_snoozed = tab_id in _suspended_tabs
        category = "active"

        tab = {
            "id": tab_id,
            "title": f"{name} (PID {pid_key})",
            "url": f"chrome://process/{pid_key}",
            "displayDomain": name.lower(),
            "category": category,
            "pid": pid_key,
            "ramMb": ram_mb,
            "cpuPercent": cpu_pct,
            "lastActive": "Just now",
            "isSnoozed": is_snoozed,
            "iconName": "language",
            "iconColor": "#c084fc",
            "whyText": f"Browser process consuming {ram_mb} MB RAM, {cpu_pct}% CPU.",
        }
        active_tabs.append(tab)

    # Sort by RAM descending
    active_tabs.sort(key=lambda t: -t["ramMb"])

    return {
        "activeTabs": active_tabs,
        "duplicateGroups": [],
        "staleTabs": [],
        "totalMemoryMb": sum(t["ramMb"] for t in active_tabs),
        "tabCount": len(active_tabs),
    }


@router.get("")
async def get_tabs():
    """Return all tabs classified into active/duplicate/stale buckets."""
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat(
        timespec="milliseconds"
    )
    events = await query_events(
        start=cutoff,
        event_type="resource_sample",
        limit=500,
    )

    return _detect_browser_tabs(events)


@router.post("/{tab_id}/suspend")
async def suspend_tab(tab_id: str = PathParam(...)):
    """Suspend a single tab (simulated — marks it in memory)."""
    _suspended_tabs.add(tab_id)
    return {"status": "suspended", "tab_id": tab_id}


@router.post("/bulk-suspend")
async def bulk_suspend(request: BulkSuspendRequest):
    """Suspend multiple tabs at once."""
    for tab_id in request.tab_ids:
        _suspended_tabs.add(tab_id)
    return {
        "status": "suspended",
        "count": len(request.tab_ids),
        "tab_ids": request.tab_ids,
    }


@router.post("/{tab_id}/restore")
async def restore_tab(tab_id: str = PathParam(...)):
    """Restore a suspended tab."""
    _suspended_tabs.discard(tab_id)
    return {"status": "restored", "tab_id": tab_id}
