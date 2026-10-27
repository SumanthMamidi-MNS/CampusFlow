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
     table each run, so a new endpoint without a gate fails CI instead of shipping.* **Consequences:** Students cannot reach any answer-bearing route (403 at the gate); staff are
  confined to their departments with 403 elsewhere while own-department authoring, CSV
export/import and bureau paper-assembly are unchanged; the directory reads now require a
  session (the frontend only calls them from authenticated pages, so no UI regression). The
  route table can no longer grow an ungated endpoint without failing the suite.

---

### ADR-018: A Section Is a Course Offering; Multi-Section Assessments Share a Series

* **Status:** Accepted (Wave 3)
* **Context:** The requirement to manage sections, section ownership and section-specific
  assessments invited a new `Section` entity. The existing schema already has one:
  `course_offerings.section` (a course + term + section = one offering row), and the Wave 0/1
  offering-scope kernel already answers every "whose section is this?" question. A parallel
  Section table would have created a second source of truth and a second scope kernel.
* **Decision:** Sections stay a property of the course offering; the offering *is* the section
  and `domain/courses/access.py` is its authorization. To let one assessment target several
  authorised sections without weakening any existing scope check, `exams.series_id` groups the
  per-section `Exam` rows created together. `POST /exams/multi-section` validates **every**
  selected offering against the caller's teaching scope before writing anything, in one
  transaction, so a substituted section id is refused and no partial paper exists.
* **Consequences:** Zero new authorization surface: section isolation is the already-tested
  offering isolation. A multi-section assessment is N exams sharing a series; grading, attempt
  and roster logic keep working per offering. `tests/test_multi_section_assessment.py` pins the
  cross-section refusal.

### ADR-019: The Campus Lead Invariant Is Enforced Transactionally, Recovered by Super Admin

* **Status:** Accepted (Wave 3)
* **Context:** An institution with no active Campus Lead (the `admin` role) cannot administer
  itself. A pre-insert count in the router would not survive two concurrent removals of
  different leads: both could read `count = 2` and both delete.
* **Decision:** `domain/institution/leadership.py` owns the invariant. Every removal path in
  `domain/users/service.py` (role demotion, deactivation, soft delete) calls
  `guard_campus_lead_removal` **before** mutating, which takes a PostgreSQL
  transaction-level advisory lock (`pg_advisory_xact_lock`) and then counts. Concurrent removals
  therefore serialise: the loser observes the reduced count and is refused with 409. SQLite
  serialises writers already, so the lock is a no-op there — which is why the concurrency
  criterion is PostgreSQL-gated in the suite. Recovery from a zero-lead state is a separate,
  explicitly authorised endpoint (`require_any_role("super_admin")`) that refuses when a lead
  already exists and is always audited.
* **Consequences:** Institutions cannot be locked out by a normal edit, and the platform role
  — not the institution's own admin — is required to recover. Ordering is load-bearing: the
  guard must run before the mutation, because a status change applied first would both answer
  its own question wrongly and be flushed by the guard's own query.

### ADR-020: The Database Is the Final Authority for Duplicate Prevention

* **Status:** Accepted (Wave 3)
* **Context:** The product had pre-insert `SELECT` checks but almost no unique constraints, so
  two concurrent requests could both create the "same" record. Wave 2 additionally reported
  duplicate `attempt_number` rows for one candidate.
* **Decision:** Every domain declares a normalised business key and encodes it as a database
  constraint, with the pre-check kept only for message quality. Added: unique
  `users.registration_number` (when present), `faculty_assignments (course_offering_id,
  faculty_id)`, `exam_attempts (exam_id, student_id, attempt_number)`, and
  `roster_import_batches.idempotency_key`. Student identifiers normalise on **case and
  whitespace only** — punctuation is preserved, because `A-12` and `A12` can be different
  people. The migration reconciles pre-existing duplicate attempt numbers by *renumbering* them
  in `started_at` order (no row is deleted) and refuses to merge duplicate teaching assignments
  automatically.
* **Consequences:** A retried or concurrent write is refused by the database, and the service
  translates that refusal into 409 rather than a 500. A unique violation can surface on any
  `flush` inside a multi-row batch, so the whole write loop — not only the final commit — is
  wrapped in the conflict guard.

### ADR-021: Roster Import Is Two-Phase, Idempotent, and Credential-Free

* **Status:** Accepted (Wave 4)
* **Context:** The existing CSV provisioning created accounts by email only, with no preview,
  no column mapping and no protection against re-import; it also accepted a default password.
  Institution spreadsheets share no fixed layout.
* **Decision:** A roster import is a staged batch (`roster_import_batches`): preview parses and
  *classifies* every row (valid / invalid / duplicate-in-file / conflict / already existing)
  without writing an account, and an explicit commit writes the committable rows in one
  transaction. Headers are aliased to canonical fields and an explicit mapping overrides the
  aliasing. `idempotency_key` makes a retried submit return the original result, and a re-import
  of the same roster matches existing accounts instead of duplicating them. Conflicts (the same
  student already enrolled in another section of the same course and term) are reported, never
  auto-moved. XLSX is read `read_only`/`data_only` so formulas are never evaluated, and generated
  reports are sanitised against spreadsheet formula injection. Imported accounts receive a
  random temporary credential and `must_change_password = True`; **no credential ever appears**
  in staged rows, reports, logs or audit records, and onboarding proceeds through the existing
  password-reset flow.
* **Consequences:** Re-uploading a roster is safe by construction. The requirement to use
  registration numbers as initial passwords is deliberately **not** implemented: it would make
  a public identifier the secret for every new account. `must_change_password` is currently
  recorded but not yet enforced at login (see progress, Wave 4 residual).

### ADR-022: The Cohort Boundary Applies to Attempt-Level Examination Surfaces; the Bureau Invigilates but Does Not Grade

* **Status:** Accepted (2026-10-11)
* **Context:** ADR-016 made the offering-scope kernel the single answer to "whose cohort is
  this?" and ADR-017 wired it through authoring surfaces and question banks. The
  examination's *attempt-level* surfaces were missed: `GET /exams/{id}/attempts`,
  `/exam-attempts/{id}/responses`, `/exam-attempts/{id}/proctoring-events`,
  `/exams/{id}/export-results`, `grade`, `publish`, `unlock`, `PUT /exams/{id}`,
  `POST /exams/{id}/questions` and `DELETE .../questions/{id}` checked only the capability
  (`exams:grade` / `exams:proctor_view` / `exams:create`). Every one of those capabilities is
  institution-wide, so any lecturer — and the examination bureau — could read or alter another
  offering's attempt list (names, emails, marks, violation counts), responses, results CSV and
  integrity timeline including captured camera frames, by supplying that offering's id.
* **Decision:** Attempt-level examination services resolve scope through
  `_assert_can_manage_exam` / `_assert_can_manage_attempt` in
  `domain/exams/service.py`, which call the offering kernel. `allow_exam_bureau` is opt-in per
  call site and is **false** for everything that is the gradebook on paper — the attempt list,
  the response queue, the results CSV, single-response grading and result publication — because
  invigilation and paper assembly are institution-wide but cohort marks are classroom work.
  Invigilation surfaces (the proctoring timeline) and the resumption path pass
  `allow_exam_bureau=True`. Authorship of an exam still grants management regardless of a
  later teaching link (unchanged from ADR-016).
* **Consequences:** A capability alone no longer reaches another section's candidates;
  `tests/test_exam_cohort_scope.py` pins both directions (own cohort 200, foreign 403) for the
  same actor so a denial can never be confused with a missing permission. The examination
  bureau keeps institution-wide invigilation and can resume a candidate it reviewed, while its
  `exams:grade` grant stops at the gradebook. Attempt ids are UUIDv4, so the previous exposure
  was not enumerable, but the rule is now structural rather than accidental.

### ADR-023: The Integrity Tolerance Is a Per-Exam Policy, Defaulting to Removal

* **Status:** Accepted (Wave 4)
* **Context:** The revised brief specifies a five-step warning ladder ending in "flag the attempt
  for faculty review", while the shipping behaviour (ADR-015) removes the candidate at the
  tolerance until a lecturer reopens the attempt. Both are defensible — removal protects the
  paper, the ladder keeps a candidate with a flaky laptop in the exam — and choosing one
  globally would either contradict the brief or silently change every assessment already
  scheduled. Raised as D-11 in `docs/completion-audit.md`, the question was put to the product
  owner, who chose a per-exam setting with **removal as the default**.
* **Decision:** `exams.config.warning_policy` is `"remove"` or `"review"`.
  `_resolve_warning_policy` in `domain/exams/service.py` is the only reader, defaults to
  `"remove"` when the key is absent or unrecognised, and the resolved policy is stamped onto every
  candidate-facing payload (`ExamStudentConfig`, `ExamDeliveryResponse`,
  `ProctoringStatusResponse`) so the browser renders the consequence the server will actually
  apply rather than assuming one. Under `review`, crossing the tolerance writes
  `flagged_for_review` plus `review_flagged_at:<iso>` **once**, audits `exam.attempt_flagged_for_review`
  once, leaves the attempt `in_progress` and lets the candidate keep working; warnings 1–4 walk the
  brief's ladder (reminder → recovery guidance → explanation → "further incidents may flag this
  attempt"). Under `remove` the lockout copy and the ADR-015 flow are untouched. Authoring rejects
  any other value at the schema (`invalid_warning_policy`, `max_violations_out_of_range`, HTTP 422)
  instead of falling back silently, and `max_violations` is bounded to 1–20. Reopening an attempt
  clears both markers, so an actioned review stops looking unreviewed in the queue.
* **Consequences:** The policy is now a disclosure rather than a hidden switch — the candidate
  brief and the live integrity banner both state which consequence applies, and a mid-paper change
  by faculty takes effect on the next recorded event. `camera_obstructed` keeps consuming a warning
  under both policies: the alternative (evidence-only) was put to the product owner with D-13 and
  declined, which is also why the four-second threshold still reports it as a warning.
  The flag is also **actionable**: `GET /exams/{id}/attempts` derives
  `flagged_for_review`/`review_flagged_at` from the flag list through `review_flag_state` (one
  reader for both the screen and the queue filter) and accepts `flagged_only=true`, and the
  faculty screen shows a "flagged for review" chip with an "N awaiting review" count and a
  review-queue toggle. Reopening an attempt clears the flag, so an actioned review leaves the
  queue it was raised in.
  `tests/test_warning_policy.py` pins the flag path, the ladder, the single audit entry, the
  `remove` default, and the authoring refusals; the ladder was additionally observed live
  (1/3 → 2/3 → 3/3 flagged, 4/3 still `in_progress` with answers saving and the paper resumable).

### ADR-024: Prohibited-Device Detection Runs On-Device, Is Disclosed Per Exam, and Is Evidence Rather Than a Verdict

* **Status:** Accepted (Wave 5). Reverses ADR-013's blanket "no camera models" for this one
  feature. Everything else ADR-013 removed — fabricated candidate feeds, the fabricated faculty
  video wall, gaze and biometric inference — stays removed.
* **Context:** `docs/completion-audit.md` D-16 recorded that the mission's Priority 1 (phones,
  earbuds and smartwatches with **measured precision/recall**) did not exist at all, and that
  re-adding it would reverse an accepted decision. Two failure modes had to be avoided: the
  ADR-013 one (canvas heuristics presented as AI, over frames streamed to the server) and its
  mirror image (a real model whose output is treated as a verdict, so a wrong prediction removes
  a candidate from a paper). Any decision here also had to answer the question ADR-013 settled by
  prohibition: **what accuracy claim can this platform actually defend?**
* **Decision:**
  - **On-device, always.** Detection runs in the candidate's browser with TensorFlow.js on WebGL,
    over a 480px frame drawn from the existing preview element into a private canvas. No video
    and no frame leaves the machine for analysis and the server never receives a stream; the only
    image the server ever sees is the evidence snapshot the proctoring trail already carries,
    attached when an observation is reported.
  - **Two models, because they answer different questions.** COCO-SSD (ssdlite_mobilenet_v2)
    *localises* a `cell phone` — a box is what makes a report reviewable — and MobileNet v2
    (alpha 0.5) *classifies* the frame for the ImageNet electronics classes COCO lacks
    (`earphone`, `digital watch`). The phone path is the measured one; the wearable path is a
    weaker whole-frame signal and is presented as such.
  - **One frame is never enough.** `DeviceConfirmationTracker` requires three consecutive agreeing
    scans at a three-second cadence before anything is reported, and each category reports at
    most once per 120 s, so a phone left on the desk for ten minutes is one observation rather
    than two hundred.
  - **A model output raises a question, never a verdict.** Server-side, `second_device_detected`
    belongs to `DEVICE_OBSERVATION_EVENT_TYPES`: it is recorded with its evidence frame, raises
    the faculty review flag (audited as `exam.attempt_flagged_device_observation`), consumes **no**
    warning allowance, and never changes the attempt state or submits it. A false positive can
    therefore cost a candidate nothing but a lecturer's glance.
  - **Opt-in per exam and disclosed before the candidate begins.** `config.device_detection_enabled`
    defaults to `False`, is validated as a boolean (anything else is 422) and is carried into the
    candidate-facing payload (`ExamStudentConfig.device_detection_enabled`), so an assessment
    written before this feature keeps the behaviour its cohort was told about and a candidate is
    told that their camera picture is analysed on their own device before the paper starts.
  - **Accuracy is measured, not asserted.** `frontend/scripts/measure-device-detection.js` scores
    the shipped module against COCO val2017 ground truth (procedure in `docs/development.md`;
    results below and in `docs/memory.md`). Thresholds and the confirmation count are the
    measured defaults, not guesses.
* **Consequences:** On 91 COCO images with an annotated phone (0.5–100% of the frame) and 100
  person-only negatives, the shipped thresholds (phoneScore 0.60, box area ≥2%) give
  **precision 0.973, recall 0.396** (36/1/55/99) — and the aggregate hides the only number that
  matters at examination distance: recall is **9/10 above 20%, 11/11 at 10–20%, 7/8 at 5–10%, but
  7/17 at 2–5%, 1/16 at 1–2% and 1/29 at 0.5–1%**. The detector works when the phone is a
  substantial part of the frame and stops working when it is small, which is the honest shape of
  a single webcam with a phone-sized model. Sensitivity: at score 0.30 with the area filter off,
  precision 0.979 and recall 0.516, so both the 0.60 bar and the 2% filter cost recall without
  buying precision **on this sample** — but 100 negatives cannot resolve small precision
  differences, so the shipped values stay conservative rather than being re-tuned to a thinner
  sample (the trade is left to real exam footage). The one false positive is a person-only frame
  with an 8%-of-frame "phone" box at 0.66 — the phone-shaped-object mode, which is why an
  observation must stay an observation. The wearable signal never cleared its 0.50 bar (the only
  mapped outputs were 0.07 and 0.03), so **no wearable accuracy is claimed** and that path is
  effectively inert until measured on real footage. Stills are not webcam frames: these numbers
  bound the detector's behaviour, they do not promise field performance. Cost: one scan of both
  models measured 88–430 ms per frame depending on the run, with 2.6–6.8 s of lazy model loading
  on the first scan only, so the three-second cadence is comfortable. Where a single camera
  fundamentally cannot see (a phone under the desk, in a pocket, off-frame, or held by someone
  else) is disclosed rather than papered over, and the retention gap for evidence frames (D-2) now
  applies to device evidence too.

---

### ADR-025: Production Is One Compose Stack with a Static SPA and a Single Proxy Front Door

* **Status:** Accepted (2026-10-12)
* **Context:** Until now the repository could be *run* but not *deployed*: the backend image
  installed dependencies into the same layer it ran from, the frontend image only existed as a dev
  server, and there was no proxy, no backup loop, no TLS story and no way to create the first
  account in a fresh database. Every deployment would have been improvised per institution.
* **Decision:**
  - **One project, one command.** `docker-compose.prod.yml` under the project name
    `campusflow-prod` runs PostgreSQL, Redis, Piston, the API, a static SPA, a Caddy proxy, the
    backup loop and the evidence-retention job. The distinct name matters: the dev stack is also
    called `campusflow` (from the directory), and two compose projects sharing a name share
    containers and volumes — a production `up` would otherwise recreate a developer's database.
  - **The SPA is a static build.** `frontend/Dockerfile` runs `npm ci && npm run build` and serves
    `dist/` from `nginx:alpine` with an SPA history fallback. No Node process, no dev server and no
    proxy-through-Vite in production.
  - **Only the proxy is public.** Backend, frontend and database bind to loopback (or not at all,
    for Piston); Caddy owns `:80`/`:443`, routes `/api/*` to the API and everything else to the
    SPA, and adds security headers and a 10 MB body cap. Same-origin serving keeps the cookie/CSRF
    model intact and makes `CORS_ORIGINS` a single entry.
  - **Secrets fail closed.** Compose interpolates `POSTGRES_PASSWORD` and `JWT_SECRET_KEY` with
    `:?`, so a missing value refuses to start; the application independently refuses to start with
    the shipped placeholder JWT secret when `DEBUG=false` (ADR-015).
  - **The image migrates at start, once.** The backend command is
    `alembic upgrade head && uvicorn …`, so the first `up` creates the schema and an upgrade applies
    itself. Migrations are idempotent and the deployment has one replica; if more replicas are ever
    added, the migration moves to a one-off job before the rollout (documented in §7.1) so two
    starts cannot race the same migration.
  - **The first account is provisioned, not self-registered.** `scripts/provision_admin.py`
    creates or repairs one account holding `admin` (the mandatory Campus Lead, ADR-019) and
    `super_admin`, from flags or `CAMPUSFLOW_ADMIN_*` environment variables. It refuses a password
    under 12 characters, is idempotent, and audits `user.bootstrap_admin`.
* **Consequences:** A fresh server needs Docker, two secrets and three commands
  (`up`, `alembic upgrade head`, `provision_admin.py`); the runbook is `docs/development.md` §7.
  The stack is verified on this host: SPA and API answered through Caddy on `:80`, unauthenticated
  API access refused with 401, a real login worked through the proxy, `pg_dump -Fc` produced a
  restorable 115 KB dump, and the sandbox memory ceiling killed a 512 MB allocation under a
  128 MB limit. The deployment has no orchestration story beyond compose (no rolling upgrades, no
  multi-node), which is the right scope for a single-institution install and is stated rather than
  implied.

---

### ADR-026: Camera Evidence Frames Expire; the Integrity Event Does Not (D-2)

* **Status:** Accepted (2026-10-12)
* **Context:** Integrity mode stores a downscaled still every minute so a reviewer can confirm who
  was present. That is the most sensitive payload in the platform — an identifiable image of a
  student — and it was retained forever, with no policy, no erasure and no way for an institution
  to set a window. A review trail that cannot distinguish "this happened" from "we kept the picture
  forever" is a liability, not evidence.
* **Decision:**
  - **The image expires; the event stays.** `PROCTORING_EVIDENCE_RETENTION_DAYS` (default 90) sets
    the window. The daily retention job erases `details.snapshot` from `camera_snapshot` events
    older than it and stamps `details.evidence_purged_at`. Type, timestamp and severity survive, so
    the timeline still proves a frame existed and records when it was erased.
  - **0 means keep, never erase-now.** A retention of 0 leaves frames alone; the purge is a no-op.
    The alternative reading ("delete everything before today") is exactly the mistake a careless
    operator would make.
  - **The window is institutional, not per-exam.** It is a data-protection policy, not an
    authoring choice, so it lives in settings and is applied uniformly.
  - **It is disclosed.** The value travels to the candidate with the exam
    (`ExamStudentConfig.evidence_retention_days`, the delivery response) and the brief says the
    pictures are deleted after N days while the log entry remains.
  - **Erasure is audited and idempotent.** A run that erases anything writes
    `proctoring.evidence_purge` with the window, cutoff and count; a second run erases nothing.
* **Consequences:** The production stack runs the purge daily in its own service, and
  `scripts/purge_proctoring_evidence.py` can be run by hand (safe). `tests/test_proctoring_security.py`
  pins the boundary: an expired frame loses its image, a recent frame keeps it, a non-evidence
  event is untouched, a second run is a no-op and 0 is a no-op. Device-detection evidence that
  includes a snapshot is covered by the same rule because the purge keys on the event vocabulary,
  not on which feature created the frame.

---

### ADR-027: MIT Licensing and a Deployable Stack Instead of a Public Demo

* **Status:** Accepted (2026-10-18)
* **Context:** This repository is also the project's portfolio artefact: a reviewer forms a judgement
  in the first screen, before reading any code. Two packaging questions followed from that. Licensing
  first — the tree shipped with no `LICENSE` file and a README ending in "Proprietary. All rights
  reserved.", which is worse than either choice: no licence is actually granted, and a reader cannot
  tell a deliberate decision from an oversight. Then demonstration: a hosted demo is the most
  compelling proof for a web application, but this is a multi-tenant examination platform with a
  privileged code sandbox, real proctoring evidence and no public sign-up. A public instance would be
  a writable anonymous surface holding personal data, and its inevitable bit-rot (sleeping free tiers,
  rotated secrets, dead links) would misrepresent the work more than its absence does.
* **Decision:**
  - **MIT, with the file present.** `LICENSE` carries the standard text (© 2026 Sumanth Mamidi); both
    package manifests declare `MIT`; the README links the file instead of restating it.
  - **The deployment path is the demo.** `docker-compose.prod.yml` installs the complete product in
    three commands on any server. The README leads with that path, states plainly why there is no
    public instance, and treats a local run as the way to evaluate the system.
  - **Screenshots are evidence, not decoration.** They are captured from the running product — headless
    Chrome against a freshly seeded database — never staged mock-ups, and the capture recipe is
    recorded in `docs/development.md` so they can be regenerated rather than hand-edited.
  - **README claims are bounded by measurement.** Every number quoted there (test counts, lint
    results, service health) comes from a run performed on the tree being pushed, and the
    "Known limitations" section names what is unfinished instead of leaving a reviewer to discover it.
* **Consequences:** A reviewer can read the repository as a product pitch and run the real thing
  locally in about five minutes. The trade-off accepted is that there is no single URL to click; the
  screenshots, the measured verification section and the three-command install carry that job instead.
  Screenshots become a maintenance obligation — they are honest, so they age, and a UI change means
  recapturing them.

---

### ADR-028: On-Device Face and Head-Direction Monitoring, and a Paper That Covers When Unobserved

* **Status:** Accepted (2026-10-24)
* **Context:** The integrity pipeline could prove the camera was alive and the tab was focused,
  and it could localise a phone. It could not answer the question a candidate actually exploits:
  *are you still looking at your own paper?* Turning to a neighbour's screen, reading a sheet
  beside the desk, or having someone else sit down all leave the camera running and the tab
  focused, so none of the browser signals fired. Two related holes made it worse: a camera outage
  cost exactly one event however long it lasted, and a banner was the only response to a
  condition that still left the question readable. ADR-003 rejected server-side streaming and
  ADR-024 rejected model output as a verdict; this decision has to stay inside both boundaries.
* **Decision:**
  - **Detection runs on the candidate's device, and only conclusions are recorded.** A face
    detector (BlazeFace, TF.js, loaded lazily at ~1 MB) runs over a 320-px copy of the required
    camera frame every 700 ms. No frame for this check is transmitted, stored or analysed
    elsewhere; the events that reach the server are a direction, an angle, a dwell and the same
    still frame the other signals already carry.
  - **The angle is geometry, not a model opinion.** The nose tip's horizontal offset from the eye
    midpoint, normalised by the eye span, inverts to a yaw through a single documented constant
    (`NOSE_DEPTH_RATIO`). It is invariant to resolution and distance, and the enforcement
    threshold (50°, a real profile turn) sits far enough out that the constant's error cannot
    flip a verdict at the boundary.
  - **Away time accumulates; a glance is not a reset.** Two seconds turned away, three seconds
    with no face, one and a half seconds with a second face — but measured cumulatively inside an
    episode. A single good frame between two turns does not restart the clock; the episode ends
    only after 1.6 s of actually facing the paper. Without this, turning for 1.9 s, glancing back
    for one frame and turning again defeats any contiguous-dwell rule — the classic evasion, and
    the reason a naive implementation is not trustworthy. A capped sample delta stops a
    throttled tab from manufacturing away time. A persisting condition is re-reported every
    twenty seconds, so a blink, a glance or a dropped frame is never an event, and ten minutes
    unobserved is not one event either.
  - **They consume the allowance.** Unlike a modelled *device* observation (ADR-024, review
    evidence only), these are measurements of the candidate's own presence, so `looking_away`,
    `face_not_visible` and `multiple_faces_detected` count against the disclosed `max_violations`
    exactly as leaving the paper does. A camera outage is now reported on the same escalation
    cadence rather than once per outage.
  - **The allowance is disclosed before the first event.** `max_violations` is part of the
    candidate's brief, and the delivery payload carries the count already recorded, so a resumed
    attempt shows `n / m` from its first frame. The number is visible in the header chip and
    repeated by the cover gate — one answer wherever the candidate looks.
  - **The paper is covered when a condition is confirmed.** Camera off, a black picture, or a
    dwell-confirmed no-face / second-face / sustained-turn condition replaces the question area
    with a gate that states what is happening, how many events are recorded, and that answers and
    the timer are safe. The gate is driven by the confirmed condition, not by a single frame: a
    detector miss must not hide the question, and a glance back must not dismiss the cover. It
    lifts only after the return has held for the recovery window. A banner was tried and is
    insufficient — it leaves the question readable, which is the whole payoff of being
    unobserved.
  - **Failure is disclosed, never simulated.** If the model cannot load, the self-view strip says
    `Face check: unavailable`; the pipeline never renders a protection that is not running.
* **Consequences:** The strongest cheat the browser can see is now detected within seconds and
  costs the candidate their allowance; hiding for the rest of the hour costs an event every
  twenty seconds, and flickering back no longer resets the timer. Accepted limits, stated to
  candidates and reviewers rather than hidden: a candidate who turns their whole body and screen
  keeps a frontal face, the check runs in the candidate's own client and so is a deterrent rather
  than a tamper-proof observer, and poor lighting or glare can make a face unmeasurable — which
  never reports and never accrues away time, by design, so a bad frame cannot punish anyone (and
  an unmeasurable reading cannot be used to dismiss an already-confirmed cover for longer than
  the recovery window). The model download adds ~1 MB once per session. Server-side video with
  invigilation would close the remaining gaps and is deliberately out of scope.

---

### ADR-029: A Per-Exam Integrity Profile, and an Observation Tier for the Weakest Cues

* **Status:** Accepted (2026-10-27)
* **Context:** ADR-023 made the *consequence* of reaching the tolerance per-exam, and ADR-028 made
  the camera signals enforceable — but every dwell in that pipeline was still a constant compiled
  into the client (`turnDwellMs: 2000`, `absenceDwellMs: 3000`). A closed-book final and a
  first-year quiz therefore ran at identical sensitivity, and a paper could not opt out of a cue
  it did not want. Two further holes were visible against how this is actually cheated: a phone
  held below the shot while the head stays forward, and a second person reading answers out of
  frame — neither of which produces a single event in the existing vocabulary. The counter-pressure
  is a published one: an AI auto-proctor study across 244 attempts recorded 74 incorrect decisions
  in 244 attempts, and no independent per-signal false-positive rate exists for hand-to-face or
  audio on an ordinary webcam. Research into commercial systems (ProctorU, Proctorio, Respondus,
  Honorlock) found the same asymmetry: browser events are near-deterministic, while a webcam
  inference is a flag for a human, and a generic audio alarm is explicitly *not* evidence.
* **Decision:**
  - **Sensitivity is a per-exam property, disclosed as values.** Three tiers — `relaxed`,
    `standard`, `strict` — set the dwell for every camera cue
    (`INTEGRITY_DWELL_MS`), and `standard` is exactly what every paper authored before the setting
    existed already ran at, so an upgrade cannot tighten a cohort's paper. The server sends the
    milliseconds with the brief and the delivery; the client adopts them (`setDwell`) and enforces
    what the candidate was told rather than its own constants. An unknown tier is refused at
    authoring time (422) rather than silently defaulting, because a silent downgrade would hold a
    cohort to a dwell nobody authored.
  - **Each camera cue is independently switchable per exam.** `face_monitoring_enabled` (default
    on — it is the baseline presence check), `hand_monitoring_enabled` and
    `audio_monitoring_enabled` (default off, because each analyses more of the candidate's own
    room). All three are disclosed to the candidate before the paper starts.
  - **Two new signals, and both sit in an observation tier.** `hand_near_face` — a hand held at or
    over the face for the tier's dwell, the geometry of reading from something in the hand —
    and `voice_detected` — a sustained second voice measured from the microphone. Both are
    recorded as evidence, raise the faculty review flag, show the candidate a neutral reminder,
    and **never consume the allowance, lock the attempt or auto-submit** (the whole reason is the
    benign-cause list: a scratch, glasses, a cough, a fan, a housemate, an accessibility need).
    `HAND_AUDIO_OBSERVATION_EVENT_TYPES` is the single place that decides this.
  - **The detectors share the face measurement instead of guessing separately.** Hand geometry
    scales the landmarks from the face loop's frame onto its own, so both agree where the head is.
    Voice reuses the call element's existing stream rather than requesting a second capture.
  - **Nothing is recorded for the voice cue.** Frames are read as numbers, tested for amplitude,
    band concentration and syllabic modulation, then discarded: no clip, no transcript, no
    streaming. The event carries a level band and a duration. A steady loud hum is explicitly
    rejected for lack of modulation, which is the false positive that would make the signal
    worthless.
* **Consequences:** A department can run a mid-term at `relaxed` with hands and voice off and a
  final at `strict` with both on, and the candidate is told exactly that, in seconds, before the
  paper starts. The two weakest cues add real coverage — the below-shot phone and the out-of-frame
  voice — without handing a model the power to fail anyone, which is the line ADR-003, ADR-024 and
  ADR-028 all draw. Accepted limits, stated on the landing page and to candidates: a phone under
  the desk, a second screen out of shot and a crib sheet on a knee remain invisible to any single
  webcam, a quiet speaker at distance is not detected, and neither new cue carries an accuracy
  figure we could publish. The hand landmarker adds a ~3 MB model fetch once per session, loaded
  lazily and reported as `unavailable` when it cannot load rather than presented as protection.
