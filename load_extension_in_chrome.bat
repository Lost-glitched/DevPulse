@echo off
echo ===================================================
echo DevPulse - Launching Chrome with Tab Tracker Extension
echo ===================================================
echo.

set EXT_PATH=%~dp0browser-extension

echo Extension path: %EXT_PATH%
echo.

start "" "chrome.exe" --load-extension="%EXT_PATH%" "http://localhost:3000"

echo Chrome launched with DevPulse extension loaded!
echo To verify, check the DevPulse dashboard at http://localhost:3000
timeout /t 3
