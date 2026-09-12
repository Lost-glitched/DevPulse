"""
DevPulse Backend Configuration
Centralizes poll intervals, process→category mapping, and diagnostic thresholds.
"""
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = os.environ.get("DEVPULSE_DB_PATH", str(BASE_DIR / "devpulse.db"))
SCHEMA_PATH = BASE_DIR / "db" / "schema.sql"

# ---------------------------------------------------------------------------
# Collector poll intervals (seconds)
# ---------------------------------------------------------------------------
SYSTEM_POLL_INTERVAL = 2          # CPU/RAM sampling
DOCKER_POLL_INTERVAL = 5          # Container stats
GIT_POLL_INTERVAL = 30            # git log diff check
DIAGNOSTIC_INTERVAL = 15          # Rule evaluation
TAB_POLL_INTERVAL = 10            # Tab status refresh

# ---------------------------------------------------------------------------
# Resource sample dedup thresholds
# Only write a new sample if the value changed more than this since the last write
# ---------------------------------------------------------------------------
CPU_CHANGE_THRESHOLD = 1.0        # percent
RAM_CHANGE_THRESHOLD = 0.01       # GB (≈10 MB)

# ---------------------------------------------------------------------------
# Process → Category mapping
# Key: substring matched against process name or cmdline (case-insensitive)
# Value: (category, friendly_subsystem_title)
# Order matters — first match wins, so put specific patterns before generic ones
# ---------------------------------------------------------------------------
PROCESS_CATEGORY_MAP: list[tuple[str, str, str]] = [
    # IDE / Editor
    ("code",            "ide",        "IDE / EDITOR"),
    ("cursor",          "ide",        "IDE / EDITOR"),
    ("devenv",          "ide",        "IDE / EDITOR"),
    ("rider",           "ide",        "IDE / EDITOR"),
    ("webstorm",        "ide",        "IDE / EDITOR"),
    ("idea",            "ide",        "IDE / EDITOR"),
    ("pycharm",         "ide",        "IDE / EDITOR"),
    ("sublime_text",    "ide",        "IDE / EDITOR"),
    ("atom",            "ide",        "IDE / EDITOR"),
    ("rust-analyzer",   "ide",        "IDE / EDITOR"),
    ("rust_analyzer",   "ide",        "IDE / EDITOR"),
    ("tsserver",        "ide",        "IDE / EDITOR"),
    ("typescript-language-server", "ide", "IDE / EDITOR"),
    ("gopls",           "ide",        "IDE / EDITOR"),
    ("pylsp",           "ide",        "IDE / EDITOR"),
    ("pyright",         "ide",        "IDE / EDITOR"),
    ("copilot",         "ide",        "IDE / EDITOR"),
    ("codeium",         "ide",        "IDE / EDITOR"),

    # Docker / Containers
    ("docker",          "containers", "DOCKER / CONTAINERS"),
    ("containerd",      "containers", "DOCKER / CONTAINERS"),
    ("dockerd",         "containers", "DOCKER / CONTAINERS"),
    ("com.docker",      "containers", "DOCKER / CONTAINERS"),
    ("colima",          "containers", "DOCKER / CONTAINERS"),
    ("podman",          "containers", "DOCKER / CONTAINERS"),
    ("kubectl",         "containers", "DOCKER / CONTAINERS"),

    # Terminal / Shell
    ("powershell",      "terminal",   "TERMINAL / SHELL"),
    ("pwsh",            "terminal",   "TERMINAL / SHELL"),
    ("cmd.exe",         "terminal",   "TERMINAL / SHELL"),
    ("bash",            "terminal",   "TERMINAL / SHELL"),
    ("zsh",             "terminal",   "TERMINAL / SHELL"),
    ("fish",            "terminal",   "TERMINAL / SHELL"),
    ("tmux",            "terminal",   "TERMINAL / SHELL"),
    ("wezterm",         "terminal",   "TERMINAL / SHELL"),
    ("alacritty",       "terminal",   "TERMINAL / SHELL"),
    ("windowsterminal", "terminal",   "TERMINAL / SHELL"),
    ("wt.exe",          "terminal",   "TERMINAL / SHELL"),
    ("conhost",         "terminal",   "TERMINAL / SHELL"),
    ("node",            "terminal",   "TERMINAL / SHELL"),
    ("npm",             "terminal",   "TERMINAL / SHELL"),
    ("python",          "terminal",   "TERMINAL / SHELL"),
    ("cargo",           "terminal",   "TERMINAL / SHELL"),
    ("go.exe",          "terminal",   "TERMINAL / SHELL"),
    ("webpack",         "terminal",   "TERMINAL / SHELL"),
    ("vite",            "terminal",   "TERMINAL / SHELL"),
    ("esbuild",         "terminal",   "TERMINAL / SHELL"),
    ("uvicorn",         "terminal",   "TERMINAL / SHELL"),
    ("fastapi",         "terminal",   "TERMINAL / SHELL"),

    # Browser
    ("chrome",          "browser",    "BROWSER TABS"),
    ("firefox",         "browser",    "BROWSER TABS"),
    ("msedge",          "browser",    "BROWSER TABS"),
    ("brave",           "browser",    "BROWSER TABS"),
    ("opera",           "browser",    "BROWSER TABS"),
    ("safari",          "browser",    "BROWSER TABS"),
    ("arc",             "browser",    "BROWSER TABS"),
    ("vivaldi",         "browser",    "BROWSER TABS"),
]

# ---------------------------------------------------------------------------
# Diagnostic engine thresholds
# ---------------------------------------------------------------------------
DIAG_MEMORY_PRESSURE_PCT = 80.0        # flag when total RAM > this %
DIAG_CPU_SUSTAINED_PCT = 90.0          # flag when a process sustains this CPU %
DIAG_CPU_SUSTAINED_SAMPLES = 5         # over this many consecutive samples
DIAG_LEAK_GROWTH_MB_PER_MIN = 10.0     # flag growth rate exceeding this
DIAG_IDLE_PROCESS_MINUTES = 30         # flag process idle this long with >200MB
DIAG_DOCKER_OVERHEAD_GB = 3.0          # flag Docker total RAM above this

# ---------------------------------------------------------------------------
# Frontend CORS
# ---------------------------------------------------------------------------
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]
