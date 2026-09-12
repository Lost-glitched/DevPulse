-- DevPulse Event Store Schema
-- SQLite with WAL mode for concurrent read/write

PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

-- Core event stream table
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,           -- ISO8601 with ms precision
    source TEXT NOT NULL,              -- system | terminal | git | browser | editor | execution
    category TEXT NOT NULL,            -- ide | terminal | docker | browser | git | system
    event_type TEXT NOT NULL,          -- resource_sample | process_start | process_end | command_run | git_commit | git_checkout | tab_opened | tab_closed | tab_focus | tab_updated | file_saved | code_snapshot | execution_result | shadow_commit
    payload TEXT NOT NULL DEFAULT '{}', -- JSON blob
    task_context_id TEXT,              -- nullable, for correlation grouping
    project_id TEXT                    -- nullable, for multi-project correlation
);

-- Performance indices
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_task_context ON events(task_context_id);
CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id);
CREATE INDEX IF NOT EXISTS idx_events_ts_source ON events(timestamp, source);
CREATE INDEX IF NOT EXISTS idx_events_ts_category ON events(timestamp, category);

-- Diagnostic engine results
CREATE TABLE IF NOT EXISTS diagnoses (
    id TEXT PRIMARY KEY,
    process_key TEXT NOT NULL,          -- e.g. "pid:1234" or "category:docker"
    cause_label TEXT NOT NULL,          -- human-readable cause label
    confidence REAL NOT NULL DEFAULT 0.0,
    recommendation TEXT,
    signal_values TEXT NOT NULL DEFAULT '{}',  -- JSON: the exact values that triggered the rule
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_diagnoses_process_key ON diagnoses(process_key);
CREATE INDEX IF NOT EXISTS idx_diagnoses_updated ON diagnoses(updated_at);
