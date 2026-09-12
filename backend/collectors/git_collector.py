"""
Git Collector — ingests git log and watches for new commits.

On startup, reads recent history.  Then polls periodically for new commits
and branch changes.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from backend.config import GIT_POLL_INTERVAL
from backend.db.store import make_event, write_events_batch

logger = logging.getLogger("devpulse.collectors.git")

# Track the last seen commit hash to detect new commits
_last_seen_hash: str | None = None
_repo = None


def _get_repo(search_path: str | None = None):
    """Try to find a git repo starting from the current working directory."""
    global _repo
    if _repo is not None:
        return _repo
    try:
        from git import Repo, InvalidGitRepositoryError
        search = search_path or str(Path.cwd())
        _repo = Repo(search, search_parent_directories=True)
        return _repo
    except Exception:
        return None


def _ingest_recent_history(repo, max_commits: int = 50) -> list[dict[str, Any]]:
    """Read the last N commits and create events for them."""
    global _last_seen_hash
    events: list[dict[str, Any]] = []

    try:
        commits = list(repo.iter_commits(max_count=max_commits))
    except Exception as exc:
        logger.debug("Failed to read git log: %s", exc)
        return events

    if commits:
        _last_seen_hash = commits[0].hexsha

    for commit in reversed(commits):  # oldest first
        payload = {
            "hash": commit.hexsha[:12],
            "full_hash": commit.hexsha,
            "message": commit.message.strip()[:200],
            "author": str(commit.author),
            "authored_date": commit.authored_datetime.isoformat(),
            "files_changed": len(commit.stats.files) if commit.stats else 0,
            "insertions": commit.stats.total.get("insertions", 0) if commit.stats else 0,
            "deletions": commit.stats.total.get("deletions", 0) if commit.stats else 0,
        }
        event = make_event(
            source="git",
            category="git",
            event_type="git_commit",
            payload=payload,
        )
        # Override timestamp to match commit time
        event["timestamp"] = commit.authored_datetime.isoformat(timespec="milliseconds")
        events.append(event)

    return events


def _check_new_commits(repo) -> list[dict[str, Any]]:
    """Check for commits newer than _last_seen_hash."""
    global _last_seen_hash
    events: list[dict[str, Any]] = []

    try:
        head_commit = repo.head.commit
    except Exception:
        return events

    if _last_seen_hash is None:
        _last_seen_hash = head_commit.hexsha
        return events

    if head_commit.hexsha == _last_seen_hash:
        return events

    # Collect new commits
    try:
        new_commits = []
        for commit in repo.iter_commits(max_count=20):
            if commit.hexsha == _last_seen_hash:
                break
            new_commits.append(commit)

        for commit in reversed(new_commits):
            payload = {
                "hash": commit.hexsha[:12],
                "full_hash": commit.hexsha,
                "message": commit.message.strip()[:200],
                "author": str(commit.author),
                "authored_date": commit.authored_datetime.isoformat(),
                "files_changed": len(commit.stats.files) if commit.stats else 0,
                "insertions": commit.stats.total.get("insertions", 0) if commit.stats else 0,
                "deletions": commit.stats.total.get("deletions", 0) if commit.stats else 0,
            }
            event = make_event(
                source="git",
                category="git",
                event_type="git_commit",
                payload=payload,
            )
            events.append(event)

        _last_seen_hash = head_commit.hexsha

    except Exception as exc:
        logger.debug("Error checking new commits: %s", exc)

    # Also check for branch change
    try:
        active_branch = repo.active_branch.name
        payload = {
            "branch": active_branch,
            "head": head_commit.hexsha[:12],
        }
        # We'll always record branch info — the timeline can use it
        event = make_event(
            source="git",
            category="git",
            event_type="git_checkout",
            payload=payload,
        )
        events.append(event)
    except Exception:
        pass  # detached HEAD, etc.

    return events


async def run_git_collector(shutdown_event: asyncio.Event) -> None:
    """Main git collector loop."""
    logger.info("Git collector starting (interval=%ss)", GIT_POLL_INTERVAL)

    loop = asyncio.get_event_loop()

    # Initial ingestion
    repo = await loop.run_in_executor(None, _get_repo, None)
    if repo is None:
        logger.warning("No git repository found — git collector will retry periodically")

    if repo:
        events = await loop.run_in_executor(None, _ingest_recent_history, repo, 50)
        if events:
            await write_events_batch(events)
            logger.info("Ingested %d historical git events", len(events))

    while not shutdown_event.is_set():
        try:
            if repo is None:
                repo = await loop.run_in_executor(None, _get_repo, None)

            if repo:
                events = await loop.run_in_executor(None, _check_new_commits, repo)
                if events:
                    await write_events_batch(events)
                    logger.debug("Wrote %d new git events", len(events))
        except Exception as exc:
            logger.error("Git collector error: %s", exc)

        try:
            await asyncio.wait_for(shutdown_event.wait(), timeout=GIT_POLL_INTERVAL)
        except asyncio.TimeoutError:
            pass

    logger.info("Git collector stopped")
