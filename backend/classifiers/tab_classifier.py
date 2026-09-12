"""
Tab Classifier — real classification of browser tabs into active/duplicate/stale.

Uses tab events from the event store (written by the Chrome extension via the
WebSocket bridge) to build current tab state and classify each tab.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

import psutil

from backend.config import (
    DUPLICATE_TAB_SIMILARITY_THRESHOLD,
    STALE_TAB_ACTIVE_MS_THRESHOLD,
    STALE_TAB_THRESHOLD_MINUTES,
)
from backend.db.store import query_events

logger = logging.getLogger("devpulse.classifiers.tab")

# Regex for tokenising titles/URLs for similarity comparison
_TOKEN_RE = re.compile(r"[a-z0-9]+", re.IGNORECASE)


def _tokenise(text: str) -> set[str]:
    """Split text into lowercase tokens for comparison."""
    return set(t.lower() for t in _TOKEN_RE.findall(text) if len(t) > 1)


def _jaccard(a: set[str], b: set[str]) -> float:
    """Jaccard similarity between two token sets."""
    if not a or not b:
        return 0.0
    intersection = len(a & b)
    union = len(a | b)
    return intersection / union if union else 0.0


def _extract_domain(url: str) -> str:
    """Extract domain from a URL."""
    try:
        parsed = urlparse(url)
        return parsed.netloc or parsed.path.split("/")[0]
    except Exception:
        return url


async def _get_cross_context_tokens() -> set[str]:
    """
    Collect tokens from recent code/git activity for cross-context relevance boost.
    Looks at file_saved file paths, code_snapshot diffs, and git_commit messages
    from the last hour.
    """
    tokens: set[str] = set()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(
        timespec="milliseconds"
    )

    # file_saved events
    file_events = await query_events(
        start=cutoff, event_type="file_saved", limit=200
    )
    for e in file_events:
        p = e.get("payload", {})
        file_path = p.get("file_path", "")
        tokens |= _tokenise(file_path)

    # git_commit events
    git_events = await query_events(
        start=cutoff, event_type="git_commit", limit=100
    )
    for e in git_events:
        p = e.get("payload", {})
        message = p.get("message", "")
        tokens |= _tokenise(message)

    # code_snapshot events (if any exist)
    snap_events = await query_events(
        start=cutoff, event_type="code_snapshot", limit=100
    )
    for e in snap_events:
        p = e.get("payload", {})
        file_path = p.get("file_path", "")
        tokens |= _tokenise(file_path)

    return tokens


def _get_os_browser_fallback() -> dict[str, Any]:
    """
    Fallback when the Chrome extension is not connected:
    Discover running OS browser processes (Chrome, Edge, Firefox, Brave)
    via psutil and expose them as browser worker/renderer instances.
    """
    browser_names = {
        "chrome.exe": ("Google Chrome", "#38bdf8", "language"),
        "msedge.exe": ("Microsoft Edge", "#38bdf8", "language"),
        "firefox.exe": ("Mozilla Firefox", "#fb923c", "language"),
        "brave.exe": ("Brave Browser", "#fb923c", "shield"),
        "opera.exe": ("Opera Browser", "#f43f5e", "language"),
        "chrome": ("Google Chrome", "#38bdf8", "language"),
        "msedge": ("Microsoft Edge", "#38bdf8", "language"),
        "firefox": ("Mozilla Firefox", "#fb923c", "language"),
        "brave": ("Brave Browser", "#fb923c", "shield"),
    }

    active_items: list[dict[str, Any]] = []
    stale_items: list[dict[str, Any]] = []
    total_ram_mb = 0

    try:
        for proc in psutil.process_iter(["pid", "name", "memory_info"]):
            try:
                name = proc.info["name"] or ""
                name_lower = name.lower()
                matched_browser = None
                for b_exe, b_meta in browser_names.items():
                    if name_lower == b_exe:
                        matched_browser = b_meta
                        break

                if not matched_browser:
                    continue

                pid = proc.info["pid"]
                mem_info = proc.info["memory_info"]
                rss_mb = round(mem_info.rss / (1024 * 1024), 1) if mem_info else 0.0
                total_ram_mb += int(rss_mb)

                b_label, b_color, b_icon = matched_browser
                role = "Renderer / Tab Instance" if rss_mb > 60 else "Background Worker / Utility"

                item = {
                    "id": f"proc-tab-{pid}",
                    "title": f"{b_label} — {role} (PID {pid})",
                    "url": f"browser://process/{pid}",
                    "displayDomain": name,
                    "category": "active" if rss_mb > 90 else "stale",
                    "ramMb": int(rss_mb),
                    "cpuPercent": 0,
                    "lastActive": "Live Process",
                    "isSnoozed": False,
                    "iconName": b_icon,
                    "iconColor": b_color,
                    "whyText": (
                        f"Live OS browser process ({role}) using {rss_mb} MB RAM. "
                        f"Connect the DevPulse Chrome Extension to map exact tab titles and URLs."
                    ),
                    "groupKey": None,
                    "idleDuration": "Active Process",
                    "pid": pid,
                }

                if item["category"] == "active":
                    active_items.append(item)
                else:
                    stale_items.append(item)

            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        # Sort by RAM descending
        active_items.sort(key=lambda x: -x["ramMb"])
        stale_items.sort(key=lambda x: -x["ramMb"])

    except Exception as exc:
        logger.warning("Failed to collect OS browser processes: %s", exc)

    return {
        "activeTabs": active_items,
        "duplicateGroups": [],
        "staleTabs": stale_items,
        "totalMemoryMb": total_ram_mb,
        "tabCount": len(active_items) + len(stale_items),
        "isFallback": True,
    }


async def classify_tabs() -> dict[str, Any]:
    """
    Build current tab state from recent tab events and classify each tab
    into active / duplicate / stale buckets.

    Returns the same shape as the frontend expects:
    { activeTabs, duplicateGroups, staleTabs, totalMemoryMb, tabCount, isFallback }
    """
    now = datetime.now(timezone.utc)

    # Pull last 24 hours of tab events to reconstruct state
    cutoff = (now - timedelta(hours=24)).isoformat(timespec="milliseconds")

    opened = await query_events(start=cutoff, event_type="tab_opened", limit=2000)
    closed = await query_events(start=cutoff, event_type="tab_closed", limit=2000)
    focused = await query_events(start=cutoff, event_type="tab_focus", limit=2000)
    updated = await query_events(start=cutoff, event_type="tab_updated", limit=2000)

    # Build set of closed tab IDs
    closed_ids: set[int] = set()
    for e in closed:
        tid = e.get("payload", {}).get("tab_id")
        if tid is not None:
            closed_ids.add(int(tid))

    # Build current open tab state from opened + updated events
    # Key: tab_id → state dict
    tabs: dict[int, dict[str, Any]] = {}

    # Process opened events (oldest first → reversed since query returns newest-first)
    for e in reversed(opened):
        p = e.get("payload", {})
        tid = p.get("tab_id")
        if tid is None:
            continue
        tid = int(tid)
        if tid in closed_ids:
            continue
        tabs[tid] = {
            "tab_id": tid,
            "url": p.get("url", ""),
            "title": p.get("title", ""),
            "favicon_url": p.get("favicon_url", ""),
            "active_ms_total": p.get("active_ms_total", 0),
            "last_interaction_ts": e["timestamp"],
            "opened_ts": e["timestamp"],
        }

    # Apply updates (oldest first)
    for e in reversed(updated):
        p = e.get("payload", {})
        tid = p.get("tab_id")
        if tid is None:
            continue
        tid = int(tid)
        if tid not in tabs:
            continue
        if p.get("url"):
            tabs[tid]["url"] = p["url"]
        if p.get("title"):
            tabs[tid]["title"] = p["title"]
        if p.get("favicon_url"):
            tabs[tid]["favicon_url"] = p["favicon_url"]
        if p.get("active_ms_total", 0) > tabs[tid].get("active_ms_total", 0):
            tabs[tid]["active_ms_total"] = p["active_ms_total"]
        tabs[tid]["last_interaction_ts"] = e["timestamp"]

    # Apply focus events to update last interaction time
    for e in reversed(focused):
        p = e.get("payload", {})
        tid = p.get("tab_id")
        if tid is None:
            continue
        tid = int(tid)
        if tid in tabs:
            tabs[tid]["last_interaction_ts"] = e["timestamp"]
            if p.get("active_ms_total", 0) > tabs[tid].get("active_ms_total", 0):
                tabs[tid]["active_ms_total"] = p["active_ms_total"]

    if not tabs:
        return _get_os_browser_fallback()

    # ─── Classification ──────────────────────────────────────────────

    # Get cross-context tokens for relevance boost
    context_tokens = await _get_cross_context_tokens()

    stale_threshold = timedelta(minutes=STALE_TAB_THRESHOLD_MINUTES)

    # Pre-compute for each tab
    for tid, state in tabs.items():
        state["domain"] = _extract_domain(state["url"])
        state["title_tokens"] = _tokenise(state["title"])
        state["domain_tokens"] = _tokenise(state["domain"])

        try:
            last_ts = datetime.fromisoformat(
                state["last_interaction_ts"].replace("Z", "+00:00")
            )
            state["idle_duration"] = now - last_ts
        except Exception:
            state["idle_duration"] = timedelta(0)

    # Step 1: Staleness check
    for tid, state in tabs.items():
        active_ms = state.get("active_ms_total", 0)
        idle = state["idle_duration"]

        if idle > stale_threshold and active_ms < STALE_TAB_ACTIVE_MS_THRESHOLD:
            # Check cross-context relevance boost
            tab_tokens = state["title_tokens"] | state["domain_tokens"]
            overlap = tab_tokens & context_tokens
            if overlap:
                state["category"] = "active"
                state["reason"] = (
                    f"Tab was idle for {_format_duration(idle)} but "
                    f"its content ('{', '.join(list(overlap)[:3])}') is referenced in recent code changes. "
                    f"Keeping active."
                )
            else:
                state["category"] = "stale"
                idle_mins = int(idle.total_seconds() / 60)
                state["reason"] = (
                    f"No interaction for {_format_duration(idle)} and only "
                    f"{active_ms / 1000:.0f}s total active time. "
                    f"Consider suspending to reclaim memory."
                )
        else:
            state["category"] = "active"
            if active_ms > 0:
                state["reason"] = (
                    f"Active tab with {active_ms / 1000:.0f}s cumulative usage, "
                    f"last interacted {_format_duration(state['idle_duration'])} ago."
                )
            else:
                state["reason"] = "Recently opened or interacted with."

    # Step 2: Duplicate detection (only among non-stale tabs)
    domain_groups: dict[str, list[int]] = {}
    for tid, state in tabs.items():
        domain = state["domain"]
        if domain:
            domain_groups.setdefault(domain, []).append(tid)

    cluster_counter = 0
    duplicate_clusters: dict[str, list[int]] = {}

    for domain, tids in domain_groups.items():
        if len(tids) < 2:
            continue
        # Pairwise Jaccard similarity on title tokens
        grouped: set[int] = set()
        clusters_in_domain: list[set[int]] = []

        for i, tid_a in enumerate(tids):
            if tid_a in grouped:
                continue
            cluster = {tid_a}
            tokens_a = tabs[tid_a]["title_tokens"]

            for tid_b in tids[i + 1:]:
                if tid_b in grouped:
                    continue
                tokens_b = tabs[tid_b]["title_tokens"]
                sim = _jaccard(tokens_a, tokens_b)
                if sim > DUPLICATE_TAB_SIMILARITY_THRESHOLD:
                    cluster.add(tid_b)

            if len(cluster) > 1:
                clusters_in_domain.append(cluster)
                grouped |= cluster

        for cluster in clusters_in_domain:
            cluster_counter += 1
            cluster_id = f"dup-{cluster_counter}"
            duplicate_clusters[cluster_id] = list(cluster)
            for tid in cluster:
                tabs[tid]["category"] = "duplicate"
                tabs[tid]["cluster_id"] = cluster_id
                other_titles = [
                    tabs[t]["title"][:40]
                    for t in cluster
                    if t != tid
                ]
                tabs[tid]["reason"] = (
                    f"Similar to {len(other_titles)} other tab(s) on {domain}: "
                    f"{', '.join(other_titles[:2])}. "
                    f"Jaccard title similarity exceeds {DUPLICATE_TAB_SIMILARITY_THRESHOLD}."
                )

    # ─── Build response ──────────────────────────────────────────────

    active_tabs: list[dict] = []
    stale_tabs: list[dict] = []
    dupe_group_list: list[dict] = []

    for tid, state in tabs.items():
        tab_item = _to_tab_item(state)

        if state["category"] == "active":
            active_tabs.append(tab_item)
        elif state["category"] == "stale":
            stale_tabs.append(tab_item)
        # duplicates are handled in groups below

    # Build duplicate groups
    for cluster_id, tids in duplicate_clusters.items():
        group_tabs = [_to_tab_item(tabs[tid]) for tid in tids]
        domain = tabs[tids[0]]["domain"]
        dupe_group_list.append({
            "id": cluster_id,
            "title": f"Duplicate tabs on {domain}",
            "tabs": group_tabs,
            "isResolved": False,
        })

    return {
        "activeTabs": active_tabs,
        "duplicateGroups": dupe_group_list,
        "staleTabs": stale_tabs,
        "totalMemoryMb": sum(t.get("ramMb", 0) for t in active_tabs + stale_tabs),
        "tabCount": len(tabs),
        "isFallback": False,
    }


def _to_tab_item(state: dict[str, Any]) -> dict[str, Any]:
    """Convert internal tab state to the TabItem shape the frontend expects."""
    idle = state.get("idle_duration", timedelta(0))
    idle_str = _format_duration(idle)

    # Choose icon based on domain
    domain = state.get("domain", "")
    icon_name = "language"
    icon_color = "#c084fc"
    if "github" in domain:
        icon_name = "commit"
        icon_color = "#38bdf8"
    elif "figma" in domain:
        icon_name = "palette"
        icon_color = "#a78bfa"
    elif "stackoverflow" in domain or "stackexchange" in domain:
        icon_name = "forum"
        icon_color = "#fb923c"
    elif "docs" in domain or "wiki" in domain or "mdn" in domain:
        icon_name = "menu_book"
        icon_color = "#4ade80"

    return {
        "id": f"tab-{state['tab_id']}",
        "title": state.get("title", "Untitled"),
        "url": state.get("url", ""),
        "displayDomain": domain,
        "category": state.get("category", "active"),
        "ramMb": 0,  # Extension doesn't have per-tab memory access
        "cpuPercent": 0,
        "lastActive": idle_str,
        "isSnoozed": False,
        "iconName": icon_name,
        "iconColor": icon_color,
        "whyText": state.get("reason", ""),
        "groupKey": state.get("cluster_id"),
        "idleDuration": idle_str,
    }


def _format_duration(td: timedelta) -> str:
    """Format a timedelta as a human-readable string."""
    total_secs = int(td.total_seconds())
    if total_secs < 60:
        return "Just now"
    minutes = total_secs // 60
    if minutes < 60:
        return f"{minutes}m ago"
    hours = minutes // 60
    remaining_mins = minutes % 60
    if hours < 24:
        return f"{hours}h {remaining_mins}m ago"
    days = hours // 24
    return f"{days}d ago"
