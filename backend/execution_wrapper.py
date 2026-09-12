"""
DevPulse Execution Wrapper.

Wraps command execution to snapshot workspace state prior to running,
records pass/fail status and output, and links results into the shadow timeline.

Usage:
    python -m backend.execution_wrapper run <command ...>
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import time
from typing import Any

from backend.db.store import init_db, make_event, write_event
from backend.project_context import detect_project_id
from backend.shadow_repo.repo import snapshot


async def run_command_with_telemetry(command_args: list[str]) -> int:
    """
    Take a pre-run snapshot, execute command, record execution_result event,
    and return exit code.
    """
    await init_db()
    project_id = detect_project_id()

    command_str = " ".join(command_args)
    print(f"[DevPulse] Snapshotting workspace before: {command_str}")

    try:
        commit_hash = await snapshot(project_root=project_id, trigger="pre_run")
    except Exception as exc:
        print(f"[DevPulse] Warning: Pre-run snapshot failed: {exc}", file=sys.stderr)
        commit_hash = None

    start_time = time.perf_counter()
    proc = subprocess.Popen(
        command_args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        shell=True if sys.platform == "win32" and len(command_args) == 1 else False,
    )

    stdout, stderr = proc.communicate()
    duration_ms = int((time.perf_counter() - start_time) * 1000)
    exit_code = proc.returncode
    passed = (exit_code == 0)

    # Print output transparently
    if stdout:
        sys.stdout.write(stdout)
    if stderr:
        sys.stderr.write(stderr)

    stdout_lines = stdout.splitlines()[-50:] if stdout else []
    stderr_lines = stderr.splitlines()[-50:] if stderr else []

    payload: dict[str, Any] = {
        "command": command_str,
        "exit_code": exit_code,
        "passed": passed,
        "duration_ms": duration_ms,
        "stdout_tail": "\n".join(stdout_lines),
        "stderr_tail": "\n".join(stderr_lines),
        "preceding_shadow_commit_hash": commit_hash,
    }

    event = make_event(
        source="execution",
        category="terminal",
        event_type="execution_result",
        payload=payload,
        project_id=project_id,
    )
    await write_event(event)

    status_str = "PASSED" if passed else f"FAILED (code {exit_code})"
    print(f"\n[DevPulse] Execution {status_str} in {duration_ms}ms (snapshot: {commit_hash[:8] if commit_hash else 'none'})")
    return exit_code


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python -m backend.execution_wrapper run <command ...>")
        sys.exit(1)

    args = sys.argv[1:]
    if args[0] == "run":
        args = args[1:]

    if not args:
        print("No command specified.")
        sys.exit(1)

    exit_code = asyncio.run(run_command_with_telemetry(args))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
