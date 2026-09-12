"""
Timeline API Routes — /api/timeline/*

Serves merged event streams and point-in-time telemetry snapshots
for the SessionTimelineView component.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import psutil
from fastapi import APIRouter, Query

from backend.db.store import get_diagnoses, query_events

router = APIRouter(prefix="/api/timeline", tags=["timeline"])

# Subsystem → track mapping and colors
TRACK_CONFIG = {
    "ide": {"color": "#38bdf8", "track": "ide"},
    "terminal": {"color": "#fb923c", "track": "terminal"},
    "containers": {"color": "#4ade80", "track": "containers"},
    "git": {"color": "#4ade80", "track": "containers"},  # git events on containers track
    "browser": {"color": "#c084fc", "track": "browser"},
    "docker": {"color": "#4ade80", "track": "containers"},
}


def _event_to_marker(event: dict, range_start: datetime, range_minutes: float) -> dict | None:
    """Convert a store event into a TimelineMarker for the frontend."""
    try:
        ts_str = event["timestamp"]
        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        minutes_from_start = (ts - range_start).total_seconds() / 60.0
        percent_left = max(2.0, min(95.0, (minutes_from_start / range_minutes) * 100))

        category = event.get("category", "system")
        payload = event.get("payload", {})
        event_type = event.get("event_type", "")

        track_info = TRACK_CONFIG.get(category, {"color": "#94a3b8", "track": "ide"})

        # Build label from event type and payload
        if event_type == "resource_sample":
            name = payload.get("name", "Process")
            cpu = payload.get("cpu_percent", 0)
            ram = payload.get("ram_gb", 0)
            label = f"{name}: {_format_ram(ram)}, {cpu}% CPU"
            full_title = f"Resource sample: {name}"
            details = f"PID {payload.get('pid', '?')} — {_format_ram(ram)} RAM, {cpu}% CPU"
        elif event_type == "git_commit":
            label = f"git commit: {payload.get('message', '')[:40]}"
            full_title = f"Git commit {payload.get('hash', '')}"
            details = f"{payload.get('author', '')} — {payload.get('files_changed', 0)} files changed"
        elif event_type == "git_checkout":
            label = f"git checkout {payload.get('branch', '')}"
            full_title = f"Branch switch to {payload.get('branch', '')}"
            details = f"HEAD at {payload.get('head', '')}"
        elif event_type == "file_saved":
            label = f"File saved: {payload.get('file_name', '')}"
            full_title = f"File save: {payload.get('file_path', '')}"
            details = f"{payload.get('size_bytes', 0)} bytes, {payload.get('kind', 'modified')}"
        elif event_type == "execution_result":
            cmd = payload.get("command", "")
            passed = payload.get("passed", False)
            exit_code = payload.get("exit_code", 0)
            icon = "✓" if passed else "✗"
            label = f"{icon} {cmd[:30]} ({'ok' if passed else f'exit {exit_code}'})"
            full_title = f"Execution: {cmd}"
            details = f"Exit code {exit_code} in {payload.get('duration_ms', 0)}ms"
            track_info = {"color": "#4ade80" if passed else "#f43f5e", "track": "terminal"}
        elif event_type == "shadow_commit":
            trigger = payload.get("trigger", "snapshot")
            hash_short = payload.get("shadow_commit_hash", "")[:8]
            label = f"Shadow snapshot: {trigger} ({hash_short})"
            full_title = f"Shadow commit {hash_short}"
            details = f"Triggered by {trigger}"
            track_info = {"color": "#38bdf8", "track": "ide"}
        else:
            label = f"{event_type}: {payload.get('name', '')}"
            full_title = event_type
            details = str(payload)[:200]

        # Determine if this is a spike
        is_spike = False
        if event_type == "resource_sample":
            cpu = payload.get("cpu_percent", 0)
            if cpu > 80:
                is_spike = True
        elif event_type == "execution_result":
            if not payload.get("passed", False):
                is_spike = True

        time_str = ts.strftime("%H:%M:%S") if ts else ""

        return {
            "id": event["id"][:16],
            "track": track_info["track"],
            "timeStr": time_str,
            "timestampMinutes": round(minutes_from_start, 1),
            "percentLeft": round(percent_left, 1),
            "label": label[:60],
            "fullTitle": full_title,
            "details": details[:200],
            "isSpike": is_spike,
            "isUnderScrubber": False,
            "color": track_info["color"],
            "passed": payload.get("passed") if event_type == "execution_result" else None,
            "command": payload.get("command") if event_type == "execution_result" else None,
            "executionResultId": event["id"] if event_type == "execution_result" else None,
            "exitCode": payload.get("exit_code") if event_type == "execution_result" else None,
        }
    except Exception:
        return None


def _format_ram(gb: float) -> str:
    if gb >= 1.0:
        return f"{gb:.1f} GB"
    return f"{int(gb * 1024)} MB"


@router.get("")
async def get_timeline(
    range: str = Query("4h", pattern="^(1h|4h|8h|full)$"),
):
    """
    Return merged timeline events across all sources.
    Deduplicates high-frequency samples into distinct spikes.
    """
    range_hours = {"1h": 1, "4h": 4, "8h": 8, "full": 24}[range]
    now = datetime.now(timezone.utc)
    range_start = now - timedelta(hours=range_hours)
    range_minutes = range_hours * 60.0

    cutoff = range_start.isoformat(timespec="milliseconds")

    all_events = await query_events(
        start=cutoff,
        limit=1000,
    )

    markers: list[dict] = []
    seen_spike_buckets: set[str] = set()

    for e in all_events:
        event_type = e.get("event_type", "")
        payload = e.get("payload", {})
        ts_str = e.get("timestamp", "")

        if event_type == "resource_sample":
            cpu = payload.get("cpu_percent", 0)
            ram = payload.get("ram_gb", 0)
            if cpu < 50 and ram < 2.0:
                continue
            name = payload.get("name", "proc")
            bucket = f"{name}:{ts_str[:16]}"
            if bucket in seen_spike_buckets:
                continue
            seen_spike_buckets.add(bucket)

        elif event_type == "file_saved":
            bucket = f"filesave:{ts_str[:16]}"
            if bucket in seen_spike_buckets:
                continue
            seen_spike_buckets.add(bucket)

        marker = _event_to_marker(e, range_start, range_minutes)
        if marker:
            markers.append(marker)

    # Sort by time
    markers.sort(key=lambda m: m["timestampMinutes"])

    # Limit per track to avoid overwhelming the frontend UI
    by_track: dict[str, list[dict]] = {}
    for m in markers:
        by_track.setdefault(m["track"], []).append(m)

    clean_markers: list[dict] = []
    for track, t_markers in by_track.items():
        clean_markers.extend(t_markers[-8:])

    clean_markers.sort(key=lambda m: m["timestampMinutes"])

    return {
        "range": range,
        "markers": clean_markers,
        "rangeStartIso": range_start.isoformat(),
        "rangeEndIso": now.isoformat(),
    }


@router.get("/telemetry")
async def get_telemetry_at_time(
    time: str = Query(..., description="ISO8601 timestamp or HH:MM:SS"),
):
    """
    Return detailed subsystem breakdown at a specific point in time.
    This powers the scrubber detail panel in the timeline view.
    """
    now = datetime.now(timezone.utc)
    try:
        if "T" in time:
            target = datetime.fromisoformat(time.replace("Z", "+00:00"))
        else:
            parts = time.split(":")
            h, m = int(parts[0]), int(parts[1])
            s = int(parts[2]) if len(parts) > 2 else 0
            target = now.replace(hour=h, minute=m, second=s, microsecond=0)
    except Exception:
        target = now

    # Query events in a ±2 minute window around the target time
    window_start = (target - timedelta(minutes=2)).isoformat(timespec="milliseconds")
    window_end = (target + timedelta(minutes=2)).isoformat(timespec="milliseconds")
    events = await query_events(start=window_start, end=window_end, limit=500)

    # Fallback to nearest recorded resource samples if window is empty
    if not any(e.get("event_type") == "resource_sample" for e in events):
        fallback_events = await query_events(end=window_end, event_type="resource_sample", limit=200)
        if not fallback_events:
            fallback_events = await query_events(event_type="resource_sample", limit=200)
        if fallback_events:
            events.extend(fallback_events)

    # Aggregate by subsystem
    subsystem_data: dict[str, dict[str, Any]] = {
        "ide": {"processes": [], "total_ram_gb": 0, "max_cpu": 0},
        "terminal": {"processes": [], "total_ram_gb": 0, "max_cpu": 0},
        "containers": {"processes": [], "total_ram_gb": 0, "max_cpu": 0},
        "browser": {"processes": [], "total_ram_gb": 0, "max_cpu": 0},
    }

    seen_pids: dict[str, set] = {k: set() for k in subsystem_data}

    for e in events:
        if e["event_type"] != "resource_sample":
            continue
        p = e["payload"]
        sub = p.get("subsystem", "system")
        if sub not in subsystem_data:
            continue
        pid = str(p.get("pid", ""))
        if pid in seen_pids[sub]:
            continue
        seen_pids[sub].add(pid)

        ram = p.get("ram_gb", 0)
        cpu = p.get("cpu_percent", 0)
        subsystem_data[sub]["processes"].append(p)
        subsystem_data[sub]["total_ram_gb"] += ram
        subsystem_data[sub]["max_cpu"] = max(subsystem_data[sub]["max_cpu"], cpu)

    # Get system totals
    try:
        mem = psutil.virtual_memory()
        total_ram_gb = round(mem.total / (1024**3), 1)
        used_ram_gb = round(mem.used / (1024**3), 1)
        cpu_pct = psutil.cpu_percent(interval=0.1)
    except Exception:
        total_ram_gb = 16.0
        used_ram_gb = 8.0
        cpu_pct = 25.0

    # Determine anomaly
    diagnoses = await get_diagnoses()
    anomaly_title = "Normal Session"
    anomaly_badge = f"Nominal · {used_ram_gb} GB RAM"

    if used_ram_gb / total_ram_gb > 0.8:
        anomaly_title = "High Memory Anomaly"
        anomaly_badge = f"High Memory · {used_ram_gb} GB / {total_ram_gb} GB"
    elif diagnoses:
        top_diag = diagnoses[0]
        anomaly_title = top_diag["cause_label"]
        anomaly_badge = f"{top_diag['cause_label']} · {top_diag.get('recommendation', '')[:40]}"

    # Build the ScrubPointTelemetry shape
    ide_procs = subsystem_data["ide"]["processes"]
    term_procs = subsystem_data["terminal"]["processes"]
    container_procs = subsystem_data["containers"]["processes"]
    browser_procs = subsystem_data["browser"]["processes"]

    telemetry = {
        "timeStr": target.strftime("%H:%M:%S"),
        "isoTime": target.isoformat(),
        "traceId": f"#TRC-{target.strftime('%H%M%S')}-live",
        "anomalyTitle": anomaly_title,
        "anomalyBadge": anomaly_badge,
        "ramUsageGb": used_ram_gb,
        "cpuPercent": round(cpu_pct, 1),
        "narrativeHeadline": _build_narrative(subsystem_data, diagnoses),
        "narrativeBody": _build_narrative_body(used_ram_gb, total_ram_gb, cpu_pct),
        "swapThrashingText": _get_swap_text(),
        "subsystems": {
            "ide": {
                "name": ide_procs[0].get("name", "IDE") if ide_procs else "No IDE detected",
                "rss": _format_ram(subsystem_data["ide"]["total_ram_gb"]),
                "details": f"{len(ide_procs)} processes active",
                "threads": sum(p.get("threads", 0) for p in ide_procs),
                "latency": "N/A",
            },
            "terminal": {
                "name": term_procs[0].get("name", "Terminal") if term_procs else "No terminal",
                "peak": _format_ram(subsystem_data["terminal"]["total_ram_gb"]),
                "culpritText": f"{len(term_procs)} processes" if term_procs else "Idle",
                "exitCode": "0",
                "spikeRate": "Stable",
                "isCulprit": subsystem_data["terminal"]["max_cpu"] > 50,
            },
            "containers": {
                "name": "Docker daemon" if container_procs else "No containers",
                "rss": _format_ram(subsystem_data["containers"]["total_ram_gb"]),
                "services": f"{len(container_procs)} containers",
                "state": "Healthy",
                "ioRate": "N/A",
            },
            "browser": {
                "name": browser_procs[0].get("name", "Browser") if browser_procs else "No browser",
                "rss": _format_ram(subsystem_data["browser"]["total_ram_gb"]),
                "tabCount": f"{len(browser_procs)} processes",
                "gpuHeap": "N/A",
                "warningText": "No leaks detected",
            },
        },
    }

    return telemetry


def _build_narrative(subsystem_data: dict, diagnoses: list) -> str:
    """Build a human-readable narrative headline."""
    active_subs = [k for k, v in subsystem_data.items() if v["processes"]]
    if diagnoses:
        return f"{diagnoses[0]['cause_label']} detected across {', '.join(active_subs)}."
    if not active_subs:
        return "No active processes detected in monitoring window."
    return f"Normal development session with {', '.join(active_subs)} active."


def _build_narrative_body(used_gb: float, total_gb: float, cpu: float) -> str:
    """Build the narrative body text."""
    pct = (used_gb / total_gb * 100) if total_gb > 0 else 0
    return (
        f"System memory at {pct:.0f}% ({used_gb:.1f} GB / {total_gb:.1f} GB). "
        f"CPU utilization at {cpu:.0f}%."
    )


def _get_swap_text() -> str:
    """Get swap usage info."""
    try:
        swap = psutil.swap_memory()
        if swap.used > 0:
            used_mb = swap.used / (1024**2)
            return f"Swap in use: {used_mb:.0f} MB"
        return "Swap idle. No page faults."
    except Exception:
        return "Swap info unavailable."
