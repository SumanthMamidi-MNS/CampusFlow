# CampusFlow — Integrated Plan: Institutional Hierarchy, Sections, Roster Imports, Live Invigilation, Duplicate Prevention

Status: **Plan (revised) → Waves 3 and 4 implemented and verified; waves 5–9 planned.**
This document is the authoritative plan for the work requested after Wave 2. Code has been
written only for the waves marked *Implemented* below; everything else is explicitly
**planned** and not claimed.

Date: 2026-10-10
Base: branch `fix/wave-1-authorization-kernel`, HEAD `3bd587d` + Wave 2 (uncommitted).

> **Implemented in this pass (with evidence in §11):** the Campus Lead invariant and recovery,
> student identity + normalisation, database-level duplicate constraints, multi-section
> assessment series with per-section validation, and the two-phase roster import (CSV **and**
> real `.xlsx`) with idempotency, conflict classification and formula-injection-safe reports.
> **Not implemented:** live invigilation transport/console (waves 6–7), scoped department-head
> assignment UI (wave 5), duplicate/orphan cleanup tooling (wave 8), Playwright suite (wave 9),
> and any frontend for the new APIs.

> **Honesty rule for this plan.** Nothing below is claimed to work until a test in
> `backend/tests/` reproduces it. Live camera streaming, roster imports and duplicate
> protection are **planned** unless the corresponding item in §10 is marked *Implemented* and
> the named test exists and passes.

**Deliverable index (the ten requested items map 1:1 onto sections 1–10):**
1 architecture & ER model → §1 · 2 six-role matrix → §2 · 3 Campus Lead invariants & recovery → §3 ·
4 lecturer assignment & section workflow → §4 and §7b · 5 roster-import specification → §5 ·
6 duplicate prevention & cleanup → §6 · 7 invigilation design & privacy → §7 and §7b ·
8 database/API/frontend inventory → §8 · 9 test matrix → §9 · 10 implementation waves → §10.
Sections §0 and §11 record what already existed and the executed verification evidence.

---

## 0. What already exists (verified, with evidence)

| Capability | State | Evidence |
|---|---|---|
| 6 roles + 23 permissions, seeded | Verified | `bedrock/rbac/service.py::DEFAULT_PERMISSIONS` / `ROLE_PERMISSION_MAPPINGS` |
| Offering-scope authorization kernel | Verified | [domain/courses/access.py](backend/campusflow/domain/courses/access.py) — `can_manage_offering`, `visible_offering_ids`, `visible_department_ids` |
| Every route gated (public = health + `/auth/*`) | Verified | `tests/test_route_policy.py` |
| Candidate/staff response separation, anti-enumeration | Verified | `tests/test_authorization_matrix.py`, ADR-016 |
| Course offering already carries a `section` column | Verified | [domain/courses/models.py](backend/campusflow/domain/courses/models.py#L40) `section: String(16) default "A"` |
| `FacultyAssignment` (offering ↔ lecturer, `primary`/`additional`) | Verified | same file, L52 |
| Enrollment unique per (offering, student) | Verified | `uq_enrollment_offering_student` |
| CSV user provisioning (`/users/bulk-import`) | Partial | `domain/users/service.py::bulk_import_users` — email-keyed, no preview, no mapping, no idempotency |
| CSV enrollment import (`/course-offerings/{id}/enrollments/bulk`) | Partial | `domain/enrollments/service.py::bulk_enroll_students` — email-keyed |
| Structured exam delivery, autosave, server-owned timing, deduped proctoring ingest | Verified | `domain/exams/service.py`; `tests/test_proctoring_security.py`, Wave 2 report |
| **Campus Lead invariant** | **Missing** | no "at least one active admin" guard anywhere |
| **Student identity (registration number)** | **Missing** | `User` has only `email/first_name/last_name/phone/status` |
| **Unique constraints on assignments/attempts** | **Missing** | `faculty_assignments` and `exam_attempts` have no unique constraint |
| **Multi-section assessment** | **Missing** | `Exam.course_offering_id` is singular |
| **Live invigilation (camera)** | **Missing** | removed in Phase 13 / ADR-013; no media path exists |

### The single most important structural finding

`CourseOffering.section` already exists (one row *is* one section of one course in one term).
There is therefore **no new "Section" entity to invent**: the *section* is the *offering*, and
the Wave 0/1 offering-scope kernel already answers every "whose section is this?" question.
The work is to (a) make that identity explicit and enforced, (b) let one assessment span
several authorised sections, and (c) never let a section id be substituted for another.

---

## 1. Updated architecture and entity-relationship model

No new process, datastore, or app per role: the modular monolith (FastAPI + SQLAlchemy async)
and the React SPA stay. The additions are three small domain modules and a handful of columns.

```
Institution (singleton row)                          ← institution domain
  └── Department            (code unique)             ← departments domain
        ├── Program → Batch                            ← departments domain
        └── Course          (code unique)              ← courses domain
              └── CourseOffering  == SECTION           ← courses domain
                    ├── FacultyAssignment (lecturer)   ← courses domain  [+unique]
                    ├── Enrollment        (student)    ← enrollments domain [unique]
                    ├── Material / Announcement        ← materials / announcements
                    ├── Assignment / Submission        ← assignments domain
                    └── Exam ── series_id ──────────── ← exams domain  [+series_id]
                          ├── ExamQuestion → Question → QuestionBank (department-scoped)
                          └── ExamAttempt (student)    ← exams domain  [+unique attempt_number]
                                ├── ExamResponse
                                └── ProctoringEvent    (append-only telemetry)

User ← role / permission / registration_number / admission_year
Campus Lead  = the `admin` role, institution-wide, ≥1 active at all times
```

New/changed entities:

| Entity | Change | Why |
|---|---|---|
| `User` | `+ registration_number` (nullable, unique-when-set), `+ admission_year` | stable student identity (deliverable E) |
| `CourseOffering` | unchanged (section is the offering) | already correct |
| `FacultyAssignment` | `+UniqueConstraint(course_offering_id, faculty_id)` | dedup (deliverable F) |
| `ExamAttempt` | `+UniqueConstraint(exam_id, student_id, attempt_number)` | dedup (deliverable F) |
| `Exam` | `+ series_id UUID NULL, indexed` | one assessment, several sections (deliverable B) |
| `RosterImportBatch` (new) | preview→commit batch, `idempotency_key` unique, `summary` JSON | roster import (deliverable D) |
| `InvigilationGrant` (new, planned) | short-lived, scoped, revocable session grant | live console (deliverable H) |

ER additions are additive; no table is dropped and no column is repurposed. Migrations are
generated under `backend/alembic/versions/` and are reversible.

---

## 2. Six-role permission and scope matrix

Roles are unchanged; **Campus Lead is the `admin` role** (documentation and UI label it
"Campus Lead / College Admin"). The permission *code* set is unchanged; what this plan adds is
the **scope** column — the exact reach each role has, and which kernel answers it.

| Role | Platform-wide | Institution-wide | Department-wide | Course / Section | Exam-specific | Student-self |
|---|---|---|---|---|---|---|
| `super_admin` | ✅ all institutions, credential recovery | ✅ | ✅ | ✅ | ✅ | — |
| `admin` (**Campus Lead**) | ❌ | ✅ everything in the one institution, incl. Campus Lead invariant | ✅ | ✅ all offerings | ✅ | — |
| `department_head` | ❌ | read-only directory | ✅ departments they **head** (`headed_department_ids`) | ✅ offerings of headed departments | ✅ exam authoring for those | — |
| `exam_controller` | ❌ | ❌ except examination objects (`allow_exam_bureau=True`) | all departments for banks/exams only | offerings for exam work only | ✅ authoring, rosters, analytics | — |
| `faculty` | ❌ | ❌ | departments they teach in (`teaching_department_ids`) | ✅ offerings they are assigned to **or authored** | ✅ own exams | — |
| `student` | ❌ | ❌ | ❌ | ✅ offerings actively enrolled in (`enrolled_offering_ids`) | ✅ own attempt only | ✅ own grades/roster-free view |

Kernel ownership (never re-implement inline):
- offering/section questions → `domain/courses/access.py`
- department questions → `domain/courses/access.py::visible_department_ids`
- exam authoring/grading → `_assert_can_manage_exam` (author fallback) in `exams/service.py`
- **Campus Lead invariant** → `domain/institution/leadership.py` (new, Wave 3A)

---

## 3. Campus Lead invariants and recovery procedure

**Invariant:** an institution always has at least one *active* user holding the Campus Lead
(`admin`) role. "Active" = `users.status == "active"` and `users.deleted_at IS NULL`.

Enforced through one service, `domain/institution/leadership.py`:

- `count_active_campus_leads(db)`
- `assert_may_remove_campus_lead(db, user, *, action)` → raises `ConflictError` (409) when the
  removal would leave zero.
- `lock_campus_lead_scope(db)` → takes a **PostgreSQL transaction-level advisory lock**
  (`pg_advisory_xact_lock`) so two concurrent removals of *different* leads cannot both read
  `count = 2` and delete; on SQLite the writer lock already serialises, so it is a no-op.

Hooks (all inside the caller's existing transaction, so the guard and the mutation commit
together):
- `users/service.py::update_user` — role replacement, and `status → inactive`
- `users/service.py::delete_user` — soft delete / deactivation
- `users/service.py::create_user` — no guard needed (adding is always safe)

Replacing the last lead is allowed **only in the same transaction** that assigns another active
Campus Lead (role payload must both drop and add, or assign first).

**Bootstrap / recovery.** A fresh institution is created by `scripts/seed.py`, which assigns a
Campus Lead. If an institution somehow ends with zero active leads, recovery is:

1. `super_admin` authenticates (platform role, unaffected by the institution guard).
2. `POST /api/v1/admin/institution/campus-lead/recover` with a target user id — **explicitly
   authorised** (`require_any_role("super_admin")`), audited as
   `institution.campus_lead_recover`, refuses if a Campus Lead already exists (no silent
   override), and refuses to target a deleted user.
3. The recovery endpoint is the *only* path that can re-establish a lead outside the normal
   assign-in-same-transaction rule, and it is never reachable by `admin`.

---

## 4. Academic organisation, lecturer assignment and section ownership workflow

**Campus Lead workflow (institution admin):**
1. Create/import lecturer accounts (`/users`, `/users/bulk-import`, later the roster import).
2. Assign a lecturer to a department (Department Head assignment = `departments.head_id`).
3. Assign lecturers to course offerings — **primary or additional** —
   (`POST /course-offerings/{id}/faculty`, `role ∈ {primary, additional}`).
4. Review existing teaching assignments (`GET /course-offerings`, faculty list per offering).
5. Reassign: unassign then assign; historical `Exam.created_by_id` / `ExamResponse.graded_by_id`
   are never nulled, so assessment history survives reassignment.
6. Every assign/unassign is audited (`FacultyAssignment` write + `record_audit_event`).

**Department Head** may coordinate assignments only inside the departments they head (scope via
`headed_department_ids`); today they hold `courses:create` but the mutation endpoints are
institution-admin only — Wave 3 records this as a known gap and Wave 5 scopes those endpoints
to the kernel rather than widening them.

**Lecturer scope.** A lecturer sees and edits only offerings they are assigned to (or authored
an exam in). Section-level roster read is `assert_can_manage_offering`. Unrelated sections are
invisible and unmutable, including by direct API call.

**Section ownership.** Because a section *is* an offering, `assert_can_manage_offering` is the
section guard. Wave 3 adds the regression that proves a substituted section id is refused.

---

## 5. Roster import specification (Excel/CSV)

**Two-phase, never a silent write.**

```
1. Upload            POST /roster-imports            (multipart file + kind + offering_id?)
2. Validate          file type/size/structure       CSV (utf-8/utf-8-sig) or XLSX (openpyxl)
3. Parse safely      streaming, row cap, cell cap, no formula evaluation
4. Normalize         header aliasing → canonical fields (see below)
5. Preview           POST /roster-imports/preview   → batch row, summary, no writes to users
6. Within-file dupes duplicate registration numbers / emails in the same sheet
7. Existing identity users already present → match, never duplicate
8. Conflicts         same student in a different section of the same course/term
9. Summary           valid / invalid / duplicate / conflict / existing counts + per-row errors
10. Confirm          POST /roster-imports/{batch_id}/commit   (explicit, idempotency key)
11. Commit           one transaction; all-or-nothing per batch
12. Audit + report   audit row + downloadable CSV error/result report (formula-injection safe)
```

**Canonical student fields and accepted header aliases** (case/space/punctuation-insensitive):

| Canonical | Aliases (examples) |
|---|---|
| `registration_number` | reg no, regno, roll no, roll number, admission no, student id, matric no |
| `first_name` / `last_name` | first name, given name / last name, surname, family name |
| `full_name` | name, student name, candidate name (split on whitespace) |
| `email` | email, e-mail, email address, college email |
| `department` | department, dept, branch |
| `course` | course, subject, paper, course code |
| `section` | section, class, group, division, batch-section |
| `academic_year` | academic year, year, admission year, batch |
| `program` | programme, program, degree |

Explicit `mapping: {canonical: source_column}` from the client overrides aliasing, so a college
whose sheet has unique headers is never forced into a fixed layout.

**Record policies:**
- *valid* → create user (if new) + enroll, or enroll only (if existing).
- *invalid* → row reported with a specific, actionable reason; never written.
- *duplicate (in file)* → first occurrence wins; later ones reported, never double-created.
- *conflict* → same student already enrolled in another section of the same course+term →
  **reported, not auto-moved**; an explicit transfer action is required.
- *already existing* → matched by registration number then email; enrollment is upserted
  (status `enrolled`), never duplicated.
- *legitimate history* → dropped enrollments, section transfers across terms, and course
  repetitions are preserved because the business key is (offering, student), and each term is a
  distinct offering.

**Idempotent re-import.** `RosterImportBatch.idempotency_key` is unique. Re-uploading the same
file with the same key returns the original summary; re-uploading with a new key that produces
the same records writes nothing new (matched as *existing*) and reports zero created.

**Hardening:** max file size (`roster_import_max_bytes`), max rows, max cell length, XLSX read
with `read_only=True`/`data_only=True` (formulas are never evaluated), and generated CSV cells
are prefixed when they begin with `= + - @ \t \r` to defeat spreadsheet formula injection.

---

## 6. Duplicate prevention and data cleanup strategy

Business key / normalization / constraint / transaction / idempotency / conflict policy per
domain. **The database constraint is the final authority**; a pre-insert `SELECT` is treated as
an optimisation, never as correctness.

| Domain | Business key (normalized) | Constraint | Conflict policy |
|---|---|---|---|
| Users | `lower(trim(email))`; `upper(trim(registration_number))` | `users.email` unique; `users.registration_number` unique-when-not-null | 409 Conflict, no merge |
| Student identity | institution code + `registration_number` | single-institution deploy → unique on the normalized number | report conflict, no auto-merge |
| Departments / Courses | `upper(trim(code))` | unique `code` | 409 |
| Batch | (program_id, start_year, label) | *planned* unique | report |
| CourseOffering (section) | (course_id, academic_term_id, section) | *planned* unique | report |
| FacultyAssignment | (course_offering_id, faculty_id) | **unique (Wave 3B)** | idempotent no-op |
| Enrollment | (course_offering_id, student_id) | unique (exists) | upsert status |
| Question bank import | (bank_id, hash(body)) | *planned* | report duplicate row |
| Exam | (course_offering_id, series_id, title) | *planned* | report |
| ExamAttempt | (exam_id, student_id, attempt_number) | **unique (Wave 3B)** | 409 on race |
| ProgrammingSubmission | (problem_id, student_id, attempt) | *planned* | report |
| Notification | (user_id, type, dedupe_key, day) | *planned* | collapse |
| ProctoringEvent | (attempt_id, event_type, time bucket) | app-level 3 s dedupe (exists) | ack, don't count |
| RosterImportBatch | `idempotency_key` | **unique (Wave 4)** | return original summary |
| Files/storage | `file_path` | *planned* orphan sweep (dry-run) | report only |

**Existing-duplicate audit + cleanup (never automatic):**
1. Dry-run query per domain; write a report to `docs/` (counts, sample ids).
2. Back up the affected tables (`pg_dump` of the specific tables).
3. Apply only additive constraints after reconciling rows (e.g. renumber duplicate
   `attempt_number` by `started_at`, keep the newest as the highest number) — **inside a
   migration**, so the reconciliation is versioned and reversible.
4. Never delete a row and never merge two identities without a human decision recorded in audit.

---

## 7. Live invigilation console — design and privacy constraints

**Scope of this plan:** the console is *designed and authorised* here; **the media transport is
not implemented and this plan does not claim it works.** The default is **live viewing only,
no recording** (ADR-003/013 remain in force).

Authorisation model (can be implemented without media):
1. Invigilator opens the console for one exam they manage → `POST /exams/{id}/invigilation/sessions`
   (`exams:proctor_view` **and** `assert_can_manage_offering`, `allow_exam_bureau=True`).
2. Server returns a **short-lived grant** (`InvigilationGrant`: exam_id, invigilator_id,
   expires_at ≈ 10 min, scopes, revoked_at) — never a raw stream URL, never a credential.
3. Each candidate's stream is addressed by an opaque *watch token* derived server-side for that
   (grant, attempt) pair; a token for section A does not open section B.
4. `DELETE .../sessions/{grant_id}` revokes immediately; expiry and revocation are checked on
   every transport handshake and every event read.
5. Cross-institution/cross-section access is refused by the offering kernel, not by the token.

Transport (planned): WebRTC with an SFU or P2P, signalling over an authenticated WebSocket that
validates the grant on connect and re-validates on renegotiation. No public stream URL or shared
secret is ever placed in the client.

Console UX: section/exam selector · camera tiles (identity, connection state, exam timer,
submission state) · **virtualised grid** (see capacity) · single-feed inspection · explicit
`loading / reconnecting / camera_unavailable / error` states · append-only event history per
candidate · incident annotation + faculty review.

Capacity: a human cannot meaningfully watch unlimited feeds. Design target = **1 invigilator :
≤24 concurrent tiles** (a 3–4 column virtualised wall), with an explicit "N candidates not
visible" counter and a round-robin auto-advance mode; larger cohorts require additional
invigilators, each with their own grant. Bandwidth is budgeted at ~0.4–0.8 Mbit/s per 360p
tile, capped by a server-side concurrent-watcher limit per exam.

Privacy: live-only by default; any recording/snapshot storage requires a **separate** privacy,
legal, retention, access-control and institutional approval before it is built. No microphone
or audio monitoring. Never claim visual monitoring proves cheating; faculty review precedes any
consequence.

---

## 7b. Section-level teaching workflow (G) and the webcam integrity policy (I)

### G — what a lecturer does inside a section

Everything below stays scoped to the offerings the lecturer is assigned to (or authored), with
`assert_can_manage_offering` on every route and every direct API call. Workflow, with what
exists today versus what this plan adds:

| Capability | Today | Plan |
|---|---|---|
| View assigned sections + enrolled students | ✅ `GET /course-offerings`, `GET /course-offerings/{id}/enrollments` | — |
| Import/review a roster in-scope | ✅ Wave 4 roster import + existing roster read | frontend wizard |
| Create assignments for a section | ✅ `POST /assignments` | — |
| **Oral / viva assessments** | ❌ | new `assessment_kind` on the assignment/exam model (`written`, `oral`, `viva`) with a scheduling slot, per-candidate examiner and rubric-based marking — wave 5 |
| Quizzes / coding tests / examinations | ✅ exams domain; ✅ programming domain | multi-section quiz creation via `series_id` (done) |
| Availability, deadlines, time limits, attempts, grading policy | ✅ `exam.config` (`max_attempts`, windows, duration, `max_violations`), assignment due dates | surface `max_attempts`/policy on the assignment model where it is still exam-only |
| View submissions and grades | ✅ | — |
| Publish results | ✅ `POST /exams/{id}/publish` | — |
| Attendance / assessment status | ❌ | attendance register per offering, wave 5 |

Grader isolation: a lecturer grades only assessments in their own offerings. This is already
true by construction — `grade_attempt_response`/`list_attempt_responses` are reachable only via
`exams:grade` routes whose service resolves the offering — but the plan adds the explicit
negative test (lecturer B grading lecturer A's attempt → 403) to the wave-5 suite, because it is
not currently pinned by a test.

### I — webcam integrity policy: one part of the request contradicts an accepted decision

The request asks to *preserve* a policy that includes "four seconds of continuous camera
obstruction before the configured obstruction warning". **CampusFlow has no camera monitoring at
all**: ADR-013 removed webcam capture, gaze/phone heuristics, the strobe and the fabricated
streams after an audit found them contradicting ADR-003 and the responsible-UX rules. There is
nothing to preserve — implementing camera-obstruction warnings would *reverse* ADR-013.

So this plan keeps the half that exists and does not silently resurrect the other half:

| Requested element | State |
|---|---|
| Five warning chances per attempt | ✅ exists — `config.max_violations`, default 5; `_resolve_max_violations` is the single source |
| Threshold behaviour | ✅ exists — reaching it **auto-submits** the attempt (`max_violations_exceeded`), it does not lock the candidate out |
| Event deduplication | ✅ exists — server-owned event vocabulary, server clock, 3 s repeat window that does not consume allowance (Wave 2) |
| Recovery handling | ✅ exists — `reconcile_expired_attempts` closes abandoned attempts; faculty-authorised `unlock` is permission-gated and audited |
| Full-screen exit warning + explicit return-to-full-screen action | ✅ exists — one full-screen effect, accessible `role="alert"` warning with a deliberate return action |
| Tab/focus event logging | ✅ exists — `tab_switch`, `window_blur` |
| No automatic cheating verdict from head direction / mouth movement / camera failure | ✅ exists — cannot happen; no such signal is collected |
| Faculty review before serious consequences | ✅ exists — integrity timeline + faculty-authorised resumption |
| Camera monitoring disclosed before starting, restricted to authorised exams | ⚠️ **moot** — no camera. The disclosure obligation applies to whatever is live: the candidate brief must state the observable telemetry that *is* recorded |
| **4 s continuous camera-obstruction warning** | ❌ **not implemented, and not planned without a new ADR** — requires ADR-013 to be reversed, plus the privacy/legal review §7 describes |

**Decision required from the institution, not from the code:** if camera monitoring is genuinely
wanted, it must arrive as a new ADR with its own consent, retention and access-control design —
not as a quiet re-addition of the removed subsystem. Until then the plan ships the observable
telemetry only, and any live-invigilation work (waves 6–7) is explicitly *live viewing, not
recording*, as §7 states.

---

## 8. Database / API / frontend change inventory

**Backend — new**
- `domain/institution/leadership.py` (Wave 3A)
- `domain/roster_import/{models,schemas,service,router}.py` (Wave 4)
- `domain/exams/invigilation.py` + schemas/router additions (Wave 6, planned)

**Backend — changed**
- `domain/users/models.py` (+registration_number, +admission_year)
- `domain/users/service.py` (Campus Lead guard; identity normalization)
- `domain/courses/models.py` (+unique faculty assignment)
- `domain/exams/models.py` (+series_id, +unique attempt_number)
- `domain/exams/service.py` (+`create_exam_for_offerings`, series-aware listing)
- `domain/exams/router.py` (+`POST /exams/multi-section`)
- `main.py` (register roster-import router)
- `bedrock/config/settings.py` (import size row caps, invigilation TTL)
- `alembic/versions/*` (one migration per wave)

**Frontend**
- `features/admin` — Campus Lead management, lecturer assignment, roster import wizard
- `features/exams` — multi-section target picker on the create form
- `features/exams/components/InvigilationConsole.tsx` (planned)
- role-aware navigation in `app/routes/_layout.tsx` (sidebar entries by permission)

**API surface added by Wave 3/4 (implemented)**
- `POST /api/v1/exams/multi-section`
- `POST /api/v1/admin/institution/campus-lead/recover`
- `GET /api/v1/roster-imports`, `POST /api/v1/roster-imports/preview`,
  `POST /api/v1/roster-imports/{batch_id}/commit`, `GET /api/v1/roster-imports/{batch_id}/report`

Every route declares a permission or role gate; the roster import and invigilation routes are
offering-scoped. `tests/test_route_policy.py` fails CI if that stops being true.

---

## 9. Test matrix with measurable acceptance criteria

Marked *Implemented* = test exists and passes in Wave 3/4; *Planned* = designed, not built.

| # | Criterion | Test | State |
|---|---|---|---|
| 1 | Deactivating/removing the last Campus Lead → 409 | `test_campus_lead_invariant.py` | Implemented |
| 2 | Removal allowed when another active lead exists | same | Implemented |
| 3 | Concurrent removals never reach zero leads (PostgreSQL) | same, `skipif` non-PG | Implemented (PG-gated) |
| 4 | Recovery works only for `super_admin`, only when zero leads, audited | same | Implemented |
| 5 | Each role's offering scope (incl. head fall-through) | `test_wave1_scoping.py` | Exists |
| 6 | Lecturer assignment/reassignment keeps exam history | planned | Planned |
| 7 | Section roster read refused for non-teaching lecturer | planned | Planned |
| 8 | Assessment to one vs many authorised sections | `test_multi_section_assessment.py` | Implemented |
| 9 | Direct API with an unrelated section id → 403, nothing created | same | Implemented |
| 10 | Repeated identical roster import creates nothing new | `test_roster_import.py` | Implemented |
| 11 | Duplicate registration numbers in one file reported, not written | same | Implemented |
| 12 | Existing students/enrollments matched, not duplicated | same | Implemented |
| 13 | Conflicting section assignment reported, not auto-moved | same | Implemented |
| 14 | Concurrent imports of the same roster (PostgreSQL) | same, PG-gated | Implemented (PG-gated) |
| 15 | Transaction rollback after a mid-batch failure | same | Implemented |
| 16 | Formula injection neutralised in the error report | same | Implemented |
| 17 | Malformed/oversized upload refused with 4xx | same | Implemented |
| 18 | Unique attempt_number blocks a duplicate attempt row | `test_duplicate_prevention.py` | Implemented |
| 19 | Unauthorized / cross-section camera feed access | planned | Planned (Wave 6) |
| 20 | Camera disconnect/reconnect, many viewers, revocation | planned | Planned (Wave 6) |
| 21 | Seed data / orphaned storage duplicate audit | planned (dry-run report) | Planned |

PostgreSQL uniqueness/concurrency criteria (3, 14, 18) are **not** evidenced by SQLite; they run
with `TEST_DATABASE_URL=postgresql+asyncpg://…/campusflow_test` and are skipped with a reason
when PostgreSQL is absent.

---

## 10. Prioritised implementation waves and dependencies

| Wave | Content | Depends on | State |
|---|---|---|---|
| **3A** | Campus Lead invariant service + hooks + recovery + audit | — | **Implemented** |
| **3B** | Student identity fields, normalization, unique constraints, reconciliation migration | 3A (users) | **Implemented** |
| **3C** | Multi-section assessment (`Exam.series_id` + per-section validation) | 3B | **Implemented** |
| **4** | Roster import: preview/commit, mapping, dedupe, idempotency, safe report | 3B | **Implemented** |
| **5** | Lecturer assignment surface: scoped department-head assignment, reassignment history, conflict detection, assignment audit UI | 3C, 4 | Planned |
| **6** | Live invigilation authorisation (grants, revoke, event/camera-status APIs) | 3C | Planned |
| **7** | Live invigilation media transport (WebRTC/SFU) + console + capacity harness | 6 | Planned |
| **8** | Duplicate/orphan audit + reversible cleanup tooling; remaining unique constraints | 3B, 4 | Planned |
| **9** | Playwright real-browser suite across the role matrix | 5, 7 | Planned |

Wave 3 and 4 are the foundation everything else needs (identity, invariants, sections), which is
why they are implemented first and verified on both SQLite and PostgreSQL.

---

## 11. Verification evidence (Wave 3 + 4, as executed)

| Check | Command | Result |
|---|---|---|
| Backend suite (fast loop) | `python -m pytest -q` (SQLite) | **58 passed, 2 skipped** |
| Backend suite (authoritative) | `TEST_DATABASE_URL=…campusflow_test python -m pytest -q` | **60 passed** (the 2 skipped above ran here) |
| Lint | `python -m ruff check campusflow tests` | clean |
| Migration apply | `alembic upgrade head` on the dev PostgreSQL | `b1f2a3c4d5e6 → c3d4e5f6a7b8 → d4e5f6a7b8c9` |
| Migration reversibility | `alembic downgrade -1` ×2 then `upgrade head` | round trip clean |
| Duplicate reconciliation | `SELECT` over `exam_attempts` after the migration | duplicate groups **1 → 0** |
| Constraints present | `pg_constraint` / `pg_indexes` | both unique constraints + `ix_users_registration_number`, `ix_exams_series_id`, `ix_roster_import_batches_idempotency_key` |

New test suites and what each one nails down:

* `tests/test_campus_lead_invariant.py` — refused last-lead deactivation/demotion/delete,
  allowed removal when another lead exists, super-admin-only audited recovery that refuses while
  a lead exists, leadership listing scope, and (PostgreSQL-gated) two concurrent removals of
  different leads yielding exactly **one** 200 and one 409 with ≥1 lead remaining.
* `tests/test_multi_section_assessment.py` — own-section creation, unrelated-section id refused
  with **no partial paper** (exam counts before == after), multi-section series linking, duplicate
  id collapse, unknown offering → 404.
* `tests/test_roster_import.py` — preview writes nothing, commit creates, re-commit and re-import
  create nothing new, within-file duplicates reported and collapsed, existing accounts matched,
  section conflict reported and not auto-moved, formula injection neutralised in the report,
  unsupported/oversized uploads refused, section-scoped access, explicit mapping override, real
  `.xlsx` parsing, whole-batch rollback on a mid-batch failure, and (PostgreSQL-gated) two
  concurrent commits producing exactly one account.
* `tests/test_duplicate_prevention.py` — registration-number normalisation and 409 on collision,
  the `exam_attempts` constraint refusing a duplicate row at the database, and idempotent faculty
  assignment.

**Limitations (stated, not glossed):**

1. No browser-driven verification of these APIs; there is no frontend for them yet, and the live
   `uvicorn` process was not restarted, so it still serves pre-Wave-3 code.
2. `must_change_password` is persisted but not enforced at login — there is no forced-change
   screen yet.
3. Live camera invigilation has **no implementation**; §7 is design only.
4. Locked-out-institution recovery was exercised by constructing the zero-lead state directly in
   the database (no API can produce it), which is the only way to reach that path.
