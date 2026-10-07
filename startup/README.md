# CampusFlow — One-Click Development Startup System

This directory provides a turn-key, one-click local development startup and shutdown workflow for **CampusFlow**.

---

## Quickstart

### Starting CampusFlow

To start the complete development environment, run:

```bat
startup\start-campusflow.bat
```

> **Tip:** In VS Code / Antigravity IDE, you can right-click `start-campusflow.bat` and select **Run in Active Terminal** or use the IDE Run/Play button.

### Stopping CampusFlow

To cleanly terminate all running development servers and stop infrastructure containers:

```bat
startup\stop-campusflow.bat
```

---

## What Happens During Startup

`start-campusflow.bat` automates the entire development environment orchestration:

1. **Repository Root Discovery**
   - Automatically determines the repository root relative to the script location. Works from any working directory without hardcoded paths.

2. **Prerequisites & Tool Verification**
   - Verifies the availability of required system tools:
     - `docker` & `docker compose`
     - `python` / `uv`
     - `node` & `npm`
   - Displays clear diagnostic instructions if any prerequisite is missing.

3. **Duplicate Run Prevention & Port Collision Checks**
   - Checks if CampusFlow is already running and healthy. If so, it immediately brings up Google Chrome without spawning duplicate processes.
   - Detects if ports `8000` or `5173` are occupied by conflicting non-CampusFlow processes.

4. **Docker Infrastructure Startup**
   - Verifies the Docker daemon is responding (attempts to launch Docker Desktop if needed).
   - Starts the repository's existing container services defined in `docker-compose.yml`:
     - **PostgreSQL 15**: Port `5432` (`campusflow_db`)
     - **Redis 7**: Port `6379` (caching & background broker)
     - **Mailpit**: SMTP on `1025`, Web UI on `8025` (local test email server)
     - **Piston**: Port `2000` (sandboxed code execution; bound to host loopback only and never exposed publicly)

5. **Dedicated Backend Process**
   - Launches the FastAPI backend in its own titled terminal window (`CampusFlow Backend`) with live auto-reload enabled.
   - Tracks the process ID in `startup/.backend.pid` for clean shutdown.
   - Command: `uv run uvicorn campusflow.main:app --host 0.0.0.0 --port 8000 --reload` (or `python -m uvicorn`).

6. **Dedicated Frontend Process**
   - Launches the Vite dev server in its own titled terminal window (`CampusFlow Frontend`) with hot-module replacement (HMR).
   - Tracks the process ID in `startup/.frontend.pid` for clean shutdown.
   - Command: `npm run dev` in `frontend/`.

7. **Automated Health & Readiness Polling**
   - Polls the backend health check endpoint (`http://localhost:8000/api/health`) up to 30 seconds until HTTP 200 is confirmed.
   - Polls the frontend dev server (`http://localhost:5173`) up to 30 seconds until HTTP 200 is confirmed.

8. **Automatic Browser Launch**
   - Once both services are verified healthy, automatically opens Google Chrome to `http://localhost:5173`.
   - Never opens the browser if any service fails readiness checks.

---

## Service URLs & Endpoints

| Service | URL | Description |
| :--- | :--- | :--- |
| **Frontend Application** | [http://localhost:5173](http://localhost:5173) | Main student, faculty, and administrator web portal |
| **Backend API Root** | [http://localhost:8000](http://localhost:8000) | FastAPI REST API root |
| **Health Check Endpoint** | [http://localhost:8000/api/health](http://localhost:8000/api/health) | System and database health status |
| **API Documentation** | [http://localhost:8000/api/docs](http://localhost:8000/api/docs) | Interactive OpenAPI / Swagger UI |
| **Mailpit Inbox** | [http://localhost:8025](http://localhost:8025) | Local inbox for viewing emails sent by CampusFlow |
| **Code execution (Piston)** | [http://localhost:2000](http://localhost:2000) | Sandbox runtime API used by the programming environment (loopback only) |

> The first start installs the Python runtime into Piston automatically; this can take a minute or two. If the programming page reports that execution is unavailable, wait for the install to finish and reload.

---

## Demo & Seed Accounts

When seeded (`uv run python scripts/seed.py`), the following demo credentials can be used to log in:

| Role | Email | Password |
| :--- | :--- | :--- |
| **System Administrator** | `admin@campusflow.edu` | `Admin@CampusFlow2026` |
| **Exam Controller** | `controller@campusflow.edu` | `Password@123` |
| **Department Head** | `hod.cse@campusflow.edu` | `Password@123` |
| **Faculty Member** | `faculty.cse@campusflow.edu` | `Password@123` |
| **Student** | `student1@campusflow.edu` | `Password@123` |

---

## Shutdown & Cleanup Details

`stop-campusflow.bat` provides safe, targeted teardown:

- **Targeted Process Tree Termination:** Reads `.backend.pid` and `.frontend.pid` and uses `taskkill /PID <PID> /T /F` to terminate only CampusFlow processes. It does **not** blindly kill other Python or Node processes on your machine.
- **Port Conflict Safeguard:** Checks if ports `8000` or `5173` remain bound and terminates any lingering orphans.
- **Infrastructure Teardown:** Stops Docker containers (`postgres`, `redis`, `mailpit`) while preserving database volumes for subsequent fast startup.
- **PID File Cleanup:** Removes `.backend.pid` and `.frontend.pid`.

---

## Troubleshooting

### 1. Docker Daemon Not Running
If you receive:
```text
[ERROR] Docker daemon is not running.
```
- Open **Docker Desktop** from your Windows Start Menu and ensure the engine icon in the lower-left corner shows **Engine running** (green).
- Re-run `startup\start-campusflow.bat`.

### 2. Port In Use (8000 or 5173)
If another program is using port 8000 or 5173:
```text
[ERROR] Port 8000 is already in use by another process
```
- Run `startup\stop-campusflow.bat` to clear any orphaned CampusFlow processes.
- If an unrelated app is using the port, check which process it is via:
  ```cmd
  netstat -ano | findstr :8000
  ```

### 3. Missing Dependencies
If the backend or frontend fails to compile:
- **Backend:** In `backend/`, run `uv sync` to install all Python dependencies.
- **Frontend:** In `frontend/`, run `npm install` to install all Node packages.
- **Database:** In `backend/`, run `uv run alembic upgrade head` to apply all pending schema migrations.
