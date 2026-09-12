"""
DevPulse Project API — /api/project/*

Returns metadata about the active project context for workspace display.
"""
from __future__ import annotations

from fastapi import APIRouter

from backend.project_context import detect_project_id, get_project_display_name

router = APIRouter(prefix="/api/project", tags=["project"])


@router.get("/current")
async def get_current_project():
    """Return the currently detected project ID and friendly display name."""
    project_id = detect_project_id()
    return {
        "project_id": project_id,
        "displayName": get_project_display_name(project_id),
    }
