# Architectural Decision Records (ADR)

This document records the foundational architectural and technical decisions made for CampusFlow.

---

### ADR-001: Modular Monolith Architecture
* **Status:** Accepted
* **Context:** A college LMS and examination platform requires strong relational consistency across users, courses, enrollments, and examinations. Distributed microservices introduce network latency, distributed transactions, deployment overhead, and complex maintenance without justifiable benefit for a single-institution system.
* **Decision:** Adopt a modular monolith backend architecture. Organize code strictly by domain boundaries with internal service interfaces and isolate generic infrastructure in a reusable `bedrock` foundation layer.
* **Consequences:** Simple single-process deployment and local development. Clear extraction path if specific modules ever need to be isolated into independent services.

---

### ADR-002: Single Page Application (SPA) with Decoupled REST API
* **Status:** Accepted
* **Context:** The examination engine requires robust client-side state management, local question caching, millisecond-accurate client timers, and immediate resilience against intermittent network drops.
* **Decision:** Decouple the frontend as a React Single Page Application (SPA) consuming a versioned RESTful JSON API.
* **Consequences:** The frontend can be hosted independently or served via high-performance static file caches. The API serves as a clean contract for future native mobile clients or external LMS integrations (LTI).

---

### ADR-003: Observable Rule-Based Proctoring over AI/Biometric Surveillance
* **Status:** Accepted
* **Context:** Commercial AI proctoring tools introduce significant student privacy violations, false-positive bias, high bandwidth demands, and legal/regulatory liabilities.
* **Decision:** Implement observable, client-telemetry proctoring based on browser events (tab switches, window blur, resize detection, clipboard interception, fullscreen monitoring) paired with server-side duration enforcement and faculty audit review.
* **Consequences:** Eliminates webcam streaming costs and privacy compliance liabilities while providing actionable audit logs of test-taking behavior.

---

### ADR-004: PostgreSQL as the Primary Data Store
* **Status:** Accepted
* **Context:** CampusFlow models complex relational data (enrollments, grading hierarchies, question banks) alongside semi-structured examination configurations and proctoring event logs.
* **Decision:** Use PostgreSQL 15+ as the single database engine. Utilize standard relational tables for core academic entities and `JSONB` for polymorphic question options, configuration payloads, and proctoring event details.
* **Consequences:** Eliminates the operational complexity of managing dual datastores (e.g. relational + document DB) while retaining relational integrity and flexible JSON querying.

---

### ADR-005: UUID Primary Keys
* **Status:** Accepted
* **Context:** Sequential auto-increment integer IDs expose business metrics, allow easy ID enumeration attacks, and complicate distributed data migrations.
* **Decision:** Use UUIDs as the primary key format across all entities.
* **Consequences:** Safe exposure of IDs in API routes and client-side URLs. Prevents enumeration vulnerabilities and ensures migration portability.

---

### ADR-006: Internal Reusable Foundation ("Bedrock")
* **Status:** Accepted
* **Context:** The foundational subsystems (authentication, RBAC, audit logs, file storage, email, error handling) are project-agnostic and will be reused in future systems. However, managing separate multi-repo packages early introduces release overhead.
* **Decision:** Keep the Bedrock foundation inside the repository under `campusflow/bedrock`, enforcing a strict architectural rule that Bedrock code never imports domain code.
* **Consequences:** Zero external package release overhead during initial development. Future extraction into a standalone package is straightforward and requires no restructuring of CampusFlow domain code.

---

### ADR-007: Tailwind CSS v4 & Institutional Light Theme
* **Status:** Accepted
* **Context:** Enterprise and academic platforms require clean readability, accessibility (WCAG 2.1 AA), and institutional branding customization rather than dark/hacker aesthetics.
* **Decision:** Standardize on Tailwind CSS v4 and Radix primitives (shadcn-compatible) with an institutional light theme driven by CSS custom properties.
* **Consequences:** Consistent, professional appearance with low CSS bundle overhead and easy institutional white-labeling.

---

### ADR-008: Multi-Signal Observable Proctoring & Automated Threshold Enforcement
* **Status:** Accepted
* **Context:** Remote and computer-based college examinations require high academic integrity without intrusive or opaque third-party proprietary desktop agents that impair portability.
* **Decision:** Implement observable browser telemetry combining visibility change, window blur timing, fullscreen tracking, clipboard interception, context-menu prevention, and devtools blocking. Log events with severity tags into append-only tables and enforce an automated violation threshold that triggers an auto-submit of the attempt once breached. Faculty are provided a chronological audit trail.
* **Consequences:** Highly portable across modern desktop browsers without proprietary native installer dependencies; provides clear, auditable evidence for academic dispute resolution.

---

### ADR-009: Institutional White-Labeling & Configurable Policy Architecture
* **Status:** Accepted
* **Context:** Different colleges and university faculties operate under diverse visual brand guidelines, timezones, and academic submission policies. Hardcoding institution attributes prevents portable deployments.
* **Decision:** Store institution identity (name, code, logo URL, brand accent color, timezone, contact info) and system policies (`allow_late_submissions`, `exam_strict_proctoring`, `max_login_attempts`) in a dedicated `institutions` table with administration API (`/api/v1/institution`) and frontend management workspace (`/admin/settings`).
* **Consequences:** Any institution can instantly customize branding and policies without code modification or redeployment.

---

### ADR-010: Bedrock Security Headers & Multi-Layer E2E Verification
* **Status:** Accepted
* **Context:** Production college LMS platforms handle sensitive examination material, student records, and grading audits, requiring defense-in-depth protections against clickjacking, MIME-confusion, and unauthorized framing.
* **Decision:** Implement `SecurityHeadersMiddleware` in the Bedrock foundation to automatically attach `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` to all outgoing HTTP responses. Back this with an end-to-end integration test suite (`test_e2e_production_flows.py`) verifying security headers, RBAC isolation, exam auto-grading, proctoring telemetry, and gradebook export.
* **Consequences:** Hardens the system against common web vulnerabilities at zero latency cost and guarantees regression-free deployment verification.

---

### ADR-011: Strict 6-Warning Escalation, Vision Gaze Detection & Faculty Re-Entry Architecture
* **Status:** Accepted
* **Context:** Remote exam takers may attempt subtle cheating methods including looking away towards secondary displays or peers, looking downward to read or write unauthorized cheat notes, switching applications, or sharing clips. Strict limits and clear re-entry protocols are essential for fair administration.
* **Decision:** 
  1. Enforce a strict 6-warning limit across all proctoring event vectors (both camera gaze analysis and browser lockdown events).
  2. Implement real-time camera-based heuristic computer-vision analysis on an offscreen HTML5 canvas to detect sideways gaze deviations (`side_viewing`) and downward tilt towards paper or desk (`looking_down`), with a biometric fallback HUD and interactive simulation suite.
  3. Warnings 1 to 5 trigger modal alert dialogues with remaining counts and an escalation meter.
  4. On the 6th warning, the exam canvas terminates immediately into a locked state (`locked_violation`).
  5. Resuming requires explicit faculty or proctor authorization via `POST /api/v1/exams/{exam_id}/attempts/{attempt_id}/unlock`.
  6. Answers are preserved continuously in local storage and debounced server sync, allowing full recovery without data loss once unlocked.
* **Consequences:** Provides a rigorous, human-aligned defense against subtle exam tampering while guaranteeing fairness through an explicit faculty appeal and unlock mechanism.

---

### ADR-012: Zero-Tolerance Mobile Phone Termination, High-Urgency Blinking Strobe Warnings & Faculty Live Invigilator Hub
* **Status:** Accepted
* **Context:** Mobile phones, unauthorized handheld devices, and browser back-navigation represent severe threats to exam integrity. Furthermore, candidates require continuous visual feedback of their own camera stream to maintain confidence, while faculty invigilators need simultaneous visibility over all active candidates without chaotic peer-to-peer student communications.
* **Decision:**
  1. **Zero-Tolerance Prohibited Device Policy:** Mobile phone detection (`mobile_phone_detected`, `phone_detected`, `unauthorized_device_detected`) immediately terminates the exam attempt, sets `violations_count = max_violations`, marks status as `locked_violation`, and requires faculty intervention to unlock.
  2. **High-Urgency Blinking Strobe Warning:** Viewport renders a persistent pulsing red strobe border (`animate-pulse border-8 border-rose-600 bg-rose-500/15`) and warning header upon security breaches to make violations unmissable.
  3. **Candidate Visual Clarity:** Provide a prominent "Self-View" header action and expandable 1080p modal detailing gaze telemetry, lighting quality, and device scan confirmation.
  4. **Fixed Position Lockdown:** Intercept `popstate` / `history.pushState` and `beforeunload` to lock the exam canvas in place and convert navigation attempts into auditable infractions.
  5. **Faculty Live Invigilator Hub:** Provide an 8-candidate real-time video wall with live telemetry, status badges, HD stream inspection, one-click re-entry authorization, and mass announcement broadcast.
  6. **Private 1-to-1 Invigilator Channel:** Replace peer messaging with a dedicated Proctor Help Desk strictly connecting candidate to invigilator.
* **Consequences:** Completely eliminates illicit device usage and browser escape routes, provides comprehensive real-time situational awareness for faculty, and removes student-to-student collusion risks.
* **Status update (2026-10-06):** **Superseded by ADR-013.** The camera/gaze, strobe, and
  lockout mechanisms introduced by this decision were removed; see ADR-013 for the audit
  findings and rationale.

---

### ADR-013: Revert to Observable Rule-Based Proctoring (Supersedes ADR-011 & ADR-012)
* **Status:** Accepted (2026-10-06)
* **Context:** A full repository audit found that ADR-011 and ADR-012 had drifted away from
  the product's own architectural principles. The shipped implementation included:
  1. Webcam capture with client-side "gaze"/"phone" heuristics presented as AI detection,
     contradicting ADR-003 (no webcam) and creating privacy and false-positive liability.
  2. A synthetic, canvas-drawn "photorealistic candidate feed" shown when no camera existed,
     which fabricated visual data instead of reporting an error.
  3. Hardcoded fake candidates and fake 1080p streams in the faculty "Live Invigilator Hub",
     meaning the video wall displayed invented people and telemetry.
  4. Blinking full-viewport strobe warnings and "CRITICAL SECURITY BREACH" copy, which
     conflicts with the responsible-educational-UX requirements (no aggressive visual
     warnings, no surveillance messaging).
  5. A student-facing "Faculty Authorization Simulator" button that let a candidate invoke
     the faculty unlock endpoint, plus hidden `Ctrl+Alt+Shift` QA hotkeys embedded in the
     student exam canvas.
* **Decision:** Remove camera-based detection, synthetic feeds, strobe warnings, the video
  wall, the student unlock simulator, and the hidden hotkeys. Retain and harden only:
  server-enforced timing, observable browser telemetry, the append-only proctoring trail,
  faculty timeline review, threshold auto-submission, and a permission-gated, audited
  faculty-authorised resumption. Unify the tolerance on `config.max_violations` (default 5).
* **Consequences:** The proctoring subsystem matches ADR-003 and ADR-008 again. Candidates
  receive neutral, non-anxious messaging; instructors retain full auditability; fabricated
  evidence can no longer appear anywhere in the product. `locked_violation` remains a valid
  historical attempt status but is no longer produced.

---

### ADR-014: Piston Sidecar for Sandboxed Student Code Execution
* **Status:** Accepted (2026-10-06)
* **Context:** The lecturer requirement is that a student can write and run Python inside
  CampusFlow with no local installation. Executing untrusted code is the highest-risk
  capability in the system: naive `subprocess.run()` inside FastAPI would allow CPU
  exhaustion, memory bombs, fork abuse, filesystem access, and network egress.
* **Decision:** Keep the modular monolith and delegate execution to a self-hosted Piston
  container reached over HTTP behind the project-agnostic `campusflow.bedrock.runner`
  protocol. Enforce a global concurrency semaphore, hard overall timeout, per-problem CPU
  and memory ceilings, output truncation, and fail-closed behaviour (HTTP 503) when the
  sandbox is unavailable. Bind Piston to host loopback only.
* **Alternatives considered:** (a) an in-repo Docker-SDK runner launching one ephemeral
  container per execution — rejected for the volume of custom security code it requires and
  its slow cold-start per run; (b) `subprocess` with rlimits/nsjail — rejected as
  insufficient isolation for untrusted student code. Gravity Index has no managed sandbox
  that satisfies self-hosting and portability requirements.
* **Consequences:** One additional container in the deployment. The `CodeRunner` interface
  keeps the choice swappable: replacing Piston with another engine is a single adapter.
  Institutions that disable the feature set `CODE_RUNNER_ENABLED=false`.

---

### ADR-015: Authentication Rate Limiting, Secret Enforcement, and No Hardcoded Credentials
* **Status:** Accepted (2026-10-06)
* **Context:** The audit found that documented rate limiting did not exist, a default JWT
  secret could be used in production, `.env.example` used a prefix the settings loader does
  not honour (making the template silently inert), and a super-admin account with a
  published password was auto-created by application startup logic.
* **Decision:** (1) Add `AuthRateLimitMiddleware` protecting only credential endpoints
  (login, refresh, password reset) with a sliding window; (2) refuse to start when `DEBUG` is
  false and the shipped placeholder secret is still configured; (3) correct `.env.example`
  to unprefixed variable names; (4) remove user creation from the application lifespan so
  demo accounts exist only via the explicit seed script; (5) set the refresh cookie to
  `SameSite=Strict`.
* **Consequences:** Brute-force attempts are throttled per client address without penalising
  many legitimate users behind a single campus NAT. Deployments must set a real secret,
  which is a deliberate fail-fast. Multi-worker deployments should back the limiter with
  Redis (`REDIS_URL` is already provisioned).





### ADR-016: Offering-Scoped Authorization & Audience-Specific Projections

* **Status:** Accepted (Wave 0, P0 security repair)
* **Context:** A live audit of the running stack found several read endpoints protected only by
  `get_current_active_user` while returning staff-shaped payloads. A signed-in student could read
  every examination's answer key for the whole institution (`is_correct`, `explanation`), the
  cohort gradebook, the course roster and course analytics — each reproduced against the running
  PostgreSQL instance. The candidate's own assessment screen also fetched the staff exam payload,
  so the answer key arrived in the student's browser during the attempt.
* **Decision:**
  1. **Authorization is scope-based, not capability-based.** A permission code answers *what* a
     user may do; it never answers *whose* data they may touch. `campusflow.domain.courses.access`
     is the single implementation of that question (`can_manage_offering`, `can_view_offering`,
     `visible_offering_ids`, `assert_can_*_offering`) and every offering-scoped domain routes its
     access decisions through it. Institution administrators see everything; department heads are
     limited to departments they head; the examination bureau is institution-wide **only** for
     examination work and must opt in with `allow_exam_bureau=True`; faculty are limited to
     offerings they teach (or authored); students are limited to offerings they are enrolled in.
  2. **One serializer per audience.** `ExamResponse` (staff, carries answer keys) and
     `ExamStudentResponse` (candidate, metadata only) are separate schemas; the candidate shape
     has no field capable of carrying answer material. `GET /exams/{id}` is a staff resource and
     candidates use `GET /exams/{id}/public` for the pre-attempt brief.
  3. **Cohort data requires teaching scope.** Gradebook, roster and course analytics are
     staff-of-offering data. A student's own marks come from a dedicated self-scoped endpoint
     (`GET /course-offerings/{id}/my-grades`) that cannot express another student's identity.
  4. **Institution-wide reporting is role-gated**, not reachable through the broad `analytics:view`
     capability individual instructors also hold.
  5. **No fabricated fallbacks:** where a statistic has no underlying data the API returns `null`
     ("no data yet") rather than a placeholder percentage.
* **Consequences:** Negative-path authorization is now testable and tested.
  `backend/tests/test_authorization_matrix.py` asserts the candidate leak space (forbidden keys),
  cross-department 403s and the self-scoped student views, so a regression that re-exposes answer
  material fails the suite instead of reaching a candidate. Faculty authoring is unchanged and
  still receives full definitions.

### ADR-017: Department Scope for Authoring Surfaces & an Executable Route Policy

* **Status:** Accepted (Wave 1 of the approved master plan)
* **Context:** The Wave 0 kernel answered *offering* questions, but three surfaces still decided
  access by other means: `/question-banks*` reads were open to any authenticated user (answer
  keys leaked to student sessions), materials routes performed no offering check, and
  `list_course_offerings` chose its filter from an `if/elif` chain on raw role names — a
  department head who was not also faculty fell through every branch into an unscoped,
  institution-wide query. A programmatic walk additionally found six directory routes
  (`/departments`, `/departments/{id}`, `/programs`, `/batches`, `/academic-terms`,
  `/institution`) reachable anonymously.
* **Decision:**
  1. **One kernel for every scope question.** Offering-owned data uses `visible_offering_ids` /
     `assert_can_*_offering`; department-owned data (question banks) uses the new
     `visible_department_ids` — `None` for administrators, all departments for the examination
     bureau only when the call site opts in with `allow_exam_bureau=True`, otherwise the
     departments the user heads or teaches in. `domain/question_banks/access.py` is the only
     place the question-bank surface interprets that result; no inline role logic in routers.
  2. **Answer material requires a capability, a session is not enough.** Every
     `/question-banks*` and `/questions*` route requires `questions:manage` (held by all staff
     roles, by no student role) *and* the department check; reads and writes alike.
  3. **The public surface is enumerated and tested.** Public routes are exactly
     `/api/health` and `/api/v1/auth/*`. `tests/test_route_policy.py` walks the live route
     table each run, so a new endpoint without a gate fails CI instead of shipping.
* **Consequences:** Students cannot reach any answer-bearing route (403 at the gate); staff are
  confined to their departments with 403 elsewhere while own-department authoring, CSV
  export/import and bureau paper-assembly are unchanged; the directory reads now require a
  session (the frontend only calls them from authenticated pages, so no UI regression). The
  route table can no longer grow an ungated endpoint without failing the suite.
