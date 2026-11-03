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
- `roster_import`: Two-phase CSV/Excel roster import (preview → commit), column mapping,
  duplicate/conflict classification, idempotent re-import, and safe row-level reports.
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
  List endpoints route through the same kernel — `list_course_offerings` filters by
  `visible_offering_ids(...)` instead of a role-name chain, so a role the chain did not
  recognise (department head without a faculty assignment, a user with no role) can never
  fall through to an unscoped query.
- **Department scope:** resources owned by a department rather than a single offering (question
  banks) use `visible_department_ids(...)` — `None` for institution administrators, all
  departments for the examination bureau only when the call site opts in with
  `allow_exam_bureau=True`, otherwise the departments the user heads or teaches in. The
  question-bank surface wraps it in `campusflow.domain.question_banks.access`; every bank,
  question, import and export route is permission-gated **and** department-scoped, because the
  payloads carry answer material.
- **Materials:** every `/course-offerings/{id}/materials|folders` and `/materials/{id}/download`
  route passes `assert_can_view_offering` (reads) or `assert_can_manage_offering` (writes);
  students reach only offerings they are enrolled in.
- **Route policy is executable:** `backend/tests/test_route_policy.py` walks the live route
  table and fails any route that declares no gate while absent from the audited public
  allowlist (`/api/health` and `/api/v1/auth/*`), and additionally requires a *permission*
  gate — not mere authentication — on the answer-material routes (`/question-banks*`,
  `/questions*`).
- **Authorship fallback:** an exam or assignment author manages what they created even when no
  `FacultyAssignment` row exists. Cohort endpoints have no such fallback and always need the
  teaching link.
- **Exam bureau:** `exam_controller` reach is opt-in via `allow_exam_bureau=True`, and applies
  only to examination objects (exam authoring, rosters, exam analytics). It never grants
  gradebook access.
- **Audience projections (two-projection rule):** a candidate and a staff member never receive
  the same payload type. `ExamResponse` carries `is_correct` and `explanation` and is staff-only;
  candidates get `ExamStudentResponse` (metadata only) from `GET /exams` and
  `GET /exams/{id}/public`, whose `config` is an explicit allowlist of the switches and
  disclosures the delivery surface needs: `proctoring_enabled`, `max_attempts`,
  `show_results_immediately`, `warning_policy`, `max_violations` (the disclosed allowance),
  `warning_cooldown_seconds` (the gap before another warning can be counted),
  `device_detection_enabled`, `obstruction_threshold_seconds`,
  `evidence_retention_days` and `demo` (the demonstration paper only; it lets a
  stopped demo offer a fresh sitting instead of a lecturer reopen). An exact-key assertion in
  `tests/test_authorization_matrix.py` forces every addition to that projection to be
  deliberate. The same rule applies to gradebooks (`MyCourseGradesResponse` for students) and to
  any future domain: a shared response model that mixes staff and candidate fields is a defect.
- **Anti-enumeration:** a candidate requesting an exam they may not see (draft, or another
  offering) receives **404**, not 403, so direct URLs cannot be probed.

### Authentication Flow
1. **Access Tokens:** Short-lived JWTs (15 minutes) passed in the `Authorization: Bearer <token>` header.
2. **Refresh Tokens:** Long-lived (7 days), stored in secure `httpOnly`, `SameSite=Strict` cookies, with automatic rotation and token-family reuse detection.
3. **Password Security:** Salted `bcrypt` hashing with configurable complexity and lockout policies.

### Observable Proctoring Model
CampusFlow implements **observable, rule-based proctoring only** (ADR-003, ADR-013). There is
no screen recording, no face recognition or identity matching, no stored biometric template
and no automated cheating verdict. Events are recorded as an append-only audit trail; they
are evidence for a human reviewer. Two analyses run on the candidate's own device and only
their conclusions — an event, a direction, an angle, a dwell — reach the server: on-device
*object* detection for prohibited devices (ADR-024) and face/head-direction monitoring
(ADR-028). Neither streams video, and the face check never identifies who is in the frame.

- **Camera-integrity mode (per exam, covered by `proctoringEnabled`):** when the exam requires
the camera, the candidate's browser asks for it explicitly and the page reports readiness
only when *real frames are rendering* (live track + real frame size + progressing playback
clock + sampled pixel content). The on-screen self-view is **mirrored**
(`SELF_VIEW_STYLE`, `ExamDelivery.tsx`) so the candidate reads their own left/right the way a
mirror shows it; the frames written to the trail are captured from the raw video pixels and
keep the camera's **true, un-mirrored** orientation.
- **Evidence frames:** one 320px-wide JPEG (≈a few KB) a minute while the attempt runs, stored
as `camera_snapshot` event details on the attempt and shown only to staff holding
`exams:proctor_view` in the integrity timeline (`ExamDetail`). Camera signals recorded:
`camera_off` (the required camera stopped; one event per outage, so a long hardware fault
neither floods the timeline nor repeatedly alarms the candidate),
`camera_obstructed` (a frame that stops changing, after the authored policy grace),
`second_device_detected` (a phone in view) — all three deliberate acts, all counted on the
disclosed ladder — and the face-monitoring signals `looking_away`, `face_not_visible` and
`multiple_faces_detected`, which are evidence for a lecturer and never counted (ADR-040).
- **Face and head-direction monitoring (ADR-028/029, on by default with the camera):** BlazeFace
runs over a 320 px copy of the required frame every 700 ms in the candidate's browser and
returns a face count and three landmarks. Yaw is geometry — the nose tip's offset from the
eye midpoint, normalised by the eye span — so it is independent of resolution and camera
distance and needs no hosted service. Away time **accumulates**: a single good frame between
two turns is not a return (the episode ends only after `recoveryMs` of actually facing the
paper), so flickering between `turned_left`/`turned_right` and `no_face` cannot reset the
dwell. The per-exam `integrity_sensitivity` sets and discloses the dwell values; standard
preserves the prior 2 s turned, 3 s absent and 1.5 s second-face thresholds. A persisting
condition is re-reported every 20 s. `unreadable` frames (glare, too far, partial view) never
count as away time, so a bad frame cannot punish anyone. Confirmed conditions temporarily
**cover the question** until a sustained return; answers and timer are untouched. Confirmed
face observations raise the lecturer's review flag with their angle, direction and dwell and are
**never** counted against the allowance (ADR-040): an inference that can be wrong is a lead for a
human, while the deliberate camera acts — the feed stopped, the picture blocked, a device in
shot — still spend one warning each. Neither kind ever determines a breach by itself. Nothing about this check is streamed: the detector runs
locally and only the resulting event, with the evidence frame that the trail already attaches to
reported observations, is sent.
- **Per-exam integrity profile (ADR-029):** `integrity_sensitivity` (`relaxed`, `standard`,
`strict`) sets and discloses `dwell_ms` for face turn/absence, hand-near-face and sustained voice.
`face_monitoring_enabled`, `hand_monitoring_enabled` and `audio_monitoring_enabled` default on;
`mouth_monitoring_enabled` is opt-in and off by default (ADR-039), because the mouth-motion
heuristic false-fired on still faces and spent warnings the candidate had not earned. Hand
proximity and sustained voice are confirmed on-device and recorded for review without spending
the allowance (ADR-040); audio is analysed in memory from the existing camera stream, with no
recording or transcript. When a
signal is disabled or its model/permission is unavailable, the candidate sees that it is
unavailable rather than an assurance that it ran.
  - **Retention and erasure (ADR-026):** frames are personal data and do not live forever.
    `PROCTORING_EVIDENCE_RETENTION_DAYS` (institution setting, default 90; non-positive values
    fall back to that default so erasure cannot be switched off) drives a
    daily retention job (`purge_proctoring_evidence`, `scripts/purge_proctoring_evidence.py`) that
    erases the image from expired `camera_snapshot` events and stamps `evidence_purged_at`. The
    event itself — type, time, severity — survives, so the timeline still shows that a frame
    existed and when it was erased. Each erasing run is audited
    (`proctoring.evidence_purge`). The window is disclosed to the candidate in the assessment
    brief (`ExamStudentConfig.evidence_retention_days`).
- **On-device prohibited-device detection (ADR-024, opt-in per exam):** when
  `config.device_detection_enabled` is true — off unless an author turns it on, and disclosed
  in the candidate's brief before they begin — the candidate's browser runs TensorFlow.js on a
  downscaled 480px frame drawn from the existing preview element. COCO-SSD localises a
  `cell phone` (a box, because a box is reviewable) and MobileNet v2 classifies the frame for
  the ImageNet electronics classes COCO has no category for (`earphone`, `digital watch`).
  Nothing is streamed: no video and no frame leaves the machine for analysis, and the only image
  the server ever receives is the evidence frame the proctoring trail already carries, attached
  when an observation is reported. Three consecutive agreeing scans are required before anything
  is reported, each category reports at most once per two minutes, and the server treats
  `second_device_detected` as a **counted warning** — recorded with its frame, raising the faculty
  review flag, spending one unit of the allowance and never changing the attempt state by itself
  below the threshold (ADR-032). Accuracy is
  measured, not asserted (`frontend/scripts/measure-device-detection.js`, procedure in
  `docs/development.md`, results in `docs/memory.md` and ADR-024; the numbers are bounded by
  COCO stills and cover the phone path
  only). A watch is too small for the whole-frame read, so the scan is also handed crops built from
  the hand landmarker's wrist point and hand span (`wristCropFromNormalised`) and classifies the
  wrist itself; that landmarker loop runs whenever **either** the hand check or the device check is
  authored, and it only feeds the hand-at-face monitor when the hand check is (ADR-031). The wrist
  path has no labelled footage behind it, so no watch accuracy is claimed.
- **Recorded telemetry (client-reported, server-stored; the server fixes the vocabulary in
`PROCTORING_EVENT_TYPES`):**
  - Tab switching (`visibilitychange`) and window blur.
  - Fullscreen exit, decided after the loss has persisted for 900 ms so that moving between the
    Fullscreen API and the browser's own F11 mode is not recorded as leaving (ADR-038).
  - Clipboard activity (copy/paste) and right-click context menu.
  - Developer-tools shortcut attempts.
  - Returning inside the five-second grace (`quick_tab_return`: recorded, never charged) and
    a window resize (low-signal).
- **Tolerated-event threshold:** Each exam carries `config.max_violations` (default **10**,
authored per exam between 1 and 20 and validated by the API) and a `config.warning_policy`
(ADR-023). Both are disclosed in the candidate's brief, and the delivery payload carries the count
already recorded, so a resumed attempt shows the true `n / m` from its first frame. Under `remove`
(the default) reaching the threshold locks the attempt until a lecturer reopens it; under
`review` the attempt is flagged once for faculty review and the candidate keeps working.
Either way an automated signal never decides guilt.
- **Warning cooldown (ADR-034, ADR-035, ADR-037):** a counted warning stamps
`ExamAttempt.last_warning_at` and clears `warning_acknowledged_at`. While the acknowledgement
is missing (or older than the count), the warning is *pending*: the paper is covered, and the
conditional `UPDATE` in `record_proctoring_event` cannot increment at all. The candidate's
acknowledgement (`POST /exam-attempts/{id}/acknowledge-warning`, `exams:take`, owner-only)
stamps `warning_acknowledged_at`; only then does `PROCTORING_WARNING_COOLDOWN_SECONDS` (5)
start. A further signal inside that window is written to the trail — annotated
`suppressed_by_cooldown`, `counted: false`, with the seconds remaining — and still raises the
review flag if it is a camera cue, but cannot increment `proctor_violations_count`. The gate is
part of the conditional `UPDATE`
(`last_warning_at IS NULL OR (warning_acknowledged_at IS NOT NULL AND warning_ack_epoch <= now - gap)`),
not a Python read followed by a write: simultaneous detector reports serialise on the row, so
only one can count. The comparison is done in epoch seconds because SQLite drops timezone
information while PostgreSQL keeps it. Delivery and every event response carry
`warning_pending`, so a reload restores the modal; the cooldown is disclosed in the candidate
brief (`warning_cooldown_seconds`) and cleared when a lecturer reopens the attempt.
- **Candidate messaging:** The attempt header carries a persistent integrity chip with the
recorded count and allowance (`n / m`), a recorded event raises a red banner with the
server's wording, and the cover gate names the condition that is hiding the paper. The copy
is instructional, not accusatory; there is no strobe effect and no permanent lockout screen.
Exactly one blocking overlay is rendered at a time — warning, camera gate, then full-screen
gate — so two detectors cannot stack two dialogs in front of the candidate. The paper asks
for full-screen on the Begin click (the trusted gesture browsers require) and again when a
warning is acknowledged; if a browser refuses, the full-screen gate gives the keyboard
command instead of leaving the paper in a normal tab. Full-screen is read from both routes
(API element or a viewport that fills the display, so F11 counts), a loss must persist for
900 ms before it is acted on, and a document that cannot enter the API is given the keyboard
instruction rather than an impossible gate (ADR-038).
- **Faculty review:** The exam workspace exposes a per-attempt integrity timeline with
severities, timestamps and the measurement behind each camera/model observation — which device the
model named, its confidence, whether the read came from a wrist close-up or the weaker whole-frame
path, how long a cue was held, and — for a paper that opted into the experimental mouth cue — how
much more the mouth band moved than the forehead band. Only
known keys are rendered, so an evidence frame or a raw bbox is never dumped into the panel.
- **Faculty-authorised resumption:** `POST /exams/{id}/attempts/{attempt_id}/unlock`
(requires `exams:grade`, always audited) reopens an attempt when a recorded event is
disputed. Students can never unlock their own attempt; the endpoint rejects them with 403.
- **Durability & resumption:** Answers are continuously mirrored to `localStorage` and
synced to the server on a 30-second cadence and on navigation, so a resumed attempt keeps
all previously entered responses.

> **History:** the camera/gaze/strobe/lockdown model described in earlier revisions of this
> document was removed in Phase 13 (ADR-013). The disclosed on-device checks above are the
> current model (ADR-024–032), not a return to it.

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

---

## 7. Institutional Hierarchy, Identity & Roster Import (Wave 3/4)

### Sections are course offerings (ADR-018)

`course_offerings.section` already models "this course, this term, this section", so a section
**is** an offering and `campusflow.domain.courses.access` is its authorization — no second
scope kernel exists. A lecturer manages only offerings they teach; a department head only
offerings of departments they head; students only offerings they are enrolled in.

One assessment may cover several authorised sections: `exams.series_id` groups the per-section
`Exam` rows, and `POST /api/v1/exams/multi-section` validates every selected offering against
the caller's scope in a single transaction before any row is written.

### The mandatory Campus Lead (ADR-019)

The `admin` role is the institution's **Campus Lead / College Admin**. `domain/institution/leadership.py`
enforces "at least one active Campus Lead": every removal path in `domain/users/service.py`
calls `guard_campus_lead_removal` *before* mutating, under a PostgreSQL transaction advisory
lock, and is refused with 409 if it would leave zero. Recovery is a separate
`super_admin`-only, audited endpoint that refuses when a lead already exists.

| Endpoint | Gate |
|---|---|
| `GET /api/v1/admin/institution/campus-leads` | `require_any_role("super_admin", "admin")` |
| `POST /api/v1/admin/institution/campus-lead/recover` | `require_any_role("super_admin")`, audited |

### Student identity and duplicate prevention (ADR-020)

`users.registration_number` is the stable student identity, stored **normalised** (trimmed,
internal whitespace collapsed, uppercased) and unique when present; `admission_year` records
cohort. Punctuation is preserved on purpose (`A-12` ≠ `A12`). Business keys are encoded as
database constraints — `uq_faculty_assignment_offering_faculty`,
`uq_exam_attempt_student_number`, `ix_users_registration_number` — because a pre-insert `SELECT`
does not hold under concurrency; services translate the resulting `IntegrityError` into 409.

### Roster import (ADR-021)

```
POST /api/v1/roster-imports/preview        stage + classify (writes no accounts)
POST /api/v1/roster-imports/{id}/commit    write committable rows in one transaction
GET  /api/v1/roster-imports               recent batches
GET  /api/v1/roster-imports/{id}/report    row-level CSV report (formula-injection safe)
```

Gated by `roster:import | users:bulk_import | enrollments:manage` **and**, when a section is
targeted, the offering-scope kernel. Rows are classified as valid / invalid / duplicate-in-file
/ conflict / already-existing; nothing is written during preview; `idempotency_key` makes a
retried submit return the original result; imported accounts get a temporary random credential
and `must_change_password`, and no credential appears in any staged row, report or audit record.



---

## 8. Deployment Topology (ADR-025)

```
                    ┌──────────────────────────── host ────────────────────────────┐
  browser ──:80/:443──► proxy (Caddy)                                             │
                        │  /api/*  ──► backend (FastAPI)  ──► postgres / redis      │
                        │  else    ──► frontend (nginx, static SPA build)           │
                        │                                                           │
                        │  piston (isolate sandbox, internal only)                  │
                        │  piston-init (installs Python/C/C++/Java runtimes)        │
                        │  backup (nightly pg_dump -Fc + prune)                     │
                        │  evidence-retention (daily camera-frame erasure)          │
                        └───────────────────────────────────────────────────────────┘
```

- **One compose project, `campusflow-prod`.** The dev stack (`docker-compose.yml`) derives the name
  `campusflow` from the directory; the production file sets its own name so the two never share
  containers or volumes.
- **The proxy is the only public surface.** The API (`127.0.0.1:8001`), the static frontend
  (`127.0.0.1:8080`) and PostgreSQL (`127.0.0.1:5433`) are loopback-bound; Piston has no host port.
  The SPA and API share an origin, so cookies/CSRF work without cross-site exceptions and
  `CORS_ORIGINS` is one entry.
- **The API is stateless; PostgreSQL and the storage volume are the state.** Redis holds rate-limit
  counters and cache, with AOF persistence. The `backend-storage` volume holds uploaded materials.
- **Migrations run at container start** (`alembic upgrade head && uvicorn …`) for a single replica;
  a multi-replica rollout would move the migration to a one-off job first.
- **There is no public sign-up.** `scripts/provision_admin.py` creates the first Campus Lead +
  platform `super_admin` account; every other account is created by staff or roster import.
- **The demonstration surface is a debug affordance.** `/api/v1/exams/demo/*` is mounted only when
  `DEBUG=true`; a production app returns 404 for it and records nothing. A demo login erases the
  demo student's earlier attempts for the demo exam before minting the session, so each click is a
  fresh sitting rather than a resume or a permanently locked row. The stopped screen offers a new
  sitting because a demo has no lecturer to approve a reopen.
- **Evidence frames expire** on an institution window (ADR-026); the retention service runs the
  purge daily and the erased image never leaves an orphaned reference — the event keeps its
  `evidence_purged_at` stamp.
- **Development and production use two frontend images on purpose.** `frontend/Dockerfile.dev` runs
  the Vite dev server for the development stack; `frontend/Dockerfile` compiles the SPA and serves
  the static output from nginx. The production image has no Node runtime, so it can never be the
  container that serves a development server (ADR-025).
