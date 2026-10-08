# CampusFlow Architecture

## 1. System Overview & Scope

CampusFlow is a production-quality, modular-monolith Learning Management System (LMS) and secure online examination platform engineered for colleges and universities.

```
┌─────────────────────────────────────────────────────────────┐
│                 Frontend (React 19 + Vite)                  │
│       src/core (API, Auth, UI)   │  src/features (LMS/Exams) │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / JSON REST API
┌──────────────────────────────▼──────────────────────────────┐
│                  Backend (Python 3.12 / FastAPI)             │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                CampusFlow Domain Modules              │  │
│  │  Institution · Users · Departments · Courses · Exams │  │
│  │  Assignments · Materials · Question Banks · Proctor   │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │ Imports foundation           │
│  ┌───────────────────────────▼───────────────────────────┐  │
│  │             Bedrock Foundation (Reusable Core)        │  │
│  │  Auth · RBAC · Audit · Storage · Mail · DB · Errors   │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
       PostgreSQL 15+                       Redis 7
   (Relational Data + JSONB)        (Cache, Rate-limits, Sessions)
```

The system is architected as a **modular monolith** with a decoupled Single Page Application (SPA) frontend.

---

## 2. Reusable Foundation ("Bedrock") vs. Domain

### The Bedrock Layer (`campusflow.bedrock`)
The Bedrock layer contains project-agnostic engineering infrastructure that can be extracted cleanly into an independent shared library without altering domain logic.

**Core Rules:**
- **Strict One-Way Dependency:** Bedrock packages **never** import from `campusflow.domain`.
- **Domain Decoupling:** Bedrock components use protocol interfaces, dependency injection, and abstract base classes.

**Subsystems in Bedrock:**
1. `bedrock.config`: Environment-driven configuration via Pydantic `BaseSettings`.
2. `bedrock.db`: Base declarative models, timestamp/soft-delete mixins, session lifecycle dependencies (`get_db`).
3. `bedrock.api`: Standard API response envelopes (`success_response`, `paginated_response`), RFC-7807 structured error handlers (`register_exception_handlers`), and pagination helpers.
4. `bedrock.middleware`: Request tracking (`X-Request-ID`), rate limiting, and HTTP security response headers (`SecurityHeadersMiddleware` enforcing nosniff, DENY frame options, XSS blocking, and strict referrer policies).
5. `bedrock.auth`: JWT issuance, verification, refresh token rotation, and password hashing (bcrypt).
6. `bedrock.rbac`: Role and permission models, capability dependencies (`require_permission`, `require_any_permission`, `require_any_role`). Offering-scope logic deliberately lives in the domain (`campusflow.domain.courses.access`), because Bedrock must not know domain concepts.
7. `bedrock.audit`: Append-only audit trail logging for all mutations.
8. `bedrock.storage`: File storage abstraction with pluggable drivers (`LocalFilesystemBackend`, `S3CompatibleBackend`).
9. `bedrock.mail`: Email delivery abstraction (`ConsoleBackend`, `SMTPBackend`).
10. `bedrock.testing`: Reusable test fixtures, database rollback helpers, and authenticated test clients.

### Domain Modules (`campusflow.domain`)
Domain modules implement higher-level academic and examination logic:
- `institution`: Global institution profile, branding, academic terms, and policies.
- `users`: User profiles, lifecycle states (pending, active, inactive), and bulk provisioning.
- `departments`: Academic divisions and programs.
- `courses`: Course definitions, offerings, sections, and the shared offering-scope kernel (`campusflow.domain.courses.access`) that every domain uses for authorization scoping.
- `enrollments`: Student roster management and instructor assignments.
- `materials`: Structured learning materials, folders, and resources.
- `assignments`: Task creation, student submissions, and grading.
- `question_banks`: Question authoring, tagging, versioning, and option pools.
- `exams`: Examination lifecycle, delivery engine, auto-save state, auto/manual grading, and proctoring observability.
- `notifications`: Multi-channel alerts (in-app and email).
- `analytics`: Aggregated institutional, course, and exam performance metrics.

---

## 3. Data Architecture & Database Conventions

### Storage Engines
- **PostgreSQL 15+**: Primary relational datastore. Leverages JSONB for flexible exam configurations and proctoring event payloads.
- **Redis 7**: Cache, session metadata, real-time rate limiting, and pub/sub event bus.

### Database Conventions
- **Primary Keys:** UUID (`uuid.uuid4` standard; index-optimized).
- **Audit Columns:** Every model inherits `created_at` (timestamptz) and `updated_at` (timestamptz).
- **Soft Deletion:** Archival-critical entities incorporate `deleted_at` (nullable timestamptz).
- **Naming Conventions:** Strict `snake_case` table and column names. Explicit foreign key constraints with indexes on all lookup columns.

---

## 4. API Design Standards

### Standard Response Envelope
All successful responses return a JSON object containing `data` and request `meta`:
```json
{
  "data": { ... },
  "meta": {
    "request_id": "c1f7b098-904e-4f76-805c-352cb2da782e",
    "timestamp": "2026-09-30T12:00:00Z"
  }
}
```

### Standard Paginated Envelope
```json
{
  "data": [ ... ],
  "meta": {
    "pagination": {
      "total": 140,
      "page": 1,
      "page_size": 20
    },
    "request_id": "c1f7b098-904e-4f76-805c-352cb2da782e"
  }
}
```

### Standard Error Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The payload failed validation constraints.",
    "details": [
      {
        "field": "email",
        "message": "Must be a valid institutional email address."
      }
    ]
  },
  "meta": {
    "request_id": "c1f7b098-904e-4f76-805c-352cb2da782e"
  }
}
```

---

## 5. Frontend Architecture

### Directory Layout
- `src/core/`: Project-agnostic and reusable UI components, layouts, auth context, API client, and utilities.
- `src/features/`: Domain-specific components, custom hooks, and API endpoints organized by feature module (`courses`, `exams`, `admin`, etc.).
- `src/app/`: Application shell, providers (`TanStack Query`, `AuthProvider`), and React Router route trees.

### Design System & Institutional UI
- Default visual theme is a clean, crisp, **light institutional UI** built with Tailwind CSS v4 and reusable foundation primitives.
- **Design Tokens:** Centralized via Tailwind CSS v4 `@theme` in `src/index.css` and `src/theme/tokens.css`, including Inter font family, institutional slate/blue palette, restrained border radius (`rounded-lg` for interactive elements, `rounded-xl` for containers), and subtle elevation shadows (`shadow-xs`, `shadow-card`).
- **Foundation UI Library (`src/core/components/ui/`):** Reusable, type-safe primitives implemented with `class-variance-authority`:
  - `Button`: Primary, secondary, ghost, destructive with size variants and loading indicators.
  - `Input` & `Select`: Uniform borders, focus rings, left icons, error validation messages.
  - `Badge`: Status badges (default, primary, success, warning, destructive, outline).
  - `Card`: Institutional cards (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`).
  - `Dialog`: Accessible modal suite with backdrop blur, keyboard Escape listener, and React portal mounting.
  - `Table`: Standardized data tables (`TableHeader`, `TableRow`, `TableHead`, `TableCell`).
  - `Tabs`: Clean underline-style tab navigation.
  - `EmptyState` & `Loading`/`Skeleton`: Standardized feedback states.
- Brand colors, logos, and institution titles are populated dynamically from the institution configuration API via CSS custom properties.
- Dark-mode, high-contrast, or terminal hacker themes are strictly avoided for regular user workflows.

---

## 6. Security, Authentication & Proctoring

### Authorization & Offering Scoping (ADR-016)

The backend is the single source of truth for authorization; the frontend hides affordances
only for usability, never as a security boundary.

- **Capability gate:** every route declares an explicit dependency — a permission
  (`require_permission` / `require_any_permission`) or a role set (`require_any_role`) — or is
  deliberately public. Routes that read or mutate cohort data are never public.
- **Scope gate:** owning a permission is not enough. Any route that answers questions about a
  *cohort* (gradebook, roster, course analytics) additionally calls the offering-scope kernel
  in `campusflow.domain.courses.access`:
  - `assert_can_manage_offering(...)` — instructor of record (or admin) may grade/manage;
  - `assert_can_view_offering(...)` — anything broader than manage is explicit;
  - `visible_offering_ids(...)` — returns the set of offerings the caller may see, or `None`
    for unrestricted roles.
- **Authorship fallback:** an exam or assignment author manages what they created even when no
  `FacultyAssignment` row exists. Cohort endpoints have no such fallback and always need the
  teaching link.
- **Exam bureau:** `exam_controller` reach is opt-in via `allow_exam_bureau=True`, and applies
  only to examination objects (exam authoring, rosters, exam analytics). It never grants
  gradebook access.
- **Audience projections (two-projection rule):** a candidate and a staff member never receive
  the same payload type. `ExamResponse` carries `is_correct` and `explanation` and is staff-only;
  candidates get `ExamStudentResponse` (metadata only, `config` reduced to
  `{proctoring_enabled, max_attempts}`) from `GET /exams` and `GET /exams/{id}/public`. The same
  rule applies to gradebooks (`MyCourseGradesResponse` for students) and to any future domain: a
  shared response model that mixes staff and candidate fields is a defect.
- **Anti-enumeration:** a candidate requesting an exam they may not see (draft, or another
  offering) receives **404**, not 403, so direct URLs cannot be probed.

### Authentication Flow
1. **Access Tokens:** Short-lived JWTs (15 minutes) passed in the `Authorization: Bearer <token>` header.
2. **Refresh Tokens:** Long-lived (7 days), stored in secure `httpOnly`, `SameSite=Strict` cookies, with automatic rotation and token-family reuse detection.
3. **Password Security:** Salted `bcrypt` hashing with configurable complexity and lockout policies.

### Observable Proctoring Model
CampusFlow implements **observable, rule-based proctoring only** (ADR-003). There is no
webcam capture, no gaze/facial analysis, no screen recording, and no biometric processing.
Events are recorded as an append-only audit trail; they are advisory evidence for a human
reviewer and never an automated judgement about a candidate.

- **Recorded telemetry (client-reported, server-stored):**
  - Tab switching (`visibilitychange`) and window blur.
  - Fullscreen exit.
  - Clipboard activity (copy/paste) and right-click context menu.
  - Developer-tools shortcut attempts.
- **Tolerated-event threshold:** Each exam carries `config.max_violations` (default 5,
authored per exam and validated by the API). Reaching the threshold **auto-submits** the
attempt with a `max_violations_exceeded` flag (ADR-008) rather than locking the candidate out.
- **Neutral candidate messaging:** Candidates see a calm, informational notice of the
remaining allowance. There is no flashing/strobe warning, no shouting copy, and no
lockdown screen.
- **Faculty review:** The exam workspace exposes a per-attempt integrity timeline with
severities and timestamps, so an instructor can interpret context before acting.
- **Faculty-authorised resumption:** `POST /exams/{id}/attempts/{attempt_id}/unlock`
(requires `exams:grade`, always audited) reopens an attempt when a recorded event is
disputed. Students can never unlock their own attempt; the endpoint rejects them with 403.
- **Durability & resumption:** Answers are continuously mirrored to `localStorage` and
synced to the server on a 30-second cadence and on navigation, so a resumed attempt keeps
all previously entered responses.

> **Superseded:** the camera/gaze/strobe/lockdown model described in earlier revisions of
> this document was removed in Phase 13. See ADR-013.

### Sandboxed Code Execution (Programming Environment)
Student source code is **never** executed inside the API process. Execution is delegated to
a self-hosted [Piston](https://github.com/engineer-man/piston) sidecar, which runs each job
inside an `isolate` sandbox in its own container.

- **Abstraction:** `campusflow.bedrock.runner` defines the project-agnostic `CodeRunner`
protocol plus `ExecutionRequest`/`ExecutionResult` value objects. `PistonRunner` is the
HTTP implementation; `get_runner()` selects it from configuration.
- **Safety envelope:** `run_code()` applies a global concurrency semaphore, a hard overall
timeout, per-problem CPU/memory ceilings, and output truncation. It **fails closed** — when
execution is disabled or the sandbox is unreachable it raises `ServiceUnavailableError`
(HTTP 503) instead of fabricating a result.
- **Isolation properties:** separate container, no host filesystem mounts used by the API,
bound to host loopback only, no candidate network access, ephemeral job filesystem,
process/CPU/memory limits enforced by `isolate`.
- **Grading:** `campusflow.domain.programming` persists problems, test cases, submissions,
and per-test results. A submission runs every test case; hidden expected outputs are never
returned to students.

See docs/decisions.md ADR-014 for the full isolation rationale and limits.


