# CampusFlow Development & Operations Guide

## 1. Prerequisites

- **Docker Desktop** (Docker 24+, Docker Compose v2)
- **Python 3.12+** (for local backend development)
- **Node.js 20+** and **npm 10+** (for local frontend development)

---

## 2. One-Click Local Development Startup System

For the fastest local development experience on Windows, use the dedicated one-click automation scripts located in the `startup/` directory:

### Starting the Full Stack
Double-click `startup/start-campusflow.bat` or run it via your IDE's Run/Play button:

```bat
startup\start-campusflow.bat
```

**What it automates:**
1. Dynamically detects repository root (no hardcoded machine paths).
2. Verifies required tools (`docker`, `docker compose`, `python`/`uv`, `node`, `npm`).
3. Checks if CampusFlow is already running to prevent redundant duplicate processes.
4. Starts Docker infrastructure services (`postgres`, `redis`, `mailpit`).
5. Launches FastAPI backend on port 8000 in a dedicated titled window (`CampusFlow Backend`) with live reload and tracks its PID.
6. Launches Vite frontend on port 5173 in a dedicated titled window (`CampusFlow Frontend`) and tracks its PID.
7. Performs automated HTTP readiness polling on `http://localhost:8000/api/health` and `http://localhost:5173`.
8. Automatically opens `http://localhost:5173` in Google Chrome when readiness is confirmed.

### Stopping the Full Stack
Double-click `startup/stop-campusflow.bat` or run:

```bat
startup\stop-campusflow.bat
```

**What it cleanly terminates:**
1. Gracefully terminates the backend and frontend process trees using tracked PIDs (does not blindly kill unrelated system Python/Node processes).
2. Releases and frees ports 8000 and 5173.
3. Stops Docker containers (`postgres`, `redis`, `mailpit`) while preserving database state.
4. Cleans up temporary PID tracking files.

---

## 3. Quickstart with Docker Compose

To start the full stack entirely inside Docker containers including PostgreSQL, Redis, Mailpit, Backend, and Frontend:

```bash
docker compose up --build
```

### Exposed Endpoints
- **Frontend SPA:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:8000](http://localhost:8000)
- **Interactive OpenAPI Documentation:** [http://localhost:8000/api/docs](http://localhost:8000/api/docs)
- **Mailpit Web UI (Dev Email Catcher):** [http://localhost:8025](http://localhost:8025)
- **PostgreSQL Database:** `localhost:5432` (`campusflow` / `campusflow`)
- **Redis Cache:** `localhost:6379`

---

## 4. Local Backend Development

### Environment Setup
```bash
cd backend
python -m venv .venv

# Windows PowerShell
.venv\Scripts\Activate.ps1
# Linux/macOS
source .venv/bin/activate

pip install -e ".[dev]"
cp .env.example .env
```

### Running the Development Server
```bash
uvicorn campusflow.main:app --reload --host 0.0.0.0 --port 8000
```

### Database Migrations (Alembic)
```bash
# Generate a new migration revision
alembic revision --autogenerate -m "describe_migration"

# Apply pending migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1
```

### Running Backend Tests
```bash
# Run test suite
pytest

# Run tests with coverage
pytest --cov=campusflow tests/

# Run proctoring security & zero-tolerance tests specifically
pytest tests/test_proctoring_security.py

```

### Linting & Formatting
```bash
# Check code style with Ruff
ruff check .

# Format code with Ruff
ruff format .
```

---

## 5. Local Frontend Development

### Environment Setup
```bash
cd frontend
npm install
```

### Running Vite Development Server
```bash
npm run dev
```

### Production Build & Verification
```bash
# Typecheck and compile assets to dist/
npm run build

# Preview production build locally
npm run preview

# Lint frontend code
npm run lint
```

---

## 6. Seed Data & Database Initialization

A comprehensive, realistic demo seeder is provided in `scripts/seed.py`:
```bash
# From repository root
uv run python scripts/seed.py

# Or from backend directory
cd backend
uv run python ../scripts/seed.py
```

### Pre-Configured Demo Accounts
| Role | Email | Password | Scope & Responsibilities |
|---|---|---|---|
| **Super Admin** | `admin@campusflow.edu` | `Admin@CampusFlow2026` | Full platform access, user provisioning, institution branding, audit logs |
| **Exam Controller** | `controller@campusflow.edu` | `Password@123` | Institutional examination scheduling, question pool approvals, exam publishing |
| **Department Head (CSE)** | `hod.cse@campusflow.edu` | `Password@123` | Department management, program definitions, course offerings, analytics |
| **Faculty (CSE)** | `faculty.cse@campusflow.edu` | `Password@123` | Course instructor (CS201, CS301), question bank authoring, exam grading |
| **Faculty (MECH)** | `faculty.mech@campusflow.edu` | `Password@123` | Mechanical Engineering instructor (ME101) |
| **Student 1** | `student1@campusflow.edu` | `Password@123` | Alex Rivera (CS201, CS301), active submissions, exam attempts |
| **Student 2** | `student2@campusflow.edu` | `Password@123` | Brianna Patel (CS201, CS301), completed exam attempt |
| **Student 3** | `student3@campusflow.edu` | `Password@123` | Carlos Gomez (CS201), in-progress attempt |
| **Student 4** | `student4@campusflow.edu` | `Password@123` | Diana Prince (ME101) |

---

## 7. Production Deployment Strategy

1. **Containers:** Backend and frontend images are built via multi-stage Dockerfiles.
2. **Reverse Proxy:** A production reverse proxy (e.g. Caddy or Nginx) terminates SSL/TLS, routes `/api/*` to the FastAPI backend, and serves static frontend assets directly.
3. **Database Backups:** Daily automated database dumps via `pg_dump` with configurable retention.
