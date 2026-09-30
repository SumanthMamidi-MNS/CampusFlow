@echo off
setlocal EnableDelayedExpansion

:: ====================================================================
:: CampusFlow - One-Click Development Startup System
:: ====================================================================

title CampusFlow Startup Launcher

:: --------------------------------------------------------------------
:: Step A: Determine Repository Root
:: --------------------------------------------------------------------
set "STARTUP_DIR=%~dp0"
pushd "%STARTUP_DIR%.."
set "REPO_ROOT=%CD%"
popd

echo ====================================================================
echo  CampusFlow One-Click Development Environment Startup
echo ====================================================================
echo  Repository Root: %REPO_ROOT%
echo.

:: --------------------------------------------------------------------
:: Step B: Check Required Tools
:: --------------------------------------------------------------------
echo [*] Checking required system tools...

where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 'docker' is not installed or not in system PATH.
    echo Please install Docker Desktop: https://www.docker.com/products/docker-desktop/
    goto :error_exit
)

docker compose version >nul 2>&1
if errorlevel 1 (
    docker-compose --version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] 'docker compose' is not installed or not available in PATH.
        echo Please ensure Docker Compose v2 is installed with Docker Desktop.
        goto :error_exit
    )
)

where python >nul 2>&1
if errorlevel 1 (
    where uv >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] 'python' is not installed or not in system PATH.
        echo Please install Python 3.12+: https://www.python.org/
        goto :error_exit
    )
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 'node' is not installed or not in system PATH.
    echo Please install Node.js 20+: https://nodejs.org/
    goto :error_exit
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 'npm' is not installed or not in system PATH.
    echo Please ensure npm is installed [bundled with Node.js].
    goto :error_exit
)

echo [OK] All prerequisite tools detected (Docker, Docker Compose, Python, Node, npm).
echo.

:: --------------------------------------------------------------------
:: Step C: Check if CampusFlow is Already Running (Prevent Duplicates)
:: --------------------------------------------------------------------
echo [*] Checking if CampusFlow is already running...
set "BACKEND_ALIVE=0"
set "FRONTEND_ALIVE=0"

for /f %%H in ('curl.exe -s -o NUL -w "%%{http_code}" http://localhost:8000/api/health 2^>nul') do (
    if "%%H"=="200" set "BACKEND_ALIVE=1"
)

for /f %%H in ('curl.exe -s -o NUL -w "%%{http_code}" http://localhost:5173 2^>nul') do (
    if "%%H"=="200" set "FRONTEND_ALIVE=1"
)

if "!BACKEND_ALIVE!"=="1" if "!FRONTEND_ALIVE!"=="1" (
    echo.
    echo ============================================================
    echo  CampusFlow is already running.
    echo ============================================================
    echo  Frontend: http://localhost:5173
    echo  Backend:  http://localhost:8000
    echo.
    echo  Opening CampusFlow in Google Chrome...
    goto :open_browser
)

:: Check if ports are occupied by unrelated processes
if "!BACKEND_ALIVE!"=="0" (
    netstat -ano 2>nul | findstr /R /C:":8000 .*LISTENING" >nul 2>&1
    if not errorlevel 1 (
        echo [ERROR] Port 8000 is already in use by another process, but is not responding as healthy CampusFlow.
        echo Please terminate the conflicting process or run startup\stop-campusflow.bat.
        goto :error_exit
    )
)

if "!FRONTEND_ALIVE!"=="0" (
    netstat -ano 2>nul | findstr /R /C:":5173 .*LISTENING" >nul 2>&1
    if not errorlevel 1 (
        echo [ERROR] Port 5173 is already in use by another process, but is not responding as CampusFlow Frontend.
        echo Please terminate the conflicting process or run startup\stop-campusflow.bat.
        goto :error_exit
    )
)

:: --------------------------------------------------------------------
:: Step D: Check & Start Docker Infrastructure
:: --------------------------------------------------------------------
echo [*] Checking Docker daemon status...
docker info >nul 2>&1
if errorlevel 1 (
    echo [INFO] Docker daemon is not responding. Checking for Docker Desktop...
    if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
        echo [INFO] Attempting to launch Docker Desktop...
        start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
        echo [WAIT] Waiting up to 30 seconds for Docker daemon to initialize...
        set "DOCKER_OK=0"
        for /l %%I in (1,1,15) do (
            if "!DOCKER_OK!"=="0" (
                ping 127.0.0.1 -n 3 >nul
                docker info >nul 2>&1 && set "DOCKER_OK=1"
            )
        )
    )
    docker info >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Docker daemon is not running.
        echo CampusFlow requires Docker to host PostgreSQL, Redis, and Mailpit.
        echo Please launch Docker Desktop, wait for the engine to start, and re-run this script.
        goto :error_exit
    )
)
echo [OK] Docker daemon is active.

echo [*] Starting database and infrastructure containers (PostgreSQL, Redis, Mailpit)...
docker compose -f "%REPO_ROOT%\docker-compose.yml" up -d postgres redis mailpit
if errorlevel 1 (
    echo [ERROR] Failed to start Docker infrastructure services.
    echo Please run 'docker compose ps' in %REPO_ROOT% to inspect container state.
    goto :error_exit
)
echo [OK] Infrastructure containers started.
echo.

:: --------------------------------------------------------------------
:: Step E: Start Backend in Dedicated Terminal Window
:: --------------------------------------------------------------------
echo [*] Starting CampusFlow Backend on http://localhost:8000...
set "BACKEND_CMD=uv run uvicorn campusflow.main:app --host 0.0.0.0 --port 8000 --reload"
where uv >nul 2>&1 || set "BACKEND_CMD=python -m uvicorn campusflow.main:app --host 0.0.0.0 --port 8000 --reload"

powershell -NoProfile -Command "$p = Start-Process -FilePath 'cmd.exe' -WorkingDirectory '%REPO_ROOT%\backend' -ArgumentList '/k', 'title CampusFlow Backend && !BACKEND_CMD!' -PassThru; [IO.File]::WriteAllText('%STARTUP_DIR%.backend.pid', $p.Id)"
set /p BACKEND_PID=<"%STARTUP_DIR%.backend.pid"
echo [OK] Backend process launched [PID: !BACKEND_PID!].

:: --------------------------------------------------------------------
:: Step F: Start Frontend in Dedicated Terminal Window
:: --------------------------------------------------------------------
echo [*] Starting CampusFlow Frontend on http://localhost:5173...
powershell -NoProfile -Command "$p = Start-Process -FilePath 'cmd.exe' -WorkingDirectory '%REPO_ROOT%\frontend' -ArgumentList '/k', 'title CampusFlow Frontend && npm run dev' -PassThru; [IO.File]::WriteAllText('%STARTUP_DIR%.frontend.pid', $p.Id)"
set /p FRONTEND_PID=<"%STARTUP_DIR%.frontend.pid"
echo [OK] Frontend process launched [PID: !FRONTEND_PID!].
echo.

:: --------------------------------------------------------------------
:: Step G: Readiness Checks
:: --------------------------------------------------------------------
echo ====================================================================
echo  Performing Readiness Checks...
echo ====================================================================

:: 1. Backend Health Check
echo [*] Waiting for Backend health endpoint (http://localhost:8000/api/health)...
set "BACKEND_READY=0"
for /l %%A in (1,1,30) do (
    if "!BACKEND_READY!"=="0" (
        for /f %%H in ('curl.exe -s -o NUL -w "%%{http_code}" http://localhost:8000/api/health 2^>nul') do (
            if "%%H"=="200" set "BACKEND_READY=1"
        )
        if "!BACKEND_READY!"=="1" (
            echo [OK] Backend is healthy and responding [HTTP 200].
        ) else (
            echo   Attempt %%A/30: Backend initializing...
            ping 127.0.0.1 -n 2 >nul
        )
    )
)

if not "!BACKEND_READY!"=="1" (
    echo.
    echo [ERROR] Backend failed to become healthy within 30 seconds.
    echo Expected: http://localhost:8000/api/health returning HTTP 200.
    echo Diagnostic guidance:
    echo   - Inspect the terminal window titled 'CampusFlow Backend' for exceptions.
    echo   - Check PostgreSQL container status with: docker compose ps
    goto :error_exit
)

:: 2. Frontend Health Check
echo [*] Waiting for Frontend dev server (http://localhost:5173)...
set "FRONTEND_READY=0"
for /l %%A in (1,1,30) do (
    if "!FRONTEND_READY!"=="0" (
        for /f %%H in ('curl.exe -s -o NUL -w "%%{http_code}" http://localhost:5173 2^>nul') do (
            if "%%H"=="200" set "FRONTEND_READY=1"
        )
        if "!FRONTEND_READY!"=="1" (
            echo [OK] Frontend is ready and responding [HTTP 200].
        ) else (
            echo   Attempt %%A/30: Frontend compiling...
            ping 127.0.0.1 -n 2 >nul
        )
    )
)

if not "!FRONTEND_READY!"=="1" (
    echo.
    echo [ERROR] Frontend failed to become ready within 30 seconds.
    echo Expected: http://localhost:5173 returning HTTP 200.
    echo Diagnostic guidance:
    echo   - Inspect the terminal window titled 'CampusFlow Frontend' for Vite errors.
    goto :error_exit
)

echo.
echo [SUCCESS] All CampusFlow services are verified and operational!
echo.

:: --------------------------------------------------------------------
:: Step H: Automatically Open Chrome
:: --------------------------------------------------------------------
:open_browser
echo [*] Opening CampusFlow in Google Chrome...
set "CHROME_BIN="

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_BIN=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
)
if not defined CHROME_BIN (
    if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
        set "CHROME_BIN=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    )
)
if not defined CHROME_BIN (
    if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
        set "CHROME_BIN=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
    )
)

if defined CHROME_BIN (
    start "" "!CHROME_BIN!" "http://localhost:5173"
    echo [OK] Google Chrome opened to http://localhost:5173.
) else (
    start chrome "http://localhost:5173" >nul 2>&1
    if errorlevel 1 (
        echo [WARNING] Google Chrome was not found at standard paths.
        echo Please manually navigate to: http://localhost:5173
    ) else (
        echo [OK] Google Chrome opened to http://localhost:5173.
    )
)

echo.
echo ====================================================================
echo  CampusFlow Development Environment is Ready!
echo ====================================================================
echo  Frontend URL:     http://localhost:5173   [Opened in Chrome]
echo  Backend API:      http://localhost:8000
echo  API Documentation:http://localhost:8000/api/docs
echo  Mailpit Web UI:   http://localhost:8025
echo ====================================================================
echo  To stop all services and containers cleanly, run:
echo    startup\stop-campusflow.bat
echo ====================================================================
echo.
ping 127.0.0.1 -n 4 >nul
exit /b 0

:: --------------------------------------------------------------------
:: Error Exit Routine
:: --------------------------------------------------------------------
:error_exit
echo.
echo ====================================================================
echo  CampusFlow startup encountered an error and could not continue.
echo  See details and diagnostic hints above.
echo ====================================================================
echo.
if not "%~1"=="--no-pause" pause
exit /b 1
