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
  by faculty takes effect on the next recorded event. Which *events* spend the allowance is a
  separate question, settled by ADR-029: every camera- and microphone-derived signal is review-only
  and the allowance covers browser/page telemetry alone, so an obstruction or a lost feed is named
  as a technical observation (the four-second threshold still reports it) without charging it.
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
  - **A non-positive setting cannot switch erasure off.** `0` (or any negative value) falls back to
    the finite 90-day default rather than meaning "keep forever"; the reading "delete everything
    before today" is exactly the mistake a careless operator would make, so neither extreme is
    reachable from configuration.
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
  event is untouched, a second run is a no-op and a non-positive window purges on the default.
  Device-detection evidence that
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
  - **They are review-only observations.** `looking_away`, `face_not_visible`,
    `multiple_faces_detected`, camera outages and obstruction are recorded with context and raised
    for faculty review, but they do not consume the browser/page-event `max_violations` allowance,
    lock the attempt or auto-submit. Face and camera models have no validated per-signal error rates
    on live exam footage; technical issues, lighting, disability and ordinary movement can all
    trigger them. The candidate is told that the paper is covered during a confirmed condition,
    while their answers and timer remain safe. A camera outage is re-reported every 20 s while it
    persists so the timeline shows duration without treating each report as a new violation.
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
* **Consequences:** The browser can record tab, focus, fullscreen and clipboard events against
  the disclosed browser/page-event allowance. Camera observations—including face presence, head
  direction, obstruction and devices—are review-only; a confirmed face condition temporarily covers
  the question but does not spend that allowance or decide guilt. Continued absence is re-reported
  every twenty seconds, and flickering back no longer resets the dwell. Accepted limits, stated to
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

### ADR-030: Mouth Movement Is Measured as Pixel Motion, Never as Speech

* **Status:** Accepted (2026-10-30); since ADR-039 the cue is opt-in and off by default.
* **Context:** Every other camera cue in the engine is a position measurement — where the head is,
  where a hand is, whether a device is in the shot. Speaking moves none of them: the head stays
  forward, the hands stay clear, the phone stays out of frame, and with `audio_monitoring_enabled`
  off the microphone is not consulted either. A candidate repeating an answer aloud for someone
  behind the camera, or reading back a dictated answer, produced no event at all. The two honest
  ways to close that were speech recognition (which records the candidate's room and is exactly
  the privacy line this project does not cross) or face landmarks (`@mediapipe/tasks-vision`, a
  second model download per proctored paper for a cue whose benign causes are constant).
* **Decision:**
  - **Measure motion, not speech.** For each sample the mouth band and a forehead reference band
    of the same face are reduced to mean luma per pixel; the change since the previous sample is
    the mean absolute difference. Talking moves the mouth band far more than the forehead; a head
    turn, a lean or a nod moves both about equally. The signal is therefore *dominance*, not raw
    motion: a reading counts only when `mouthMotion >= MOUTH_MOTION_MIN` **and**
    `mouthMotion >= MOUTH_DOMINANCE * referenceMotion` (0.02 and 1.8), which is what stops a
    candidate shifting in their chair from reading as one who is talking.
  - **No audio, no clip, no transcript.** Nothing is recognised, transcribed or kept; the event
    carries two motion numbers, a dominance ratio and a duration. `audio_active` records whether
    the voice check independently heard something at the same moment — corroboration for a
    reviewer, never an input to the decision.
  - **Dwell is authored and disclosed, and pauses do not reset it.** `INTEGRITY_DWELL_MS.mouth`
    (relaxed 4.5 s, standard 3 s, strict 2 s) is sent with the brief and the delivery; the client
    adopts it. Speech is *made* of pauses, so observed motion accumulates across them and only a
    `recoveryMs` of stillness ends the episode. A continuing episode re-reports no more often than
    `escalationMs`, so ten minutes of talking is a handful of entries, not a full timeline.
  - **Observation tier, on with the camera.** `mouth_movement_detected` joins
    `MOUTH_OBSERVATION_EVENT_TYPES`, so it is recorded with its evidence frame, raises the faculty
    review flag, shows the candidate a neutral reminder and never consumes the allowance, locks or
    auto-submits. It defaults on with face monitoring (`DEFAULT_MOUTH_MONITORING = True`) because it
    reads frames the face check already reads and adds no capture of its own.
* **Consequences:** The talk-aloud path now produces a reviewable signal where it previously
  produced silence, at a few hundred bytes of arithmetic per sample and no new model. Accepted
  limits, stated to candidates: it cannot distinguish talking from chewing, yawning, drinking,
  laughing or a sneeze; a candidate who speaks with little lip movement, or who is off to the side
  of the frame, is not detected; heavy compression smears small motion, so quiet movement can fall
  below the threshold. No accuracy figure is claimed, which is why the cue can never spend the
  allowance.

### ADR-031: The Wrist Crop That Finds a Watch Is Supplied Independently of the Hand Check

* **Status:** Accepted (2026-10-30)
* **Context:** ADR-024 shipped wearable detection through MobileNet, and measurement later showed
  that path to be effectively inert: a watch at exam distance is a few thousand pixels of a 480 px
  frame, so the whole-frame classifier never cleared its bar (the only mapped outputs were 0.07 and
  0.03). The fix was a close-up: the hand landmarker's wrist point and hand span define a crop that
  contains mostly wrist, and classifying that crop is what makes a watch findable at all. But the
  wrist point came from the hand-at-face loop, which only runs when an author enabled
  `hand_monitoring_enabled` — off by default, and off on most papers. So a paper with device
  detection on and hand monitoring off could never produce the crop, and smartwatch detection was
  still inert in exactly the configuration most papers use.
* **Decision:** The hand landmarker loop runs when **either** `hand_monitoring_enabled` **or**
  `device_detection_enabled` is authored. Its wrist crops feed the device scan either way; the
  hand-at-face monitor is only fed when `hand_monitoring_enabled` is true, and the loop returns
  immediately after publishing the crops when it is not. The hand check's own status states are
  likewise only set when that check is authored, so a device-only paper never shows "hand check:
  active" for a check it did not enable.
* **Consequences:** A smartwatch is now reachable on a paper that never asked to watch hands, and a
  hand-only paper is unchanged. The cost is one more lazy model fetch on device-enabled papers,
  which already load TensorFlow models; a blocked model host leaves the wearable read on the weaker
  whole-frame path and the device scan still reports phones. Supplying a crop is not an observation:
  no `hand_near_face` event can be produced by a loop that exists only to find a watch, and the
  candidate brief says the watch is looked for in a small close-up of the wrist while the hands are
  in view. **This is a mechanism, not a measured detector.** No labelled watch footage exists in
  this repository and COCO carries no watch ground truth, so the wrist path ships with no accuracy
  figure and the old warning stands: do not describe earbud or smartwatch detection as working until
  it has been measured on real footage. A watch on the far arm, worn above the sleeve line, or out
  of frame remains undetected.

### ADR-032: A Confirmed Cue Spends a Warning, and Every Cue Ships Switched On

* **Status:** Accepted (2026-10-30) — supersedes the "observation tier" classification in ADR-024,
  ADR-028 and ADR-030, and the off-by-default switches in ADR-029. **Superseded in part 2026-11-03
  by ADR-040:** a deliberate act (leaving the paper, closing or covering the camera, a device in
  shot) still spends one warning, while an inference about the candidate is recorded for review
  and never counted. The switch defaults in this ADR still stand.
* **Context:** The observation tier was built so a model could never punish a candidate, and it did
  that job too well. Every camera cue — a hand at the face, a phone in shot, sustained talking, mouth
  movement — was recorded for review and charged nothing, so a candidate who ignored the advisory
  could hold a phone to the lens for the whole paper and see their counter sit still. Two of the
  four detectors were also off unless an author turned them on, and the assessments nobody
  configured were exactly the ones where a raised phone used to pass unrecorded. The product's
  disclosed contract was already "seven warnings, then a stop only a lecturer can lift"; a signal
  that never touches that ladder is indistinguishable, from the candidate's seat, from a detector
  that does not work.
* **Decision:** Every confirmed cue spends exactly one of the disclosed warnings, on the same ladder
  as a tab switch, and the seventh stops the paper under the `remove` policy. `hand_monitoring_enabled`,
  `mouth_monitoring_enabled` and `device_detection_enabled` default on, `audio_monitoring_enabled`
  stays on, and an author may still switch any one of them off. (The mouth default was reversed in
  ADR-039 after real-sitting false positives; it is now opt-in.) The server no longer applies its
  duplicate-signal debounce to confirmed camera cues: the client has already paid the dwell and
  resets its episode after reporting, so a repeat is a new episode, not a doubled listener. Browser
  signals keep the debounce.
* **Consequences:** The candidate is told which behaviour was seen and which warning it was ("Warning
  3 of 7 — a phone, earbuds or a watch was visible to your camera"), the lecturer still receives the
  measurement and the review flag, and the path back into the paper is unchanged: the candidate
  requests, only a lecturer may reopen. The cost is more warnings on ordinary behaviour, and that
  cost is deliberate and disclosed — a cough, a scratch or a stretch may spend a warning, which is
  why the candidate can explain it and the lecturer controls whether the attempt continues. The
  accuracy caveat stands: none of these cues is a measured detector on exam footage, so each one is
  a warning a human weighs, never a verdict.

### ADR-033: The Demo May Restart Itself; a Real Paper May Not

* **Status:** Accepted (2026-11-01).
* **Context:** The integrity stop is deliberately one-way for an institution: after the disclosed
  allowance, only a lecturer can reopen the attempt, and the candidate sees a request screen while
  they wait. The demo paper runs the same policy, so a reviewer who reached seven warnings landed on
  a screen that asked them to wait for a lecturer who does not exist in the demo. The demo exists to
  show the product in a few minutes, not to strand the reviewer in its most restrictive state.
* **Decision:** `demo_login` discards the demo student's attempts for the demo exam before minting a
  session, and the candidate payload carries a `demo` boolean (in `ExamStudentConfig` and
  `ExamDeliveryResponse`; never in a staff projection). When a demo attempt is stopped, the candidate
  screen replaces the lecturer-request flow with "Start a fresh demo", which calls the same launcher
  as the exams board. A real paper keeps the reopen flow, the automatic re-check and the lecturer
  gate unchanged.
* **Consequences:** Every demo click — the exams-board button or the stopped screen — is a new
  attempt 1 with a full clock and zero warnings. Restarting from one tab deletes
  the demo attempt another tab may still be holding; that is acceptable for a single-purpose demo
  account and is the reason the state is explicitly disposable. `demo` is a bare marker, not an
  answer or a grading internal, and the exact-key assertion on the candidate config still guards the
  projection.

### ADR-034: Ten Warnings, and a Cooldown Between Counted Ones

* **Status:** Accepted (2026-11-01) — raises the default allowance from ADR-032's seven and adds the
  cooldown; the ADR-032 decision that every confirmed cue spends a warning is unchanged. The gap
  value is **5 s** since ADR-039, and the clock starts at the acknowledgement since ADR-037; the
  mechanism described below is otherwise current.
* **Context:** The warning ladder was correct but too fast in practice. A single sustained
  condition — a face out of frame, a phone left in shot, a stalled monitor — could emit several
  events in a second, so a candidate could reach the stop before reading the first warning, and the
  candidate experience looked like a burst rather than a ladder. The product also asked for a larger
  default: ten visible warnings before the paper stops.
* **Decision:** `DEFAULT_MAX_VIOLATIONS` is **10**, and an exam may still author any value from 1 to
  20. `PROCTORING_WARNING_COOLDOWN_SECONDS` is **10**: when a warning is counted, the attempt stamps
  `last_warning_at`, and for the next ten seconds a further signal is written to the append-only
  trail with `counted: false`, `suppressed_by_cooldown: true` and the seconds remaining, but cannot
  increment `proctor_violations_count`. A suppressed camera cue still raises the lecturer's review
  flag, because it is evidence; it just does not spend the ladder. The gap is server-side, disclosed
  as `warning_cooldown_seconds` in the candidate brief and delivery payload, and cleared when a
  lecturer reopens the attempt. It is stored on the attempt rather than derived from the trail so a
  suppressed observation can never be mistaken for the last warning.
* **Consequences:** A candidate sees one warning at a time and the next can only arrive after they
  have had ten seconds to read it. A burst now produces one count plus a fully recorded timeline,
  which is the honest shape of the event. The cost is that a genuinely new condition arriving inside
  the gap is not counted, so the lecturer's timeline and the counter can differ; the suppression
  annotation makes that difference legible instead of hiding it. Tests run with the cooldown
  disabled by an autouse seam and one dedicated test turns it back on, so the rest of the suite
  still exercises the ladder without sleeping. Existing exams keep an explicitly authored value
  until the seeder repairs the demo rows; the default for an exam that authored nothing is now ten.

### ADR-035: The Warning Gate Lives in the UPDATE, Not in a Read

* **Status:** Accepted (2026-11-01) — hardens ADR-034.
* **Context:** The cooldown was correct one request at a time, and still let two warnings through
  when two detectors reported in the same second. Both requests loaded the attempt with
  `last_warning_at = NULL`, both passed the Python `if`, and both incremented. A face leaving the
  frame and an obstruction (or a tab switch and a blur) could therefore produce "Warning 1 of 10"
  followed immediately by "Warning 2 of 10" — exactly the burst the ten-second gap exists to
  prevent.
* **Decision:** The gap is part of the conditional `UPDATE` that increments the counter:
  `WHERE id = :id AND (last_warning_at IS NULL OR last_warning_at <= now - gap)`. The database's
  row lock serialises concurrent requests, and the loser sees the winner's timestamp after the
  lock is released, so it updates zero rows and is recorded as suppressed. The comparison uses
  epoch seconds (`strftime('%s', …)` on SQLite, `extract('epoch', …)` on PostgreSQL) because SQLite
  returns naive datetimes and a Python datetime comparison would fail across the two engines.
  `synchronize_session=False` keeps the ORM from trying the same comparison in Python.
* **Consequences:** Simultaneous signals now produce one counted warning and one suppressed trail
  entry; the candidate sees one modal, and the count in the header cannot jump by two. A timestamp
  that is ahead of the server also closes the gate rather than opening it, so a clock skew cannot
  be used to spend the ladder faster. The loser refreshes the attempt before narrating the
  remaining seconds, so the trail carries the real gap rather than a stale one.

### ADR-036: One Blocking Overlay at a Time, and Full-Screen on the Begin Gesture

* **Status:** Accepted (2026-11-01).
* **Context:** The warning modal and the observation gate were independent layers. When a camera
  cue both counted a warning and confirmed the cover condition, the warning rendered at `z-60`
  over the cover gate at `z-57`; the candidate saw two full-page panels at once, one behind the
  other. The full-screen request was made after the start request and the camera handshake, by
  which point the browser had forgotten the click that authorised it, so the paper often opened in
  a normal tab. A full-screen overlay also could not appear while the cover gate was up.
* **Decision:** The candidate surface renders exactly one blocking overlay, in priority order:
  the unacknowledged warning, the observation gate, then the full-screen gate. A warning's
  acknowledge click is also the trusted gesture used to request full-screen again. Full-screen is
  requested synchronously at the top of `beginAttempt`, before any `await`, and the gate is only
  rendered where `document.documentElement.requestFullscreen` exists; where it does not, the
  header carries the keyboard instruction. The full-screen gate is not suppressed by the
  "you left full-screen" banner any more, so the paper is covered rather than merely annotated.
* **Consequences:** The candidate can only be looking at one explanation at a time, and the
  warning count cannot be read against a second, contradictory panel. Browsers still refuse
  full-screen without a gesture; a refusal is not fatal and leaves the candidate on the gate with
  the F11 / Control+Command+F instruction. The browser's native full-screen mode (F11) is not
  visible to the Fullscreen API; ADR-038 supersedes the part of this decision that treated an
  F11 candidate as out of full-screen.

### ADR-037: The Gap Starts When the Warning Is Acknowledged

* **Status:** Accepted (2026-11-02) — supersedes the clock point of ADR-034.
* **Context:** A timestamp taken at the instant of the count is enough to stop a burst, but it is
  not the rule the candidate is promised. The modal can take ten seconds or more to read, and any
  timestamp-only gate has already expired by the time they dismiss it. Worse, a candidate who was
  reading the modal saw the header count move underneath it when a second detector reported. The
  promise on the paper is a short gap after the acknowledgement (now 5 s, ADR-039), so the server
  has to measure from the acknowledgement, not from the count.
* **Decision:** A counted warning stores `last_warning_at` and leaves `warning_acknowledged_at`
  null. `_warning_is_pending` treats the attempt as gated while the acknowledgement is null or
  older than the count. In that state the conditional `UPDATE` cannot increment at all. Pressing
  "I understand — continue the paper" calls `POST /exam-attempts/{id}/acknowledge-warning` (gate:
  `exams:take`, owner-only, conditional update), which stamps `warning_acknowledged_at`; only then
  does the disclosed gap begin, measured as `warning_acknowledged_at <= now - gap`. A duplicate or
  retried acknowledgement is a no-op, and a candidate who never acknowledges keeps the paper
  covered and the ladder paused rather than being counted again. Delivery and every event response
  carry `warning_pending`, so a reload restores the same modal instead of stranding the sitting.
  Migration `c8d9e0f1a2b3` backfills attempts that predate the concept by acknowledging their
  existing warning at its count time.
* **Consequences:** The count cannot move while the candidate is reading a warning, and a burst of
  camera cues arrives as one modal plus recorded, suppressed evidence. The browser still has to be
  the one that shows the modal and sends the click; the server's guarantee is that nothing counts
  before that write commits. A dropped acknowledgement leaves the modal on screen with a retry, so
  the client cannot silently dismiss a warning the server has not received. Signals during the
  still-unacknowledged or cooling windows stay in the lecturer's timeline with `counted: false`.

### ADR-038: Full-Screen Means the Display Is Filled, and Loss Must Persist

* **Status:** Accepted (2026-11-02) — supersedes the F11 point of ADR-036.
* **Context:** Two false alarms shared one root cause: judging full-screen from
  `document.fullscreenElement` alone. A candidate in the browser's own F11 mode is visibly
  full-screen, yet the API element is null, so the gate told them to return to a screen they were
  already on. Separately, Chrome clears the API element one frame before its own full-screen mode
  becomes visible to the viewport, so moving between the two routes flashed the gate and recorded a
  `fullscreen_exit` the candidate never performed. Finally, a request in flight after Begin could
  be judged before it settled, and an environment that cannot enter the API at all (an iframe
  without `allow="fullscreen"`, a Permissions-Policy) was shown a gate whose button could never
  work.
* **Decision:** `frontend/src/features/exams/fullscreen.ts` owns the reading. `api` is
  `document.fullscreenElement`; `browser` is the standalone display mode or a viewport that fills
  the reported screen within a 16 px edge tolerance (a maximised window still has browser chrome, so
  it is not full-screen); `active = api || browser`. The gate is armed only after the entry request
  has resolved or rejected, and a loss is acted on only after it has persisted for 900 ms — the
  same window decides the cover and the `fullscreen_exit` event, so one transition cannot produce a
  false panel or a false warning. Loss is not reported while the document is hidden, because the
  tab-switch handler already recorded that departure. `canRequestFullscreen()` also requires
  `document.fullscreenEnabled !== false`; where the API is unavailable the paper keeps the keyboard
  instruction banner rather than a gate that cannot be cleared.
* **Consequences:** F11 and the in-page control are both full-screen, and switching between them is
  not an event. A genuinely lost full-screen still covers the paper after under a second and still
  records one `fullscreen_exit`. The viewport test can theoretically mistake an exactly
  screen-sized non-fullscreen window for full-screen; that is accepted because it fails open (no
  false accusation) and ordinary maximised windows are far outside the tolerance. The detector is
  pinned by `scripts/check-fullscreen.ts` (11 checks), because the headless preview cannot grant
  the Fullscreen API.

### ADR-039: Five-Second Gap, and the Mouth Cue Retired to Opt-In

* **Status:** Accepted (2026-11-02) — supersedes the gap value in ADR-034/ADR-037 and the default
  in ADR-032/ADR-030.
* **Context:** Two reports from a real sitting. First, the disclosed gap was longer than the
  product needed: the acknowledgement already guarantees the candidate has seen the warning, so
  ten further seconds added waiting without adding protection. Second, `mouth_movement_detected`
  fired with "sustained mouth movement" while the candidate was not talking. The cue is a pixel
  heuristic: the mouth band is differenced against a forehead band, and a jaw shift, a cheek
  movement, a low-light sensor or video compression on a still face can clear both the 0.012
  motion floor and the 1.35 dominance factor. It spends a warning like every confirmed cue
  (ADR-032), so a false positive removes a warning the candidate never earned — worse than a cue
  that does not exist, especially on a paper being handed to an external examiner.
* **Decision:** `DEFAULT_WARNING_COOLDOWN_SECONDS` is **5**. The clock still starts at the
  server-confirmed acknowledgement (ADR-037); nothing else about the gate changes. Mouth-movement
  monitoring becomes **opt-in**: `DEFAULT_MOUTH_MONITORING` is `False`, the demo sets it off, the
  authoring form offers it off with an "experimental" label, and the landing page no longer lists
  it among the cues a default paper runs. The engine, the event type, the dwell tier and the
  harness stay: an author who explicitly enables it still gets the measurement and the warning, and
  the published rules still apply. The supported talking signal is the voice check (ADR-029),
  which requires a loud, vowel-shaped, fluctuating and sustained sound and records no audio.
* **Consequences:** The demo and every new paper can no longer produce the false "mouth movement"
  warning that prompted the report; existing papers that explicitly enabled it keep it until their
  author turns it off. The authored brief only mentions mouth movement when the paper enables it.
  The five-second gap means a second warning can arrive five seconds after the acknowledgement,
  never before it; signals inside the window are still recorded with `counted: false`. The
  regression tests pin both the disclosure value and the opt-in default.

### ADR-040: A Leisurely Integrity Posture — Deliberate Acts Count, Inference Is Evidence

* **Status:** Accepted (2026-11-03) — supersedes the counting half of ADR-032 and D-13's resolution
  for the six inference cues. Keeps the mechanics of ADR-023/026/029/030/031/034/035/037/038/039.
* **Context:** ADR-032 made every confirmed camera and microphone cue spend one warning, on the
  argument that a cue recorded but never counted is indistinguishable from a detector that does
  not work. That argument is right about a *detector* and wrong about a *charge*. Six of those cues
  are model readings about the candidate — gaze, presence, face count, hand proximity, a second
  voice, mouth motion — and the published evidence on exactly that inference is that it belongs to
  a human: browser events are near-deterministic, webcam inference is only ever a flag for a
  reviewer, and a 2022 study of automated proctoring found 74 wrong decisions across 244 attempts.
  ADR-039 had already had to retire the mouth cue to opt-in because a pixel heuristic fired on a
  still face and spent a warning the candidate had not earned. Charging an inference means charging
  the model's error rate to a candidate — and the candidates who pay first are the ones with an
  unusual room, an atypical camera, darker skin under a weak detector, or a disability. Meanwhile
  the acts the browser itself can attest to — leaving the paper, closing the camera, covering the
  lens, holding a phone into the picture — carry essentially no false-positive rate and are exactly
  the deliberate routes the allowance exists to deter.
* **Decision:** every signal in `PROCTORING_EVENT_TYPES` has exactly one **disposition**, owned by
  the server and disclosed to the candidate before the first event:
  - **counted** (spends one warning, climbs the ladder, can stop the paper): `tab_switch`,
    `window_blur`, `fullscreen_exit`, the three clipboard names, `context_menu`, `window_resized`,
    `ip_change`, `camera_off`, `camera_obstructed`, `second_device_detected`;
  - **review_only** (recorded with its measurement, raises the review flag, never counted and never
    able to lock or submit): `looking_away`, `face_not_visible`, `multiple_faces_detected`,
    `hand_near_face`, `voice_detected`, `mouth_movement_detected`;
  - **evidence** (recorded, never a finding, unchanged): `camera_snapshot`, `quick_tab_return`.
  `REVIEW_ONLY_EVENT_TYPES` is a new set; `COUNTED_EVENT_TYPES` is derived so the three cannot
  drift; `_proctoring_event_disposition` is the single classifier, separate from
  `_proctoring_event_category` (which only says where a cue came from). The ingest path returns an
  inference cue after the append and the review flag, before the conditional `UPDATE`. Every
  proctoring response and every timeline row carries `disposition`; `ExamStudentConfig` and the
  delivery payload carry `counted_event_types` and `review_only_event_types` from the same sets.
  The candidate surface never raises a modal for a review-only response; the existing coverage
  gates (a turned head, an absent face) still cover the paper, which is a display of the reading,
  not a charge for it.
* **Consequences:** The allowance, the two policy outcomes, the acknowledged 5 s gap, the
  concurrency gate, the dwell tiers, obstruction grace, evidence retention and the mouth cue's
  opt-in default are all unchanged — leisureliness comes only from which signals may spend. A
  candidate can no longer lose a warning for a model's mistake; a candidate who closes or covers
  the camera, or brings a phone into shot, still climbs the ladder to the stop. Every inference is
  still on the timeline with its angle, dwell or level and still raises the review flag, so "we
  stopped charging for it" never becomes "we stopped watching it". The tests were rewritten to the
  new contract rather than loosened: the same evidence is asserted, with the opposite expectation.
  If an institution decides a particular inference should be charged, that is one line in
  `REVIEW_ONLY_EVENT_TYPES` plus an ADR — deliberately visible, not a hidden setting.
