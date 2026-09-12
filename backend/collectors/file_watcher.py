"""
File Watcher Collector — watchdog-based file save detection.

Uses the watchdog library to monitor a project directory for file
modifications and writes file_saved events to the store.
"""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

from backend.config import BASE_DIR
from backend.db.store import make_event, write_event

logger = logging.getLogger("devpulse.collectors.file_watcher")

# Directories to exclude from watching
EXCLUDE_DIRS = {
    "node_modules", ".git", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", ".nuxt", "target", ".idea",
    ".vs", ".vscode", "vendor",
}

# Extensions to watch
WATCH_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".rs", ".go",
    ".java", ".cpp", ".c", ".h", ".css", ".html", ".json",
    ".yaml", ".yml", ".toml", ".md", ".sql",
}


def _should_watch(path: str) -> bool:
    """Check if the file path should be watched."""
    p = Path(path)
    # Skip excluded directories
    for part in p.parts:
        if part in EXCLUDE_DIRS:
            return False
    # Check extension
    if p.suffix.lower() in WATCH_EXTENSIONS:
        return True
    return False


async def _handle_file_event(filepath: str, event_kind: str) -> None:
    """Create and write a file_saved event."""
    try:
        p = Path(filepath)
        size_bytes = p.stat().st_size if p.exists() else 0

        payload = {
            "file_path": str(p),
            "file_name": p.name,
            "extension": p.suffix,
            "size_bytes": size_bytes,
            "kind": event_kind,
        }

        event = make_event(
            source="editor",
            category="ide",
            event_type="file_saved",
            payload=payload,
        )
        await write_event(event)
        logger.debug("Recorded file event: %s %s", event_kind, p.name)

    except Exception as exc:
        logger.debug("Error handling file event for %s: %s", filepath, exc)


async def run_file_watcher(shutdown_event: asyncio.Event, watch_path: str | None = None) -> None:
    """
    Main file watcher loop using watchdog.
    Falls back gracefully if watchdog is unavailable.
    """
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler, FileModifiedEvent, FileCreatedEvent
    except ImportError:
        logger.warning("watchdog not installed — file watcher disabled")
        await shutdown_event.wait()
        return

    target_path = watch_path or str(Path.cwd())
    logger.info("File watcher starting on: %s", target_path)

    loop = asyncio.get_event_loop()

    class DevPulseHandler(FileSystemEventHandler):
        def on_modified(self, event):
            if event.is_directory:
                return
            if _should_watch(event.src_path):
                asyncio.run_coroutine_threadsafe(
                    _handle_file_event(event.src_path, "modified"),
                    loop,
                )

        def on_created(self, event):
            if event.is_directory:
                return
            if _should_watch(event.src_path):
                asyncio.run_coroutine_threadsafe(
                    _handle_file_event(event.src_path, "created"),
                    loop,
                )

    observer = Observer()
    handler = DevPulseHandler()

    try:
        observer.schedule(handler, target_path, recursive=True)
        observer.start()
        logger.info("File watcher active")

        # Wait for shutdown
        await shutdown_event.wait()

    except Exception as exc:
        logger.error("File watcher error: %s", exc)
    finally:
        observer.stop()
        observer.join(timeout=5)
        logger.info("File watcher stopped")
