@echo off
echo Starting DevPulse...

echo Starting Backend...
start "DevPulse Backend" cmd /k "python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000"

echo Starting Frontend...
start "DevPulse Frontend" cmd /k "cd frontend && npm run dev"

echo DevPulse is starting up!
echo The backend is running in a new window.
echo The frontend is running in a new window.
echo You can view the dashboard at http://localhost:3000

timeout /t 3
