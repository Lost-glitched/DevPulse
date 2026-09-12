"""
DevPulse Shadow Repository — Local, automatic version control.

Creates and maintains a mirror Git repository inside `.devpulse/shadow-repo/`
that snapshots the workspace state independently of user git commits.
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
from pathlib import Path
from typing import Any

from git import Repo

from backend.db.store import make_event, write_event
from backend.project_context import detect_project_id

logger = logging.getLogger("devpulse.shadow_repo.repo")

_snapshot_lock = asyncio.Lock()

EXCLUDE_DIRS = {
    ".git", ".devpulse", "node_modules", ".venv", "venv", "env",
    "__pycache__", "dist", "build", ".next", ".nuxt", "target",
    ".idea", ".vscode", ".pytest_cache",
}

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


def _ensure_gitignore(root_path: Path) -> None:
    """Ensure .devpulse/ is included in the project's .gitignore."""
    gitignore_path = root_path / ".gitignore"
    try:
        if gitignore_path.exists():
            content = gitignore_path.read_text(encoding="utf-8", errors="ignore")
            if ".devpulse" not in content:
                with gitignore_path.open("a", encoding="utf-8") as f:
                    f.write("\n# DevPulse shadow repository\n.devpulse/\n")
        else:
            gitignore_path.write_text("# DevPulse shadow repository\n.devpulse/\n", encoding="utf-8")
    except Exception as exc:
        logger.debug("Failed to update .gitignore in %s: %s", root_path, exc)


def init_shadow_repo(project_root: str | None = None) -> str:
    """
    Ensure the shadow repo directory exists and is an initialized Git repository.
    Returns the absolute path to the shadow repository.
    """
    root = Path(project_root or detect_project_id()).resolve()
    shadow_dir = root / ".devpulse" / "shadow-repo"
    shadow_dir.mkdir(parents=True, exist_ok=True)

    _ensure_gitignore(root)

    git_dir = shadow_dir / ".git"
    if not git_dir.exists():
        logger.info("Initializing shadow repository at %s", shadow_dir)
        repo = Repo.init(str(shadow_dir))
        with repo.config_writer() as config:
            config.set_value("user", "name", "DevPulse")
            config.set_value("user", "email", "devpulse@local")
            config.set_value("commit", "gpgsign", "false")
    else:
        repo = Repo(str(shadow_dir))

    return str(shadow_dir)


def _get_project_files(root_path: Path) -> set[str]:
    """
    Collect relative paths of all relevant files in the project.
    Uses git if root is a repo; falls back to directory walk.
    """
    rel_files: set[str] = set()

    try:
        real_repo = Repo(str(root_path), search_parent_directories=False)
        tracked = real_repo.git.ls_files().splitlines()
        untracked = real_repo.git.ls_files(others=True, exclude_standard=True).splitlines()
        for f in tracked + untracked:
            clean = f.strip().replace("\\", "/")
            if clean and not clean.startswith(".devpulse/"):
                rel_files.add(clean)
        return rel_files
    except Exception:
        pass

    # Fallback to filesystem walk
    for current_dir, dirs, files in os.walk(str(root_path)):
        rel_dir = Path(current_dir).relative_to(root_path)
        # Prune excluded directories
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith(".")]

        for filename in files:
            full_path = Path(current_dir) / filename
            try:
                if full_path.stat().st_size > MAX_FILE_SIZE_BYTES:
                    continue
            except OSError:
                continue
            rel_file = (rel_dir / filename).as_posix()
            if not rel_file.startswith(".devpulse/"):
                rel_files.add(rel_file)

    return rel_files


def _sync_and_commit_sync(root_path: Path, shadow_path: Path, trigger: str) -> tuple[str, str | None]:
    """
    Synchronously copy files from root to shadow, stage, commit, and return
    (shadow_commit_hash, real_git_head_or_none).
    """
    shadow_repo = Repo(str(shadow_path))
    files_to_sync = _get_project_files(root_path)

    # 1. Copy changed/new files
    for rel in files_to_sync:
        src = root_path / rel
        dst = shadow_path / rel
        if not src.is_file():
            continue
        try:
            if src.stat().st_size > MAX_FILE_SIZE_BYTES:
                continue
        except OSError:
            continue

        dst.parent.mkdir(parents=True, exist_ok=True)
        # Check if dst exists and matches
        try:
            if dst.exists() and src.stat().st_mtime == dst.stat().st_mtime and src.stat().st_size == dst.stat().st_size:
                continue
            shutil.copy2(src, dst)
        except Exception:
            try:
                shutil.copyfile(src, dst)
            except Exception:
                pass

    # 2. Remove deleted files from shadow repo
    for current_dir, dirs, files in os.walk(str(shadow_path)):
        if ".git" in dirs:
            dirs.remove(".git")
        rel_dir = Path(current_dir).relative_to(shadow_path)
        for f in files:
            rel_path = (rel_dir / f).as_posix() if rel_dir != Path(".") else f
            if rel_path not in files_to_sync:
                try:
                    (shadow_path / rel_path).unlink(missing_ok=True)
                except Exception:
                    pass

    # 3. Stage all in shadow repo
    shadow_repo.git.add(A=True)

    # Check real git head if available
    real_git_head = None
    try:
        real_repo = Repo(str(root_path), search_parent_directories=False)
        real_git_head = real_repo.head.commit.hexsha
    except Exception:
        pass

    has_commits = False
    try:
        _ = shadow_repo.head.commit
        has_commits = True
    except Exception:
        has_commits = False

    is_dirty = shadow_repo.is_dirty(untracked_files=True)

    if not is_dirty and has_commits:
        return shadow_repo.head.commit.hexsha, real_git_head

    commit = shadow_repo.index.commit(f"[DevPulse] {trigger} snapshot")
    return commit.hexsha, real_git_head


async def snapshot(project_root: str | None = None, trigger: str = "manual") -> str:
    """
    Take an incremental snapshot of the project in the shadow repo.
    Emits a `shadow_commit` event and returns the commit hash.
    """
    async with _snapshot_lock:
        root_path = Path(project_root or detect_project_id()).resolve()
        shadow_path = Path(init_shadow_repo(str(root_path)))

        loop = asyncio.get_event_loop()
        commit_hash, real_git_head = await loop.run_in_executor(
            None, _sync_and_commit_sync, root_path, shadow_path, trigger
        )

        event = make_event(
            source="shadow_repo",
            category="git",
            event_type="shadow_commit",
            payload={
                "shadow_commit_hash": commit_hash,
                "trigger": trigger,
                "real_git_head": real_git_head,
            },
            project_id=str(root_path),
        )
        await write_event(event)
        logger.info("Shadow snapshot created [%s]: %s", trigger, commit_hash[:8])
        return commit_hash
