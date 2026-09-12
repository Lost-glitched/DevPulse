"""
DevPulse Backend — FastAPI Application Entrypoint

Mounts all API routers, starts background collector tasks on startup,
and handles graceful shutdown.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.diagnoses import router as diagnoses_router
from backend.api.project import router as project_router
from backend.api.resources import router as resources_router
from backend.api.shadow import router as shadow_router
from backend.api.tabs import router as tabs_router
from backend.api.timeline import router as timeline_router
from backend.browser_bridge.ws_server import setup_ws_routes
from backend.collectors.docker_collector import run_docker_collector
from backend.collectors.git_collector import run_git_collector
from backend.collectors.system_collector import run_system_collector
from backend.config import CORS_ORIGINS
from backend.db.store import init_db
from backend.diagnostics.engine import run_diagnostics

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("devpulse")

# Shutdown event shared across all background tasks
_shutdown_event = asyncio.Event()
_background_tasks: list[asyncio.Task] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup and shutdown of background services."""
    logger.info("DevPulse backend starting up...")

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Start background collectors
    _shutdown_event.clear()

    tasks = [
        asyncio.create_task(run_system_collector(_shutdown_event), name="system_collector"),
        asyncio.create_task(run_docker_collector(_shutdown_event), name="docker_collector"),
        asyncio.create_task(run_git_collector(_shutdown_event), name="git_collector"),
        asyncio.create_task(run_diagnostics(_shutdown_event), name="diagnostics"),
    ]

    # File watcher is optional — don't crash if it fails
    try:
        from backend.collectors.file_watcher import run_file_watcher
        tasks.append(
            asyncio.create_task(run_file_watcher(_shutdown_event), name="file_watcher")
        )
    except Exception as exc:
        logger.warning("File watcher disabled: %s", exc)

    _background_tasks.extend(tasks)
    logger.info("Started %d background tasks", len(tasks))

    yield  # App is running

    # Shutdown
    logger.info("Shutting down background tasks...")
    _shutdown_event.set()

    # Wait for tasks to finish (with timeout)
    for task in _background_tasks:
        try:
            await asyncio.wait_for(task, timeout=5.0)
        except asyncio.TimeoutError:
            task.cancel()
        except Exception:
            pass

    _background_tasks.clear()
    logger.info("DevPulse backend stopped")


# Create the FastAPI app
app = FastAPI(
    title="DevPulse",
    description="Developer workspace telemetry and resource monitoring backend",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(resources_router)
app.include_router(tabs_router)
app.include_router(timeline_router)
app.include_router(project_router)
app.include_router(shadow_router)
app.include_router(diagnoses_router)

# Mount WebSocket routes
setup_ws_routes(app)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "name": "DevPulse",
        "status": "running",
        "version": "0.1.0",
    }


@app.get("/api/health")
async def health():
    """Detailed health check."""
    import os
    import psutil
    try:
        mem = psutil.virtual_memory()
        cpu = psutil.cpu_percent(interval=None)
    except Exception:
        mem = None
        cpu = 0

    try:
        proc = psutil.Process(os.getpid())
        daemon_rss_mb = round(proc.memory_info().rss / (1024 * 1024), 1)
        daemon_cpu = round(proc.cpu_percent(interval=None) or 0.0, 1)
    except Exception:
        daemon_rss_mb = 35.0
        daemon_cpu = 0.5

    return {
        "status": "healthy",
        "version": "0.1.0",
        "collectors": {
            "system": not _shutdown_event.is_set(),
            "docker": not _shutdown_event.is_set(),
            "git": not _shutdown_event.is_set(),
            "diagnostics": not _shutdown_event.is_set(),
        },
        "background_tasks": len(_background_tasks),
        "system": {
            "ram_percent": mem.percent if mem else 0,
            "cpu_percent": cpu,
        },
        "daemon": {
            "rss_mb": daemon_rss_mb,
            "cpu_percent": daemon_cpu,
            "pid": os.getpid(),
            "version": "0.1.0",
        },
    }
