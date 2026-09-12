"""
DevPulse Event Store — async SQLite read/write helpers.

Uses aiosqlite for non-blocking I/O inside FastAPI's async event loop.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiosqlite

from backend.config import DB_PATH, SCHEMA_PATH


async def get_db() -> aiosqlite.Connection:
    """Open (and create if needed) the SQLite database with WAL mode."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA synchronous=NORMAL")
    return db


async def init_db() -> None:
    """Run schema.sql to create tables and indices if they don't exist, and migrate columns."""
    schema_sql = Path(SCHEMA_PATH).read_text(encoding="utf-8")
    try:
        db = await get_db()
        try:
            # Check if events table exists; if so, ensure project_id column exists before running schema indices
            cursor = await db.execute("PRAGMA table_info(events)")
            columns = [row[1] for row in await cursor.fetchall()]
            if columns and "project_id" not in columns:
                await db.execute("ALTER TABLE events ADD COLUMN project_id TEXT")
                await db.commit()

            await db.executescript(schema_sql)
            await db.commit()
        finally:
            await db.close()
    except Exception as e:
        if "malformed" in str(e).lower() or "corrupt" in str(e).lower():
            # Automatically recreate database if disk image is malformed
            for ext in ["", "-shm", "-wal"]:
                p = Path(f"{DB_PATH}{ext}")
                if p.exists():
                    try:
                        p.unlink()
                    except Exception:
                        pass
            db = await get_db()
            try:
                await db.executescript(schema_sql)
                await db.commit()
            finally:
                await db.close()
        else:
            raise


def make_event(
    source: str,
    category: str,
    event_type: str,
    payload: dict[str, Any] | None = None,
    task_context_id: str | None = None,
    project_id: str | None = None,
) -> dict[str, Any]:
    """Create a well-formed event dict ready for insertion."""
    return {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        "source": source,
        "category": category,
        "event_type": event_type,
        "payload": payload or {},
        "task_context_id": task_context_id,
        "project_id": project_id,
    }


async def write_event(event: dict[str, Any]) -> None:
    """Insert a single event into the store."""
    db = await get_db()
    try:
        await db.execute(
            """INSERT OR IGNORE INTO events
               (id, timestamp, source, category, event_type, payload, task_context_id, project_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                event["id"],
                event["timestamp"],
                event["source"],
                event["category"],
                event["event_type"],
                json.dumps(event["payload"]),
                event.get("task_context_id"),
                event.get("project_id"),
            ),
        )
        await db.commit()
    finally:
        await db.close()


async def write_events_batch(events: list[dict[str, Any]]) -> None:
    """Batch-insert multiple events efficiently."""
    if not events:
        return
    db = await get_db()
    try:
        await db.executemany(
            """INSERT OR IGNORE INTO events
               (id, timestamp, source, category, event_type, payload, task_context_id, project_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                (
                    e["id"],
                    e["timestamp"],
                    e["source"],
                    e["category"],
                    e["event_type"],
                    json.dumps(e["payload"]),
                    e.get("task_context_id"),
                    e.get("project_id"),
                )
                for e in events
            ],
        )
        await db.commit()
    finally:
        await db.close()


async def query_events(
    start: str | None = None,
    end: str | None = None,
    source: str | None = None,
    category: str | None = None,
    event_type: str | None = None,
    project_id: str | None = None,
    limit: int = 1000,
) -> list[dict[str, Any]]:
    """Query events with optional filters. Returns newest-first."""
    conditions: list[str] = []
    params: list[Any] = []

    if start:
        conditions.append("timestamp >= ?")
        params.append(start)
    if end:
        conditions.append("timestamp <= ?")
        params.append(end)
    if source:
        conditions.append("source = ?")
        params.append(source)
    if category:
        conditions.append("category = ?")
        params.append(category)
    if event_type:
        conditions.append("event_type = ?")
        params.append(event_type)
    if project_id:
        conditions.append("project_id = ?")
        params.append(project_id)

    where_clause = (" WHERE " + " AND ".join(conditions)) if conditions else ""
    query = f"SELECT * FROM events{where_clause} ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)

    db = await get_db()
    try:
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
        results = []
        for row in rows:
            keys = row.keys()
            results.append({
                "id": row["id"],
                "timestamp": row["timestamp"],
                "source": row["source"],
                "category": row["category"],
                "event_type": row["event_type"],
                "payload": json.loads(row["payload"]),
                "task_context_id": row["task_context_id"],
                "project_id": row["project_id"] if "project_id" in keys else None,
            })
        return results
    finally:
        await db.close()


# ---------------------------------------------------------------------------
# Diagnosis helpers
# ---------------------------------------------------------------------------

async def write_diagnosis(diagnosis: dict[str, Any]) -> None:
    """Upsert a diagnostic result."""
    db = await get_db()
    try:
        await db.execute(
            """INSERT OR REPLACE INTO diagnoses
               (id, process_key, cause_label, confidence, recommendation, signal_values, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                diagnosis["id"],
                diagnosis["process_key"],
                diagnosis["cause_label"],
                diagnosis["confidence"],
                diagnosis.get("recommendation", ""),
                json.dumps(diagnosis.get("signal_values", {})),
                datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            ),
        )
        await db.commit()
    finally:
        await db.close()


async def get_diagnoses() -> list[dict[str, Any]]:
    """Get all current diagnoses."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM diagnoses ORDER BY updated_at DESC"
        )
        rows = await cursor.fetchall()
        results = []
        for row in rows:
            results.append({
                "id": row["id"],
                "process_key": row["process_key"],
                "cause_label": row["cause_label"],
                "confidence": row["confidence"],
                "recommendation": row["recommendation"],
                "signal_values": json.loads(row["signal_values"]),
                "updated_at": row["updated_at"],
            })
        return results
    finally:
        await db.close()


async def clear_old_events(hours: int = 24) -> int:
    """Delete events older than `hours`. Returns count deleted."""
    cutoff = datetime.now(timezone.utc)
    from datetime import timedelta
    cutoff = (cutoff - timedelta(hours=hours)).isoformat(timespec="milliseconds")
    db = await get_db()
    try:
        cursor = await db.execute("DELETE FROM events WHERE timestamp < ?", (cutoff,))
        await db.commit()
        return cursor.rowcount
    finally:
        await db.close()
