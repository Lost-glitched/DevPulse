"""
System Resource Collector — psutil-based CPU/RAM/process sampling.

Runs as an asyncio background task, polling process_iter() on a configurable
interval.  Writes resource_sample events to the store with deduplication
(only writes when values change beyond a threshold).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import psutil

from backend.config import (
    CPU_CHANGE_THRESHOLD,
    PROCESS_CATEGORY_MAP,
    RAM_CHANGE_THRESHOLD,
    SYSTEM_POLL_INTERVAL,
)
from backend.db.store import make_event, write_events_batch
from backend.project_context import detect_project_id

logger = logging.getLogger("devpulse.collectors.system")

_project_id: str | None = None

# In-memory dedup cache: pid -> last written values
_last_samples: dict[int, dict[str, float]] = {}


def classify_process(proc_name: str, cmdline_str: str) -> tuple[str, str] | None:
    """
    Match a process name/cmdline against the category mapping table.
    Returns (category, subsystem_title) or None if unrecognised.
    """
    lower_name = proc_name.lower()
    lower_cmd = cmdline_str.lower()
    for pattern, category, title in PROCESS_CATEGORY_MAP:
        if pattern in lower_name or pattern in lower_cmd:
            return category, title
    return None


def _should_write(pid: int, cpu_pct: float, ram_gb: float) -> bool:
    """Check if the sample differs enough from the last written one."""
    prev = _last_samples.get(pid)
    if prev is None:
        return True
    if abs(cpu_pct - prev["cpu"]) > CPU_CHANGE_THRESHOLD:
        return True
    if abs(ram_gb - prev["ram"]) > RAM_CHANGE_THRESHOLD:
        return True
    return False


async def collect_once() -> list[dict[str, Any]]:
    """
    Sample all processes once, classify them, and return events
    for those that pass the dedup threshold.
    """
    events: list[dict[str, Any]] = []

    for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info", "status", "num_threads"]):
        try:
            info = proc.info
            pid = info["pid"]
            name = info["name"] or ""
            cmdline_str = ""
            try:
                cmdline_str = " ".join(proc.cmdline())
            except (psutil.AccessDenied, psutil.ZombieProcess, OSError):
                pass

            classification = classify_process(name, cmdline_str)
            if classification is None:
                continue

            category, subsystem_title = classification
            mem = info.get("memory_info")
            ram_bytes = mem.rss if mem else 0
            ram_gb = round(ram_bytes / (1024 ** 3), 3)
            cpu_pct = round(info.get("cpu_percent", 0.0) or 0.0, 1)
            threads = info.get("num_threads", 0) or 0

            if not _should_write(pid, cpu_pct, ram_gb):
                continue

            _last_samples[pid] = {"cpu": cpu_pct, "ram": ram_gb}

            payload = {
                "pid": pid,
                "name": name,
                "subsystem": category,
                "subsystem_title": subsystem_title,
                "ram_gb": ram_gb,
                "ram_display": f"{ram_gb} GB" if ram_gb >= 1.0 else f"{int(ram_gb * 1024)} MB",
                "cpu_percent": cpu_pct,
                "threads": threads,
                "cmdline": cmdline_str[:200],  # truncate long cmdlines
            }

            global _project_id
            if _project_id is None:
                _project_id = detect_project_id()

            event = make_event(
                source="system",
                category=category,
                event_type="resource_sample",
                payload=payload,
                project_id=_project_id,
            )
            events.append(event)

        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
        except Exception as exc:
            logger.debug("Error sampling PID %s: %s", proc.pid, exc)
            continue

    return events


async def run_system_collector(shutdown_event: asyncio.Event) -> None:
    """
    Main collector loop.  Runs until shutdown_event is set.
    """
    logger.info("System collector started (interval=%ss)", SYSTEM_POLL_INTERVAL)

    # Initial cpu_percent call returns 0.0 — prime it first
    for proc in psutil.process_iter(["cpu_percent"]):
        try:
            proc.cpu_percent()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    while not shutdown_event.is_set():
        try:
            events = await collect_once()
            if events:
                await write_events_batch(events)
                logger.debug("Wrote %d system samples", len(events))
        except Exception as exc:
            logger.error("System collector error: %s", exc)

        try:
            await asyncio.wait_for(shutdown_event.wait(), timeout=SYSTEM_POLL_INTERVAL)
        except asyncio.TimeoutError:
            pass

    logger.info("System collector stopped")
