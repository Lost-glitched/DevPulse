"""
DevPulse Diagnostic Engine — rule-based anomaly detection.

Runs as a background asyncio task on a slower cadence (every 15s).
Evaluates rules.yaml against recent events and writes diagnoses
to the store for the API layer to surface.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import yaml

from backend.config import (
    DIAG_CPU_SUSTAINED_PCT,
    DIAG_CPU_SUSTAINED_SAMPLES,
    DIAG_DOCKER_OVERHEAD_GB,
    DIAG_IDLE_PROCESS_MINUTES,
    DIAG_LEAK_GROWTH_MB_PER_MIN,
    DIAG_MEMORY_PRESSURE_PCT,
    DIAGNOSTIC_INTERVAL,
)
from backend.db.store import query_events, write_diagnosis

logger = logging.getLogger("devpulse.diagnostics")

# Load rules once at import time
_rules_path = Path(__file__).parent / "rules.yaml"
_rules: list[dict] = []

try:
    with open(_rules_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
        _rules = data.get("rules", [])
    logger.info("Loaded %d diagnostic rules", len(_rules))
except Exception as exc:
    logger.error("Failed to load diagnostic rules: %s", exc)


def _make_diag_id(rule_id: str, process_key: str) -> str:
    """Deterministic ID for a diagnosis so we can upsert."""
    raw = f"{rule_id}:{process_key}"
    return hashlib.md5(raw.encode()).hexdigest()[:16]


async def _evaluate_memory_pressure(events: list[dict]) -> list[dict]:
    """Check if total system RAM is above threshold."""
    import psutil
    diagnoses: list[dict] = []

    try:
        mem = psutil.virtual_memory()
        if mem.percent > DIAG_MEMORY_PRESSURE_PCT:
            diag = {
                "id": _make_diag_id("memory_pressure", "system"),
                "process_key": "system",
                "cause_label": "Memory Pressure",
                "confidence": 0.9,
                "recommendation": f"System RAM at {mem.percent:.0f}% ({mem.used / (1024**3):.1f} GB / {mem.total / (1024**3):.1f} GB). Close unused apps.",
                "signal_values": {
                    "ram_percent": mem.percent,
                    "ram_used_gb": round(mem.used / (1024**3), 2),
                    "ram_total_gb": round(mem.total / (1024**3), 2),
                },
            }
            diagnoses.append(diag)
    except Exception as exc:
        logger.debug("Memory pressure check failed: %s", exc)

    return diagnoses


async def _evaluate_high_cpu_processes(events: list[dict]) -> list[dict]:
    """Flag processes with sustained high CPU."""
    diagnoses: list[dict] = []

    # Group recent samples by pid
    pid_samples: dict[str, list[dict]] = {}
    for e in events:
        if e["event_type"] != "resource_sample":
            continue
        p = e["payload"]
        pid_key = str(p.get("pid", ""))
        if pid_key:
            pid_samples.setdefault(pid_key, []).append(p)

    for pid_key, samples in pid_samples.items():
        if len(samples) < DIAG_CPU_SUSTAINED_SAMPLES:
            continue
        recent = samples[:DIAG_CPU_SUSTAINED_SAMPLES]
        avg_cpu = sum(s.get("cpu_percent", 0) for s in recent) / len(recent)

        if avg_cpu > DIAG_CPU_SUSTAINED_PCT:
            name = recent[0].get("name", "Unknown")
            diag = {
                "id": _make_diag_id("high_cpu", pid_key),
                "process_key": f"pid:{pid_key}",
                "cause_label": "High CPU",
                "confidence": 0.85,
                "recommendation": f"{name} (PID {pid_key}) sustained {avg_cpu:.0f}% CPU. Consider restarting.",
                "signal_values": {
                    "avg_cpu_percent": round(avg_cpu, 1),
                    "process_name": name,
                    "sample_count": len(recent),
                },
            }
            diagnoses.append(diag)

    return diagnoses


async def _evaluate_docker_overhead(events: list[dict]) -> list[dict]:
    """Flag when total Docker RAM exceeds threshold."""
    diagnoses: list[dict] = []

    # Get most recent sample per container
    container_ram: dict[str, float] = {}
    for e in events:
        if e["event_type"] != "resource_sample" or e["category"] != "containers":
            continue
        p = e["payload"]
        cid = str(p.get("container_id", p.get("pid", "")))
        if cid and cid not in container_ram:
            container_ram[cid] = p.get("ram_gb", 0)

    total_gb = sum(container_ram.values())
    if total_gb > DIAG_DOCKER_OVERHEAD_GB:
        diag = {
            "id": _make_diag_id("docker_overhead", "containers"),
            "process_key": "category:containers",
            "cause_label": "Docker Overhead",
            "confidence": 0.8,
            "recommendation": f"Docker containers using {total_gb:.1f} GB total. Set memory limits or stop unused containers.",
            "signal_values": {
                "total_ram_gb": round(total_gb, 2),
                "container_count": len(container_ram),
            },
        }
        diagnoses.append(diag)

    return diagnoses


async def _evaluate_memory_leaks(events: list[dict]) -> list[dict]:
    """Detect processes with steadily growing RAM."""
    diagnoses: list[dict] = []

    # Group samples by pid, ordered by time
    pid_samples: dict[str, list[tuple[str, float]]] = {}
    for e in events:
        if e["event_type"] != "resource_sample":
            continue
        p = e["payload"]
        pid_key = str(p.get("pid", ""))
        if pid_key:
            pid_samples.setdefault(pid_key, []).append(
                (e["timestamp"], p.get("ram_gb", 0))
            )

    for pid_key, samples in pid_samples.items():
        if len(samples) < 3:
            continue

        # Sort by time ascending
        samples.sort(key=lambda x: x[0])

        # Calculate growth rate (MB/min)
        first_ts, first_ram = samples[0]
        last_ts, last_ram = samples[-1]

        try:
            t0 = datetime.fromisoformat(first_ts.replace("Z", "+00:00"))
            t1 = datetime.fromisoformat(last_ts.replace("Z", "+00:00"))
            minutes = (t1 - t0).total_seconds() / 60.0
            if minutes < 1.0:
                continue

            growth_mb = (last_ram - first_ram) * 1024
            rate_mb_per_min = growth_mb / minutes

            if rate_mb_per_min > DIAG_LEAK_GROWTH_MB_PER_MIN:
                # Find the process name from the most recent sample
                name = "Unknown"
                for e in events:
                    if e["event_type"] == "resource_sample":
                        p = e["payload"]
                        if str(p.get("pid", "")) == pid_key:
                            name = p.get("name", "Unknown")
                            break

                diag = {
                    "id": _make_diag_id("memory_leak", pid_key),
                    "process_key": f"pid:{pid_key}",
                    "cause_label": "Memory Leak",
                    "confidence": 0.85,
                    "recommendation": f"Restart worker or enable memory limit",
                    "signal_values": {
                        "process_name": name,
                        "growth_rate_mb_per_min": round(rate_mb_per_min, 1),
                        "current_ram_gb": round(last_ram, 3),
                        "leak_rate_display": f"+{rate_mb_per_min:.0f} MB/min",
                    },
                }
                diagnoses.append(diag)
        except Exception:
            continue

    return diagnoses


async def run_diagnostics(shutdown_event: asyncio.Event) -> None:
    """Main diagnostic engine loop."""
    logger.info("Diagnostic engine started (interval=%ss)", DIAGNOSTIC_INTERVAL)

    while not shutdown_event.is_set():
        try:
            # Query last 5 minutes of events
            cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(
                timespec="milliseconds"
            )
            events = await query_events(start=cutoff, limit=2000)

            # Run all evaluators
            all_diagnoses: list[dict] = []
            all_diagnoses.extend(await _evaluate_memory_pressure(events))
            all_diagnoses.extend(await _evaluate_high_cpu_processes(events))
            all_diagnoses.extend(await _evaluate_docker_overhead(events))
            all_diagnoses.extend(await _evaluate_memory_leaks(events))

            # Write results
            for diag in all_diagnoses:
                await write_diagnosis(diag)

            if all_diagnoses:
                logger.debug("Wrote %d diagnoses", len(all_diagnoses))

        except Exception as exc:
            logger.error("Diagnostic engine error: %s", exc)

        try:
            await asyncio.wait_for(shutdown_event.wait(), timeout=DIAGNOSTIC_INTERVAL)
        except asyncio.TimeoutError:
            pass

    logger.info("Diagnostic engine stopped")
