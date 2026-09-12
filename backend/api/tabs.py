"""
Tab API Routes — /api/tabs/*

Uses real tab data from the Chrome extension (via WebSocket bridge)
and the tab classifier for active/duplicate/stale classification.
Falls back to an empty response when no extension is connected.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Path as PathParam
from pydantic import BaseModel

from backend.browser_bridge.ws_server import (
    is_extension_connected,
    send_restore_command,
    send_suspend_command,
)
from backend.classifiers.tab_classifier import classify_tabs

logger = logging.getLogger("devpulse.api.tabs")

router = APIRouter(prefix="/api/tabs", tags=["tabs"])

# In-memory state for tracking which tabs we've asked the extension to suspend
_suspended_tabs: set[str] = set()


class BulkSuspendRequest(BaseModel):
    tab_ids: list[str]


@router.get("")
async def get_tabs():
    """Return all tabs classified into active/duplicate/stale buckets."""
    result = await classify_tabs()
    result["extensionConnected"] = is_extension_connected()

    # Mark any locally-tracked suspended tabs
    for tab in result.get("activeTabs", []):
        if tab["id"] in _suspended_tabs:
            tab["isSnoozed"] = True
    for tab in result.get("staleTabs", []):
        if tab["id"] in _suspended_tabs:
            tab["isSnoozed"] = True
    for group in result.get("duplicateGroups", []):
        for tab in group.get("tabs", []):
            if tab["id"] in _suspended_tabs:
                tab["isSnoozed"] = True

    return result


@router.post("/{tab_id}/suspend")
async def suspend_tab(tab_id: str = PathParam(...)):
    """
    Suspend a single tab by pushing a discard command to the Chrome extension.
    The extension calls chrome.tabs.discard(tabId) which unloads the tab
    from memory while keeping it in the tab strip.
    """
    _suspended_tabs.add(tab_id)

    # Extract numeric tab ID (format: "tab-{id}")
    chrome_tab_id = _extract_chrome_tab_id(tab_id)
    sent = False
    if chrome_tab_id is not None:
        sent = await send_suspend_command(chrome_tab_id)

    return {
        "status": "suspended" if sent else "suspended_locally",
        "tab_id": tab_id,
        "extension_notified": sent,
    }


@router.post("/bulk-suspend")
async def bulk_suspend(request: BulkSuspendRequest):
    """Suspend multiple tabs at once."""
    sent_count = 0
    for tab_id in request.tab_ids:
        _suspended_tabs.add(tab_id)
        chrome_tab_id = _extract_chrome_tab_id(tab_id)
        if chrome_tab_id is not None:
            sent = await send_suspend_command(chrome_tab_id)
            if sent:
                sent_count += 1

    return {
        "status": "suspended",
        "count": len(request.tab_ids),
        "extension_notified": sent_count,
        "tab_ids": request.tab_ids,
    }


@router.post("/{tab_id}/restore")
async def restore_tab(tab_id: str = PathParam(...)):
    """
    Restore a suspended tab.

    Note: chrome.tabs.discard() is not reversible via the Tabs API.
    The best we can do is reload the tab, which causes it to re-render
    from scratch (fetching the page again). This is functionally equivalent
    to restoring since the tab URL is preserved by Chrome after discard.
    """
    _suspended_tabs.discard(tab_id)

    chrome_tab_id = _extract_chrome_tab_id(tab_id)
    sent = False
    if chrome_tab_id is not None:
        sent = await send_restore_command(chrome_tab_id)

    return {
        "status": "restored" if sent else "restored_locally",
        "tab_id": tab_id,
        "extension_notified": sent,
    }


def _extract_chrome_tab_id(tab_id: str) -> int | None:
    """Extract the numeric Chrome tab ID from our 'tab-{id}' format."""
    try:
        if tab_id.startswith("tab-"):
            return int(tab_id[4:])
        return int(tab_id)
    except (ValueError, TypeError):
        return None
