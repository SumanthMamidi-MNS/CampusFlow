# CampusFlow

### College LMS & secure examination platform — academic operations, integrity-monitored assessment and automated code grading in one deployable system.

[![CI](https://github.com/SumanthMamidi-MNS/CampusFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/SumanthMamidi-MNS/CampusFlow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![PostgreSQL 15](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)
![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

![Institutional dashboard — enrolment, faculty, course and examination analytics](docs/images/02-dashboard.png)

**CampusFlow** is a self-hosted platform for a single college or university: departments, programmes,
terms, courses, sections and rosters; learning materials, assignments, submissions and gradebooks;
question banks and scheduled examinations with an auditable integrity trail; institution-wide
analytics; and an in-browser programming environment where student code runs in a sandbox and is
graded automatically against test cases.

It is one repository that a college IT team can deploy on a single server. There is no SaaS
dependency, no public sign-up, and no fabricated demo data in the product paths: every screen is
backed by the same API a live institution would use.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [Feature highlights](#feature-highlights)
- [Screens](#screens)
- [Run it](#run-it)
- [Architecture](#architecture)
- [Security and privacy model](#security-and-privacy-model)
- [Tech stack](#tech-stack)
- [Verification](#verification)
- [Production deployment](#production-deployment)
- [Repository layout](#repository-layout)
- [Documentation](#documentation)
- [Selected engineering decisions](#selected-engineering-decisions)
- [Known limitations and roadmap](#known-limitations-and-roadmap)
- [License](#license)

---

## Why this exists

Most teaching platforms force a bad choice: a general-purpose LMS that cannot run a secure examination,
or a separate exam tool that knows nothing about the course, the section or the roster. Institutions
end up stitching together an LMS, a forms tool, a proctoring subscription and a code-judge, then
reconciling four sets of identities.

CampusFlow treats those as **one cohort problem**. The same `course_offering` that owns a roster,
materials, assignments and a gradebook also owns the examinations sat by exactly those students, the
integrity events recorded during those sittings, and the marks that go back into the gradebook. One
service owns who may see which cohort — and every route has to ask it.

---

## Feature highlights

**Academic operations**
- Departments, programmes, batches, academic terms; curriculum catalogues and sectioned course offerings with faculty assignments.
- Rosters with two-phase CSV/Excel import (preview → commit), duplicate prevention enforced at the database, and an immutable registration-number identity.
- Materials (folders, files, links, notes), course announcements, assignments with rubrics, late penalties and weighted gradebooks with CSV export.

**Assessment integrity**
- Question banks with departments, approval workflow, every question type (MCQ, MSQ, true/false, numerical with tolerance, fill-in-the-blank, short/long answer) and CSV import/export.
- Examination lifecycle: draft → scheduled → live → completed → graded → published, with sections, per-paper question banks, shuffling, negative marking and instant-result policies.
- Candidate delivery canvas: server-authoritative timing, autosave with a local fallback, question navigator, and abandoned attempts reconciled automatically.
- Observable integrity signals (tab switch, blur, full-screen exit, navigation attempt, clipboard) with a **per-exam tolerance policy** that defaults to removal at the threshold, plus a faculty-authorised, audited resumption.

**Programming environment**
- Problem sets with hidden and public test cases; students write and run code in the browser, then submit for grading against the visible and hidden suites.
- Student code **never runs in the API process**: it is handed to a Piston sidecar that executes it inside an `isolate` sandbox with real CPU-time, memory and concurrency ceilings. If the sandbox is unavailable, the API fails closed with a `503` instead of inventing a result.

**Institution administration**
- RBAC with six system roles and fine-grained permissions, an append-only audit trail with filtering, and institution white-labelling (name, crest, accent, timezone, helpline, proctoring defaults).
- Institutional, course, exam and student analytics — computed, never fabricated: a metric with no data returns `null`, not a placeholder percentage.
- Notification centre with per-channel preferences and SMTP delivery; CSV exports for gradebooks, results and question banks.

**Operations**
- One `docker compose` project for production: static SPA, API, PostgreSQL, Redis, sandbox, Caddy front door, nightly backups and a camera-evidence retention job.
- Configurable retention erases camera frames while keeping the integrity event and its timeline; each erasure is audited.

---

## Screens

| Assessment integrity | Coding environment | Institution operations |
| :---: | :---: | :---: |
| ![Candidate assessment brief with the integrity and camera disclosure](docs/images/11-assessment.png) | ![Sandboxed programming problem with the editor and test results](docs/images/10-programming-editor.png) | ![Examination workspace with questions and the grading queue](docs/images/06-exam-workspace.png) |
| ![Scheduled and published examinations](docs/images/05-examinations.png) | ![Question bank authoring](docs/images/08-question-banks.png) | ![Course workspace with announcements](docs/images/04-course-workspace.png) |

The student's whole view is a different projection from the staff view — different payloads, different
navigation, never the same response model:

| Candidate | Staff |
| :---: | :---: |
| ![Student dashboard with their own KPIs](docs/images/12-student-dashboard.png) | ![Institutional analytics dashboard](docs/images/02-dashboard.png) |

---

## Run it

### Option A — the real thing, on any server, in three commands

Requires Docker Engine with Compose v2 and ports 80/443 free. Nothing else on the host.

```bash
cp .env.production.example .env      # then set POSTGRES_PASSWORD and JWT_SECRET_KEY
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend \
  python scripts/provision_admin.py --email you@example.edu --password 'at least 12 characters'
```

Migrations run in-process at start, the proxy is the only public service, and there is no public
sign-up — the last command creates the first Campus Lead. Full runbook (TLS, backups and restore,
retention, upgrades, troubleshooting): [docs/development.md §7](docs/development.md#7-production-deployment).

### Option B — one click, for development (Windows)

Double-click **`start.bat`**. One terminal bootstraps the environment, starts the infrastructure
containers, applies migrations, seeds demo data, starts both services with interleaved logs, opens
Chrome at <http://localhost:5173>, and stops everything when you press a key.

```bat
start.bat                       :: everything above
startup\stop-campusflow.bat     :: stop every CampusFlow process and container
```

### Option C — Docker Compose, cross-platform

```bash
docker compose up --build       # postgres, redis, mailpit, piston, backend, frontend
```

Or run the services directly:

```bash
# Backend — http://localhost:8000  (OpenAPI docs at /api/docs)
cd backend && uv sync
python ../scripts/bootstrap.py          # .env + migrations + idempotent seed
uv run uvicorn campusflow.main:app --host 127.0.0.1 --port 8000 --reload

# Frontend — http://localhost:5173, proxies /api to :8000
cd frontend && npm install && npm run dev
```

Without Docker the bootstrap falls back to a local SQLite file so the application (login, courses,
assignments, exams, analytics) still runs; only sandboxed code execution is unavailable, and the UI
says so explicitly.

### Demo accounts (created by the seeder)

| Role | Email | Password |
| :--- | :--- | :--- |
| Super Admin | `admin@campusflow.edu` | `Admin@CampusFlow2026` |
| Exam Controller | `controller@campusflow.edu` | `Password@123` |
| Department Head (CSE) | `hod.cse@campusflow.edu` | `Password@123` |
| Faculty (CSE) | `faculty.cse@campusflow.edu` | `Password@123` |
| Student | `student1@campusflow.edu` | `Password@123` |

Signing in as the demo student from the examinations page provisions a ready practice paper end to end
(questions, integrity signals, auto-grading, scorecard). These credentials exist **only** in the local
seeded database — a production deployment starts empty apart from the Campus Lead you provision.

> **Why there is no public demo link.** A public instance of this system would be a writable,
> anonymous-adjacent multi-tenant app with a privileged code sandbox and real proctoring data. A
> reviewer running the stack locally gets the complete product — including the sandbox and the
> student journey — in about five minutes, which is why the deployment path above is the demo. The
> screenshots are captured from a normally seeded database, not staged mock-ups.

---

## Architecture

CampusFlow is a **modular monolith**: one deployable API with hard internal boundaries, rather than a
service mesh that a two-person college IT team cannot operate.

```mermaid
flowchart LR
  B["Browser<br/>React 19 SPA"]
  C["Caddy<br/>TLS · security headers · body cap"]
  A["FastAPI<br/><b>bedrock</b> + <b>domain</b>"]
  P[("PostgreSQL 15")]
  R[("Redis 7")]
  S["Piston sidecar<br/>isolate sandbox"]

  B -->|HTTPS| C
  C -->|"/api/*"| A
  C -->|"static assets"| B
  A --> P
  A --> R
  A -->|"student code, hidden tests"| S
```

**Layering is enforced, not aspirational.**

- **`campusflow.bedrock`** — project-agnostic foundation: configuration, database session and base
  models, JWT and cookie handling, RBAC, the audit trail, storage and mail backends, API envelopes and
  error types, middleware, and the code-runner abstraction. It **never** imports from `domain`.
- **`campusflow.domain`** — the business modules (`courses`, `enrollments`, `materials`, `assignments`,
  `question_banks`, `exams`, `programming`, `analytics`, `notifications`, `roster_import`,
  `institution`). Domains import from Bedrock and cooperate through service interfaces, never by
  reaching into one another's tables.
- **Frontend** — `src/core/` holds reusable UI primitives plus API/auth infrastructure; `src/features/`
  holds domain features; `src/app/` holds routes, layout and providers. Imports use the `@/*` alias.

The consequence that matters most: when the same question is asked in twelve places — *may this caller
see this cohort?* — there is exactly one implementation to audit.

---

## Security and privacy model

This is an examination system, so authorization is the product, not a wrapper around it. The rules are
enforced by the server and pinned by tests.

| Rule | How it is enforced |
| :--- | :--- |
| **Every route declares a gate** | `tests/test_route_policy.py` walks the live route table and fails if any route has neither a permission/role dependency nor a deliberate place on the public allowlist (`health`, `/auth/*`, and the debug-only demo surface). |
| **Cohort data needs scope, not just permission** | Gradebook, roster, course/exam analytics, materials and attempt-level examination surfaces all pass the offering-scope kernel in `campusflow.domain.courses.access` (`assert_can_manage_offering`, `assert_can_view_offering`, `visible_offering_ids`). Scope checks are never re-implemented inline. |
| **Two projections, never one** | Staff and candidate payloads are different response models. A candidate response cannot carry `is_correct`, explanations, rubrics, hidden test expectations or peer grades — canary tests assert the forbidden keys never appear. |
| **Anti-enumeration** | A student asking for an object they may not see gets **404**, not 403. Staff denials stay 403. |
| **Exam bureau is opt-in per call site** | `exam_controller` reach requires an explicit `allow_exam_bureau=True` and never extends to the gradebook. |
| **Concurrency is not a lock in Python** | Duplicate prevention lives in database constraints; services translate `IntegrityError` into `409`. Violation counters use atomic SQL increments. |
| **Credentials and secrets** | Refresh tokens live in an httpOnly `SameSite=Strict` cookie, never in a JSON body; credential endpoints are rate-limited per IP; the API refuses to start with the shipped placeholder JWT secret when `DEBUG=false`; no account is created at startup with a published password. |
| **Untrusted code is never hosted in-process** | Submissions are executed by Piston in a separate privileged container with CPU, memory and concurrency ceilings; an unreachable sandbox is a fail-closed `503`. |
| **Personal data expires** | Camera frames are erased after an institution-configurable window; the integrity event and its timeline survive, and each erasure writes an audit record. Candidates are told the window in the assessment brief. |
| **Everything consequential is audited** | RBAC seeding, user lifecycle, roster commits, examination changes, grading, publishing, integrity thresholds, faculty resumption and evidence purges write append-only audit records. |

An independent audit of the *running* stack — not the test suite — is what produced the last two
hardening waves: candidate sessions could read answer keys and cohort gradebooks, six directory routes
had no gate at all, a department-head filter fell through to an unscoped query, and the assessment page
did not even compile. Each defect, its reproduction and its fix is recorded in
[docs/audit-wave2-exam-delivery.md](docs/audit-wave2-exam-delivery.md) and
[docs/completion-audit.md](docs/completion-audit.md).

---

## Tech stack

| Layer | Choice | Why |
| :--- | :--- | :--- |
| API | Python 3.12, FastAPI, Pydantic v2 | Async I/O for I/O-bound examination traffic; request/response schemas double as the contract and the authorization surface. |
| Persistence | SQLAlchemy 2 (async), Alembic, PostgreSQL 15 | Constraints enforce invariants that application code cannot (uniqueness, campus-lead survival, attempt numbering). SQLite is a development fallback only. |
| Frontend | React 19, TypeScript, Vite 8, TanStack Query, Tailwind CSS 4 | A typed SPA with server state kept out of component state; institutional light theme with design tokens, no dark-mode/terminal styling. |
| Auth | JWT access tokens + rotating refresh cookies, RBAC permissions, audit trail | Stateless reads, revocable refresh families, and a permission catalogue that a route can declare. |
| Sandbox | Piston (isolate), separate privileged container | Student code runs where it can be killed without touching the API. |
| Edge | Caddy, nginx (static assets) | Automatic TLS, one public entry point, SPA fallback with correctly cached hashed assets. |
| Delivery | Docker Compose (dev + production), GitHub Actions | The same image runs locally and on the server; CI runs the suite against PostgreSQL. |

---

## Verification

```bash
# Backend
cd backend
uv run --extra dev ruff check .        # lint
uv run --extra dev pytest -q           # suite on in-memory SQLite

# The authoritative pass: constraints, JSON columns and concurrency behave
# differently on PostgreSQL. CI runs this configuration.
TEST_DATABASE_URL="postgresql+asyncpg://campusflow:campusflow@localhost:5432/campusflow_test" \
  uv run --extra dev pytest -q

# Frontend
cd frontend
npm run lint                           # 0 errors
npm run build                          # tsc -b + vite build — the real typecheck
```

Current state of this tree:

```
backend   ruff check .                                    → clean
backend   pytest -q (SQLite)                              →  81 passed,  2 skipped
backend   pytest -q (PostgreSQL, TEST_DATABASE_URL set)   →  83 passed
frontend  npm run lint                                    →   0 errors (14 warnings)
frontend  npm run build                                   →  success
compose   docker compose config / up --build              →  every service healthy
```

The two SQLite skips are PostgreSQL-only tests (advisory-lock and concurrent-commit behaviour); they
run in CI. The suite covers the authorization matrix and forbidden-key canaries, the cohort-scope
matrix, the route policy walk, the campus-lead invariant, roster import (including concurrency),
duplicate prevention, multi-section assessment, the warning policy, the sandbox classification and
fail-closed path, proctoring security, and the end-to-end production flows.

Beyond the suite, the last wave was verified against a **running** stack: the production stack through
its proxy, migrations at head, a provisioned Campus Lead signing in, unauthenticated requests refused,
the evidence purge executed in its container, a `pg_dump`/`pg_restore --list` round trip, and the
sandbox memory ceiling measured (a 512 MB allocation is killed under a 128 MB cap in ~20 ms). Exact
commands and outputs: [docs/progress.md](docs/progress.md).

---

## Production deployment

`docker-compose.prod.yml` is the whole system under its own Compose project name (so a production `up`
can never touch a developer's database):

| Service | Reachable from | Role |
| :--- | :--- | :--- |
| `proxy` (Caddy) | `:80`, `:443` | The only public entry point: `/api/*` to the API, everything else to the SPA |
| `backend` | loopback `:8001` | FastAPI, migrations applied in-process at start |
| `frontend` | loopback `:8080` | Static SPA build on nginx |
| `postgres` | loopback `:5433` | Database, healthchecked, backed up nightly |
| `redis` | loopback `:6380` | Rate-limit and cache store with AOF persistence |
| `piston` | internal only | Code sandbox |
| `backup` | — | `pg_dump -Fc` nightly, age-based pruning, atomic renames |
| `evidence-retention` | — | Daily erasure of expired camera frames, audited |

Two secrets are mandatory and Compose refuses to start without them; the application refuses to start
with the placeholder JWT secret. Migrations are reversible in both directions. The step-by-step
runbook — first deployment, TLS with a real hostname, backup and verified restore, retention, sandbox
limits, upgrades, a verification checklist and a troubleshooting table — is
[docs/development.md §7](docs/development.md#7-production-deployment).

---

## Repository layout

```
CampusFlow/
├── start.bat                    # one-click launcher (Windows)
├── backend/                     # FastAPI service (Python 3.12)
│   ├── campusflow/
│   │   ├── bedrock/             # foundation: config, db, auth, rbac, audit, storage, mail, runner
│   │   └── domain/              # courses, exams, programming, analytics, roster_import, …
│   ├── alembic/                 # migrations (reversible, applied at start in production)
│   ├── scripts/                 # provision_admin, purge_proctoring_evidence, sample fetcher
│   ├── tests/                   # pytest suite (SQLite fast pass + PostgreSQL authoritative pass)
│   └── Dockerfile               # two-stage, unprivileged runtime
├── frontend/                    # React 19 SPA (TypeScript, Vite, Tailwind)
│   ├── src/core/                # UI primitives, API client, auth context and hooks
│   ├── src/features/            # domain features
│   ├── src/app/                 # routes, layout, providers
│   ├── Dockerfile               # production: build → static assets on nginx
│   └── Dockerfile.dev           # development: Vite dev server with hot reload
├── deploy/                      # Caddyfile (the public front door), backup.sh
├── scripts/                     # bootstrap.py (env + migrations + seed), seed.py
├── startup/                     # start/stop orchestration for the launcher
├── docs/                        # architecture, decisions, progress, audits, runbooks, screenshots
├── docker-compose.yml           # development stack
├── docker-compose.prod.yml      # production stack
├── .env.production.example      # every production setting, documented
└── LICENSE                      # MIT
```

---

## Documentation

| Document | What is in it |
| :--- | :--- |
| [docs/master-plan.md](docs/master-plan.md) | The product plan: phases, scope, acceptance criteria. |
| [docs/architecture.md](docs/architecture.md) | Module boundaries, data model, API surface, authorization kernel. |
| [docs/decisions.md](docs/decisions.md) | 26 ADRs, including the supersessions — the reasoning is part of the record. |
| [docs/development.md](docs/development.md) | Local setup, testing, the measurement harnesses, and the production runbook (§7). |
| [docs/progress.md](docs/progress.md) | Phase-by-phase progress with the verification evidence for each wave. |
| [docs/memory.md](docs/memory.md) | Durable operational gotchas and measured numbers. |
| [docs/completion-audit.md](docs/completion-audit.md) | What is complete, what is partial, and what is missing — with a prioritised repair plan. |
| [docs/audit-wave2-exam-delivery.md](docs/audit-wave2-exam-delivery.md) | The running-stack audit of the candidate journey: defects, reproduction, fixes, limits. |
| [docs/qa-report.md](docs/qa-report.md) · [docs/live-qa-log.md](docs/live-qa-log.md) | QA matrices and the live browser walkthrough log. |

---

## Selected engineering decisions

- **ADR-003 / ADR-013 — observable, rule-based integrity monitoring.** An earlier iteration shipped
  camera gaze analysis, a strobe overlay and a lockdown screen. It was removed: it contradicted the
  responsible-UX requirement, the product could not substantiate its accuracy, and the ADR records the
  supersession rather than quietly deleting the mistake.
- **ADR-014 — the sandbox is a separate service.** The API hands code to Piston and fails closed if it
  is unreachable. No path executes student code in the application process.
- **ADR-016 / ADR-017 / ADR-022 — scope is a kernel, not a habit.** Offering scope, department scope
  for authoring, and the cohort boundary on attempt-level surfaces are one shared implementation with
  an executable route policy, because "remember to check" is not a security control.
- **ADR-020 — the database is the final authority.** Stabilised student identity (normalised
  registration numbers, admission year) plus unique constraints; services translate constraint
  violations instead of pre-checking and hoping.
- **ADR-021 — roster import is two-phase, idempotent and credential-free.** Preview classifies rows
  without writing anything; commit is one transaction keyed by an idempotency key; generated passwords
  never appear in a staged row, report or audit record.
- **ADR-023 — integrity tolerance is per-exam policy.** Defaulting to removal at the threshold, with a
  documented review ladder as the alternative, because institutions differ and a hard-coded number
  makes both choices wrong.
- **ADR-025 / ADR-026 — production is one Compose stack, and evidence expires.** A single proxy front
  door, no dev servers in the production project, and a retention job that erases camera frames while
  preserving the event that proves what happened.

---

## Known limitations and roadmap

Stated plainly, because the omissions matter as much as the features:

- **The Python course (learning content) is not built.** The programming environment (problems, tests,
  grading, sandbox) is complete; a guided course with lessons, quizzes and progress tracking is the
  largest remaining product gap and is planned, not implemented.
- **C, C++ and Java runtimes are installed by the deployment but only Python is verified end to end**
  through the grading flow; the Java class-name convention and a disposable-database SQL executor are
  still open (tracked as D-4/D-5 in [docs/completion-audit.md](docs/completion-audit.md)).
- **No browser-driven end-to-end suite yet.** The backend suite and the live HTTP/browser walkthroughs
  are thorough, but Playwright coverage is the honest next step (tracked as D-6).
- **The candidate camera check cannot be automated** in a headless browser; it is verified by hand
  against the documented procedure in [docs/development.md](docs/development.md#verifying-the-assessment-camera-by-hand).
- **Live invigilator video tiles are not implemented** (and were deliberately removed with ADR-013);
  invigilation today is the recorded, auditable event timeline.
- **Frontend bundling is not code-split yet** — the production build warns about a chunk above 500 kB.
  Route-level splitting is planned.
- **There is no public demo instance**, for the reasons given above; the deployment path is the demo.

---

## License

Released under the **MIT License** — see [LICENSE](LICENSE). Copyright © 2026 Sumanth Mamidi.

Built by [Sumanth Mamidi](https://github.com/SumanthMamidi-MNS).
