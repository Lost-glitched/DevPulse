"""
DevPulse Browser Bridge — WebSocket server for Chrome extension communication.

Accepts a single WebSocket connection from the DevPulse Chrome extension,
writes incoming tab events to the event store, and exposes functions to
push suspend/restore commands back to the extension.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from backend.db.store import make_event, write_event

logger = logging.getLogger("devpulse.browser_bridge")

# Reference to the currently connected extension WebSocket
_active_ws: WebSocket | None = None
_ws_lock = asyncio.Lock()

# Valid tab event types we accept from the extension
_VALID_TAB_EVENTS = {"tab_opened", "tab_closed", "tab_focus", "tab_updated"}


def setup_ws_routes(app: FastAPI) -> None:
    """Register the WebSocket endpoint on the FastAPI app."""

    @app.websocket("/ws/tabs")
    async def ws_tabs(websocket: WebSocket):
        global _active_ws

        await websocket.accept()
        logger.info("Tab WebSocket client connected")

        async with _ws_lock:
            # Close any previous connection (only one extension at a time)
            if _active_ws is not None:
                try:
                    await _active_ws.close()
                except Exception:
                    pass
            _active_ws = websocket

        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    logger.debug("Invalid JSON from extension: %s", raw[:200])
                    continue

                await _handle_extension_message(msg)

        except WebSocketDisconnect:
            logger.info("Tab WebSocket client disconnected")
        except Exception as exc:
            logger.warning("Tab WebSocket error: %s", exc)
        finally:
            async with _ws_lock:
                if _active_ws is websocket:
                    _active_ws = None


async def _handle_extension_message(msg: dict[str, Any]) -> None:
    """Process a message received from the Chrome extension."""
    event_type = msg.get("type", "")

    if event_type not in _VALID_TAB_EVENTS:
        # Ack messages, etc. — just log them
        if event_type in ("tab_suspended_ack", "tab_restored_ack"):
            success = msg.get("success", False)
            tab_id = msg.get("tab_id", "?")
            logger.info("Extension %s tab %s: success=%s", event_type, tab_id, success)
        return

    # Build payload from the message (exclude 'type' key)
    payload: dict[str, Any] = {}
    for key in ("tab_id", "url", "title", "favicon_url", "active_ms_total"):
        if key in msg:
            payload[key] = msg[key]

    event = make_event(
        source="browser",
        category="browser",
        event_type=event_type,
        payload=payload,
    )
    await write_event(event)
    logger.debug("Wrote %s event for tab %s", event_type, payload.get("tab_id", "?"))


async def send_suspend_command(tab_id: int) -> bool:
    """
    Push a suspend_tab command to the connected Chrome extension.
    Returns True if the command was sent, False if no extension is connected.
    """
    return await _send_command({"command": "suspend_tab", "tab_id": tab_id})


async def send_restore_command(tab_id: int) -> bool:
    """
    Push a restore_tab command to the connected Chrome extension.
    Note: This actually reloads the tab since chrome.tabs.discard() is
    not reversible — the tab has already been unloaded from memory.
    Returns True if the command was sent, False if no extension is connected.
    """
    return await _send_command({"command": "restore_tab", "tab_id": tab_id})


def is_extension_connected() -> bool:
    """Return True if a Chrome extension client is currently connected."""
    return _active_ws is not None


async def _send_command(msg: dict[str, Any]) -> bool:
    """Send a JSON command to the connected extension."""
    async with _ws_lock:
        if _active_ws is None:
            logger.warning("No extension connected — cannot send command: %s", msg)
            return False
        try:
            await _active_ws.send_json(msg)
            return True
        except Exception as exc:
            logger.error("Failed to send command to extension: %s", exc)
            return False
