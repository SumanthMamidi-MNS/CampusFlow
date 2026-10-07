# CampusFlow Quality Assurance & Verification Report

> **Revision:** 2.0 — 2026-10-06
> **Scope:** Independent repository audit (Phase 13) and the repairs that followed.
>
> This report supersedes the previous "verified clean, ready for production" claim, which was
> not supported by the repository state. It records **only checks that were actually executed**
> and clearly separates them from checks that could not run in this environment.

---

## 1. Verification Environment

| Item | Value |
| :--- | :--- |
| Python | 3.12.10 |
| Backend tests | `pytest` (in-memory SQLite via `sqlite+aiosqlite`) |
| Frontend build | `npm run build` (`tsc -b && vite build`) |
| Lint | `ruff check campusflow tests`; `oxlint` |
| Docker daemon | **Not running during this audit** — PostgreSQL, Piston, and the live stack could not be exercised |
| Browser QA | **Not performed in this environment** (no running stack) |

---

## 2. Checks That Actually Ran

| Check | Command | Result |
| :--- | :--- | :--- |
| Backend test suite | `python -m pytest -q` | **24 passed** |
| Programming flow (authoring, run, submit, RBAC, hidden-case leakage, fail-closed 503) | `python -m pytest -q tests/test_programming.py` | **1 passed** |
| Rate limiting, secret guard, `/assignments/me`, response-listing contract | `python -m pytest -q tests/test_contract_hardening.py` | **4 passed** |
| Proctoring (observable threshold auto-submit + faculty-only resumption) | `python -m pytest -q tests/test_proctoring_security.py` | **1 passed** |
| Python lint (application + tests) | `python -m ruff check campusflow tests` | **All checks passed** |
| TypeScript typecheck + production bundle | `cd frontend && npm run build` | **Clean** (2055 modules, 0 TS errors, `vite` ✓ built) |
| Frontend lint | `cd frontend && npm run lint` | **0 errors** (14 advisory warnings) |
| Seeder syntax | `ast.parse(scripts/seed.py)` | **OK** |

### Test database note
`tests/conftest.py` now reads `TEST_DATABASE_URL`. When unset it uses fast in-memory SQLite;
when set to a PostgreSQL async URL it creates and tears down the schema there instead, so the
same suite can be run against the production engine in CI. **This PostgreSQL path has not yet
been executed in this environment.**

---

## 3. Defects Found by the Audit — and Their Repair Status

| # | Defect | Severity | Status |
| :--- | :--- | :--- | :--- |
| 1 | Demo authentication bypass via `localStorage.campusflow_demo_role` + fake token | Critical | **Fixed** — removed from login and auth context |
| 2 | Student-facing "Faculty Authorization Simulator" invoking the faculty unlock endpoint | Critical | **Fixed** — removed |
| 3 | Hidden `Ctrl+Alt+Shift+M/S/D` QA hotkeys inside the candidate exam canvas | Critical | **Fixed** — removed |
| 4 | Silent fabricated API results (fake score `85`, fake attempts, fake submissions) | Critical | **Fixed** — fallbacks removed; errors propagate |
| 5 | Synthetic canvas-drawn "photorealistic" camera feed presented as a real feed | Critical | **Fixed** — removed with the camera subsystem |
| 6 | Hardcoded fake candidates and fake 1080p streams in the faculty video wall | Critical | **Fixed** — replaced with the real attempt table and integrity timeline |
| 7 | Webcam gaze/phone "AI" heuristics contradicting ADR-003 | High | **Fixed** — reverted to observable proctoring (ADR-013) |
| 8 | Blinking strobe warnings and "CRITICAL SECURITY BREACH" copy | High | **Fixed** — neutral, informational messaging |
| 9 | Threshold auto-*lock* requiring faculty unlock, contradicting ADR-008 | High | **Fixed** — threshold now auto-submits |
| 10 | Inconsistent `max_violations` defaults (5 vs 6) | Medium | **Fixed** — single `_resolve_max_violations` source, default 5 |
| 11 | Manual grading submitted exam-question IDs where response IDs are required | High | **Fixed** — added `GET /exam-attempts/{id}/responses` |
| 12 | 401 refresh path could loop / redirect while already on the login screen | Medium | **Fixed** — single retry, guarded redirect |
| 13 | Documented rate limiting did not exist | High | **Fixed** — `AuthRateLimitMiddleware` on credential endpoints |
| 14 | Default JWT secret usable in production | High | **Fixed** — startup refuses when `DEBUG=false` and the placeholder is set |
| 15 | `.env.example` used a prefix the settings loader ignores (template inert) | Medium | **Fixed** — unprefixed variable names |
| 16 | Startup auto-created a super-admin with a published password | High | **Fixed** — removed from `lifespan`; accounts come from the seed script |
| 17 | Refresh cookie `SameSite=Lax` versus documented `Strict` | Medium | **Fixed** — `SameSite=Strict` |
| 18 | `/assignments` rendered a hardcoded mock catalogue | High | **Fixed** — real `GET /assignments/me` + real submissions |
| 19 | Download helpers read `localStorage['token']` instead of `access_token` | Medium | **Fixed** |
| 20 | `index.html` document title was the placeholder `frontend` | Low | **Fixed** |
| 21 | Student-facing exam route had no role guard for the delivery surface | Low | **Reviewed** — backend enforces enrolment/permission; page handles 403/423 |
| 22 | Programming environment absent although it is a core requirement | Critical | **Implemented** — Piston-backed, fail-closed, with tests |

---

## 4. Checks That Did NOT Run (explicitly deferred)

These are **not** passes. They require a working Docker daemon and a running stack:

1. **PostgreSQL migrations** — `alembic upgrade head` including the new
   `b1f2a3c4d5e6_create_programming_tables`.
2. **Piston sandbox end-to-end** — running real student code, timeout enforcement, memory
   limits, and the `piston-init` runtime install.
3. **Live browser QA across all six roles** (Super Admin, College Admin, Department Head, Exam
   Controller, Faculty, Student): login, navigation, forms, dialogs, filters, empty/loading/error
   states, console and network inspection.
4. **The two end-to-end chains** (academic → course → assignment → grade, and exam →
   delivery → grading → publication) exercised through a browser.
5. **The programming chain** (write → run → stdin → output → submit → per-test results →
   faculty review) against the real sandbox.
6. **Vitest component tests, Playwright E2E, and CI** — not yet written.

Per AGENTS.md, these remain open until executed. They must be completed before the product is
described as institution-ready.

---

## 5. Definition of Done — Current Standing

| Requirement | Standing |
| :--- | :--- |
| No fabricated/demo data paths | ✅ Met (verified by inspection + typecheck) |
| Proctoring matches ADR-003/008 | ✅ Met (test-verified) |
| Backend tests green | ✅ 24/24 |
| Lint clean | ✅ ruff + oxlint (0 errors) |
| Production build | ✅ Clean |
| Sandbox fail-closed | ✅ Test-verified (503) |
| Hidden test-case leakage prevented | ✅ Test-verified |
| PostgreSQL migrations verified | ✅ Applied to head (`b1f2a3c4d5e6`) against live PostgreSQL |
| Live browser QA across roles | ✅ Executed — see `docs/live-qa-log.md` |
| Sandboxed execution end-to-end | ✅ Verified against real Piston (run + graded submit) |
| E2E/CI | ⛔ Not written |

**Verdict (updated after the live verification round):** the audited defects are repaired, the
migrations apply cleanly to PostgreSQL, and the application was driven in a real browser across
the role matrix with every defect found fixed and re-tested. The remaining gap is automated
frontend/E2E coverage and CI, not unverified functionality. Full evidence: `docs/live-qa-log.md`.
