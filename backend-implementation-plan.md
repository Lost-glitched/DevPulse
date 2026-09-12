<!-- Arnav Sahu -->
<!-- 24BCE2976 -->

# DevPulse — Backend Implementation Plan

Companion to `implementation-plan.md` (full-system spec) and the Stitch/AI Studio frontend already built. This document scopes the backend build only. The frontend folder already exists in the project — this plan assumes the backend is built to satisfy the API contract below so it can be wired to the existing frontend directly.

## Goal
Build a local backend service that collects developer-environment telemetry, stores it as a unified event stream, runs a rule-based diagnostic engine over it, and serves everything the frontend needs through a REST/WebSocket API — matching the endpoints specified here so no frontend changes are needed.

## Project structure

```
backend/
  main.py                  # FastAPI app entrypoint
  db/
    schema.sql              # SQLite schema (events table + indices)
    store.py                 # read/write helpers for the event store
  collectors/
    system_collector.py      # psutil-based CPU/RAM/process sampling
    docker_collector.py       # docker SDK container stats
    git_collector.py          # git log/diff ingestion
    file_watcher.py            # watchdog-based code snapshotting on save
    execution_wrapper.py        # CLI wrapper: devpulse run <command>
  browser_bridge/
    ws_server.py               # WebSocket endpoint receiving tab events from the Chrome extension
  correlator/
    context_correlator.py      # joins events into task_context_id groups
    code_outcome_correlator.py  # diff-since-last-pass, resource-correlation-to-failure logic
  diagnostics/
    rules.yaml                  # rule base
    engine.py                    # rule evaluation against recent events
  classifiers/
    tab_classifier.py            # duplicate/stale/active bucketing for tabs
  api/
    resources.py                  # /api/resources/* routes
    tabs.py                        # /api/tabs/* routes
    timeline.py                    # /api/timeline/* routes
  config.py                        # category mapping tables, thresholds, poll intervals
  cli.py                            # `devpulse run` entrypoint (execution_wrapper wrapper script)
```

## Build order

### Step 1 — Event store (foundation, do this first)
- SQLite file with WAL mode enabled for concurrent read/write
- Single `events` table matching the schema below; add indices on `timestamp`, `source`, `category`, `event_type`
- `store.py` exposes `write_event(event)` and `query_events(start, end, source=None, category=None, event_type=None)`
- Write a handful of hardcoded test events and confirm read/write round-trips correctly before building anything on top

**Event schema (must match exactly — this is what the frontend was designed against)**
```json
{
  "id": "uuid",
  "timestamp": "ISO8601 with ms precision",
  "source": "system | terminal | git | browser | editor | execution",
  "category": "ide | terminal | docker | browser | git | system",
  "event_type": "resource_sample | process_start | process_end | command_run | git_commit | git_checkout | tab_opened | tab_closed | tab_focus | tab_updated | file_saved | code_snapshot | execution_result",
  "payload": {},
  "task_context_id": null
}
```

### Step 2 — System resource collector
- `system_collector.py` runs as a background thread/asyncio task, polling `psutil.process_iter()` every 1-5s
- Tag each process with a `category` using a lookup table in `config.py` matching process name/cmdline substrings (e.g. `Code`, `node`, known LSP binary names → `ide`; `Docker`, `dockerd`, `com.docker` → `docker`; known shell names → `terminal`)
- Write a `resource_sample` event per tracked process per poll — but downsample writes (e.g. only write if value changed more than a small threshold since last sample) to avoid flooding the store
- Keep this collector's own process footprint small: avoid holding large in-memory structures, avoid synchronous DB writes blocking the sampling loop (queue + batch write instead)

### Step 3 — `/api/resources/current` and `/api/resources/history`
- `current`: query the most recent `resource_sample` per process, group by `category`, return nested JSON the treemap consumes: `{ category: [{ name, pid, ram_mb, cpu_pct, flagged_cause }] }`
- `history`: query `resource_sample` events over a range, downsample into buckets suitable for the waveform graph (e.g. 1-minute buckets for a 1h range)
- `flagged_cause` comes from the diagnostic engine (Step 5) — stub it as `null` until that's wired in, so the frontend can integrate against real resource data immediately

### Step 4 — Docker collector
- `docker_collector.py` uses the `docker` Python SDK to poll container stats (`container.stats(stream=False)`) on the same cadence as the system collector
- Normalize into the same `resource_sample` shape with `category: "docker"`

### Step 5 — Diagnostic engine
- `rules.yaml`: start with the 6 rules already scoped (memory pressure, language server thrashing, redundant file watchers, forgotten background process, Docker overhead, build cache invalidation). Each rule defines conditions as simple threshold/pattern checks against recent events, plus a `cause_label` and `confidence`
- `engine.py` runs on a slower loop (every 10-30s), reads recent events from the store, evaluates each rule, and writes matches back as a lightweight `flagged_cause` lookup (in-memory cache or a small `diagnoses` table keyed by process/category) that `/api/resources/current` reads from
- Every match retains the exact signal values that triggered it, exposed in the API response so the frontend's "why" panel has real data to show, not a placeholder

### Step 6 — Browser bridge (tabs)
- `ws_server.py`: WebSocket endpoint the Chrome extension connects to, receiving `tab_opened`, `tab_closed`, `tab_focus`, `tab_updated` events and writing them to the event store
- Also exposes a way to push commands back to the extension (`suspend_tab`) over the same socket

### Step 7 — Tab classifier + `/api/tabs`
- `tab_classifier.py`: for each open tab, compute `bucket` (active/duplicate/stale) using:
  - Interaction recency + total active time from stored tab events
  - Duplicate clustering via title/domain token-overlap similarity against other open tabs
  - Cross-context correlation: check if the tab's domain/title has any token overlap with recent `code_snapshot` file paths or `git_commit` messages, boosting relevance if so
- `GET /api/tabs` returns tabs with `bucket, reason, cluster_id`
- `POST /api/tabs/{id}/suspend` and `POST /api/tabs/bulk-suspend` send a `suspend_tab` command over the WebSocket to the extension; store a pre-action snapshot of tab state for restore

### Step 8 — Git + file-watcher collectors
- `git_collector.py`: on startup, ingest recent git log; then poll or hook (e.g. a `post-commit` hook, or periodic `git log` diffing against last-seen hash) to write `git_commit`/`git_checkout` events
- `file_watcher.py`: `watchdog` observer on the project root, on save events compute a diff against the last stored snapshot of that file, write a `code_snapshot` event with the unified diff

### Step 9 — Execution wrapper + code-outcome correlator
- `cli.py` / `execution_wrapper.py`: `devpulse run <command>` runs the command as a subprocess, captures exit code, stdout/stderr tail, duration, writes an `execution_result` event including which `code_snapshot` ids occurred since the previous `execution_result`
- `code_outcome_correlator.py`: on a failing `execution_result`, compute:
  - `diff_since_last_pass`: merged diff of all `code_snapshot` events since the last `execution_result` with `passed: true`
  - `new_error` flag: compare `stderr_tail` similarity against the previous failure's `stderr_tail`
  - `possible_resource_cause`: check for any diagnostic-engine anomaly within a ±30s window of the failure timestamp

### Step 10 — `/api/timeline` endpoints
- `GET /api/timeline?range=1h|4h|full`: merged, time-sorted events across all sources for the range, plus the resource waveform series from Step 3's history query
- `GET /api/timeline/failure/{execution_result_id}`: returns the correlator output from Step 9 for that specific failure
- `POST /api/timeline/restore-to/{execution_result_id}`: returns the reverse diff needed to restore to that passing state (dry-run only for the hackathon — return the diff, don't auto-apply it without explicit confirmation)

### Step 11 — Wire to the existing frontend
- Confirm every endpoint's response shape matches exactly what the Stitch/AI Studio frontend expects (check the frontend's API client/fetch calls or mock data shape first)
- Replace any mock data the frontend was built against with real calls to these endpoints
- Smoke-test each of the three screens against live data end-to-end

## Config values to centralize in `config.py`
- Poll intervals (hot metrics 1-5s, cold metrics 30-60s, diagnostic engine 10-30s)
- Category mapping table (process name/cmdline patterns → category)
- Rule thresholds (memory pressure %, CPU sustained duration, etc.) — keep these as named constants, not magic numbers buried in `engine.py`, so they're easy to tune during the demo

## Non-goals for this backend build
- No ML/embeddings for tab similarity — token-overlap or basic string similarity is sufficient
- No auto-applying the restore-to-last-pass diff without explicit user confirmation
- No production-grade collector rewrite (Rust/Go) — Python/psutil is fine for the hackathon demo
- No authentication/multi-user support — single local user, single machine

## Suggested order to hand to the coding agent
Steps 1 to 3 first and get them fully working end-to-end before touching anything else — that's the minimum needed to make the Resource Overview screen real instead of mocked, and it validates the event store design before more collectors write to it. Then proceed sequentially through Steps 4-10, checking each API response against the frontend's expected shape as you go rather than integrating everything at the end.
