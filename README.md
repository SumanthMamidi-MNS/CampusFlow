# CampusFlow

**College LMS & Secure Online Examination Platform**

CampusFlow is a self-contained, institution-deployable Learning Management System with integrated secure online examinations. It covers academic administration, course management, learning materials, assignments, question banks, proctored examinations, and a sandboxed in-browser programming environment with automated test-case grading.

---

## Quick Start (one click)

Double-click **`start.bat`** in the repository root. One terminal window opens and does everything:

1. Checks the toolchain and dependencies.
2. Starts the infrastructure containers (PostgreSQL, Redis, Mailpit, Piston) when Docker is available.
3. Bootstraps the environment — creates `backend/.env` on first run, applies migrations, and seeds realistic demo data (all idempotent, safe to re-run).
4. Starts the backend and frontend **inside that same window**, with both logs streaming interleaved.
5. Opens **Google Chrome at <http://localhost:5173>** once both services report healthy.
6. Pressing any key in the window stops every CampusFlow process cleanly.

Equivalent manual commands:

```bat
start.bat                      :: everything above
startup\stop-campusflow.bat    :: stop all services and containers
```

### If Docker is not running

The launcher still works: `scripts/bootstrap.py` detects that PostgreSQL is unreachable and falls back to a local SQLite file (`backend/campusflow.db`), so the whole application — login, courses, assignments, exams, analytics — remains usable. Only sandboxed code execution is unavailable in that mode, and the UI says so explicitly instead of failing silently.

### Prerequisites

- [Python 3.12+](https://www.python.org/) and [`uv`](https://docs.astral.sh/uv/) (backend dependencies: `cd backend && uv sync`)
- [Node.js 20+](https://nodejs.org/) (frontend dependencies are installed automatically on first run)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — recommended for PostgreSQL and the Piston code sandbox, but not required to explore the app

### Demo accounts (created by the seeder)

| Role | Email | Password |
| :--- | :--- | :--- |
| Super Admin | `admin@campusflow.edu` | `Admin@CampusFlow2026` |
| Exam Controller | `controller@campusflow.edu` | `Password@123` |
| Department Head | `hod.cse@campusflow.edu` | `Password@123` |
| Faculty (CSE) | `faculty.cse@campusflow.edu` | `Password@123` |
| Student | `student1@campusflow.edu` | `Password@123` |

---

## Running Without the Launcher

**Backend**

```bash
cd backend
uv sync                      # install dependencies
python ../scripts/bootstrap.py   # .env + migrations + seed (idempotent)
uv run uvicorn campusflow.main:app --host 127.0.0.1 --port 8000 --reload
```

**Frontend**

```bash
cd frontend
npm install
npm run dev                  # http://localhost:5173, proxies /api to :8000
```

**Verification suite**

```bash
cd backend  && python -m pytest -q && python -m ruff check campusflow tests
cd frontend && npm run build && npm run lint
```

---

## Project Structure

```
CampusFlow/
├── start.bat                # one-click launcher
├── backend/                 # FastAPI backend (Python 3.12)
│   ├── campusflow/
│   │   ├── bedrock/         # foundation: auth, RBAC, audit, storage, mail, code runner
│   │   └── domain/          # CampusFlow business logic (one module per domain)
│   ├── alembic/             # migrations
│   ├── tests/               # pytest suite (24 tests)
│   └── scripts/bootstrap.py # idempotent env + schema + seed
├── frontend/                # React 19 SPA (TypeScript, Vite 8, Tailwind 4)
│   └── src/
│       ├── core/            # reusable UI primitives, API client, auth
│       ├── features/        # domain feature modules
│       └── app/             # routes, layout, providers
├── startup/                 # start/stop orchestration + README
├── scripts/seed.py          # demo dataset
├── docker-compose.yml       # postgres, redis, mailpit, piston, backend, frontend
└── docs/                    # architecture, decisions, progress, QA reports
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic, PostgreSQL 15 |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, TanStack Query |
| Auth | JWT access + refresh tokens, RBAC permissions, audit logging |
| Code execution | Piston sidecar (isolate sandbox), fail-closed API |

---

## Architecture

CampusFlow uses a **modular monolith**:

- **Bedrock** — project-agnostic foundation (auth, RBAC, audit, storage, mail, API conventions, the code-runner abstraction). Never imports from Domain.
- **Domain** — CampusFlow business logic (courses, enrollments, assignments, question banks, exams, programming, analytics, notifications). Imports from Bedrock only.

Student code is never executed inside the API process: every submission is handed to the Piston sidecar, which runs it in an `isolate` sandbox. If the sandbox is unreachable the API fails closed with a clear "unavailable" response rather than fabricating a result.

Details: [`docs/architecture.md`](docs/architecture.md) · Decision log: [`docs/decisions.md`](docs/decisions.md) · QA evidence: [`docs/qa-report.md`](docs/qa-report.md) and [`docs/live-qa-log.md`](docs/live-qa-log.md)

---

## Environment Variables

See [`backend/.env.example`](backend/.env.example). The launcher creates `backend/.env` automatically with a generated JWT secret. Notable settings:

| Variable | Default | Purpose |
|---|---|---|
| `DEBUG` | `false` | Enables `/api/docs` and permits the placeholder secret |
| `DATABASE_URL` | PostgreSQL | Falls back to SQLite via the bootstrap script when Postgres is unreachable |
| `CODE_RUNNER_*` | Piston on `:2000` | Sandboxed code execution; `CODE_RUNNER_ENABLED=false` disables it |
| `AUTH_RATE_LIMIT_*` | 20 / 60s | Per-IP rate limit on credential endpoints |

---

## License

Proprietary. All rights reserved.
