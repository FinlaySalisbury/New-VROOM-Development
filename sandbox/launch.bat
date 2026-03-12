@echo off
title InView Sandbox Launcher
echo.
echo  ========================================
echo   InView VROOM Simulation Sandbox
echo  ========================================
echo.
echo  Starting Docker containers...
echo.

docker compose up -d --build

if %ERRORLEVEL% EQU 0 (
    echo.
    echo  ✅ Sandbox is running!
    echo  Open: http://localhost:8000
    echo.
    start http://localhost:8000
) else (
    echo.
    echo  ❌ Failed to start. Is Docker Desktop running?
    echo.
)

pause
