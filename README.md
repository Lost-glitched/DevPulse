# DevPulse ⚡

**DevPulse** is a local developer-workspace telemetry dashboard. It collects real-time system, Docker, Git, file change, and diagnostic events through a lightweight FastAPI backend and renders an interactive, high-performance React dashboard.

---

## Key Features

- **Live Resource Treemap**: Dynamically categorizes active system processes into subsystems (**IDE / Editors**, **Terminals / CLI**, **Docker & Containers**, and **Browser Instances**) with live RAM and CPU tracking, sorting, and process inspection.
- **Session Timeline & Telemetry Scrubber**: Interactive synchronized waveform chart (RAM & CPU load over time), categorized event marker tracks (file saves, git commits, resource spikes), and scrubbable point-in-time process inspection.
- **Browser Tab & Process Classifier**: Identifies heavy browser and web runtime processes, displaying memory consumption and process attribution.
- **Asynchronous Telemetry Engine**: Powered by `psutil`, background file watchers, and a rule-based diagnostic engine for automated anomaly detection.
- **Local & Lightweight**: Uses an asynchronous SQLite database in WAL mode with zero cloud telemetry requirements.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Material Symbols
- **Backend**: Python 3.10+, FastAPI, Uvicorn, psutil, aiosqlite, PyYAML
- **Storage**: SQLite 3 (WAL mode)

---

## Requirements

- **Python**: 3.10 or newer
- **Node.js**: 18 or newer and `npm`
- **Docker Desktop**: (Optional) for container metrics

---

## Quick Start

### Windows (Automated)

Run the startup script from the project root:

```cmd
start_devpulse.bat
```

This launches both the FastAPI backend (`http://127.0.0.1:8000`) and the Vite frontend dev server (`http://localhost:3000`).

---

### Manual Setup

#### 1. Backend Setup

From the repository root:

```powershell
# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\Activate.ps1   # On Linux/macOS: source .venv/bin/activate

# Install dependencies
pip install -r backend\requirements.txt

# Start backend server
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Backend health endpoints:
- API Base: `http://127.0.0.1:8000/`
- Health Check: `http://127.0.0.1:8000/api/health`

#### 2. Frontend Setup

In a separate terminal:

```powershell
cd frontend

# Install packages
npm install

# Start Vite dev server
npm run dev
```

Open your browser at **`http://localhost:3000`**.

---

## Development & Verification

From the `frontend/` directory:

```powershell
npm run dev       # Start development server
npm run build     # Validate production bundle
npm run lint      # Run TypeScript type checks (tsc --noEmit)
```

---

## Project Structure

```text
DevPulse/
├── backend/
│   ├── api/             # FastAPI REST endpoints (resources, tabs, timeline)
│   ├── collectors/      # Background collectors (system, docker, git, file watcher)
│   ├── db/              # SQLite schema and asynchronous store helpers
│   ├── diagnostics/     # Rule-based diagnostic engine & YAML rules
│   ├── config.py        # Centralized collector intervals & classification maps
│   ├── main.py          # FastAPI application entrypoint & lifecycle
│   └── requirements.txt # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/  # React views (Treemap, Timeline, Tabs, Modals, Nav)
│   │   ├── services/    # Frontend API client and polling services
│   │   ├── types.ts     # TypeScript data models and telemetry interfaces
│   │   ├── App.tsx      # Main application state and workspace view router
│   │   └── main.tsx     # React entrypoint
│   ├── package.json
│   └── vite.config.ts   # Vite configuration and backend API proxy
├── start_devpulse.bat   # Windows one-click startup script
├── .gitignore
└── README.md
```

---

## License

MIT License. Open source for local developer productivity.