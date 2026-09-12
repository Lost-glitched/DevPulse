"""
DevPulse Project Context — Multi-project correlation and detection.

Identifies the active project by walking up the filesystem to locate
the nearest .git directory, falling back to DEVPULSE_PROJECT_ROOT or CWD.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from backend.config import PROJECT_ROOT

logger = logging.getLogger("devpulse.project_context")


def detect_project_id(path: str | None = None) -> str:
    """
    Detect the project ID for the given path (defaults to PROJECT_ROOT / CWD).
    Walks up the directory tree looking for a .git directory.
    Returns the resolved absolute path of the project root directory.
    """
    start = Path(path).resolve() if path else Path(PROJECT_ROOT).resolve()
    current = start

    # Walk up to find nearest .git
    while current != current.parent:
        if (current / ".git").exists():
            return str(current)
        current = current.parent

    # Check root as well
    if (current / ".git").exists():
        return str(current)

    # Fallback to start directory
    return str(start)


def get_project_display_name(project_id: str) -> str:
    """
    Return the human-readable display name for a project_id.
    Typically the basename of the repository directory.
    """
    p = Path(project_id)
    return p.name or str(project_id)
