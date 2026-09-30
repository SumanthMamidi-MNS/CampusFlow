# CampusFlow

**College LMS & Secure Online Examination Platform**

CampusFlow is a self-contained, institution-deployable Learning Management System with integrated secure online examinations. It covers academic administration, course management, learning materials, assignments, question banks, and proctored examinations.

---

## Quick Start (Development)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- [Python 3.12+](https://www.python.org/) (for backend development without Docker)
- [Node.js 20+](https://nodejs.org/) (for frontend development without Docker)

### Option 1: Docker Compose (recommended)

```bash
# Clone and start all services
docker compose up --build

# Services:
#   Frontend:  http://localhost:5173
#   Backend:   http://localhost:8000
#   API Docs:  http://localhost:8000/api/docs
#   Mailpit:   http://localhost:8025
```

### Option 2: Manual Setup

**Backend:**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/Mac

pip install -e ".[dev]"
cp .env.example .env            # Edit as needed

# Run database migrations
alembic upgrade head

# Start development server
uvicorn campusflow.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## Project Structure

```
CampusFlow/
├── backend/                 # FastAPI backend (Python)
│   ├── campusflow/
│   │   ├── bedrock/         # Reusable foundation (auth, RBAC, storage, etc.)
│   │   └── domain/          # CampusFlow-specific business logic
│   ├── alembic/             # Database migrations
│   ├── tests/
│   └── Dockerfile
├── frontend/                # React SPA (TypeScript)
│   ├── src/
│   │   ├── core/            # Reusable frontend infrastructure
│   │   ├── features/        # Domain feature modules
│   │   └── app/             # App shell, routing, providers
│   └── Dockerfile
├── docker-compose.yml       # Development environment
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.x (async), Alembic |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| Auth | JWT (access + refresh tokens) |

---

## Architecture

CampusFlow uses a **modular monolith** architecture:

- **Bedrock** — project-agnostic reusable foundation (auth, RBAC, audit, storage, API conventions, DB base models)
- **Domain** — CampusFlow-specific business logic (courses, exams, enrollments, etc.)

Bedrock never imports from Domain. Domain imports from Bedrock. This boundary enables future extraction of Bedrock as a standalone package for other projects.

---

## Environment Variables

See [`backend/.env.example`](backend/.env.example) for all configuration options.

---

## License

Proprietary. All rights reserved.
