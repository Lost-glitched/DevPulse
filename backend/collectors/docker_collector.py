"""
Docker Container Collector — polls Docker Desktop container stats.

Uses the Docker Python SDK.  Gracefully degrades when Docker is not running.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from backend.config import DOCKER_POLL_INTERVAL
from backend.db.store import make_event, write_events_batch
from backend.project_context import detect_project_id

logger = logging.getLogger("devpulse.collectors.docker")

_project_id: str | None = None

# In-memory dedup: container_id -> last written values
_last_samples: dict[str, dict[str, float]] = {}


def _get_docker_client():
    """Try to connect to the Docker daemon.  Returns None on failure."""
    try:
        import docker
        client = docker.from_env()
        client.ping()
        return client
    except Exception:
        return None


def _calc_cpu_percent(stats: dict) -> float:
    """Calculate CPU percent from Docker stats JSON."""
    try:
        cpu_delta = (
            stats["cpu_stats"]["cpu_usage"]["total_usage"]
            - stats["precpu_stats"]["cpu_usage"]["total_usage"]
        )
        system_delta = (
            stats["cpu_stats"]["system_cpu_usage"]
            - stats["precpu_stats"]["system_cpu_usage"]
        )
        num_cpus = stats["cpu_stats"].get("online_cpus", 1)
        if system_delta > 0 and cpu_delta > 0:
            return round((cpu_delta / system_delta) * num_cpus * 100.0, 1)
    except (KeyError, TypeError, ZeroDivisionError):
        pass
    return 0.0


def _collect_container_stats(client) -> list[dict[str, Any]]:
    """Collect stats from all running containers."""
    events: list[dict[str, Any]] = []

    try:
        containers = client.containers.list()
    except Exception as exc:
        logger.debug("Failed to list containers: %s", exc)
        return events

    for container in containers:
        try:
            stats = container.stats(stream=False)
            name = container.name or container.short_id
            container_id = container.short_id

            # Memory
            mem_usage = stats.get("memory_stats", {}).get("usage", 0)
            mem_limit = stats.get("memory_stats", {}).get("limit", 1)
            ram_gb = round(mem_usage / (1024 ** 3), 3)

            # CPU
            cpu_pct = _calc_cpu_percent(stats)

            # Dedup
            prev = _last_samples.get(container_id)
            if prev is not None:
                if abs(cpu_pct - prev["cpu"]) < 1.0 and abs(ram_gb - prev["ram"]) < 0.01:
                    continue
            _last_samples[container_id] = {"cpu": cpu_pct, "ram": ram_gb}

            # Image name
            image_name = ""
            try:
                image_name = container.image.tags[0] if container.image.tags else str(container.image.short_id)
            except Exception:
                pass

            payload = {
                "container_id": container_id,
                "name": name,
                "image": image_name,
                "subsystem": "containers",
                "subsystem_title": "DOCKER / CONTAINERS",
                "ram_gb": ram_gb,
                "ram_display": f"{ram_gb} GB" if ram_gb >= 1.0 else f"{int(ram_gb * 1024)} MB",
                "cpu_percent": cpu_pct,
                "status": container.status,
                "pid": container_id,
            }

            global _project_id
            if _project_id is None:
                _project_id = detect_project_id()

            event = make_event(
                source="system",
                category="containers",
                event_type="resource_sample",
                payload=payload,
                project_id=_project_id,
            )
            events.append(event)

        except Exception as exc:
            logger.debug("Error collecting stats for container %s: %s", container.short_id, exc)
            continue

    return events


async def run_docker_collector(shutdown_event: asyncio.Event) -> None:
    """
    Main Docker collector loop.  Gracefully degrades when Docker is not available.
    """
    logger.info("Docker collector starting (interval=%ss)", DOCKER_POLL_INTERVAL)

    while not shutdown_event.is_set():
        try:
            client = _get_docker_client()
            if client is None:
                logger.debug("Docker not available, skipping collection")
            else:
                events = await asyncio.get_event_loop().run_in_executor(
                    None, _collect_container_stats, client
                )
                if events:
                    await write_events_batch(events)
                    logger.debug("Wrote %d Docker samples", len(events))
                try:
                    client.close()
                except Exception:
                    pass
        except Exception as exc:
            logger.error("Docker collector error: %s", exc)

        try:
            await asyncio.wait_for(shutdown_event.wait(), timeout=DOCKER_POLL_INTERVAL)
        except asyncio.TimeoutError:
            pass

    logger.info("Docker collector stopped")
