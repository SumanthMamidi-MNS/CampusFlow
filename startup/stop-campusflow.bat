@echo off
setlocal EnableDelayedExpansion

:: ====================================================================
:: CampusFlow - One-Click Development Shutdown System
:: ====================================================================

title CampusFlow Shutdown Launcher

:: --------------------------------------------------------------------
:: Step A: Determine Repository Root
:: --------------------------------------------------------------------
set "STARTUP_DIR=%~dp0"
pushd "%STARTUP_DIR%.."
set "REPO_ROOT=%CD%"
popd

echo ====================================================================
echo  CampusFlow Clean Shutdown Launcher
echo ====================================================================
echo  Repository Root: %REPO_ROOT%
echo.

:: --------------------------------------------------------------------
:: Step B: Terminate Backend Process
:: --------------------------------------------------------------------
echo [*] Checking for running Backend process...
if exist "%STARTUP_DIR%.backend.pid" (
    set /p BPID=<"%STARTUP_DIR%.backend.pid"
    if defined BPID (
        echo [INFO] Stopping Backend process tree [PID: !BPID!]...
        taskkill /PID !BPID! /T /F >nul 2>&1
        if not errorlevel 1 (
            echo [OK] Backend process tree terminated.
        ) else (
            echo [INFO] Backend process was already stopped or PID expired.
        )
    )
    del /f /q "%STARTUP_DIR%.backend.pid" >nul 2>&1
) else (
    echo [INFO] No .backend.pid file found.
)

:: Free port 8000 if still bound
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr /R /C:":8000 .*LISTENING"') do (
    set "STRAY_PID=%%P"
    if defined STRAY_PID if not "!STRAY_PID!"=="0" (
        echo [INFO] Cleaning up lingering process on port 8000 [PID: !STRAY_PID!]...
        taskkill /PID !STRAY_PID! /T /F >nul 2>&1
    )
)

:: --------------------------------------------------------------------
:: Step C: Terminate Frontend Process
:: --------------------------------------------------------------------
echo [*] Checking for running Frontend process...
if exist "%STARTUP_DIR%.frontend.pid" (
    set /p FPID=<"%STARTUP_DIR%.frontend.pid"
    if defined FPID (
        echo [INFO] Stopping Frontend process tree [PID: !FPID!]...
        taskkill /PID !FPID! /T /F >nul 2>&1
        if not errorlevel 1 (
            echo [OK] Frontend process tree terminated.
        ) else (
            echo [INFO] Frontend process was already stopped or PID expired.
        )
    )
    del /f /q "%STARTUP_DIR%.frontend.pid" >nul 2>&1
) else (
    echo [INFO] No .frontend.pid file found.
)

:: Free port 5173 if still bound
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr /R /C:":5173 .*LISTENING"') do (
    set "STRAY_PID=%%P"
    if defined STRAY_PID if not "!STRAY_PID!"=="0" (
        echo [INFO] Cleaning up lingering process on port 5173 [PID: !STRAY_PID!]...
        taskkill /PID !STRAY_PID! /T /F >nul 2>&1
    )
)

:: --------------------------------------------------------------------
:: Step D: Stop Docker Infrastructure
:: --------------------------------------------------------------------
echo [*] Stopping Docker infrastructure containers [PostgreSQL, Redis, Mailpit]...
where docker >nul 2>&1
if not errorlevel 1 (
    docker info >nul 2>&1
    if not errorlevel 1 (
        docker compose -f "%REPO_ROOT%\docker-compose.yml" stop postgres redis mailpit >nul 2>&1
        if not errorlevel 1 (
            echo [OK] Docker containers stopped.
        ) else (
            echo [WARNING] Docker Compose encountered an issue stopping containers.
        )
    ) else (
        echo [INFO] Docker daemon is not active. Containers are not running.
    )
) else (
    echo [INFO] Docker CLI is not installed or not in PATH.
)

:: --------------------------------------------------------------------
:: Step E: Final Verification
:: --------------------------------------------------------------------
echo.
echo [*] Verifying port releases...

netstat -ano 2>nul | findstr /R /C:":8000 .*LISTENING" >nul 2>&1
if errorlevel 1 (
    echo [OK] Port 8000 is free.
) else (
    echo [WARNING] Port 8000 is still reported as LISTENING.
)

netstat -ano 2>nul | findstr /R /C:":5173 .*LISTENING" >nul 2>&1
if errorlevel 1 (
    echo [OK] Port 5173 is free.
) else (
    echo [WARNING] Port 5173 is still reported as LISTENING.
)

echo.
echo ====================================================================
echo  CampusFlow Environment has been cleanly stopped.
echo ====================================================================
echo  All application processes have been terminated.
echo  Infrastructure containers have been stopped.
echo  To start CampusFlow again at any time, run:
echo    startup\start-campusflow.bat
echo ====================================================================
echo.
ping 127.0.0.1 -n 3 >nul
exit /b 0
