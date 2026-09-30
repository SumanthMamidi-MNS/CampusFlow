# CampusFlow — Master Plan & Architecture

> **Document type:** Architecture & Development Plan (v1.0)
> **Date:** 2026-09-30
> **Status:** Planning — no implementation begun

---

## Table of Contents

1. [Product Vision & Boundaries](#1-product-vision--boundaries)
2. [Architectural Philosophy](#2-architectural-philosophy)
3. [Reusable Foundation vs. Domain Layers](#3-reusable-foundation-vs-domain-layers)
4. [Technology Decisions](#4-technology-decisions)
5. [Roles & Permissions](#5-roles--permissions)
6. [Authentication & Account Lifecycle](#6-authentication--account-lifecycle)
7. [Domain Model & Data Architecture](#7-domain-model--data-architecture)
8. [Backend / API Architecture](#8-backend--api-architecture)
9. [Frontend Architecture](#9-frontend-architecture)
10. [Examination System — Deep Dive](#10-examination-system--deep-dive)
11. [File & Storage Handling](#11-file--storage-handling)
12. [Notifications](#12-notifications)
13. [Analytics & Reporting](#13-analytics--reporting)
14. [Security, Privacy & Auditability](#14-security-privacy--auditability)
15. [Deployment Architecture](#15-deployment-architecture)
16. [Portability & Migration Strategy](#16-portability--migration-strategy)
17. [Testing & Verification](#17-testing--verification)
18. [Development Phases](#18-development-phases)
19. [MVP vs. Deferred Features](#19-mvp-vs-deferred-features)
20. [Future Extensibility](#20-future-extensibility)

---

## 1. Product Vision & Boundaries

### What CampusFlow Is

CampusFlow is a **self-contained, institution-deployable** Learning Management System (LMS) with an integrated secure online examination platform. It serves a single college or university and handles:

- **Academic administration** — departments, programs, batches, courses, academic terms/semesters
- **Teaching & learning** — course materials, assignments, grading, announcements, discussion
- **Examinations** — question banks, exam creation, scheduling, secure delivery with observable proctoring, auto/manual grading, results publication
- **Institutional management** — user provisioning, role management, policies, branding, audit trails

### What CampusFlow Is Not

- **Not a MOOC platform** — no marketplace, no cross-institution discovery, no self-enrollment by the public
- **Not a video conferencing tool** — it links to or embeds live-class tools but does not build one
- **Not a full SIS (Student Information System)** — it handles academic enrollment and grades but not admissions, fees/billing, hostel, or transportation (these can integrate later)
- **Not an AI-powered auto-question-generator** — question authoring is human-driven (AI features are deferred)

### Single-Tenant, Multi-Customizable

Each deployment is a **single institution**. Multi-tenancy (SaaS hosting multiple colleges) is a future concern and is explicitly out of scope. However, the system is designed so:

- Institution name, logo, colors, policies are **configuration**, not hard-coded
- Deployment scripts and environment variables control all environment-specific values
- The same codebase can be deployed for different colleges without code changes

---

## 2. Architectural Philosophy

### Core Principles

| Principle | Implication |
|---|---|
| **Monolith-first** | A single deployable backend. No microservices until proven necessary. Internal module boundaries enforce separation. |
| **API-first** | The backend exposes a RESTful JSON API. The frontend is a separate SPA. No server-rendered HTML. |
| **Convention over configuration** | Standardized project layout, naming, error formats, pagination, filtering. |
| **Portability by abstraction** | Storage, email, auth tokens, caching — all behind interfaces. Swap implementations without touching business logic. |
| **Security by default** | RBAC enforced at the API layer. Audit logging on all mutations. Exam lockdown designed from day one. |
| **Progressive complexity** | Start with the simplest correct implementation. Add caching, queues, and optimization only when measured need arises. |

### Monolith with Clean Module Boundaries

The backend is a modular monolith. Modules communicate through well-defined internal interfaces (service classes), never by directly querying each other's database tables. This gives us:

- **Simple deployment** — one process, one database
- **Easy local development** — `docker compose up` and go
- **Future extractability** — any module can become a service later because its boundary is already defined

---

## 3. Reusable Foundation vs. Domain Layers

### Layer Architecture

```
┌─────────────────────────────────────────────────┐
│              CampusFlow Application              │
│  (routes, controllers, domain services, views)   │
├─────────────────────────────────────────────────┤
│           CampusFlow Domain Modules              │
│  Courses · Exams · Enrollment · Materials · …    │
├─────────────────────────────────────────────────┤
│          Foundation Layer ("Bedrock")             │
│  Auth · RBAC · Audit · Storage · Config · Mail   │
│  API conventions · DB base · Validation · Errors │
│  Testing utilities · Middleware · Pagination      │
└─────────────────────────────────────────────────┘
```

### Foundation Layer ("Bedrock")

This layer contains **genuinely project-agnostic** infrastructure. It is organized as internal packages/modules within the monolith, with no CampusFlow-specific imports. The boundary rule:

> **Bedrock imports nothing from CampusFlow domain modules. CampusFlow domain modules import from Bedrock.**

Bedrock includes:

| Component | Responsibility |
|---|---|
| `auth` | JWT issuance/validation, refresh tokens, password hashing, session management |
| `rbac` | Role + permission definitions, decorators/middleware for endpoint protection, hierarchical permission resolution |
| `audit` | Structured audit log recording (who, what, when, where, before/after), queryable audit trail |
| `storage` | File storage abstraction: local filesystem, S3-compatible, or any object store — behind a single interface |
| `config` | Layered configuration: defaults → environment variables → config file → database overrides |
| `mail` | Email abstraction: SMTP, or provider SDKs — behind a send interface |
| `db` | Base model, migration tooling, soft-delete mixin, timestamp mixin, UUID primary key mixin |
| `api` | Standardized request/response envelopes, error format (RFC 7807-style), pagination helpers, filtering/sorting DSL |
| `validation` | Schema validation utilities, common validators (email, phone, date ranges) |
| `errors` | Application exception hierarchy, global error handler, error code registry |
| `middleware` | Request ID, rate limiting, CORS, security headers, request logging |
| `testing` | Test fixtures, factory base classes, API test client helpers, database transaction rollback per test |
| `tasks` | Background task abstraction (in-process initially, replaceable with Celery/RQ/BullMQ later) |

### Future Reuse Strategy

Bedrock is **not** a separate repo or published package at this stage. It lives inside the CampusFlow codebase as a clearly separated package. When a second project needs it:

1. Extract Bedrock into its own repository
2. Publish it as an internal package (private PyPI, npm, etc.)
3. CampusFlow pins a version of Bedrock as a dependency
4. The new project also depends on Bedrock

This extraction requires **no restructuring** of CampusFlow because the import boundary is clean from day one. CampusFlow continues working — it just swaps a local import for a package dependency.

---

## 4. Technology Decisions

### Backend

| Choice | Rationale |
|---|---|
| **Python 3.12+ / FastAPI** | Async-capable, excellent type hints, auto-generated OpenAPI docs, high ecosystem maturity. Python is the strongest choice for a system that may later integrate ML/AI features (proctoring analytics, plagiarism detection). FastAPI's dependency injection maps cleanly to our RBAC and auth middleware. |
| **SQLAlchemy 2.x (async)** | The most mature Python ORM. Supports async, explicit query construction, and complex relationships. Migration via **Alembic**. |
| **PostgreSQL 15+** | The only serious choice for a production relational database. JSONB for flexible metadata, full-text search, row-level security capabilities, excellent indexing, and it's fully open source and portable. |
| **Redis** | Session/cache store, rate limiting, real-time pub/sub for exam events. Lightweight and universally available. |
| **Pydantic v2** | Request/response validation and serialization. Tight FastAPI integration. |

### Frontend

| Choice | Rationale |
|---|---|
| **React 18+ with TypeScript** | Component model, ecosystem, hiring pool, and library support are unmatched. TypeScript is non-negotiable for a project of this size. |
| **Vite** | Fast builds, HMR, ESM-native. |
| **TanStack Query (React Query)** | Server state management — caching, background refetching, optimistic updates. Eliminates hand-rolled data fetching. |
| **Zustand** | Minimal client-side state (UI state, exam timer, sidebar). No Redux boilerplate. |
| **Tailwind CSS + shadcn/ui** | Utility-first CSS with a component library built on Radix primitives. Accessible, themeable (supports institution branding), no vendor lock-in (components are source code, not a package). |
| **React Router v6** | Mature routing with nested layouts, loaders, and guards. |

### Infrastructure (Development / Demo)

| Component | Dev/Demo | Production-replaceable with |
|---|---|---|
| **File storage** | Local filesystem | S3, MinIO, GCS, Azure Blob |
| **Email** | Console logger / Mailpit | SMTP, SES, SendGrid, institutional mail server |
| **Background tasks** | In-process async (or `arq` with Redis) | Celery, `arq`, or any task queue |
| **Auth** | Self-issued JWTs | Can integrate institutional SSO (SAML/OIDC) alongside |
| **Reverse proxy** | Caddy (auto HTTPS) | Nginx, HAProxy, institutional load balancer |
| **Containerization** | Docker Compose | Kubernetes, Nomad, bare VMs |

### Why Not

| Rejected | Reason |
|---|---|
| **Next.js / SSR** | Adds deployment complexity (Node server). CampusFlow's UI is a dashboard app, not a content/SEO site. SPA + API is simpler and more portable. |
| **Django** | Excellent, but its ORM is synchronous and its monolithic conventions fight the clean-separation goal. FastAPI gives us more control. |
| **MongoDB** | An LMS has highly relational data (enrollments, grades, permissions). Document stores create query headaches here. |
| **Microservices** | Premature. Adds network hops, distributed debugging, deployment complexity. The modular monolith gives us the same code-level separation without the operational cost. |
| **Firebase / Supabase** | Vendor lock-in contradicts portability requirements. |

---

## 5. Roles & Permissions

### Role Hierarchy

```
Super Admin (system-level, one or very few)
  └── College Admin (institution management)
        ├── Department Head (department-scoped admin)
        ├── Exam Controller (examination management)
        ├── Faculty / Lecturer (course-scoped)
        └── Student (read-mostly, submit assignments, take exams)
```

### RBAC Model

**Entity-based permissions with scope:**

```
Permission = (action, resource, scope)
Examples:
  ("create", "course", "department:CS")
  ("grade", "exam_submission", "course:CS301")
  ("view", "analytics", "institution")
  ("manage", "question_bank", "department:CS")
```

- **Roles** are named collections of permissions
- **Users** are assigned roles, optionally scoped to a department, course, or batch
- **Built-in roles** cover 90% of use cases; college admins can create custom roles
- **Permission checks** are enforced at the API route level via middleware/dependencies and at the service level for complex business rules

### Permission Categories

| Category | Actions |
|---|---|
| **User management** | create, view, update, deactivate, assign-role, bulk-import |
| **Academic structure** | manage departments, programs, batches, academic terms |
| **Courses** | create, update, archive, assign-faculty, enroll-students, view-roster |
| **Materials** | upload, organize, publish, view |
| **Assignments** | create, submit, grade, view-submissions, return-feedback |
| **Question banks** | create, view, tag, approve, archive, share-across-courses |
| **Examinations** | create, schedule, publish, proctor, grade, release-results |
| **Analytics** | view-own, view-course, view-department, view-institution |
| **System config** | branding, policies, feature flags, integrations |
| **Audit** | view-audit-logs (admin only) |

---

## 6. Authentication & Account Lifecycle

### Authentication Flow

```
┌──────────┐     POST /auth/login       ┌──────────┐
│  Client   │ ──── email + password ───▶ │  Server   │
│  (SPA)    │ ◀── access_token (15m)  ── │           │
│           │     refresh_token (7d)      │           │
│           │     (httpOnly cookie)       │           │
└──────────┘                              └──────────┘

Access token: short-lived JWT in Authorization header
Refresh token: long-lived, httpOnly secure cookie, stored hashed in DB
Token refresh: POST /auth/refresh (sends cookie, returns new access token)
Logout: POST /auth/logout (revokes refresh token server-side)
```

### Token Strategy

- **Access token (JWT, 15 min):** Contains `user_id`, `roles[]`, `permissions[]` (or a permission fingerprint — full permissions fetched if token is lightweight). Stateless verification.
- **Refresh token (opaque, 7 days):** Stored hashed in PostgreSQL. Enables revocation. Rotation on each use (old token invalidated).
- **Token family tracking:** Detects refresh token reuse (theft indicator) and invalidates the entire family.

### Account Lifecycle

```
┌─────────┐    Admin creates    ┌──────────┐   First login    ┌────────┐
│ Invited  │ ────────────────▶ │  Pending   │ ──────────────▶ │ Active  │
│          │   or bulk import   │ (set pwd)  │  set password   │         │
└─────────┘                    └──────────┘                   └────────┘
                                                                  │
                                                    Admin deactivates
                                                                  ▼
                                                             ┌──────────┐
                                                             │ Inactive  │
                                                             └──────────┘
```

- **No self-registration.** All accounts are created by admins (individually or bulk CSV/Excel import).
- **First login** requires setting a password and optionally verifying email.
- **Password reset** via email link (time-limited, single-use token).
- **Account deactivation** (not deletion) preserves audit trail and historical records.
- **Future SSO:** OIDC/SAML integration point designed in. The auth module supports pluggable authentication backends. When institutional SSO is configured, login redirects to the IdP. The server maps the SSO identity to a local user record.

### Password Policy

Configurable at the institution level:
- Minimum length (default: 10)
- Complexity requirements (configurable)
- Password history (prevent reuse of last N)
- Account lockout after N failed attempts (with configurable cooldown)

---

## 7. Domain Model & Data Architecture

### Entity-Relationship Overview

```mermaid
erDiagram
    Institution ||--o{ Department : has
    Institution ||--o{ AcademicTerm : defines
    Department ||--o{ Program : offers
    Program ||--o{ Batch : has
    Department ||--o{ Course : owns
    AcademicTerm ||--o{ CourseOffering : scopes
    Course ||--o{ CourseOffering : "offered as"
    CourseOffering }o--|| Batch : "delivered to"
    CourseOffering }o--o{ User : "taught by (faculty)"
    CourseOffering }o--o{ User : "enrolled (students)"
    CourseOffering ||--o{ Material : contains
    CourseOffering ||--o{ Assignment : has
    Assignment ||--o{ Submission : receives
    Submission }o--|| User : "submitted by"
    Department ||--o{ QuestionBank : owns
    QuestionBank ||--o{ Question : contains
    Question ||--o{ QuestionOption : has
    CourseOffering ||--o{ Exam : scheduled_for
    Exam ||--o{ ExamQuestion : includes
    ExamQuestion }o--|| Question : references
    Exam ||--o{ ExamAttempt : taken_as
    ExamAttempt }o--|| User : "attempted by"
    ExamAttempt ||--o{ Response : contains
    User ||--o{ Notification : receives
    User ||--o{ AuditLog : generates
```

### Key Entities — Detailed

#### Institution & Structure

| Entity | Key Fields | Notes |
|---|---|---|
| **Institution** | name, logo, colors, timezone, policies (JSON), contact info | Singleton per deployment. Drives branding and config. |
| **Department** | name, code, head (FK→User) | Organizational unit. Scopes courses, faculty, question banks. |
| **Program** | name, code, department, degree_type, duration_years | e.g., "B.Tech Computer Science" |
| **Batch** | program, start_year, label | e.g., "2024–2028 Batch A" |
| **AcademicTerm** | name, type (semester/trimester/year), start_date, end_date, is_current | e.g., "Fall 2026" |

#### Courses & Offerings

| Entity | Key Fields | Notes |
|---|---|---|
| **Course** | code, title, department, credits, description | The template: "CS301 — Database Systems" |
| **CourseOffering** | course, academic_term, batch, section | A specific delivery: "CS301, Fall 2026, Batch A, Section 1" |
| **Enrollment** | course_offering, student (FK→User), status, enrolled_at | Many-to-many with metadata |
| **FacultyAssignment** | course_offering, faculty (FK→User), role (primary/assistant) | Who teaches this offering |

#### Learning Materials

| Entity | Key Fields | Notes |
|---|---|---|
| **MaterialFolder** | course_offering, parent_folder, title, sort_order | Hierarchical organization |
| **Material** | folder, title, type (file/link/text), file_path, url, content_text, sort_order, published_at | Learning resources |
| **Announcement** | course_offering, author, title, body, pinned, published_at | Course announcements |

#### Assignments & Submissions

| Entity | Key Fields | Notes |
|---|---|---|
| **Assignment** | course_offering, title, description, type (file_upload/text/quiz), due_date, total_marks, published_at, allow_late, late_penalty_config | Faculty creates |
| **Submission** | assignment, student, submitted_at, content_text, file_paths[], status (draft/submitted/graded/returned) | Student submits |
| **SubmissionGrade** | submission, graded_by, marks, feedback, graded_at | Faculty grades |

#### Question Banks & Examinations

| Entity | Key Fields | Notes |
|---|---|---|
| **QuestionBank** | department, course (optional), title, description, created_by | Container for questions. Can be department-wide or course-specific. |
| **Question** | question_bank, type, difficulty, marks, body (rich text), explanation, tags[], metadata, status (draft/approved/archived), created_by, approved_by | Core question entity |
| **QuestionOption** | question, label, body, is_correct, sort_order | For MCQ/MSQ types |
| **Exam** | course_offering, title, type (quiz/midterm/final/practice), total_marks, duration_minutes, start_window, end_window, instructions, config (JSON), status (draft/scheduled/live/completed/graded/published), created_by | The exam definition |
| **ExamQuestion** | exam, question, sort_order, marks_override | Links questions into an exam, optionally overriding marks |
| **ExamAttempt** | exam, student, started_at, submitted_at, status (in_progress/submitted/auto_submitted/graded), total_score, ip_address, browser_fingerprint, proctor_flags[] | A student's exam session |
| **ExamResponse** | attempt, exam_question, answer_data (JSON), time_spent_seconds, flagged_for_review | Individual answer |
| **ProctoringEvent** | attempt, event_type, timestamp, data (JSON), severity | Tab switch, window blur, copy attempt, etc. |

### Question Types

| Type | `body` format | `answer_data` format |
|---|---|---|
| **MCQ** (single correct) | Rich text + options | `{"selected": "option_id"}` |
| **MSQ** (multiple correct) | Rich text + options | `{"selected": ["id1", "id2"]}` |
| **True/False** | Statement | `{"selected": true/false}` |
| **Short Answer** | Prompt | `{"text": "..."}` |
| **Long Answer / Essay** | Prompt | `{"text": "..."}` |
| **Numerical** | Problem | `{"value": 42.5}` |
| **Fill in the Blank** | Text with `___` placeholders | `{"blanks": ["word1", "word2"]}` |

> **Deferred:** Code execution questions, diagram/drawing questions, file-upload questions.

### Database Conventions

- **Primary keys:** UUIDv7 (time-sortable, globally unique, no sequence leakage)
- **Timestamps:** `created_at`, `updated_at` on every table (UTC, timezone-aware)
- **Soft delete:** `deleted_at` column (nullable) on entities that need historical preservation (users, courses, submissions, exam attempts). Hard delete only for ephemeral data.
- **Audit columns:** `created_by`, `updated_by` on entities where authorship matters
- **Naming:** `snake_case` tables and columns. Plural table names. No prefixes.
- **Indexes:** On all foreign keys, on commonly filtered/sorted columns, composite indexes for common query patterns
- **Constraints:** Foreign keys, unique constraints, check constraints used aggressively. The database is the last line of defense.
- **JSONB:** Used sparingly for genuinely flexible/schemaless data (exam config, proctoring event payload, institution policies). Not as a substitute for proper columns.

### Migration Strategy

- **Alembic** for schema migrations
- Each migration has an `upgrade()` and `downgrade()`
- Migrations are version-controlled and linear (no branching in production)
- Data migrations separated from schema migrations
- Zero-downtime migration patterns (add column → backfill → add constraint → drop old column) for production deployments

---

## 8. Backend / API Architecture

### Project Structure

```
campusflow/
├── bedrock/                    # Reusable foundation (no CampusFlow imports)
│   ├── auth/
│   │   ├── backends.py         # Pluggable auth backends (password, SSO)
│   │   ├── jwt.py              # JWT creation, validation
│   │   ├── dependencies.py     # FastAPI dependencies (get_current_user, etc.)
│   │   ├── models.py           # RefreshToken, PasswordHistory
│   │   └── service.py          # Login, logout, refresh, password reset
│   ├── rbac/
│   │   ├── models.py           # Role, Permission, UserRole
│   │   ├── dependencies.py     # require_permission(), require_role()
│   │   ├── service.py          # Permission checking logic
│   │   └── decorators.py       # @requires("action", "resource")
│   ├── audit/
│   │   ├── models.py           # AuditLog
│   │   ├── middleware.py        # Auto-capture request context
│   │   └── service.py          # record_event()
│   ├── storage/
│   │   ├── interface.py         # Abstract StorageBackend
│   │   ├── local.py             # LocalFilesystemBackend
│   │   ├── s3.py                # S3CompatibleBackend
│   │   └── service.py          # upload, download, delete, generate_url
│   ├── mail/
│   │   ├── interface.py         # Abstract EmailBackend
│   │   ├── smtp.py
│   │   ├── console.py           # Dev: logs emails to console
│   │   └── service.py
│   ├── config/
│   │   └── settings.py          # Pydantic Settings (env + file + defaults)
│   ├── db/
│   │   ├── base.py              # Declarative base, mixins (timestamps, soft-delete, UUID PK)
│   │   ├── session.py           # Async session factory, dependency
│   │   └── pagination.py        # Cursor and offset pagination
│   ├── api/
│   │   ├── responses.py         # Envelope: {"data": ..., "meta": {...}}
│   │   ├── errors.py            # Error response format, exception handlers
│   │   ├── filters.py           # Generic filtering/sorting from query params
│   │   └── dependencies.py      # Common deps (pagination params, etc.)
│   ├── tasks/
│   │   ├── interface.py         # Abstract task runner
│   │   ├── local.py             # Asyncio-based in-process runner
│   │   └── arq_backend.py       # arq (Redis-backed) runner
│   ├── middleware/
│   │   ├── request_id.py
│   │   ├── rate_limit.py
│   │   ├── security_headers.py
│   │   └── logging.py
│   └── testing/
│       ├── fixtures.py
│       ├── factories.py         # Base factory class
│       └── client.py            # Authenticated test client helpers
│
├── domain/                      # CampusFlow-specific business logic
│   ├── institution/
│   │   ├── models.py
│   │   ├── schemas.py           # Pydantic request/response models
│   │   ├── service.py
│   │   └── router.py            # FastAPI router
│   ├── departments/
│   ├── programs/
│   ├── batches/
│   ├── academic_terms/
│   ├── users/                   # User profiles, bulk import
│   ├── courses/
│   ├── course_offerings/
│   ├── enrollments/
│   ├── materials/
│   ├── announcements/
│   ├── assignments/
│   ├── submissions/
│   ├── question_banks/
│   ├── questions/
│   ├── exams/
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── service.py           # Exam CRUD, scheduling, state machine
│   │   ├── delivery.py          # Exam session management, answer submission
│   │   ├── grading.py           # Auto-grading + manual grading workflow
│   │   ├── proctoring.py        # Proctoring event recording, flag evaluation
│   │   └── router.py
│   ├── results/
│   ├── notifications/
│   └── analytics/
│
├── main.py                      # FastAPI app factory, router mounting
├── alembic/                     # Database migrations
├── alembic.ini
├── pyproject.toml
├── Dockerfile
└── docker-compose.yml
```

### API Design Conventions

#### URL Structure

```
/api/v1/auth/login
/api/v1/auth/refresh
/api/v1/auth/logout
/api/v1/auth/password/reset-request
/api/v1/auth/password/reset

/api/v1/users
/api/v1/users/{id}
/api/v1/users/bulk-import

/api/v1/departments
/api/v1/departments/{id}
/api/v1/departments/{id}/courses

/api/v1/course-offerings
/api/v1/course-offerings/{id}
/api/v1/course-offerings/{id}/materials
/api/v1/course-offerings/{id}/assignments
/api/v1/course-offerings/{id}/enrollments
/api/v1/course-offerings/{id}/exams

/api/v1/assignments/{id}/submissions
/api/v1/submissions/{id}/grade

/api/v1/question-banks
/api/v1/question-banks/{id}/questions

/api/v1/exams/{id}
/api/v1/exams/{id}/questions
/api/v1/exams/{id}/start                  # Student starts attempt
/api/v1/exams/{id}/attempt/responses      # Submit/update answers
/api/v1/exams/{id}/attempt/submit         # Final submission
/api/v1/exams/{id}/attempt/proctor-event  # Report proctoring events
/api/v1/exams/{id}/attempts               # Faculty: view all attempts
/api/v1/exams/{id}/results                # Published results

/api/v1/notifications
/api/v1/analytics/...

/api/v1/admin/institution
/api/v1/admin/roles
/api/v1/admin/audit-logs
```

#### Response Envelope

```json
{
  "data": { ... },
  "meta": {
    "request_id": "uuid",
    "timestamp": "2026-09-30T12:00:00Z"
  }
}
```

**List responses:**
```json
{
  "data": [ ... ],
  "meta": {
    "total": 142,
    "page": 2,
    "page_size": 20,
    "request_id": "uuid"
  }
}
```

**Error responses (RFC 7807-inspired):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  },
  "meta": { "request_id": "uuid" }
}
```

#### API Versioning

- URL-based: `/api/v1/...`
- v1 is the only version initially
- Breaking changes trigger a v2 with a deprecation period for v1

---

## 9. Frontend Architecture

### Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── routes/                # File-based route definitions
│   │   │   ├── _layout.tsx        # Root layout (sidebar, topbar)
│   │   │   ├── auth/
│   │   │   │   ├── login.tsx
│   │   │   │   └── reset-password.tsx
│   │   │   ├── dashboard.tsx      # Role-aware dashboard
│   │   │   ├── courses/
│   │   │   ├── exams/
│   │   │   │   ├── _layout.tsx
│   │   │   │   ├── index.tsx      # Exam list
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── index.tsx  # Exam detail
│   │   │   │   │   ├── take.tsx   # Exam delivery (lockdown)
│   │   │   │   │   └── results.tsx
│   │   │   │   └── create.tsx
│   │   │   ├── admin/
│   │   │   └── ...
│   │   ├── providers.tsx          # Auth, query, theme providers
│   │   └── router.tsx             # Route config + guards
│   │
│   ├── core/                      # Reusable (Bedrock equivalent for FE)
│   │   ├── api/
│   │   │   ├── client.ts          # Axios/fetch wrapper, interceptors, token refresh
│   │   │   └── types.ts           # ApiResponse<T>, PaginatedResponse<T>, ApiError
│   │   ├── auth/
│   │   │   ├── context.tsx        # AuthContext, useAuth()
│   │   │   ├── guard.tsx          # ProtectedRoute, RoleGuard
│   │   │   └── hooks.ts          # useLogin, useLogout, useCurrentUser
│   │   ├── hooks/
│   │   │   ├── use-pagination.ts
│   │   │   ├── use-debounce.ts
│   │   │   └── use-media-query.ts
│   │   ├── components/
│   │   │   ├── ui/                # shadcn/ui components (Button, Dialog, Table, etc.)
│   │   │   ├── data-table/        # Generic sortable/filterable data table
│   │   │   ├── form/              # Form primitives (with react-hook-form + zod)
│   │   │   ├── layout/            # Sidebar, Topbar, Breadcrumbs, PageHeader
│   │   │   └── feedback/          # Toast, AlertDialog, EmptyState, LoadingSpinner
│   │   └── lib/
│   │       ├── date.ts            # Date formatting (day.js)
│   │       ├── storage.ts         # localStorage/sessionStorage helpers
│   │       └── constants.ts
│   │
│   ├── features/                  # CampusFlow domain features
│   │   ├── courses/
│   │   │   ├── api.ts             # React Query hooks: useCourses, useCourseDetail
│   │   │   ├── components/        # CourseCard, CourseList, CourseSidebar
│   │   │   └── types.ts
│   │   ├── exams/
│   │   │   ├── api.ts
│   │   │   ├── components/
│   │   │   │   ├── ExamEditor.tsx
│   │   │   │   ├── QuestionRenderer.tsx
│   │   │   │   ├── ExamTimer.tsx
│   │   │   │   └── ProctoringOverlay.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── use-exam-session.ts    # Exam state machine (client-side)
│   │   │   │   └── use-proctoring.ts      # Tab focus, visibility, copy detection
│   │   │   └── types.ts
│   │   ├── assignments/
│   │   ├── materials/
│   │   ├── question-banks/
│   │   ├── users/
│   │   ├── admin/
│   │   ├── notifications/
│   │   └── analytics/
│   │
│   └── theme/
│       ├── tokens.css             # CSS custom properties (institution branding)
│       └── tailwind.config.ts
│
├── public/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── Dockerfile
```

### UI/UX Design Principles

- **Role-aware dashboard:** Each role sees a different home view (student: my courses + upcoming exams; faculty: my offerings + pending grading; admin: system overview)
- **Responsive:** Desktop-first (dashboards are desktop-heavy), but responsive for basic student workflows on tablet/mobile
- **Accessible:** WCAG 2.1 AA compliance via Radix primitives and semantic HTML
- **Branded:** Institution logo, name, and accent color applied via CSS custom properties loaded from institution config API
- **Offline-safe exams:** Exam answers are auto-saved to both server and `localStorage`. Network interruptions don't lose work.

---

## 10. Examination System — Deep Dive

This is the most complex subsystem. It requires its own detailed design.

### Exam Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> Draft : Faculty creates
    Draft --> Scheduled : Publish (validates questions, marks, window)
    Scheduled --> Live : start_window reached (automatic)
    Live --> Completed : end_window passed (automatic)
    Completed --> Graded : All grading done (auto + manual)
    Graded --> Published : Faculty releases results
    Draft --> Draft : Edit questions, settings
    Scheduled --> Draft : Unpublish (before start_window)
    Published --> [*]
```

### Exam Configuration Options

```json
{
  "shuffle_questions": true,
  "shuffle_options": true,
  "one_question_at_a_time": false,
  "allow_back_navigation": true,
  "show_marks_per_question": true,
  "auto_submit_on_timeout": true,
  "negative_marking": { "enabled": false, "fraction": 0.25 },
  "allowed_attempts": 1,
  "passing_marks": 40,
  "proctoring": {
    "enabled": true,
    "track_tab_switches": true,
    "track_copy_paste": true,
    "track_window_blur": true,
    "max_violations_before_auto_submit": 5,
    "fullscreen_required": true
  },
  "ip_restriction": {
    "enabled": false,
    "allowed_cidrs": []
  }
}
```

### Exam Delivery Flow (Student)

```
1. Student opens exam page within the start_window
2. System verifies: enrolled, within time window, attempts remaining, IP (if restricted)
3. Student clicks "Start Exam" → system creates ExamAttempt, records start time
4. If proctoring enabled:
   a. Request fullscreen mode
   b. Activate visibility/focus listeners
   c. Disable right-click, copy/paste, print (best-effort browser controls)
5. Questions presented (shuffled per config)
6. Student answers are auto-saved every 30 seconds AND on every question navigation
   - Saved to server via API
   - Saved to localStorage as fallback
7. Student can flag questions for review
8. Timer counts down visibly
9. Student clicks "Submit" → confirm dialog → final submission
10. OR timer expires → auto-submit with warning
11. OR max proctoring violations → auto-submit with flag
12. ExamAttempt status → "submitted"
13. Auto-grading runs immediately for objective questions
14. Student sees "Exam submitted" confirmation
```

### Auto-Saving & Network Resilience

- **Server sync:** PATCH to `/exams/{id}/attempt/responses` with debounced batching (every 30s or on navigation)
- **Local backup:** All responses mirrored to `localStorage` keyed by `attempt_id`
- **Reconnection:** If server sync fails, retry with exponential backoff. Queue unsent responses.
- **Recovery:** If the browser crashes/closes and the student reopens within the time window, the attempt resumes from the server state (merged with any localStorage state if newer)
- **Final submit:** Must succeed server-side. If network is down at submit time, retry loop with clear UI feedback. The auto-submit-on-timeout on the server acts as the ultimate safety net.

### Auto-Grading

| Question Type | Grading Method |
|---|---|
| MCQ | Exact match against correct option |
| MSQ | Full marks if all correct selected & no incorrect; partial marking configurable |
| True/False | Exact match |
| Numerical | Within tolerance range (configurable per question) |
| Fill in the Blank | Case-insensitive match against accepted answers list |
| Short Answer | **Manual grading required** |
| Essay | **Manual grading required** |

### Manual Grading Workflow

1. Faculty opens exam → "Grade Submissions" view
2. Sees list of attempts, sorted by student, filtered by "needs manual grading"
3. For each response needing manual grading:
   - Views question and student's answer side-by-side
   - Assigns marks (0 to max for that question)
   - Optionally adds per-question feedback
4. When all responses in an attempt are graded → attempt status becomes "graded"
5. When faculty is satisfied → "Publish Results" for the exam
6. Students receive notification, can view their results

### Observable Proctoring (Not AI Proctoring)

> [!IMPORTANT]
> CampusFlow implements **observable, rules-based proctoring**, not AI/webcam proctoring. This is a deliberate decision based on privacy, reliability, legal, and infrastructure considerations.

**What the system monitors (client-side, reported to server):**

| Event | Detection Method | Severity |
|---|---|---|
| Tab switch / window blur | `visibilitychange` + `blur` events | Warning |
| Browser resize (shrunk to peek at notes) | `resize` event below threshold | Low |
| Copy attempt | `copy` event interception | Warning |
| Paste attempt | `paste` event interception | Warning |
| Print attempt | `beforeprint` event | High |
| Right-click (context menu) | `contextmenu` event prevention | Low |
| Fullscreen exit | `fullscreenchange` event | High |
| DevTools open (heuristic) | Window size delta heuristic | High |
| Multiple rapid question jumps | Client-side pattern detection | Low |

**What the system does with this data:**

- Each event is logged as a `ProctoringEvent` with timestamp and context
- Events are classified by severity
- A configurable **violation threshold** triggers auto-submit (default: 5 high-severity events)
- Faculty can review the proctoring event log for any attempt in a "Proctor Review" panel
- Events are **advisory** — faculty makes the final judgment call
- A summary "integrity score" or "flag count" is shown alongside each attempt

**What the system does NOT do:**

- No webcam recording or facial recognition
- No screen recording
- No AI behavior analysis
- No keystroke logging (beyond copy/paste detection)
- No microphone access

### IP Restriction (Optional)

- Exams can be restricted to specific CIDR ranges (e.g., campus network)
- Validated on exam start and periodically during the attempt (on each server sync)
- If IP changes mid-exam to outside the allowed range, a high-severity proctoring event is logged
- This is a supplementary measure, not a primary one

### Results & Grade Book

- Results are per-exam, showing: total score, per-question breakdown, auto vs. manual graded markers, proctoring flag summary
- Faculty can adjust individual scores after grading (with audit trail)
- "Publish" makes results visible to students
- A course-level **grade book** aggregates all assignment and exam scores for enrolled students (weighted by faculty-configured weights)
- Export to CSV/Excel for institutional records

---

## 11. File & Storage Handling

### Storage Abstraction

```python
class StorageBackend(Protocol):
    async def upload(self, path: str, data: bytes, content_type: str) -> str: ...
    async def download(self, path: str) -> bytes: ...
    async def delete(self, path: str) -> None: ...
    async def get_url(self, path: str, expires_in: int = 3600) -> str: ...
    async def exists(self, path: str) -> bool: ...
```

**Implementations:**
- `LocalFilesystemBackend` — stores files on disk, serves via the backend (dev/small deployments)
- `S3CompatibleBackend` — works with AWS S3, MinIO, DigitalOcean Spaces, Backblaze B2, etc.

### File Upload Flow

1. Client sends file via `multipart/form-data` to the API
2. API validates: file type whitelist, max size (configurable, default 50MB), virus scan (future)
3. File is stored via the storage backend with a deterministic path: `{entity_type}/{entity_id}/{uuid}_{sanitized_filename}`
4. A `File` record is created in the database with metadata (original name, size, MIME type, storage path, uploaded_by)
5. The storage path (not the full URL) is stored. URLs are generated on demand (supporting signed URLs for private storage).

### Supported Upload Contexts

- Course materials (PDF, DOCX, PPTX, images, video links)
- Assignment submissions (PDF, DOCX, ZIP, images)
- Question body images (embedded in rich text)
- Institution logo / branding assets
- User profile photos (deferred)

---

## 12. Notifications

### Notification Architecture

```
┌──────────────┐     enqueue      ┌─────────────────┐     dispatch     ┌──────────┐
│ Domain Event  │ ──────────────▶ │ Notification     │ ──────────────▶ │ Channels │
│ (exam_created │                 │ Service          │                 │ • In-app  │
│  grade_posted │                 │ (template +      │                 │ • Email   │
│  due_reminder)│                 │  recipient logic) │                 │ • (Future)│
└──────────────┘                  └─────────────────┘                  └──────────┘
```

### Notification Types

| Event | Recipients | Channels | Priority |
|---|---|---|---|
| Exam scheduled/updated | Enrolled students | In-app, Email | High |
| Exam starting soon (30 min) | Enrolled students | In-app, Email | High |
| Results published | Enrolled students | In-app, Email | High |
| Assignment posted | Enrolled students | In-app | Normal |
| Assignment due soon (24h) | Students who haven't submitted | In-app, Email | Normal |
| Submission graded | Student | In-app, Email | Normal |
| New announcement | Enrolled students | In-app | Normal |
| New material uploaded | Enrolled students | In-app | Low |
| Proctoring violation (high severity) | Faculty, Exam Controller | In-app | High |
| Account created (welcome) | New user | Email | Normal |
| Password reset | User | Email | High |

### In-App Notifications

- Stored in a `notifications` table: recipient, title, body, type, read_at, reference (entity_type + entity_id for deep linking)
- REST API: `GET /notifications` (paginated, filterable by read/unread), `PATCH /notifications/{id}/read`, `POST /notifications/mark-all-read`
- **Real-time delivery (deferred to Phase 3):** WebSocket or SSE for live notification bell updates. Initially, the frontend polls on a timer (every 60 seconds).

### Email Notifications

- Rendered from templates (plain text + HTML)
- Sent via the mail abstraction (console in dev, SMTP/provider in production)
- **Preferences:** Users can mute non-critical email notifications (stored in user preferences table)

---

## 13. Analytics & Reporting

### Scope (MVP)

Analytics in the MVP are **pre-built views**, not a generic analytics engine.

| View | Audience | Data |
|---|---|---|
| **Student Dashboard** | Student | My courses, upcoming exams/deadlines, recent grades, GPA summary |
| **Course Analytics** | Faculty | Enrollment count, assignment submission rates, average scores per assignment/exam, grade distribution histogram |
| **Exam Analytics** | Faculty, Exam Controller | Attempt count, average score, score distribution, per-question difficulty analysis (% correct), proctoring flag summary |
| **Department Overview** | Dept Head | Courses offered this term, faculty load, pass/fail rates |
| **Institution Dashboard** | Admin | Total students/faculty, active courses, exams conducted, system usage |

### Implementation Approach

- All analytics are computed from **existing transactional tables** via SQL queries/views
- No separate analytics database or ETL pipeline (premature for this scale)
- Expensive queries are cached (Redis, TTL-based)
- Charts rendered client-side (a lightweight chart library, e.g., Recharts, which integrates naturally with React)

### Export

- All tabular reports exportable to **CSV** and **Excel (XLSX)**
- Exam results exportable in formats compatible with common grading systems

---

## 14. Security, Privacy & Auditability

### Security Measures

| Layer | Measures |
|---|---|
| **Transport** | HTTPS everywhere (TLS 1.2+). HSTS headers. |
| **Authentication** | bcrypt password hashing (cost factor 12). JWT with short expiry. Refresh token rotation with reuse detection. Account lockout. |
| **Authorization** | RBAC enforced at API layer. Every endpoint declares its required permissions. Service layer double-checks for complex rules. |
| **Input validation** | Pydantic schema validation on all inputs. SQL injection prevention via parameterized queries (SQLAlchemy). XSS prevention via React's default escaping + CSP headers. |
| **CSRF** | SPA architecture + JWT in Authorization header (not cookie) means CSRF is not applicable for API calls. Refresh token cookie is `SameSite=Strict`. |
| **Rate limiting** | Per-IP and per-user rate limits on auth endpoints. Configurable per-route. |
| **File upload** | Whitelist of allowed MIME types. Max file size. Files stored outside web root. Served with `Content-Disposition: attachment` to prevent inline execution. |
| **Headers** | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy`, `Referrer-Policy: strict-origin-when-cross-origin` |
| **Dependency security** | Automated dependency vulnerability scanning (e.g., `pip-audit`, `npm audit`) in CI |
| **Secrets** | All secrets via environment variables. Never in code, config files, or version control. `.env` files for local dev only (gitignored). |

### Audit Logging

Every state-changing API call generates an audit log entry:

```json
{
  "id": "uuid",
  "timestamp": "2026-09-30T12:00:00Z",
  "user_id": "uuid",
  "user_email": "faculty@college.edu",
  "action": "exam.grade.update",
  "resource_type": "exam_attempt",
  "resource_id": "uuid",
  "ip_address": "10.0.1.50",
  "request_id": "uuid",
  "changes": {
    "score": { "old": 72, "new": 75 }
  },
  "metadata": {
    "reason": "Re-evaluated Q3 partial credit"
  }
}
```

- Audit logs are **append-only** (no update, no delete — enforced at the database level via triggers or application constraints)
- Queryable by admins via API with filters: user, action, resource, date range
- Retention: configurable (default: 3 years)

### Privacy

- Minimal PII collection: name, email, enrollment ID. No unnecessary demographic data.
- Exam proctoring data is behavioral metadata, not biometric. No webcam, no audio.
- Data export: Admin can export a student's data on request (right to access)
- Data deletion: Soft delete preserves audit integrity. True purge is a manual admin process with safeguards.
- Passwords never logged, never visible in API responses, never stored in plaintext.

### Exam Integrity Considerations

- Question banks are access-controlled (faculty/admin only)
- Exam questions are not visible to students until the exam starts
- After submission, students see their responses but not the correct answers (configurable per exam — faculty can enable answer reveal)
- Proctoring event logs cannot be modified by students
- Server-side timer validation: even if the client timer is manipulated, the server enforces the duration based on `started_at`

---

## 15. Deployment Architecture

### Development Environment

```
docker compose up
├── backend   (FastAPI, uvicorn, hot reload)
├── frontend  (Vite dev server, HMR)
├── postgres  (PostgreSQL 15)
├── redis     (Redis 7)
└── mailpit   (Email capture UI for development)
```

One command to start everything. Seed data script creates an admin user, sample department, courses, and students.

### Production Deployment

```
┌──────────────────────────────────────────────┐
│              Reverse Proxy (Caddy / Nginx)    │
│   HTTPS termination, static file serving,     │
│   gzip, rate limiting, routing                │
│   ┌──────────────┐  ┌──────────────────────┐ │
│   │ /api/*  ───▶  │  │ /* ───▶ SPA static   │ │
│   │ Backend       │  │ files (pre-built)     │ │
│   └──────┬───────┘  └──────────────────────┘ │
└──────────┼───────────────────────────────────┘
           │
    ┌──────┴───────┐
    │   FastAPI     │  (Gunicorn + Uvicorn workers)
    │   Backend     │  (N workers = 2 * CPU + 1)
    └──────┬───────┘
           │
    ┌──────┴───────┐     ┌────────────┐
    │  PostgreSQL   │     │   Redis     │
    │  (persistent  │     │  (cache,    │
    │   volume)     │     │   sessions) │
    └──────────────┘     └────────────┘
```

### Deployment Artifacts

| Artifact | Contents |
|---|---|
| `backend` Docker image | Python app, dependencies, Alembic migrations |
| `frontend` Docker image | Nginx serving built static files (or served by the reverse proxy directly) |
| `docker-compose.prod.yml` | Production compose with resource limits, healthchecks, restart policies |
| `.env.production.template` | Documented template of all required environment variables |
| `scripts/seed.py` | Initial admin user + institution setup |
| `scripts/backup.sh` | Database and file storage backup script |

### Backup & Recovery

- **Database:** Automated daily `pg_dump` to a configured backup location (local directory, S3, etc.)
- **File storage:** If using local filesystem, included in backup. If S3-compatible, provider handles durability.
- **Backup testing:** Documented procedure to restore from backup to a fresh environment
- **Retention:** Configurable (default: 30 daily + 12 monthly backups)

---

## 16. Portability & Migration Strategy

### Portability Principles

Every infrastructure dependency is behind an abstraction:

| Concern | Abstraction | Default Implementation | Alternatives |
|---|---|---|---|
| Database | SQLAlchemy + Alembic | PostgreSQL | Any SQLAlchemy-supported RDBMS (though PostgreSQL is recommended and tested) |
| File storage | `StorageBackend` interface | Local filesystem | S3, MinIO, Azure Blob, GCS |
| Email | `EmailBackend` interface | SMTP / Console | SES, SendGrid, institutional relay |
| Caching | Redis client abstraction | Redis | Could be replaced with memcached or in-memory for dev |
| Background tasks | Task runner interface | In-process / arq | Celery, any task queue |
| Auth | Pluggable backends | Self-issued JWT | OIDC/SAML federation |
| Search (future) | Search interface | PostgreSQL full-text | Elasticsearch, Meilisearch |

### Migration Playbook (Moving to College Infrastructure)

```
1. Infrastructure Setup
   - Provision: Linux server(s), PostgreSQL, Redis
   - Configure DNS, TLS certificate
   - Set up backup storage location

2. Configuration
   - Create .env.production from template
   - Configure: DATABASE_URL, REDIS_URL, STORAGE_BACKEND, SMTP settings
   - Set institution name, logo, timezone, policies via admin API or seed script

3. Deployment
   - Option A: Docker Compose on a single server (simplest)
   - Option B: Container orchestration (Kubernetes, Nomad)
   - Option C: Direct process management (systemd) — no containers

4. Data Migration (if migrating from demo)
   - pg_dump from demo → pg_restore to production
   - Copy file storage to production storage backend
   - Update storage paths if backend type changed

5. SSO Integration (if applicable)
   - Configure OIDC/SAML provider in environment variables
   - Map institutional identity attributes to CampusFlow user fields
   - Test login flow with a pilot group

6. Verification
   - Run health check endpoints
   - Test critical flows: login, course access, exam start/submit
   - Verify backup/restore procedure
```

---

## 17. Testing & Verification

### Testing Strategy

```
                  ┌──────────────┐
                  │  E2E Tests    │  Few, critical user journeys
                  │  (Playwright) │  Login → Take Exam → See Results
                  ├──────────────┤
                  │ Integration   │  API tests against real DB
                  │ Tests         │  (TestClient + test database)
                  ├──────────────┤
                  │  Unit Tests   │  Service logic, grading, RBAC
                  │  (pytest)     │  rules, state machines
                  └──────────────┘
                     Testing Pyramid
```

### Test Categories

| Category | Tool | Scope | Speed |
|---|---|---|---|
| **Unit** | pytest | Pure business logic: grading algorithms, permission checks, validation rules, state machine transitions | Fast (ms) |
| **Integration** | pytest + httpx AsyncClient | API endpoints with real database (transaction rollback per test): auth flows, CRUD, enrollment, exam lifecycle | Medium (seconds) |
| **E2E** | Playwright | Full browser tests for critical paths: student exam flow, faculty grading flow, admin user creation | Slow (tens of seconds) |
| **Frontend Unit** | Vitest + React Testing Library | Component rendering, hooks, form validation | Fast |

### CI Pipeline

```
on push / PR:
  1. Lint (ruff, eslint, prettier)
  2. Type check (mypy, tsc)
  3. Unit tests (backend + frontend, parallel)
  4. Integration tests (backend, needs PostgreSQL service container)
  5. Build frontend (catch build errors)
  6. Security scan (pip-audit, npm audit)
  7. E2E tests (on merge to main only — too slow for every push)
```

### Critical Test Scenarios (Must-Have)

- [ ] Authentication: login, refresh, logout, password reset, account lockout
- [ ] RBAC: unauthorized access to protected endpoints returns 403, not data
- [ ] Exam lifecycle: draft → schedule → live → complete → grade → publish
- [ ] Exam delivery: start attempt, save answers, auto-save, submit, auto-submit on timeout
- [ ] Exam grading: auto-grade MCQ correctly, manual grading workflow
- [ ] Proctoring: events are recorded, violation threshold triggers auto-submit
- [ ] Enrollment: student can only access courses they're enrolled in
- [ ] Concurrent exam access: two students can take the same exam simultaneously without interference
- [ ] File upload: valid files accepted, oversized/wrong type rejected, stored correctly
- [ ] Audit: all mutations create audit log entries

---

## 18. Development Phases

### Phase 0 — Project Bootstrap (1 week)

**Goal:** Runnable project skeleton with dev environment.

| Task | Deliverable |
|---|---|
| Initialize backend project | FastAPI app, pyproject.toml, Docker, docker-compose |
| Initialize frontend project | Vite + React + TypeScript, Tailwind, shadcn/ui setup |
| Database setup | PostgreSQL in Docker, SQLAlchemy async engine, Alembic init |
| Redis setup | Redis in Docker, connection factory |
| CI pipeline | GitHub Actions: lint, type check, test (initially skeleton) |
| Dev documentation | README with setup instructions, .env.example |

**Verification gate:** `docker compose up` starts all services. Backend responds to `GET /health`. Frontend renders a blank shell with sidebar.

---

### Phase 1 — Foundation & Auth (2 weeks)

**Goal:** Bedrock layer + complete authentication + user management.

| Task | Deliverable |
|---|---|
| Bedrock: DB base models | Timestamp mixin, soft-delete mixin, UUID PK mixin, base model |
| Bedrock: API conventions | Response envelope, error handler, pagination, request ID middleware |
| Bedrock: Auth module | JWT issuance/validation, refresh tokens, password hashing, login/logout/refresh endpoints |
| Bedrock: RBAC module | Role + Permission models, `require_permission` dependency, seed default roles |
| Bedrock: Audit module | AuditLog model, `record_event()` service, middleware integration |
| Bedrock: Config | Pydantic Settings, layered config loading |
| Bedrock: Storage | Interface + LocalFilesystemBackend |
| Bedrock: Mail | Interface + ConsoleBackend |
| User management | User CRUD API, bulk CSV import, password reset flow, user status lifecycle |
| Frontend: Auth | Login page, auth context, token refresh interceptor, protected routes, logout |
| Frontend: Layout | Sidebar + topbar shell, role-aware navigation, breadcrumbs |
| Frontend: Users | Admin user list, create user form, bulk import page |

**Verification gate:**
- Admin can log in, create users (single + bulk), assign roles
- Non-admin cannot access admin endpoints (RBAC enforced)
- Password reset flow works
- Audit logs capture all user management actions
- 80%+ test coverage on auth and RBAC modules

---

### Phase 2 — Academic Structure & Course Management (2 weeks)

**Goal:** Departments, programs, batches, terms, courses, offerings, enrollment, materials, announcements.

| Task | Deliverable |
|---|---|
| Academic structure APIs | Department, Program, Batch, AcademicTerm CRUD |
| Course management | Course CRUD, CourseOffering CRUD, faculty assignment |
| Enrollment | Enroll/unenroll students (single + bulk), enrollment status |
| Materials | Folder structure, material upload (files + links), publish/unpublish, file download |
| Announcements | Course-level announcements CRUD |
| Frontend: Academic admin | Department/program/batch/term management pages |
| Frontend: Courses | Course offering list (role-aware), course detail page, material browser, announcement feed |
| Frontend: Enrollment | Admin enrollment management, student "My Courses" view |

**Verification gate:**
- Admin can set up complete academic structure: departments → programs → batches → terms → courses → offerings
- Faculty assigned to offerings can manage materials and announcements
- Students see only their enrolled courses and can browse materials
- File upload/download works correctly
- Tests cover enrollment logic and access control

---

### Phase 3 — Assignments & Grading (1.5 weeks)

**Goal:** Assignment creation, submission, grading, grade book.

| Task | Deliverable |
|---|---|
| Assignments API | Create, update, publish assignments with due dates and config |
| Submissions API | Student submit (file upload + text), draft/submit status, late submission handling |
| Grading API | Faculty grade submissions (marks + feedback), return to student |
| Grade book | Course-level grade aggregation, configurable weights |
| Frontend: Assignments | Faculty assignment creator, student assignment view + submit, submission list with grading interface |
| Frontend: Grade book | Faculty grade book view, export to CSV |
| Notifications | Assignment posted, due reminder, submission graded notifications (in-app) |

**Verification gate:**
- Faculty can create assignments, students can submit, faculty can grade and return
- Late submission handling works per policy
- Grade book accurately aggregates scores
- Students receive notifications for new assignments and grades
- Tests cover submission deadlines, grading math, and notifications

---

### Phase 4 — Question Banks (1.5 weeks)

**Goal:** Question authoring, organization, tagging, and management.

| Task | Deliverable |
|---|---|
| Question Bank API | CRUD, department/course scoping, access control |
| Question API | Create questions of all types (MCQ, MSQ, T/F, Short, Essay, Numerical, FitB), rich text body, options management, tagging, difficulty, status workflow (draft → approved) |
| Question import | Bulk import from structured CSV/Excel |
| Frontend: Question Banks | Bank list, bank detail with question list, filters (type, difficulty, tags) |
| Frontend: Question Editor | Form for each question type, preview, rich text editor (Tiptap or similar), image upload in question body |

**Verification gate:**
- Faculty can create, tag, and organize questions in banks
- All question types render correctly in preview
- Department-scoped access control works (faculty in CS can't see Math questions)
- Bulk import successfully creates questions
- Tests cover question validation rules per type

---

### Phase 5 — Examination Core (2.5 weeks) ⭐

**Goal:** Exam creation, scheduling, delivery, auto-save, auto-grading, manual grading, results.

| Task | Deliverable |
|---|---|
| Exam CRUD API | Create exam, configure settings, add questions from banks, state machine (draft → scheduled → live → completed) |
| Exam delivery API | Start attempt, save responses, submit, auto-submit on timeout, resume after interruption |
| Auto-grading engine | Grade objective questions immediately on submission |
| Manual grading API | Faculty views attempts, grades subjective responses |
| Results API | Per-student results, per-exam analytics, publish/unpublish |
| Server-side timer | Validate attempt duration server-side, enforce auto-submit |
| Frontend: Exam creation | Exam editor: settings form, question picker from banks, question ordering, preview |
| Frontend: Exam delivery | Full-screen exam interface, question navigation, timer, auto-save indicator, flag for review, submit confirmation |
| Frontend: Grading | Attempt list, per-response grading interface, bulk actions |
| Frontend: Results | Student results view, faculty results overview with statistics |

**Verification gate:**
- Complete exam lifecycle works end-to-end: create → schedule → take → grade → publish results
- Auto-save works (kill browser mid-exam, reopen, answers preserved)
- Auto-grading correctly scores all objective question types
- Manual grading workflow is functional
- Server-side timer prevents over-time submissions
- Concurrent exam taking works without data conflicts
- Comprehensive test coverage on grading algorithms and exam state machine

---

### Phase 6 — Proctoring & Exam Security (1.5 weeks)

**Goal:** Observable proctoring, exam lockdown, integrity features.

| Task | Deliverable |
|---|---|
| Proctoring event API | Receive and store proctoring events from client |
| Violation engine | Count violations, enforce auto-submit threshold |
| Lockdown features (client) | Fullscreen enforcement, tab switch detection, copy/paste prevention, right-click disable, devtools detection |
| IP restriction | Optional CIDR-based access control for exams |
| Proctor review UI | Faculty view of proctoring event timeline per attempt |
| Frontend: Proctoring overlay | Visual warnings on violations, violation counter |

**Verification gate:**
- Tab switch events are captured and reported
- Violation threshold triggers auto-submit
- Faculty can review proctoring event log per student attempt
- IP restriction blocks attempts from unauthorized networks
- Proctoring does not trigger on legitimate interactions (minimize false positives)

---

### Phase 7 — Notifications & Analytics (1.5 weeks)

**Goal:** Complete notification system, dashboards, and reporting.

| Task | Deliverable |
|---|---|
| Notification infrastructure | Notification model, service, email templates, in-app notification API |
| Email sending | SMTP integration, configurable templates |
| Notification preferences | User-level email notification opt-out for non-critical types |
| Analytics dashboards | Student dashboard, course analytics, exam analytics, admin overview |
| Reports & export | CSV/Excel export for grade books, exam results, enrollment lists |
| Frontend: Notifications | Notification bell, notification panel, mark read, notification preferences |
| Frontend: Dashboards | Role-aware dashboard with cards, charts (Recharts), key metrics |

**Verification gate:**
- Notifications are generated for all defined events
- Email notifications are sent (verified via Mailpit in dev)
- Users can manage notification preferences
- Analytics dashboards show accurate data
- Exports produce valid, correctly formatted files

---

### Phase 8 — Polish, Hardening & Documentation (1.5 weeks)

**Goal:** Production readiness.

| Task | Deliverable |
|---|---|
| E2E test suite | Playwright tests for critical journeys (5-10 scenarios) |
| Security hardening | Security headers audit, dependency audit, rate limiting tuning, penetration test checklist |
| Performance | Identify and optimize slow queries (EXPLAIN ANALYZE), add indexes, cache hot data |
| Error handling | Ensure all error paths return structured errors, no stack traces in production |
| Loading states & empty states | All UI pages handle loading, error, and empty states gracefully |
| Institution branding | Admin UI for setting logo, name, accent color. Verify branding applies across all pages. |
| Deployment documentation | Production deployment guide, environment variable reference, backup/restore procedures |
| Seed data | Realistic demo dataset with multiple departments, courses, exams, and results |
| Monitoring | Health check endpoint, structured logging (JSON), log aggregation guidance |

**Verification gate:**
- All E2E tests pass
- No high/critical dependency vulnerabilities
- Deployment guide followed by a fresh reader can successfully deploy
- Demo instance running with realistic data
- All documented features work as described

---

### Phase Summary & Timeline

| Phase | Duration | Cumulative |
|---|---|---|
| 0. Bootstrap | 1 week | 1 week |
| 1. Foundation & Auth | 2 weeks | 3 weeks |
| 2. Academic Structure & Courses | 2 weeks | 5 weeks |
| 3. Assignments & Grading | 1.5 weeks | 6.5 weeks |
| 4. Question Banks | 1.5 weeks | 8 weeks |
| 5. Examination Core ⭐ | 2.5 weeks | 10.5 weeks |
| 6. Proctoring & Exam Security | 1.5 weeks | 12 weeks |
| 7. Notifications & Analytics | 1.5 weeks | 13.5 weeks |
| 8. Polish & Hardening | 1.5 weeks | **15 weeks** |

> **Total estimated duration: ~15 weeks** for a complete, deployable product.

> [!NOTE]
> These estimates assume a single focused developer working full-time. Adjust proportionally for team size. Phases 2-4 have some parallelism potential if multiple developers are available (e.g., one on backend, one on frontend).

---

## 19. MVP vs. Deferred Features

### MVP (Phases 0–8)

Everything described above. A complete, production-deployable LMS with secure examinations.

### Deferred Features (Post-MVP)

| Feature | Rationale for Deferral |
|---|---|
| **WebSocket real-time updates** | Polling is adequate for MVP. WebSocket adds deployment complexity (sticky sessions, connection management). |
| **Discussion forums** | Nice-to-have for LMS, not critical for core exam/learning workflows. |
| **Calendar integration** | Export to iCal is simple; interactive calendar view is complex UI work. |
| **Mobile app** | The SPA is responsive enough for student basics. Native app is a separate project. |
| **Video hosting/streaming** | Link to external video (YouTube, Vimeo, institutional video server). Hosting video is a different problem. |
| **Plagiarism detection** | Complex, often best handled by integrating a third-party service (Turnitin API, etc.). |
| **AI-assisted question generation** | Promising but requires careful quality control. Not core to the LMS. |
| **AI proctoring (webcam/audio)** | Privacy concerns, legal complexity, infrastructure cost, reliability issues. Observable proctoring is the responsible choice. |
| **Multi-tenancy (SaaS)** | The architecture supports it (institution is configurable), but the implementation (tenant isolation, billing) is a separate effort. |
| **SSO integration** | The auth module is designed for it, but implementing/testing OIDC/SAML requires an institutional IdP to test against. Added when a specific college deployment needs it. |
| **Advanced analytics** | Learning analytics (time-on-task, learning path analysis) are research-grade features beyond a core LMS. |
| **Internationalization (i18n)** | Initially English-only. i18n can be added when needed (React i18n + backend message catalogs). |
| **API for external integrations** | Webhooks, LTI compatibility, SIS sync — important for mature deployments, premature for initial build. |
| **Code execution questions** | Requires sandboxed execution environment. Complex and security-sensitive. Deferred. |

---

## 20. Future Extensibility

### Extension Points (Designed In)

| Extension Point | Mechanism |
|---|---|
| **New question types** | Question type is a string enum. New types add a renderer (frontend) and a grader (backend). The system's JSON-based `answer_data` accommodates any structure. |
| **New notification channels** | Implement the notification channel interface (e.g., SMS, push notifications). |
| **New storage backends** | Implement the `StorageBackend` protocol. |
| **New auth backends** | Implement the auth backend interface (SSO, LDAP, etc.). |
| **Institution-specific modules** | New domain modules can be added alongside existing ones without modifying core code. |
| **Custom roles and permissions** | The RBAC system supports dynamic role/permission creation via admin API. |
| **Feature flags** | Institution-level config supports feature toggles (e.g., enable discussion forums). New features can be gated behind flags. |
| **Webhooks (future)** | The audit/event system can be extended to dispatch webhooks to external systems. |
| **LTI integration (future)** | CampusFlow can act as an LTI Tool Provider, allowing embedding in other LMS platforms. |

### Bedrock Extraction Timeline

| When | Action |
|---|---|
| **Now** | Clean import boundaries, no CampusFlow imports in Bedrock |
| **When 2nd project starts** | Extract Bedrock into separate repo, publish as internal package |
| **Ongoing** | Both projects pin Bedrock versions independently, contribute improvements back |

---

## Appendix A: Environment Variables Reference

```bash
# === Database ===
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/campusflow

# === Redis ===
REDIS_URL=redis://localhost:6379/0

# === Auth ===
JWT_SECRET_KEY=<random-256-bit-key>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# === Storage ===
STORAGE_BACKEND=local          # local | s3
STORAGE_LOCAL_PATH=./storage
# STORAGE_S3_ENDPOINT=https://s3.amazonaws.com
# STORAGE_S3_BUCKET=campusflow-files
# STORAGE_S3_ACCESS_KEY=...
# STORAGE_S3_SECRET_KEY=...

# === Email ===
EMAIL_BACKEND=console          # console | smtp
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=...
# SMTP_PASSWORD=...
# SMTP_FROM=noreply@college.edu

# === Institution ===
INSTITUTION_NAME=Demo College
INSTITUTION_TIMEZONE=Asia/Kolkata

# === Security ===
CORS_ORIGINS=["http://localhost:5173"]
ALLOWED_HOSTS=["localhost"]

# === Tasks ===
TASK_BACKEND=local             # local | arq
```

## Appendix B: Key Architectural Decisions Record (ADR)

### ADR-001: Monolith over Microservices
**Decision:** Modular monolith with clean internal module boundaries.
**Rationale:** Single-team project, shared database is simpler, deployment is trivial, modules can be extracted later if needed.

### ADR-002: SPA + API over Server-Rendered
**Decision:** React SPA consuming a RESTful JSON API.
**Rationale:** Clean separation of concerns, API is reusable (mobile app, integrations), frontend can be deployed as static files, better offline/caching capabilities for exam delivery.

### ADR-003: Observable Proctoring over AI Proctoring
**Decision:** Browser-based behavioral monitoring with faculty review, no webcam/AI.
**Rationale:** Privacy-respecting, legally simpler, no ML infrastructure needed, reliable, sufficient for institutional exams when combined with IP restrictions and faculty review.

### ADR-004: PostgreSQL as the sole data store
**Decision:** PostgreSQL for all data (relational + JSONB for flexible metadata). No separate document store.
**Rationale:** Data is fundamentally relational. PostgreSQL's JSONB handles the few flexible-schema needs. One database to backup, maintain, and reason about.

### ADR-005: UUIDv7 Primary Keys
**Decision:** UUIDv7 for all primary keys instead of auto-increment integers.
**Rationale:** No ID enumeration attacks, safe for client-side generation, time-sortable (index-friendly), globally unique across tables and future systems.

### ADR-006: Bedrock as Internal Package (Not Separate Repo)
**Decision:** Keep Bedrock inside the CampusFlow repo with import-boundary discipline. Extract later when a second project needs it.
**Rationale:** Avoids premature abstraction and the overhead of managing a separate package before there's a second consumer. The clean boundary makes future extraction mechanical.

---

*End of Master Plan*
