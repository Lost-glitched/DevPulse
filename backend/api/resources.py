"""
Resource API Routes — /api/resources/*

Serves process data grouped by subsystem in the shape the frontend's
ResourceTreemapView expects (ProcessNode[]).
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any

import psutil
from fastapi import APIRouter, Query

from backend.db.store import get_diagnoses, query_events

router = APIRouter(prefix="/api/resources", tags=["resources"])


def _format_ram(ram_gb: float) -> str:
    """Format RAM for display."""
    if ram_gb >= 1.0:
        return f"{ram_gb:.2f} GB"
    return f"{int(ram_gb * 1024)} MB"


def _assign_grid_span(ram_gb: float, max_ram: float) -> dict[str, int]:
    """Assign grid span based on relative resource usage."""
    if max_ram <= 0:
        return {"colSpan": 1, "rowSpan": 1}

    ratio = ram_gb / max_ram
    if ratio > 0.5:
        return {"colSpan": 4, "rowSpan": 6}
    elif ratio > 0.3:
        return {"colSpan": 6, "rowSpan": 3}
    elif ratio > 0.15:
        return {"colSpan": 3, "rowSpan": 3}
    elif ratio > 0.08:
        return {"colSpan": 2, "rowSpan": 4}
    elif ratio > 0.04:
        return {"colSpan": 2, "rowSpan": 2}
    elif ratio > 0.02:
        return {"colSpan": 2, "rowSpan": 1}
    else:
        return {"colSpan": 1, "rowSpan": 2}


@router.get("/current")
async def get_current_resources():
    """
    Return current process data as ProcessNode[] grouped by subsystem.
    Merges live event data with diagnostic causes.
    """
    # Get most recent resource samples (last 30 seconds)
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat(
        timespec="milliseconds"
    )
    events = await query_events(
        start=cutoff,
        event_type="resource_sample",
        limit=500,
    )

    # Deduplicate: keep only the most recent sample per pid
    seen_pids: set[str] = set()
    latest_samples: list[dict[str, Any]] = []
    for e in events:
        pid_key = str(e["payload"].get("pid", ""))
        if pid_key and pid_key not in seen_pids:
            seen_pids.add(pid_key)
            latest_samples.append(e["payload"])

    # Get diagnoses
    diagnoses = await get_diagnoses()
    diag_by_pid: dict[str, dict] = {}
    for d in diagnoses:
        key = d["process_key"]
        if key.startswith("pid:"):
            diag_by_pid[key.replace("pid:", "")] = d
        elif key.startswith("category:"):
            # Category-level diagnoses apply to all processes in that category
            cat = key.replace("category:", "")
            diag_by_pid[f"_cat_{cat}"] = d

    # Find max RAM for grid span calculation
    max_ram = max((s.get("ram_gb", 0) for s in latest_samples), default=1.0)

    # Build ProcessNode list
    processes: list[dict[str, Any]] = []
    for sample in latest_samples:
        pid = str(sample.get("pid", ""))
        category = sample.get("subsystem", "system")
        ram_gb = sample.get("ram_gb", 0)

        # Check for diagnoses
        diag = diag_by_pid.get(pid) or diag_by_pid.get(f"_cat_{category}")
        is_cause = diag is not None
        cause_badge = diag.get("cause_label", "") if diag else None
        leak_rate = None
        recommendation = None

        if diag:
            signals = diag.get("signal_values", {})
            leak_rate = signals.get("leak_rate_display")
            recommendation = diag.get("recommendation")

        process_node = {
            "id": f"proc-{pid}",
            "subsystem": category,
            "subsystemTitle": sample.get("subsystem_title", category.upper()),
            "name": sample.get("name", "Unknown"),
            "pid": sample.get("pid", 0),
            "details": sample.get("cmdline", "")[:80] or sample.get("name", ""),
            "ramGb": ram_gb,
            "ramDisplay": _format_ram(ram_gb),
            "cpuPercent": sample.get("cpu_percent", 0),
            "threads": sample.get("threads", 0),
            "isCause": is_cause,
            "causeBadgeText": cause_badge,
            "leakRate": leak_rate,
            "recommendation": recommendation,
            "gridSpan": _assign_grid_span(ram_gb, max_ram),
        }
        processes.append(process_node)

    # Sort: cause processes first, then by RAM descending
    processes.sort(key=lambda p: (not p["isCause"], -p["ramGb"]))

    # System totals
    total_ram = sum(p["ramGb"] for p in processes)
    try:
        mem = psutil.virtual_memory()
        system_memory_gb = round(mem.used / (1024**3), 2)
        system_memory_total_gb = round(mem.total / (1024**3), 2)
    except Exception:
        system_memory_gb = total_ram
        system_memory_total_gb = 16.0

    return {
        "processes": processes,
        "systemMemoryUsedGb": system_memory_gb,
        "systemMemoryTotalGb": system_memory_total_gb,
        "processCount": len(processes),
    }


@router.get("/history")
async def get_resource_history(
    range: str = Query("1h", regex="^(1h|4h|8h)$"),
):
    """
    Return time-bucketed resource usage series for the waveform graph.
    """
    range_hours = {"1h": 1, "4h": 4, "8h": 8}[range]
    cutoff = (
        datetime.now(timezone.utc) - timedelta(hours=range_hours)
    ).isoformat(timespec="milliseconds")

    events = await query_events(
        start=cutoff,
        event_type="resource_sample",
        limit=5000,
    )

    # Bucket events into 1-minute intervals
    buckets: dict[str, dict[str, list[float]]] = {}  # minute_key -> { category -> [values] }
    categories = {"ide", "terminal", "containers", "browser"}

    for e in events:
        ts = e["timestamp"][:16]  # truncate to minute: "2024-01-01T12:34"
        category = e["payload"].get("subsystem", "system")
        if category not in categories:
            continue

        if ts not in buckets:
            buckets[ts] = {c: [] for c in categories}
        buckets[ts].setdefault(category, []).append(e["payload"].get("ram_gb", 0))

    # Build series
    series: list[dict[str, Any]] = []
    for ts_key in sorted(buckets.keys()):
        bucket = buckets[ts_key]
        point = {"time": ts_key}
        for cat in categories:
            values = bucket.get(cat, [])
            point[cat] = round(sum(values), 2) if values else 0
        point["total"] = sum(point.get(c, 0) for c in categories)
        series.append(point)

    return {
        "range": range,
        "series": series,
        "categories": list(categories),
    }
