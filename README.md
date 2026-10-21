<p align="center">
  <img src="docs/assets/campusflow-logo.svg" alt="CampusFlow" height="88">
</p>
<h3 align="center">
  <strong>College LMS &amp; Secure Examination Platform</strong><br>
  <small>Academic Operations &bull; Integrity-Monitored Assessment &bull; Sandboxed Code Grading</small>
</h3>

<p align="center">
  <a href="https://www.python.org/"><img src="docs/assets/badges/python.svg" alt="Python 3.12" height="30"></a>
  <a href="https://fastapi.tiangolo.com"><img src="docs/assets/badges/fastapi.svg" alt="FastAPI REST + WS" height="30"></a>
  <a href="https://react.dev"><img src="docs/assets/badges/react.svg" alt="React 19" height="30"></a>
  <a href="https://www.postgresql.org/"><img src="docs/assets/badges/postgresql.svg" alt="PostgreSQL 15" height="30"></a>
  <a href="https://docs.docker.com/compose/"><img src="docs/assets/badges/docker.svg" alt="Docker Compose" height="30"></a>
  <a href="docs/architecture.md"><img src="docs/assets/badges/authorization.svg" alt="Authorization: offering scope" height="30"></a>
  <a href="docs/decisions.md#adr-014-piston-sidecar-for-sandboxed-student-code-execution"><img src="docs/assets/badges/sandbox.svg" alt="Sandbox: Piston isolate" height="30"></a>
  <a href="backend/tests/"><img src="docs/assets/badges/tests.svg" alt="83 Passing" height="30"></a>
  <a href="LICENSE"><img src="docs/assets/badges/license.svg" alt="MIT License" height="30"></a>
</p>

<p align="center">
  <strong>One platform for a whole college:</strong> the roster, the material, the assignment, the
  examination, the integrity trail and the grade — kept on the same cohort record instead of four
  disconnected tools.
</p>

<p align="center">
  Self-hosted on a single server. No SaaS dependency, no public sign-up, no fabricated demo data:
  every screen is backed by the API a live institution would use.
</p>

<p align="center"><img src="docs/assets/divider.svg" width="100%" height="1" alt=""></p>

<p align="center">
  <a href="docs/images/02-dashboard.png"><img src="docs/images/02-dashboard.png" alt="CampusFlow institutional analytics: enrolment, faculty load, course performance, examination readiness and an integrity trend, all computed from live records" width="100%"></a>
  <br><em>Institutional analytics — every number is computed from the same records the students and faculty see.</em>
</p>

<p align="center"><img src="docs/assets/divider.svg" width="100%" height="1" alt=""></p>

<details open>
<summary><strong>Table of contents</strong></summary>

1. [The problem](#the-problem)
2. [Who uses it](#who-uses-it)
3. [The examination journey](#the-examination-journey)
4. [A look inside](#a-look-inside)
5. [Security model](#security-model)
6. [Tech stack](#tech-stack)
7. [Run it](#run-it)
8. [Verification](#verification)
9. [Limits](#limits)
10. [License](#license)

</details>

<p align="center"><img src="docs/assets/divider.svg" width="100%" height="1" alt=""></p>

## The problem

Teaching platforms usually force an either/or. A general-purpose LMS cannot run a secure
examination, so institutions bolt on a forms tool, a proctoring subscription and a separate
code-judge — then spend the year reconciling four sets of identities and three kinds of truth
about the same student.

CampusFlow treats it as **one cohort problem**. The `course_offering` that owns the roster, the
materials and the gradebook also owns the examinations sat by exactly those students, the integrity
events recorded during those sittings, and the marks that flow back into the grade. One service
decides who may see which cohort, and every route has to ask it.

## Who uses it

Five roles, one hierarchy, and a boundary the server enforces rather than the interface:

```mermaid
flowchart TB
  L["Campus Lead<br/>institution, users, roles, audit"]
  D["Department Head<br/>programmes, courses, sections, faculty"]
  F["Faculty<br/>materials, assignments, gradebook"]
  X["Exam Controller<br/>question banks, papers, integrity policy"]
  S["Student<br/>own cohort, timed attempt, own results"]

  L --> D
  D --> F
  D --> X
  F -->|"teaches and grades"| S
  X -->|"schedules and releases"| S
  S -->|"attempt, integrity trail, marks"| F
```

| Role | What they own in the product | Where they live |
| :--- | :--- | :--- |
| **Campus Lead** | Institution identity, users and permissions, academic structure, audit trail, institution-wide analytics | Dashboard, Academics, Users, Settings |
| **Department Head** | Programmes, curriculum and sections for one department; faculty assignments; department analytics | Academics, Course workspace |
| **Faculty** | Materials, announcements, assignments and rubrics for their own offerings; the weighted gradebook; question authoring | Courses, Assignments, Question Banks |
| **Exam Controller** | Question banks, paper assembly, scheduling windows, the integrity policy and the release of results | Examinations, Question Banks |
| **Student** | Their own cohort only: materials, assignments, a server-timed attempt, and their own scorecard | My Courses, Take Exam, Results |

The two projections are structural, not cosmetic: staff and candidate responses are different
models, so a candidate payload cannot carry answer keys, rubrics, hidden test expectations or peer
grades. A student asking for something outside their cohort gets **404**, not a 403 that confirms
the object exists.

## The examination journey

One paper, five stages, with the integrity trail running underneath the whole of it:

```mermaid
flowchart LR
  A["Author<br/>question bank + answer key"]
  B["Assemble<br/>sections, shuffling, marking"]
  C["Schedule<br/>window, tolerance policy"]
  D["Sit<br/>server-timed attempt, autosave"]
  E["Grade<br/>auto-score + rubric"]
  F["Publish<br/>result, gradebook, analytics"]

  A --> B --> C --> D --> E --> F
  D -.->|"tab, blur, focus, clipboard"| G["Integrity timeline<br/>audited review and resumption"]
  G -.-> E
```

Timing is server-authoritative and the attempt is autosaved, so a dropped connection or a closed
tab is reconciled rather than lost. Every integrity signal is recorded with its policy threshold,
and any resumption is a faculty decision written to the audit trail — not a silent reset.

## A look inside

<table>
<tr>
<td width="50%"><a href="docs/images/11-assessment.png"><img src="docs/images/11-assessment.png" alt="Candidate assessment brief with the timed-paper summary, integrity disclosure and camera notice"></a><br><sub><b>The candidate's brief.</b> Timing, marks and the integrity policy are disclosed before the clock starts.</sub></td>
<td width="50%"><a href="docs/images/10-programming-editor.png"><img src="docs/images/10-programming-editor.png" alt="Sandboxed programming problem with the in-browser editor and per-test results"></a><br><sub><b>Code, graded.</b> The editor runs against public tests; grading runs the hidden suite in the sandbox.</sub></td>
</tr>
<tr>
<td width="50%"><a href="docs/images/06-exam-workspace.png"><img src="docs/images/06-exam-workspace.png" alt="Examination workspace with the paper structure, questions and the grading queue"></a><br><sub><b>The paper, assembled.</b> Sections, question sources and the grading queue in one workspace.</sub></td>
<td width="50%"><a href="docs/images/08-question-banks.png"><img src="docs/images/08-question-banks.png" alt="Question bank authoring with departments, approval state and question types"></a><br><sub><b>Banks, not spreadsheets.</b> Every question type, an approval state, and CSV import for the backlog.</sub></td>
</tr>
<tr>
<td width="50%"><a href="docs/images/05-examinations.png"><img src="docs/images/05-examinations.png" alt="Scheduled, live and published examinations with attempt counts"></a><br><sub><b>The examination board.</b> What is scheduled, what is live, and what is waiting to be released.</sub></td>
<td width="50%"><a href="docs/images/12-student-dashboard.png"><img src="docs/images/12-student-dashboard.png" alt="Student dashboard with their own deadlines, marks and upcoming examinations"></a><br><sub><b>The student's own view.</b> A different projection of the same data — deadlines, marks, next examination.</sub></td>
</tr>
<tr>
<td width="50%"><a href="docs/images/04-course-workspace.png"><img src="docs/images/04-course-workspace.png" alt="Course workspace with announcements, materials and the roster"></a><br><sub><b>The course workspace.</b> Materials, announcements and the roster behind one section.</sub></td>
<td width="50%"><a href="docs/images/02-dashboard.png"><img src="docs/images/02-dashboard.png" alt="Institutional analytics dashboard"></a><br><sub><b>The institution's view.</b> Enrolment, faculty load, course performance and examination readiness.</sub></td>
</tr>
</table>

## Security model

This is an examination system, so authorization is the product, not a wrapper around it. Each rule
is enforced by the server and pinned by a test that fails the build if it regresses.

| Rule | How it is enforced |
| :--- | :--- |
| **Every route declares a gate** | `tests/test_route_policy.py` walks the live route table and fails if a route has neither a permission/role dependency nor a deliberate place on the public allowlist. |
| **Cohort data needs scope, not just permission** | Gradebook, roster, materials, analytics and attempt-level surfaces all pass the offering-scope kernel in `campusflow.domain.courses.access`. Scope checks are never re-implemented inline. |
| **Two projections, never one** | Staff and candidate responses are separate models; canary tests assert forbidden keys never appear in a candidate payload. |
| **Anti-enumeration** | A student asking for an object outside their cohort gets **404**. Staff denials stay 403. |
| **Untrusted code never runs in-process** | Submissions go to a Piston sidecar inside an `isolate` sandbox with CPU, memory and concurrency ceilings. An unreachable sandbox is a fail-closed `503`, not an invented pass. |
| **Credentials are cookies, not JSON** | Refresh tokens live in an httpOnly `SameSite=Strict` cookie; credential endpoints are rate-limited per IP; the API refuses to start with the shipped placeholder JWT secret. |
| **Personal data expires** | Camera frames are erased after an institution-configurable window; the integrity event and its timeline survive, and every erasure writes an audit record. |
| **Everything consequential is audited** | Role changes, roster commits, paper changes, grading, publishing, threshold changes, resumption and evidence purges all append to an immutable audit trail. |

The last two hardening waves came from auditing the *running* stack rather than the test suite:
candidate sessions could read answer keys and cohort gradebooks, six directory routes had no gate,
and a department filter fell through to an unscoped query. Each defect, its reproduction and its fix
is recorded in [docs/audit-wave2-exam-delivery.md](docs/audit-wave2-exam-delivery.md).

## Tech stack

| Layer | Choice |
| :--- | :--- |
| **API** | Python 3.12 · FastAPI · Pydantic v2 — request schemas double as the validation and authorization surface |
| **Data** | PostgreSQL 15 · SQLAlchemy 2 (async) · Alembic — invariants live in constraints, not in application hope |
| **Frontend** | React 19 · TypeScript · Vite · TanStack Query · Tailwind CSS 4 — typed SPA, light institutional theme, no dark-mode styling |
| **Identity** | JWT access tokens · rotating refresh cookies · RBAC permission catalogue · append-only audit trail |
| **Sandbox** | Piston (isolate) in a separate privileged container with real CPU, memory and concurrency ceilings |
| **Delivery** | Docker Compose for development and production · Caddy front door with TLS · GitHub Actions running the suite against PostgreSQL |

The API is a modular monolith with enforced internal boundaries: `campusflow.bedrock` (config,
database, auth, RBAC, audit, storage, mail, runner) never imports from `campusflow.domain`, and
domains cooperate through service interfaces rather than each other's tables. Module map and data
model: [docs/architecture.md](docs/architecture.md).

## Run it

**On a server, in three commands.** Requires Docker Engine with Compose v2 and ports 80/443 free.

```bash
cp .env.production.example .env      # then set POSTGRES_PASSWORD and JWT_SECRET_KEY
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend \
  python scripts/provision_admin.py --email you@example.edu --password 'at least 12 characters'
```

Migrations run at start, the proxy is the only public service, and there is no public sign-up — the
last command creates the first Campus Lead. TLS, backups and verified restore, retention, upgrades
and troubleshooting live in [docs/development.md §7](docs/development.md#7-production-deployment).

**One click, for development (Windows).** Double-click **`start.bat`**: it bootstraps the
environment, starts the containers, applies migrations, seeds demo data, runs both services with
interleaved logs, opens <http://localhost:5173>, and stops everything when you press a key.
`startup\stop-campusflow.bat` stops every CampusFlow process and container.

**Cross-platform.** `docker compose up --build` for the full stack (PostgreSQL, Redis, Mailpit,
Piston, API, SPA). Without Docker the bootstrap falls back to a local SQLite file: everything runs
except sandboxed execution, and the UI says so explicitly.

### Demo accounts (created by the seeder)

| Role | Email | Password |
| :--- | :--- | :--- |
| Campus Lead (Super Admin) | `admin@campusflow.edu` | `Admin@CampusFlow2026` |
| Exam Controller | `controller@campusflow.edu` | `Password@123` |
| Department Head (CSE) | `hod.cse@campusflow.edu` | `Password@123` |
| Faculty (CSE) | `faculty.cse@campusflow.edu` | `Password@123` |
| Student | `student1@campusflow.edu` | `Password@123` |

Signing in as the demo student from the examinations page provisions a complete practice paper —
questions, integrity signals, auto-grading, scorecard. These credentials exist **only** in a locally
seeded database; a production deployment starts empty apart from the Campus Lead you provision.

> **Why there is no public demo link.** A live instance would be a writable, multi-tenant
> examination platform with a privileged code sandbox and real proctoring data — not something to
> leave on a public URL. The stack above *is* the demo: five minutes to a complete product,
> screenshots included. An instance opens on a product landing page — the one screen a signed-out
> visitor can reach; every other route waits for a session.

## Verification

```bash
cd backend && uv run --extra dev ruff check . && uv run --extra dev pytest -q
TEST_DATABASE_URL="postgresql+asyncpg://campusflow:campusflow@localhost:5432/campusflow_test" \
  uv run --extra dev pytest -q          # the authoritative pass; CI runs this
cd ../frontend && npm run lint && npm run build
```

```
backend   ruff check .                                    → clean
backend   pytest -q (SQLite)                              →  81 passed,  2 skipped
backend   pytest -q (PostgreSQL)                          →  83 passed
frontend  npm run lint                                    →   0 errors
frontend  npm run build                                   →  success
```

Live status of that suite on `main`:

[![CI](https://github.com/SumanthMamidi-MNS/CampusFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/SumanthMamidi-MNS/CampusFlow/actions/workflows/ci.yml)

The two SQLite skips are PostgreSQL-only concurrency tests and run in CI. Beyond the suite, the last
wave was verified against a **running** stack: the production Compose project through its proxy,
migrations at head, a provisioned Campus Lead signing in, unauthenticated requests refused, the
evidence purge executed in its container, a `pg_dump` / `pg_restore --list` round trip, and the
sandbox memory ceiling measured — a 512 MB allocation killed under a 128 MB cap in ~20 ms.

## Limits

Stated plainly, because the omissions matter as much as the features.

- **The Python course is not built.** Problems, tests, grading and the sandbox are complete; a
  guided course with lessons and progress tracking is the largest remaining product gap.
- **Only Python is verified end to end.** C, C++ and Java runtimes ship with the deployment, but
  their grading paths are not exercised yet.
- **No browser-driven end-to-end suite.** The backend suite and the live HTTP/browser walkthroughs
  are thorough; Playwright coverage is the honest next step.
- **The candidate camera check needs a human.** It cannot be automated in a headless browser and is
  verified against a documented manual procedure.
- **No code splitting yet.** The production bundle warns about a single chunk above 500 kB;
  route-level splitting is planned.

## License

Released under the **MIT License** — see [LICENSE](LICENSE). Copyright © 2026 Sumanth Mamidi.

<p align="center"><img src="docs/assets/divider.svg" width="100%" height="1" alt=""></p>

<p align="center">
  Designed &amp; Developed by <a href="https://github.com/SumanthMamidi-MNS">Sumanth Mamidi</a>
</p>
