# DevPulse

DevPulse is a local developer-workspace telemetry dashboard. It collects system, Docker, Git, file, and diagnostic events in the FastAPI backend and presents resource, tab, and timeline views in a React dashboard.

## Features

- Live CPU, memory, process, and Docker resource monitoring
- SQLite-backed event storage
- Git and file activity collection
- Rule-based diagnostics for common workspace performance issues
- Resource treemap, session timeline, and tab classification views

## Requirements

- Python 3.10 or newer
- Node.js 18 or newer and npm
- Docker Desktop, if Docker metrics are needed

## Quick Start

### Windows

Run `start_devpulse.bat` from the repository root. This opens the backend and frontend in separate terminal windows.

### Manual setup

Install backend dependencies:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

Install and start the frontend:

```powershell
cd frontend
npm install
npm run dev
```

In a second terminal, from the repository root, start the backend:

```powershell
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open the dashboard at <http://localhost:3000>. The backend health endpoints are available at <http://localhost:8000/> and <http://localhost:8000/api/health>.

## Development

Frontend commands are run from `frontend`:

```powershell
npm run dev
npm run build
npm run lint
```

The backend uses FastAPI and starts its collectors and diagnostics engine during application startup. Local runtime data, including the SQLite database, is intentionally ignored by Git.

## Project Structure

```text
backend/       FastAPI application, collectors, database, and diagnostics
frontend/      React + TypeScript dashboard powered by Vite
start_devpulse.bat
```

## License

No license has been specified yet.