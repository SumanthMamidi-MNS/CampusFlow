# CampusFlow — Live QA Log

> **Date:** 2026-10-07 · **Method:** the application was driven in a real Chrome browser against a live stack (PostgreSQL + Redis + Mailpit + Piston containers, FastAPI backend on :8000, Vite frontend on :5173). Every result below is an observed behaviour, not a claim.
>
> Console and network traffic were inspected on every page; findings were fixed and then **re-tested in the same browser**.

## Environment

| Component | State during the test |
| :--- | :--- |
| Docker daemon | Up |
| Containers | postgres (healthy), redis (healthy), mailpit (healthy), piston (up) |
| Backend | `uvicorn` on 127.0.0.1:8000, `/api/health` → 200 |
| Frontend | Vite on :5173, `/api` proxy verified |
| Database | 38 tables, migration `b1f2a3c4d5e6`, 9 seeded users |
| Sandbox | Piston executed `print(1+1)` → `2` |
| Viewport | 1440×900 (an earlier 265px-wide harness panel was identified and corrected before judging any layout) |

## Routes exercised

`/auth/login` · `/` (student and staff variants) · `/courses` · `/courses/:id` (Announcements, Materials, Assignments, Gradebook, Roster) · `/assignments` · `/programming` · `/programming/:id` (Workspace, Test cases, Submissions) · `/exams` · `/exams/:id` (Questions, Submissions & Grading, Performance) · `/exams/:id/results` · `/question-banks` · `/admin/users` · `/admin/academic` · `/admin/settings`

Roles used: **super_admin**, **student** (plus role-guard probing as student).

## Checks that passed (observed)

- **Auth** — sign-in returns 200 with a real token and roles; sign-out returns 200 and redirects; unauthenticated users are redirected to `/auth/login`.
- **Role scoping** — the student sidebar shows only Dashboard/Courses/Assignments/Programming/Exams; navigating a student to `/admin/users` redirects cleanly to the dashboard (no crash, no blank page).
- **Dashboard** — real institutional metrics (4 students, 3 faculty, 2 departments, 100% pass rate) and a live audit trail; the student variant shows enrolled courses, cumulative average 96.1% and recent graded work from `/analytics/student/me`.
- **Courses** — 2 offerings with search; course detail loads all 7 endpoints with 200s; every tab renders real content (announcements, materials, 1 assignment, gradebook with 3 rows + Export CSV, roster with 3 students).
- **Assignments (student)** — real `GET /assignments/me`, tab counts correct (1 total / 0 pending / 0 awaiting / 1 graded), real assignment metadata.
- **Programming (end-to-end, real sandbox)** — typed code + stdin in the editor, pressed **Run**: Piston executed it and the output panel showed `success` / `STDOUT: BROWSER TEST`. Pressed **Submit for grading**: `PASSED 10 / 10`, `3 of 3 tests passed`, with the two hidden cases correctly labelled `(hidden)` and their expected outputs never exposed. A deliberately wrong submission returned `FAILED 0 / 10`. `GET /programming/health` → 200.
- **Exams (staff)** — 2 exams with status filters; detail page shows 6 real questions; **Submissions & Grading** lists real candidates with real scores (73.3%, 93.3%), integrity counts and a Reopen action; **Performance** shows attempt analytics and Export CSV.
- **Scorecard (student)** — "Official Exam Scorecard", 14/15 (93.33%), **Performance Breakdown (6 Items)** with per-question marks, the student's answers and instructor feedback.
- **Question banks** — bank list with department filter and real question counts.
- **Administration** — `/admin/users` (9 real users, role/status filters, bulk import), `/admin/academic` (departments/terms), `/admin/settings` (institution branding).
- **Console** — no unexpected errors on any page; every network request returned 200.

## Defects found live → fixed → re-verified in the browser

| # | Defect observed | Root cause | Fix | Re-test |
| :--- | :--- | :--- | :--- | :--- |
| D1 | Role badge printed raw API values ("Super_admin", "student") | `user.roles[0]` rendered unformatted | `formatRole()` normalises snake_case to Title Case | Badge reads "Super Admin" / "Student" |
| D2 | Dashboard "View Schedule" / "New Report" buttons did nothing | No click handlers | Replaced with working links: "My Courses" → `/courses`, "Manage Exams" → `/exams` | Both navigate correctly for student and staff |
| D3 | Course roster showed "Enrolled Student" plus a raw UUID for every row | Enrollments API returned `first_name`/`last_name`/`email` while the UI expected `student_name`/`student_email` — the enrollments contract was the outlier | Added the denormalised display fields to `EnrollmentResponse` (consistent with assignments, exams and programming) and taught the UI to fall back to them | Roster shows "Carlos Gomez / student3@campusflow.edu" etc., no UUIDs |
| D4 | Native `window.confirm()` on "drop student" | Missed during the earlier dialog sweep | Replaced with the shared accessible `ConfirmDialog` | Dialog opens, Escape/backdrop dismiss, action confirmed |
| D5 | Gradebook header read "Section Section A" | `course_title` built as `f"Section {offering.section}"` while `section` already contains "Section A" | Use the course's real title | API returns "Data Structures & Algorithms" |
| D6 | **Every code Run failed with 503** — the flagship programming feature was unusable | Two causes: Piston's stock ceiling (3000 ms) rejected the requested 5000/10000 ms budgets with HTTP 400, and requesting `run_memory_limit` made isolate SIGKILL the process on this host | Raised Piston's ceilings via `PISTON_RUN_TIMEOUT`/`PISTON_COMPILE_TIMEOUT` in compose; made the memory cap opt-in (`CODE_RUN_MEMORY_LIMIT_KB=0`); the runner now retries once inside the sandbox's reported ceiling | Run and Submit succeed; PASSED 10/10 with hidden cases enforced |
| D7 | Sandbox failures reported only "The code execution service returned HTTP 400" | The runner discarded Piston's response body, hiding the real cause | Error detail is now extracted and surfaced to the caller | Failures now name the actual reason |
| D8 | Scorecard showed "Performance Breakdown (0 Items)" despite a 14/15 attempt | The seeder set an attempt's `total_score` without creating any `exam_responses` rows | Seeder now writes a full answer sheet (correct/wrong by type, faculty-graded short answers) and derives the score from it | Breakdown shows 6 items; stored score still matches (14/15, 11/15) |
| D9 | Fill-blank answers displayed "No answer submitted" despite 2/2 marks | The scorecard renderer handled `selected`/`value`/`text` but not `blanks` | Added the `blanks` case | Q2 shows "Your Answer: queue" |

## Exam delivery driven end-to-end (added after the main walkthrough)

The seeded exam windows had already closed, so a short live quiz (`CS201 Live Quiz: Trees & Traversals`, open window, 2 auto-graded questions) was created and the full candidate flow was driven in the browser as the student:

- **Brief/consent screen** renders with the neutral integrity notice.
- Attempting it while signed in as an **unenrolled admin** was refused with a clean "You are not actively enrolled in this course offering" page — the enrolment guard works.
- **Delivery UI** — timer counting down from 30:00, candidate name, "Integrity monitoring on", flag-for-review, navigator with answered/not-answered legend, autosave indicator showing "Saved" after each answer.
- **Submit** raised the accessible confirm dialog ("You have answered 2 of 2 questions… responses are final"); confirming redirected to the results page, which correctly reported that results are not yet published.
- **Server side** — the attempt is stored as `graded` with 3/4 (75%) and two responses: MCQ `"C"` → 2/2 and True/False `"false"` → 1/1, both `is_auto_graded = true`. Auto-grading matched the correct options exactly.

## Launcher verification

- **Warm path** — with services already healthy, the launcher detects it, opens Chrome and skips duplicate starts.
- **Cold path** — from a fully stopped state: containers started, bootstrap migrated to head and seeded, backend and frontend started inside the same window, both health checks passed, Chrome opened, and the final keypress cleanly terminated both processes and the containers (ports verified free, exit 0).
- Two launcher bugs were found and fixed during this testing: a preflight check that only worked when run from `backend/`, and an unescaped parenthesis inside a batch `if` block that aborted parsing.

## Automated checks after all fixes

| Check | Result |
| :--- | :--- |
| `python -m pytest -q` | 24 passed (exit 0) |
| `python -m ruff check campusflow tests` | All checks passed (exit 0) |
| `npm run build` (includes `tsc -b`) | exit 0 |
| `npm run lint` | 0 errors, 13 advisory warnings |

## Known limitations

- Playwright/Vitest suites and CI remain outstanding (documented in `docs/qa-report.md`).
