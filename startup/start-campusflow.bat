@echo off
setlocal EnableDelayedExpansion

:: ====================================================================
::  CampusFlow - One-Click Development Startup (single terminal)
::
::  Everything runs inside THIS window: bootstrap, infrastructure,
::  backend and frontend logs stream interleaved, then Chrome opens
::  automatically once both services report healthy.
::
::  Press any key in this window to stop every CampusFlow process.
:: ====================================================================

title CampusFlow

:: --------------------------------------------------------------------
:: Step A: Repository Layout
:: --------------------------------------------------------------------
set "STARTUP_DIR=%~dp0"
pushd "%STARTUP_DIR%.."
set "REPO_ROOT=%CD%"
popd
set "BACKEND_DIR=%REPO_ROOT%\backend"
set "FRONTEND_DIR=%REPO_ROOT%\frontend"
set "COMPOSE_FILE=%REPO_ROOT%\docker-compose.yml"

echo ====================================================================
echo  CampusFlow - starting everything in this single window
echo ====================================================================
echo  Repository: %REPO_ROOT%
echo.

:: --------------------------------------------------------------------
:: Step B: Preflight
:: --------------------------------------------------------------------
echo [*] Checking required tools...

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 'python' is not in PATH. Install Python 3.12+ first.
    goto :error_exit
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 'node' is not in PATH. Install Node.js 20+ first.
    goto :error_exit
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 'npm' is not in PATH. It ships with Node.js.
    goto :error_exit
)

pushd "%BACKEND_DIR%"
python -c "import campusflow" >nul 2>&1
if errorlevel 1 (
    popd
    echo [ERROR] Backend dependencies are missing.
    echo         Run:  cd backend ^&^& uv sync
    goto :error_exit
)
popd

if not exist "%FRONTEND_DIR%\node_modules" (
    echo [*] Installing frontend dependencies - first run only...
    pushd "%FRONTEND_DIR%"
    call npm install
    if errorlevel 1 (
        popd
        echo [ERROR] npm install failed.
        goto :error_exit
    )
    popd
)

echo [OK] Tools and dependencies ready.
echo.

:: --------------------------------------------------------------------
:: Step C: Already Running?
:: --------------------------------------------------------------------
set "BACKEND_ALIVE=0"
set "FRONTEND_ALIVE=0"
for /f %%H in ('curl.exe -s -o NUL -w "%%{http_code}" http://127.0.0.1:8000/api/health 2^>nul') do (
    if "%%H"=="200" set "BACKEND_ALIVE=1"
)
for /f %%H in ('curl.exe -s -o NUL -w "%%{http_code}" http://localhost:5173 2^>nul') do (
    if "%%H"=="200" set "FRONTEND_ALIVE=1"
)

if "!BACKEND_ALIVE!"=="1" if "!FRONTEND_ALIVE!"=="1" (
    echo [OK] CampusFlow is already running - opening Chrome.
    goto :open_browser
)

:: --------------------------------------------------------------------
:: Step D: Infrastructure (Docker when available, SQLite otherwise)
:: --------------------------------------------------------------------
where docker >nul 2>&1
if not errorlevel 1 (
    docker info >nul 2>&1
    if not errorlevel 1 (
        echo [*] Docker detected - starting PostgreSQL, Redis, Mailpit and Piston...
        docker compose -f "%COMPOSE_FILE%" up -d postgres redis mailpit piston piston-init
        if errorlevel 1 (
            echo [WARN] docker compose failed - continuing, bootstrap will use SQLite.
        )
    ) else (
        echo [INFO] Docker daemon is not running.
        echo        Falling back to the local SQLite database so the app still works.
        echo        Code execution will report 'sandbox unavailable' until Docker is up.
    )
) else (
    echo [INFO] Docker is not installed - using the local SQLite database.
)
echo.

:: --------------------------------------------------------------------
:: Step E: Bootstrap (.env, schema, demo data) - idempotent
:: --------------------------------------------------------------------
echo [*] Bootstrapping environment, schema and demo data...
python "%REPO_ROOT%\scripts\bootstrap.py"
if errorlevel 1 (
    echo [ERROR] Bootstrap failed. See the message above.
    goto :error_exit
)
echo.

:: --------------------------------------------------------------------
:: Step F: Port conflicts
:: --------------------------------------------------------------------
if "!BACKEND_ALIVE!"=="0" (
    netstat -ano 2>nul | findstr /R /C:":8000 .*LISTENING" >nul 2>&1
    if not errorlevel 1 (
        echo [ERROR] Port 8000 is held by another process. Run startup\stop-campusflow.bat.
        goto :error_exit
    )
)
if "!FRONTEND_ALIVE!"=="0" (
    netstat -ano 2>nul | findstr /R /C:":5173 .*LISTENING" >nul 2>&1
    if not errorlevel 1 (
        echo [ERROR] Port 5173 is held by another process. Run startup\stop-campusflow.bat.
        goto :error_exit
    )
)

:: --------------------------------------------------------------------
:: Step G: Start Backend + Frontend in THIS window (interleaved logs)
:: --------------------------------------------------------------------
echo [*] Starting backend on http://127.0.0.1:8000  (logs appear below)
powershell -NoProfile -Command "$p = Start-Process -NoNewWindow -FilePath 'python' -ArgumentList '-m','uvicorn','campusflow.main:app','--host','127.0.0.1','--port','8000' -WorkingDirectory '%BACKEND_DIR%' -PassThru; [IO.File]::WriteAllText('%STARTUP_DIR%\.backend.pid', [string]$p.Id)"

echo [*] Starting frontend on http://localhost:5173 (logs appear below)
powershell -NoProfile -Command "$p = Start-Process -NoNewWindow -FilePath 'cmd.exe' -ArgumentList '/c','npm run dev' -WorkingDirectory '%FRONTEND_DIR%' -PassThru; [IO.File]::WriteAllText('%STARTUP_DIR%\.frontend.pid', [string]$p.Id)"
echo.

:: --------------------------------------------------------------------
:: Step H: Readiness
:: --------------------------------------------------------------------
echo [*] Waiting for the backend health endpoint...
set "BACKEND_READY=0"
for /l %%A in (1,1,30) do (
    if "!BACKEND_READY!"=="0" (
        for /f %%H in ('curl.exe -s -o NUL -w "%%{http_code}" http://127.0.0.1:8000/api/health 2^>nul') do (
            if "%%H"=="200" set "BACKEND_READY=1"
        )
        if not "!BACKEND_READY!"=="1" ping 127.0.0.1 -n 2 >nul
    )
)
if "!BACKEND_READY!"=="1" (
    echo [OK] Backend healthy.
) else (
    echo [ERROR] Backend did not become healthy within 30 seconds.
    goto :error_exit
)

echo [*] Waiting for the frontend dev server...
set "FRONTEND_READY=0"
for /l %%A in (1,1,30) do (
    if "!FRONTEND_READY!"=="0" (
        for /f %%H in ('curl.exe -s -o NUL -w "%%{http_code}" http://localhost:5173 2^>nul') do (
            if "%%H"=="200" set "FRONTEND_READY=1"
        )
        if not "!FRONTEND_READY!"=="1" ping 127.0.0.1 -n 2 >nul
    )
)
if "!FRONTEND_READY!"=="1" (
    echo [OK] Frontend ready.
) else (
    echo [ERROR] Frontend did not become ready within 30 seconds.
    goto :error_exit
)
echo.

:: --------------------------------------------------------------------
:: Step I: Chrome
:: --------------------------------------------------------------------
:open_browser
echo [*] Opening Google Chrome...
set "CHROME_BIN="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_BIN if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_BIN if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if defined CHROME_BIN (
    start "" "!CHROME_BIN!" "http://localhost:5173"
    echo [OK] Chrome opened at http://localhost:5173
) else (
    start chrome "http://localhost:5173" >nul 2>&1
    if errorlevel 1 (
        echo [WARN] Chrome not found - open http://localhost:5173 manually.
    ) else (
        echo [OK] Chrome opened at http://localhost:5173
    )
)

echo.
echo ====================================================================
echo  CampusFlow is running. Live logs stream below.
echo --------------------------------------------------------------------
echo   App:        http://localhost:5173
echo   API docs:   http://localhost:8000/api/docs
echo   Mailpit:    http://localhost:8025
echo.
echo   Demo login: admin@campusflow.edu / Admin@CampusFlow2026
echo               student1@campusflow.edu / Password@123
echo.
echo   PRESS ANY KEY IN THIS WINDOW TO STOP EVERYTHING.
echo ====================================================================
echo.
pause >nul

echo [*] Stopping all CampusFlow services...
call "%STARTUP_DIR%\stop-campusflow.bat" --no-pause
exit /b 0

:: --------------------------------------------------------------------
:error_exit
echo.
echo ====================================================================
echo  Startup failed - see the message above.
echo ====================================================================
echo.
if "%~1"=="--no-pause" exit /b 1
pause
exit /b 1
