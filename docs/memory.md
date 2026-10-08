# Engineering Memory & Constraints

This document preserves durable technical context, implementation constraints, and discovered system behaviors for CampusFlow.

---

## 1. Environment & Platform Nuances

### Operating System & Shell (Windows PowerShell)
- The host environment runs **Windows with PowerShell**.
- Avoid chaining directory changes (`cd`); always pass explicit relative or absolute paths or specify the working directory parameter.
- Remember path quoting when dealing with paths containing spaces (e.g. `Anti Gravity`).
- Use cross-platform path handling in Python (`pathlib.Path`).

### Python & Database (SQLAlchemy 2.x Async & Alembic)
- **SQLAlchemy 2.0+ Async Style:** All models must use the modern `Mapped[...]` and `mapped_column(...)` declarative syntax.
- **Async Engine:** Always use `asyncpg` as the database driver (`postgresql+asyncpg://...`). Ensure `greenlet` is installed.
- **Async Relationship Loading:** In async SQLAlchemy, accessing or assigning to relationship collections (e.g. `role.permissions = [...]` or serialization of `submission.grade`) triggers implicit lazy queries unless eagerly loaded with `selectinload` or configured with `lazy="selectin"` / `lazy="joined"` on the model relationship. Always use eager loading to avoid `MissingGreenlet` exceptions during serialization.
- **BaseModel vs. SoftDeleteMixin:** `BaseModel` provides `id`, `created_at`, and `updated_at`. `SoftDeleteMixin` is a separate mixin. Do not query `deleted_at` on models unless they explicitly inherit from `SoftDeleteMixin`.
- **SQLite In-Memory Testing:** SQLite returns naive datetimes for `DateTime(timezone=True)` columns. When performing time comparisons in services (e.g. token expiration checks), normalize with `if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)` to prevent `TypeError: can't compare offset-naive and offset-aware datetimes`.
- **PostgreSQL 15+ Schema Permissions:** PostgreSQL 15+ restricts the default `public` schema. Ensure the application user is granted schema access:
  `GRANT ALL ON SCHEMA public TO campusflow; ALTER SCHEMA public OWNER TO campusflow;`
- **Alembic Autogenerate Discovery:** In `alembic/env.py`, import all models with `# noqa: F401` so Ruff does not strip them as unused imports, ensuring `target_metadata = Base.metadata` registers all tables.
- **Pydantic Settings v2:** `SettingsConfigDict` is configured with `case_sensitive=False` and no prefix, allowing standard environment variables (`DATABASE_URL`, `REDIS_URL`, `DEBUG`, etc.) to map directly to settings fields without prefix duplication.
- **Windows Console Encoding:** When running standalone utility scripts (e.g. `scripts/seed.py`), Windows console defaults to `cp1252`. Ensure `sys.stdout.reconfigure(encoding="utf-8")` is called or stick to ASCII markers to prevent `UnicodeEncodeError`.
- **Audit Logging Signature:** `record_audit_event` in `campusflow.bedrock.audit.service` takes `action`, `resource_type`, `resource_id`, and `user_id` (not `actor_id`). Always pass keyword arguments matching this signature.

### Windows Batch & Local Startup Automation (`startup/*.bat`)
- **Parentheses in Batch Blocks:** Inside `if (...)` or `for (...)` compound blocks in `cmd.exe`, an unescaped closing parenthesis `)` immediately terminates the compound block, causing syntax errors on subsequent text. Never use literal parentheses in `echo` statements inside compound blocks; use square brackets `[...]` instead (e.g. `echo [OK] Backend ready [HTTP 200].`).
- **Sleep in Automated / Redirected Shells:** `timeout.exe` fails with `ERROR: Input redirection is not supported` when executed in non-interactive subshells, automated test runners, or IDE tasks. Use `ping 127.0.0.1 -n <N> >nul` for reliable, non-blocking sleeps in Windows batch scripts.
- **Process ID File Encoding:** When capturing process IDs from PowerShell into file (e.g. `.backend.pid`), standard `>` redirection in Windows PowerShell 5.1 writes UTF-16 LE with BOM, which causes `set /p` in batch to misread the PID with null bytes. Always use `[IO.File]::WriteAllText(path, $p.Id)` or `Out-File -Encoding ascii` to generate clean single-line ASCII files.
- **Google Chrome Path Discovery:** Chrome can be installed in `%ProgramFiles%\Google\Chrome\Application\chrome.exe`, `%ProgramFiles(x86)%\...`, or `%LOCALAPPDATA%\...`. Check all three candidate locations before falling back to `start chrome <url>`.

### Frontend (React 19, Tailwind CSS v4, TypeScript)
- **Tailwind CSS v4:** Configuration uses `@import "tailwindcss";` in `src/index.css` with the `@tailwindcss/vite` plugin.
- **TypeScript Aliases:** The path alias `@/*` maps to `./src/*` across both `tsconfig.app.json` and `vite.config.ts`. In `vite.config.ts`, use ESM `fileURLToPath(new URL('./src', import.meta.url))` to avoid Node `__dirname` deprecation warnings.
- **UI Guidelines:** Maintain institutional light-theme styling. Do not introduce dark or neon themes.
- **Client Resilience:** In examination flows, persist unsaved answer drafts in browser `localStorage` as a fallback against network dropouts.

---

## 2. Architectural Boundaries & Conventions

### Bedrock vs. Domain Boundary
- `campusflow.bedrock` must **never** import any module from `campusflow.domain`.
- If a Bedrock component requires domain-specific data, it must accept it via dependency injection, interfaces, or generic parameters.
- Domain modules should communicate through explicit service classes rather than performing direct cross-boundary queries into foreign database tables.

### Soft Delete & Audit Records
- Tables supporting historical preservation utilize the `SoftDeleteMixin` (`deleted_at` timestamp).
- When querying entities that inherit `SoftDeleteMixin`, always filter by `deleted_at.is_(None)` unless explicitly fetching archived records.
- Audit logs in `campusflow.bedrock.audit` are strictly append-only.

---

## 3. Examination Engine Guardrails

- **Clock Integrity:** Never trust client-reported timestamps for exam duration. Duration and expiration are strictly computed from `started_at` recorded on the server.
- **Auto-Grading Safety:** Auto-grading routines must run idempotently on exam submission. Objective questions (MCQ, MSQ, True/False, Numerical) grade immediately; subjective questions (Short/Long answer) enter the manual grading queue.
- **Observable Proctoring Only:** There is no webcam capture, gaze analysis, or biometric
  processing anywhere in the product. Camera/gaze/strobe/lockdown code was removed in
  Phase 13 (see ADR-013). Only browser telemetry (`tab_switch`, `window_blur`,
  `fullscreen_exit`, `copy_paste_attempt`, `context_menu`) is recorded.
- **Single Tolerance Source:** `_resolve_max_violations(exam)` in
  `campusflow.domain.exams.service` is the only place the tolerance is read, from
  `exam.config["max_violations"]` with a default of `DEFAULT_MAX_VIOLATIONS = 5`. Reaching it
  auto-submits the attempt with a `max_violations_exceeded` flag (ADR-008) — it does **not**
  lock the candidate out.
- **Neutral Candidate Copy:** Warning strings must stay calm and informational. No strobe,
  no shouting, no "breach" language. Follow the responsible-UX rules in AGENTS.md §13.
- **Faculty-Authorised Resumption:** `POST /exams/{exam_id}/attempts/{attempt_id}/unlock`
  requires `exams:grade`, is always audited, and resets the recorded count. Students receive
  403. A student-facing unlock affordance must never be reintroduced.
- **No Hidden Shortcuts:** Do not embed QA/simulation keyboard shortcuts inside candidate
  surfaces. Test via the API or unit tests instead.
- **Answer Durability:** Answers are mirrored to `localStorage` and synced to the server on a
  30-second cadence and on navigation, so a resumed attempt keeps all prior responses.

## 4. Sandboxed Code Execution (Programming Environment)

- **Never execute student code in the API process.** All execution goes through
  `campusflow.bedrock.runner.run_code`, which talks to the Piston sidecar over HTTP.
- **Fail closed:** If `CODE_RUNNER_ENABLED=false`, no backend is configured, or Piston is
  unreachable, `run_code` raises `ServiceUnavailableError` (HTTP 503). Never substitute a
  fabricated result.
- **Limits:** `ExecutionLimits` carries `run_timeout_ms`, `compile_timeout_ms`, `memory_kb`,
  and `max_output_bytes`. Per-problem overrides are sanitised by
  `code_run_max_timeout_ms` in settings, and all executions share one semaphore sized by
  `code_run_max_concurrency`.
- **Piston specifics:** image `ghcr.io/engineer-man/piston`; requires `privileged: true` for
  `isolate`; bound to host loopback only (`127.0.0.1:2000`). The Python runtime version must
  match `CODE_RUNNER_PYTHON_VERSION` (compose installs `3.10.0` via the `piston-init`
  one-shot container, which is idempotent).
- **Hidden test leakage:** `CodingTestResult.expected_output` is blanked for hidden cases in
  every student-facing response (`_submission_response(include_hidden_expected=False)`).
- **Comparison modes:** `trimmed` collapses all whitespace; `exact` compares line-by-line
  with trailing whitespace removed. Default is `trimmed`.
- **Submission status vocabulary:** `passed` (all tests), `partial` (some), `failed` (ran but
  none matched), `error` (did not compile or never ran successfully).



## Wave 0 — authorization, audience separation, and the PostgreSQL test harness

- **Audience rule:** never hand a staff-shaped payload to a candidate. `ExamResponse` carries
  `is_correct`/`explanation`; `ExamStudentResponse` deliberately has no field that can. Candidate
  reads go through `GET /exams` (scoped list, non-draft states, enrolled offerings only) and
  `GET /exams/{id}/public` (brief). `GET /exams/{id}` now requires
  `exams:create|grade|proctor_view` **and** offering scope.
- **Scope kernel:** `campusflow.domain.courses.access` owns every offering-scope question.
  `allow_exam_bureau=True` is the only way to give `exam_controller` institution-wide reach, and
  it applies to examination objects (rosters, exam authoring, exam analytics) — never to the
  gradebook, which the bureau must not read.
- **Authorship fallback:** an exam/assignment author manages what they created even when no
  `FacultyAssignment` row exists. Tests that build an offering directly in the ORM must still add
  the teaching link, because cohort endpoints (gradebook, roster, analytics) have no author to
  fall back on.
- **Student self-service:** `GET /course-offerings/{id}/my-grades` returns only the caller's rows
  and mirrors the staff gradebook's weighted arithmetic, so student and instructor never disagree.
- **Anti-enumeration:** a candidate asking for an exam they may not see (draft, or another
  offering) receives **404**, not 403, so direct URLs cannot be probed.
- **pytest + PostgreSQL:** asyncpg connections belong to the event loop that created them. A
  session-scoped engine plus a fresh loop per test hands a poisoned connection to the next test
  ("cannot rollback; the transaction is in error state"). `tests/conftest.py` therefore uses
  `NullPool` for PostgreSQL (SQLite keeps `StaticPool`). Run PG-backed tests with
  `TEST_DATABASE_URL=postgresql+asyncpg://campusflow:campusflow@localhost:5432/campusflow_test`
  (create that database once).
- **Exit-status trap:** piping pytest into `tail` hides its failure unless `set -o pipefail` is
  set; wrapping it in a subshell makes `$PIPESTATUS` report the filter instead of pytest.
- **Stale dev server:** `uvicorn campusflow.main:app` without `--reload` keeps serving the code
  it was started with, so a live "leak still present" observation may just be a stale process.
  After backend edits, restart the listener (find it with `netstat -ano | grep :8000`, stop the
  exact PID, relaunch) before drawing conclusions from live HTTP.
- **Session-shared pytest database:** the test engine is session-scoped, so committed rows from
  one test are visible to later tests in the same run. Fixtures that create users/departments
  must tag emails and codes with a per-invocation uuid, and assertions over *institution-wide*
  collections (admin/bureau listings) must be containment checks (`{mine} <= listed`), not
  equality — scoped actors can still assert exact lists because their scope never includes
  another fixture's world.
- **FastAPI route introspection:** included routers appear as `_IncludedRouter` objects in
  `app.routes`, not `APIRoute`; policy audits must unwrap `include_context.prefix` /
  `original_router.routes` (see `tests/test_route_policy.py`) or they silently count only the
  leaf app-level routes.
