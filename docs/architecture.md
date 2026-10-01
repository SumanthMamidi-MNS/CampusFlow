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
6. `bedrock.rbac`: Role and permission models, permission dependency injection (`require_permission`).
7. `bedrock.audit`: Append-only audit trail logging for all mutations.
8. `bedrock.storage`: File storage abstraction with pluggable drivers (`LocalFilesystemBackend`, `S3CompatibleBackend`).
9. `bedrock.mail`: Email delivery abstraction (`ConsoleBackend`, `SMTPBackend`).
10. `bedrock.testing`: Reusable test fixtures, database rollback helpers, and authenticated test clients.

### Domain Modules (`campusflow.domain`)
Domain modules implement higher-level academic and examination logic:
- `institution`: Global institution profile, branding, academic terms, and policies.
- `users`: User profiles, lifecycle states (pending, active, inactive), and bulk provisioning.
- `departments`: Academic divisions and programs.
- `courses`: Course definitions, offerings, and sections.
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

### Authentication Flow
1. **Access Tokens:** Short-lived JWTs (15 minutes) passed in the `Authorization: Bearer <token>` header.
2. **Refresh Tokens:** Long-lived (7 days), stored in secure `httpOnly`, `SameSite=Strict` cookies, with automatic rotation and token-family reuse detection.
3. **Password Security:** Salted `bcrypt` hashing with configurable complexity and lockout policies.

### Observable & Live Proctoring Model
To ensure academic integrity, student privacy, and operational reliability:
- **Zero-Tolerance Prohibited Device Detection:**
  - Dedicated detection vector for mobile phones and smart devices (`mobile_phone_detected`, `phone_detected`, `unauthorized_device_detected`).
  - **Instant Termination:** Immediately bypasses standard warning counters, forces `violations_count = max_violations`, marks `status = "locked_violation"`, and triggers `exam.attempt_locked_phone_detected` audit trail.
- **High-Urgency Blinking Strobe Warnings:**
  - Client viewport renders an unmissable red pulsing strobe border (`animate-pulse border-8 border-rose-600 bg-rose-500/15`) and high-priority banner upon any security breach.
- **Candidate Visual Prominence & Expanded View:**
  - Top header "Self-View" action and expandable camera HUD offering full HD Candidate Camera & Visual Self-Verification with live gaze angle, lighting balance, and device scanner feedback.
- **Fixed Position Browser Lockdown:**
  - Intercepts and overrides browser `popstate` / `history.pushState` to trap back/forward navigation within the exam canvas. Any navigation attempt logs a violation without losing position.
  - Implements `beforeunload` warning handler preventing accidental tab close or page reload.
- **Real-Time Vision & Gaze Monitoring:** HTML5 Canvas offscreen analysis of camera stream detecting gaze deviation (head turn / looking sideways away from monitor) and downward tilt (reading/writing unauthorized notes or phone in lap). Includes biometric fallback and simulation controls for reproducible evaluation.
- **Client-Side Cheat Interception:**
  - Browser visibility and focus tracking (`visibilitychange`, `blur`).
  - Fullscreen enforcement and exit tracking.
  - Prevention and logging of copy/paste, cut, and right-click context-menu actions.
  - Blocked unauthorized shortcuts (Developer Tools `F12`, `Ctrl+Shift+I/J/C`, `Ctrl+U`, `Alt-Tab`, `Meta`/Windows key, `PrintScreen`).
- **Strict 6-Warning Escalation & Lockout:**
  - Candidates receive inescapable modal warnings for non-fatal infractions 1 through 5, complete with remaining warning countdowns and a visual 6-step progress meter.
  - On the 6th infraction (`violations_count >= 6`), the exam session terminates immediately; attempt status transitions to `locked_violation` and is locked out.
- **Faculty Live Invigilator Hub & Multi-Candidate Video Wall:**
  - Dedicated "Live Invigilator Hub & Webcams" dashboard tab in `ExamDetail.tsx`.
  - Multi-candidate simultaneous video wall showing 1080p feeds, station IDs, real-time gaze telemetry, audio decibel meters, and status badges (`CENTERED`, `WARNING X/6`, `PHONE LOCKED`, `LOCKED`).
  - Stream inspection modal with detailed gaze vectors, audio waveforms, and question completion metrics.
  - Mass broadcast system to dispatch high-priority invigilator announcements to all candidate screens simultaneously.
  - Direct one-click re-entry authorization resetting candidate violations.
- **Strict 1-to-1 Proctor Help Desk (No Peer Communication):**
  - Candidate emergency communication is strictly 1-to-1 between candidate and invigilator; student-to-student peer chat is disabled.
- **Durability & Resumption:** Client answers are continuously preserved in local storage and debounced server sync; upon faculty unlock, the student resumes with all previous answers intact.


