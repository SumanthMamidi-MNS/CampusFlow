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

## Operational gotchas (Wave 2 audit)

- **A stale `uvicorn` can keep the port after its PID is gone.** When a reloader parent dies,
  a child can inherit the listening socket, so `netstat -ano` attributes `:8000` to a
  **dead** PID and `Get-Process` cannot find it. Kill the child (search for
  `multiprocessing.spawn` processes / the process whose `ParentProcessId` is the missing PID)
  or stop whichever PID actually owns the port via `Get-NetTCPConnection -LocalPort 8000`
  before starting a replacement — otherwise the new server fails to bind and every request is
  answered by the old code.
- **`netstat -ano` PID ≠ live process.** Always confirm with `Get-Process`/`Get-CimInstance`
  and, above all, confirm behaviour: after changing backend code, assert the new behaviour over
  HTTP rather than assuming a restart took effect.
- **The audit trail must never be handed raw ORM values.** `datetime`/`UUID`/`Enum` are not
  JSON-encodable and a failing `audit_logs` insert aborts the whole request. Use
  `campusflow.bedrock.audit.service.json_safe` (applied centrally in `record_audit_event`).
- **Commit order matters for audited writes:** flush the change, write the audit entry, then
  commit — so an edit can never be persisted without its audit record.
- **Counters incremented across requests need SQL-side increments.** `obj.count += 1` in a
  handler loses updates under concurrency (reproduced: 5 trail rows, counter 2).
  Use `values(col=Model.col + 1)` and re-read.
- **The preview/embedded browser cannot grant full-screen.** `document.fullscreenEnabled` is
  `true` but `requestFullscreen()` never settles. Verify Fullscreen API behaviour by hand in a
  normal Chrome/Edge window.
- **Vite binds IPv6 loopback only** (`[::1]:5173`) in this environment; `curl 127.0.0.1:5173`
  fails while `http://localhost:5173` works.

## Wave 3/4 — hierarchy, identity, roster import, duplicate prevention

- **Guard before mutate, or the guard answers its own question wrongly.**
  `guard_campus_lead_removal` asks "is this user an active Campus Lead *now*?". Applying the
  status change first makes `is_active_campus_lead` return False (SQLAlchemy autoflush writes
  the pending change before the guard's SELECT), the guard returns early, and the institution
  silently loses its last lead. The guard is therefore the first thing `update_user` and
  `delete_user` do. `tests/test_campus_lead_invariant.py` fails if the order is flipped.
- **Institution-wide invariants fight a session-scoped test database.** A Campus Lead count is
  global, while the pytest engine and its rows are shared across the whole session, so earlier
  worlds' admin users would change the count and break the assertions. The fixture *parks*
  (deactivates) every other active Campus Lead for the duration of the test and restores them
  afterwards, making the count deterministic without weakening any assertion.
- **`pg_advisory_xact_lock` is PostgreSQL-only.** It is the only thing that serialises two
  concurrent removals of *different* leads (row locks do not: each transaction locks its own
  row and both read `count = 2`). SQLite serialises writers anyway, so the lock is a no-op there
  — which is exactly why the concurrency criterion must be `skipif`-gated on PostgreSQL and can
  never be evidenced by the SQLite run.
- **`IntegrityError` surfaces at the first `flush`, not only at `commit`.** In a multi-row
  batch (`commit_import`) the unique-constraint refusal happens inside the row loop, so the
  conflict guard must wrap the *whole* write section. Wrapping only `await db.commit()` leaves a
  500 for two concurrent imports of the same roster (reproduced on PostgreSQL).
- **Student identifiers normalise on case and whitespace only.** Punctuation is preserved:
  `A-12` and `A12` can be different people. `normalize_registration_number` collapses internal
  whitespace and uppercases; a test that expects `cse / 2026 / x` to equal `CSE/2026/X` is
  wrong, not the code.
- **`assign_role_to_user` commits.** It is convenient at single-record call sites and fatal in a
  multi-record transaction: calling it mid-batch persists half the batch. `roster_import`
  therefore inserts `UserRole` rows directly and takes the batch through one commit.
- **`httpx.ASGITransport` re-raises unhandled exceptions.** A test that provokes a raw
  `RuntimeError` inside a handler sees the traceback, not FastAPI's 500 handler. Failure-path
  tests should raise an `AppException` subclass so the response is exercised the way a real
  client would see it.
- **The `exam_attempts` unique constraint needed data reconciliation first.** The live database
  carried one duplicate `(exam_id, student_id, attempt_number)` group. Migration
  `c3d4e5f6a7b8` renumbers duplicates by `started_at` (no row deleted) before adding
  `uq_exam_attempt_student_number`; a duplicate *faculty assignment* group would instead abort
  the migration with instructions, because merging teaching links is not a decision a migration
  should make.
- **`openpyxl` is a new runtime dependency** for `.xlsx` roster import, imported lazily so a
  deployment without it degrades to a clear "upload a CSV" error rather than an import failure.

## Media capture & session recovery (camera repair wave)

- **A promise reaction registered before an `await` runs before the await resumes.** The
  "release a late stream" cleanup in `startCamera` was attached with
  `request.then(handler)` *before* `await Promise.race([request, timeout])`, so on the normal
  path `handler` ran while `streamRef.current` was still `null`, matched its own
  `!streamRef.current` guard, and stopped the tracks of the camera it had just been granted.
  The result was a permanently black tile from a live-looking element. Guard release paths with
  an explicit flag set by the *timeout* (`gaveUp`), never with "is the ref still empty".
- **`video.readyState >= 2 && video.videoWidth > 0` does not mean "a live picture".** Chrome
  parks a **2×2 placeholder frame** on a `MediaStream`-backed `<video>` whose track has ended, so
  that predicate is true for a dead camera, `videoWidth` reported `2`, `currentTime` stayed `0`,
  and the sampled pixels were pure black while the UI said "live picture is showing". A truthful
  readiness test needs all four: `track.readyState === 'live'`, a real frame size, a playback
  clock that advances, and sampled pixel luminance above a near-zero floor.
- **Prove the pixels, not the object.** `canvas.drawImage(video, …)` + `getImageData` over a
  32×24 downscale gives both the obstruction signature and the mean luminance used to name a
  black feed honestly. Keep the black floor near zero (pure black only) so a genuinely dark
  room, whose sensor still produces grain, is not reported as a dead camera.
- **Camera state ≠ picture state.** A device can be *on* while the picture is *not there yet* or
  *black*; three states (`waiting` / `live` / `black`) plus the device state (idle, starting,
  on, denied, unsupported, lost) is what makes every message match reality. Anything that gates
  the attempt (the "Begin assessment" button) must key off the verified `live` state only.
- **The preview browser cannot grant camera permission** (`navigator.permissions.query` reports
  `denied`, like it cannot enter full-screen). Grant it in page context instead: stub
  `navigator.permissions.query` → `granted` and return `canvas.captureStream()` from
  `navigator.mediaDevices.getUserMedia`. That harness reproduces the original black-tile defect
  *and* proves the fix (a colour canvas yields `track: live`, 640×480, advancing clock, and
  "Camera ready").
- **`/auth/me` must be allowed to refresh.** Excluding every `/auth/*` URL from the 401 retry
  means the one call a page reload always makes can never use the refresh cookie; combined with
  "clear the token on any error", Ctrl+R signs the user out as soon as the 15-minute access
  token is stale. Only session-establishing endpoints (`login`, `refresh`, `logout`,
  `password/*`) belong on that list, and the session should be cleared on a definitive 401/403
  alone — infrastructure failures must keep the stored token.
- **Validate emails on the way in, not on the way out.** `UserResponse` inheriting
  `email: EmailStr` meant one stored address Pydantic rejects (the old demo account's
  `campusflow.local`, a reserved special-use TLD) turned every endpoint that returns a user into
  a 500. Response models should carry stored values; input models do the validating.
- **Cookie attributes must not be duplicated per route.** `/auth/login`, `/auth/refresh` and the
  demo sign-in now all use `campusflow.bedrock.auth.cookies.set_refresh_cookie`, and the demo
  route pops the raw refresh token out of the payload so it only ever travels in the httpOnly
  cookie.
- **Running the stack without Docker.** `docker` was not running in this session, so Postgres
  (`:5432`) and the `.env` `postgresql+asyncpg://…` URL are unusable. The supported offline path
  is `cd backend && uv run --extra dev python ../scripts/bootstrap.py --sqlite` (creates the
  schema from model metadata and seeds demo data, idempotent), then
  `uv run python -m uvicorn campusflow.main:app --host 127.0.0.1 --port 8000`. The backend venv
  is uv-managed and has **no `pip`** — use `uv run`/`uv sync`, not `python -m pip`.
- **`npx tsc --noEmit -p tsconfig.json` is not this project's typecheck.** The root tsconfig is a
  solution file of project references, so that command reports success while checking nothing;
  `npm run build` (`tsc -b && vite build`) is the real gate and the one that catches JSX
  narrowing errors (e.g. comparing a state already narrowed to `'lost'`).
- **`localhost` resolves to `::1` on this machine, and another project's Vite server can own
  `[::1]:5173`.** During this session a second dev server (the *Portfolio* project) bound
  `[::1]:5173` while CampusFlow's dev server held `127.0.0.1:5173`. Because the browser resolves
  `localhost` to IPv6 first, `http://localhost:5173` was answered by the **wrong app**: every
  `/api/*` GET came back as that project's `index.html` (HTTP 200, `Content-Type: text/html`) and
  every POST came back **404** — which axios reports as `Request failed with status code 404`,
  and which looked exactly like a broken backend route. Diagnose it with
  `netstat -ano | grep 5173` (two listeners, two PIDs, two address families) and
  `curl "http://[::1]:5173/"` (wrong `<title>`). Use **`http://127.0.0.1:5173`** for CampusFlow, or
  stop the other dev server; the API proxy is configured correctly
  (`server.proxy['/api'] → http://localhost:8000`) and works on the IPv4 origin.
  This is also a second, environment-level cause of "Ctrl+R signs me out": when `/auth/me` is
  answered by a foreign server, every reload failed and the old client cleared the token.
- **A Pydantic validator that raises an exception can break the *error* response, not just the
  request.** `exc.errors()` for a `field_validator` that raises `ValueError` carries the raised
  exception object under `ctx`, and `bedrock/api/errors.py` used to place those entries directly
  into `JSONResponse` — so the handler's own `json.dumps` failed with
  `TypeError: Object of type ValueError is not JSON serializable` and an intended **422 became a
  500**. Any new validator hits this, so the handler now encodes each error field individually
  (`_json_safe`, falling back to `str`) and new validators prefer `PydanticCustomError` for a
  stable `type` and a readable `msg` (see `domain/exams/schemas.py` `validate_exam_config`).
  If a request that should be refused ever answers 500, suspect the error path first.
- **`exams.config` is an untyped JSON column, so new exam settings need no migration — and get no
  constraint either.** The default has to live in the service resolver (`_resolve_max_violations`,
  `_resolve_warning_policy`) and the validation in the authoring schemas
  (`validate_exam_config`), because nothing at the database level will hold either.

## Orientation, evidence and the scope kernel (completion-audit wave)

- **A self-view must be mirrored; evidence must not be.** A raw webcam frame puts the subject's
  right hand on the viewer's left — faithful, and unnerving to sit an exam behind (“it shows my
  left hand”). All candidate self-views now render through one `SELF_VIEW_STYLE`
  (`transform: scaleX(-1)`) in `ExamDelivery.tsx`, and the copy states the split plainly. The
  evidence path needs no guard: `canvas.drawImage(video, …)` reads the video's *source pixels*,
  so a CSS transform on the element can never flip what is stored. Verified with a red-left /
  blue-right source: `matrix(-1, 0, 0, 1, 0, 0)` on screen, left = red in the captured canvas.
- **A static `canvas.captureStream()` produces no frames.** `video.currentTime` stays `0`, so a
  liveness gate that requires an advancing clock correctly refuses to say "ready" — the harness,
  not the app, is what is missing. Animate the canvas (`setInterval` redraw) before judging
  readiness, or the test will report a false failure.
- **`getComputedStyle(video).transform` is the cheapest truthful orientation assertion.** It
  returns the resolved `matrix(...)`, so a mirror is provable without a camera; pair it with a
  `drawImage` pixel read to prove the *evidence* is unflipped.
- **Exam/attempt staff endpoints are permission-only — D-1 in `docs/completion-audit.md`.**
  `assert_can_manage_offering` is called in exactly three places in `domain/exams/service.py`
  (exam create/update, staff exam listing). The attempt-level reads and writes
  (`/exams/{id}/attempts`, `/exam-attempts/{id}/responses`, `/exam-attempts/{id}/proctoring-events`,
  `/exams/{id}/export-results`, unlock, grade, publish) rely on the `exams:grade` /
  `exams:proctor_view` permission alone, so any holder can reach another offering's cohort data by
  id. Any new staff-facing exam surface must resolve its offering and call the kernel.
- **Two reference documents exist and must stay honest:** `docs/qa-report.md` and
  `docs/live-qa-log.md` hold the Phase-13 audit and the 2026-10-07 live walkthrough (D1–D9, all
  repaired); `docs/completion-audit.md` holds the brief-to-status checklist, the defect register
  and the release-readiness verdict. Update the register when a defect is opened or closed — do
  not restate a claim as verified without its evidence line.
- **A capability is not a scope.** `exams:grade`, `exams:proctor_view` and `exams:create` are
  institution-wide grants; every attempt-level examination service must additionally resolve the
  exam's offering through `_assert_can_manage_exam` / `_assert_can_manage_attempt`
  (`domain/exams/service.py`). The refusal must not be confused with a missing permission, so
  `tests/test_exam_cohort_scope.py` asserts the *same actor* succeeding on their own cohort in
  the same test — otherwise a 403 could be the route gate and the test would prove nothing.
- **Attempt-level 404 precedes 403 by necessity.** An attempt id must be resolved to its exam
  before scope can be checked, so a foreign caller probing an unknown attempt gets 404. That is
  the same anti-enumeration shape used for candidates; do not "fix" it into a 403.
- **Deleting an exam question cascades to the candidate's response**
  (`ExamResponse.exam_question_id` is `ondelete="CASCADE"`). A test that walks every staff
  surface in one loop will hit 404 on the *second* pass over the grading endpoints — order the
  loops so the destructive authoring call comes last, or assert it separately.
- **The examination bureau invigilates but does not grade** (ADR-022). `allow_exam_bureau=True`
  for the proctoring timeline and the resumption path; `False` for the attempt list, the
  response queue, the results CSV, grading and publication. The bureau's role *does* carry
  `exams:grade`, so only the scope kernel can hold that line.
- **Proving a regression test bites.** Neutralise the enforcement for one run (a temporary
  `return` at the top of the helper), run the suite, confirm the expected failures, then restore
  it and re-run. `git stash` of whole files is riskier than a one-line edit that is reverted
  immediately, because other work of your own lives in the same files.

## On-device device detection: what is measured, and what a sample can hide (ADR-024)

- **Sampling by "largest first" flatters the detector.** The first version of
  `backend/scripts/fetch_device_detection_sample.py` took the twenty COCO val2017 images with the
  biggest annotated phone and produced **precision 1.000 / recall 0.950** — because those twenty
  all have a phone held against the lens (11–71% of the frame, model scores 0.86–0.99). Widening
  the sample to *every* phone image down to 0.5% of the frame (91 positives, six size buckets, plus
  100 person-only negatives) gives the honest number: **precision 0.973, recall 0.396** at the
  shipped thresholds (phoneScore 0.60, box area ≥2%), with recall by phone size
  **9/10 (>20%) · 11/11 (10–20%) · 7/8 (5–10%) · 7/17 (2–5%) · 1/16 (1–2%) · 1/29 (0.5–1%)**.
  The detector catches a phone that occupies a real part of the frame and misses small ones, and
  any single-pair precision/recall figure quoted without the size split is misleading. The lesson
  generalises: check the difficulty distribution of a labelled sample before trusting its score.
- **Reproduce with** `python backend/scripts/fetch_device_detection_sample.py` then, in a browser
  on `http://127.0.0.1:5173`, `(await import('/scripts/measure-device-detection.js')).runMeasurement()`
  (procedure in `docs/development.md`). The harness imports the shipped
  `src/features/exams/device-detection.ts` from the dev server, so it scores the real thresholds —
  a Node/tfjs-node port would measure a different implementation. It sweeps
  (phoneScore × min-area), reports recall per size bucket, timings and the false positives.
- **Run it in a fresh tab.** A tab left open for hours across many hot reloads can stall inside
  the first `analyseFrame` (a second TensorFlow.js session over a stale WebGL context never
  resolves — `Loading models...` logs, then nothing, with no error). A fresh tab does the same 191
  images in about a minute; do not wait on the stuck one.
- **A disposable sample must not live in `frontend/public/`.** Everything under `public/` is
  copied into `dist/` by the build, so the first version of this harness shipped a 113 MB
  production bundle containing the COCO stills, with nothing in the build output saying so. The
  sample now lives in `frontend/dev-measure/`, which the dev server serves at the same
  `/dev-measure/...` URLs (Vite serves any file under the project root) and the build ignores.
  When adding any large or throwaway asset, check `ls dist` after a build.
- **Cost measured on this machine:** one scan of both models 88–430 ms per frame (run-dependent),
  models load lazily in 2.6–6.8 s on the first scan only — comfortable at the three-second
  cadence with three-scan confirmation (a device is reported at ~9–12 s after it appears).
- **The wearable path is inert, not merely weak.** MobileNet's mapped ImageNet classes never
  cleared the 0.50 bar on the sample (the only outputs were `smartwatch` at 0.07 and 0.03), and
  COCO has no earbud/watch ground truth, so no wearable accuracy is claimed anywhere. Do not
  describe earbud or smartwatch detection as working until it has been measured on real footage.
- **A phone photo in a synthetic camera feed drives the whole chain.** Stub
  `navigator.mediaDevices.getUserMedia` with a canvas stream that redraws a sample phone image
  (jitter it a few pixels per frame), enable `device_detection_enabled` on a throwaway exam, and
  the candidate page reports `second_device_detected` on its own: confidence 0.983, `bbox`,
  `analysed_frame 374×480` and a ~20 KB evidence snapshot end up on the attempt, the attempt stays
  `in_progress`, the violation count is unchanged, and `flagged_for_review` becomes true. Note the
  nearly-static stub also trips `camera_obstructed` (`reason: frozen_frame_4s`) — expected, and a
  reminder that obstruction detection charges the allowance while device observation does not.
- **Exam windows are UTC and are sent with the timezone you provide.** `POST /exams` with
  `start_window`/`end_window` built from `datetime.now().astimezone()` stored a window that had
  not started yet, so `POST /exams/{id}/start` answered **400** and the begin button did nothing —
  the server compares naive UTC. Build probe windows from `datetime.now(timezone.utc)`; the seeded
  exams' timestamps read as naive UTC too.

---

## Deployment and platform operations (Wave 6)

- **Two compose projects with the same name destroy each other's data.** Compose derives a project
  name from the directory, so `docker-compose.yml` and `docker-compose.prod.yml` would both be
  `campusflow` and share containers, networks and volumes — a production `up` would recreate the
  developer's Postgres. `docker-compose.prod.yml` therefore sets `name: campusflow-prod` explicitly.
- **The backend image migrates on start** (`alembic upgrade head && uvicorn …`), which is safe for
  the single-replica deployment this stack targets and makes a first `up` self-sufficient. It is
  not safe for multiple replicas starting at once — move the migration to a one-off job before a
  rolling deploy if that ever changes. `alembic current` is the check, not the absence of logs.
- **Anything the operator must run inside the image has to be copied in.** The runtime stage copies
  only `alembic/`, `campusflow/` and `scripts/`; the first build after adding
  `provision_admin.py` / `purge_proctoring_evidence.py` failed with "can't open file
  '/app/scripts/…'" until `COPY scripts ./scripts` was added. A script that works on the host can
  still be absent from the container.
- **A fresh database has no way in without `provision_admin.py`.** There is no public sign-up (by
  design), so without the script the deployment is unusable. It needs the schema first, assigns
  `admin` + `super_admin`, is idempotent, and refuses passwords under 12 characters.
- **The Piston memory ceiling is a real cgroup kill, and a cgroup kill is `SIGKILL`.** `isolate`
  uses the same signal for "you exceeded memory" and "you exceeded time"; the observed OOM died
  after 68 ms of a 10 000 ms budget, so `_killed_by_memory()` attributes a `SIGKILL` that lands well
  inside the budget to memory and leaves a budget-consuming kill as a timeout. `SIGSEGV` stays an
  unambiguous allocator death. Without this, enabling `CODE_RUN_MEMORY_LIMIT_KB` would have labelled
  every OOM as a timeout.
- **`PISTON_RUN_TIMEOUT` / `PISTON_COMPILE_TIMEOUT` must be ≥ `CODE_RUN_MAX_TIMEOUT_MS`.** Piston
  answers HTTP 400 ("cannot exceed the configured limit") for a larger budget; the runner retries
  once at the server's ceiling, but the ceiling should never be the configured default.
- **The proxy is the only public surface.** Backend `:8001`, frontend `:8080` and Postgres `:5433`
  bind loopback; Piston has no host port at all. The SPA is served same-origin with the API, which
  keeps cookies/CSRF simple and makes `CORS_ORIGINS` one entry. The non-default loopback ports let
  the dev stack keep 5432/6379/8000/5173.
- **nginx must not cache `index.html`.** Hashed assets are immutable; the HTML entry point must
  revalidate, otherwise a deploy leaves browsers pointing at deleted bundle hashes. `frontend/nginx.conf`
  encodes that split and falls back to `index.html` for client-side routes.
- **`request_body max_size 10MB` in Caddy is a size guard, not the import limit.** The roster
  importer's own limit is 5 MiB / 5000 rows / 512 chars per cell; the proxy cap sits above it so the
  application returns a useful error instead of the connection being cut.
- **A JSON column does not track in-place mutation.** Erasing an evidence frame by
  `details.pop("snapshot")` would be silently discarded on flush; the purge assigns a new dict
  (`event.details = {…}`). Any future JSON edit in this codebase needs the same pattern.
- **`PROCTORING_EVIDENCE_RETENTION_DAYS=0` means keep.** The purge returns a no-op for `0`; reading
  it as "cutoff today" would delete every frame in the system on the first run.
- **The repo is not uniformly `ruff format`-clean**, so CI runs `ruff check` but not
  `ruff format --check` (a global format gate fails on files a branch did not touch). Format the
  files you change.
- **Docker Desktop is not always running on the verification host.** `docker compose config` is
  client-side and still validates the file, but `up`, image builds and the live checks in §7.7 need
  the daemon. Verification runs in this session started it explicitly and recorded the evidence in
  `docs/progress.md` (Wave 6).
- **The development Compose stack used to build the *production* frontend image.** `docker-compose.yml`
  pointed the `frontend` service at `frontend/Dockerfile`, whose final stage is nginx — and an nginx
  container has no Node runtime, so the documented `docker compose up --build` quickstart died on
  startup with a command it could not run. The dev service now builds `frontend/Dockerfile.dev`
  (`node:20-alpine`, `npm ci`, `vite --host 0.0.0.0`), and the Vite proxy target is
  `VITE_PROXY_TARGET` (default `http://localhost:8000`, set to `http://backend:8000` in compose)
  because the dev server's network namespace is not the host's. Production still builds `Dockerfile`.
- **README screenshots are regenerated, never edited.** `docs/images/*.png` are real captures of the
  running product at 1440×900 taken with `puppeteer-core` driving the installed Chrome
  (`headless: 'shell'`), against a **freshly seeded** database (`campusflow_shots`). Two traps: the
  Vite dev server binds `localhost` (IPv6-aware) while `127.0.0.1` may refuse the connection, and a
  database carrying manual QA leftovers (`DDS`, `G!`, `Wave2 Fresh Exam`) photographs as unfinished
  work — seed a clean database before capturing. Nothing in the product is changed to flatter a
  screenshot, so the images age as the UI evolves and must be recaptured (recipe: `docs/development.md` §5).
- **A README that quotes numbers is a claim about a specific tree.** The counts in it
  (`81 passed, 2 skipped` on SQLite, `83 passed` with `TEST_DATABASE_URL`, `0 errors` from oxlint)
  were produced by the verification run recorded in `docs/progress.md` Phase 18. Re-run those
  commands and update the README in the same commit as any change that moves them; otherwise the
  most-read file in the repository becomes the least accurate one.
- **Commit authorship is the owner's alone.** Every commit is authored and committed by
  "Sumanth Mamidi <mamidinagasaisumanth@gmail.com>"; no AI attribution, co-author trailer or
  tool footer appears in the history or in any tracked file (see `AGENTS.md` rule 8). The history
  was rewritten once, on 2026-10-18, to strip the automated co-author trailers a coding tool had
  appended, which GitHub was rendering as a second contributor — that rewrite required a force-push
  of `main`. If a tool offers to append a footer, decline: re-adding one means rewriting again.
- **A coding tool's workspace directory is ignored locally, not in `.gitignore`.** It is listed in
  `.git/info/exclude` (see that file) so the tracked ignore list carries no tool-specific names while
  `git status` stays clean. Add future tool state the same way.
- **A README logo that assumes a dark page is a bug, not a style.** GitHub renders images inside the
  page's own theme, so a transparent SVG with white text disappears on the light theme — the reason
  the first CampusFlow lockup was wrapped in a dark panel, and why the panel had to go once the
  portfolio settled on a transparent lockup. Put both palettes inside the SVG (`@media
  (prefers-color-scheme: dark)` on the wordmark classes) and never rely on a background rectangle.
- **The lockup's wordmark is text, not paths.** It uses the system font stack the other repositories
  use, so its width differs by platform. Keep a right margin of at least 20 viewBox units and verify
  with `getBBox()` in a real browser (headless Chrome with `--dump-dom` and a small measuring script
  is enough) rather than assuming the font metrics.
- **The loading screen exists twice, deliberately.** `frontend/index.html` carries the static boot
  markup and CSS so the first paint is branded before the bundle parses; `SplashScreen.tsx` is the
  React version used while `/auth/me` resolves. They must stay visually identical — change them in
  the same commit, and keep both reduced-motion aware.
- **A branch that adds nothing is still a branch.** Both `fix/*` branches were fully contained in
  `main` before removal; verify with `git log --oneline main..<branch>` (empty means contained)
  before deleting, and delete on the remote as well or the repository keeps advertising them.
- **An SVG loaded in an `<img>` and an SVG pasted inline follow different theme signals.** In an
  `<img>` (how GitHub renders README images), `@media (prefers-color-scheme)` resolves against the
  embedder's `color-scheme`, so a page that sets `color-scheme: light` gets the light fills. Inline
  in the DOM, the same media query follows the operating system and ignores the page's
  `color-scheme`. Verify badge and lockup previews through `<img>`, or the preview will lie.
- **Badge geometry is measured, not guessed.** The nine `docs/assets/badges/*.svg` files are sized
  from a Chrome measurement of the badge font (`600 11.5px` for the label, `700 11.5px` for the
  value); when a label or value changes, re-measure before editing the viewBox, and check that the
  label still clears the value chip by a few units. Displayed at `height="30"` from a 32px canvas.
- **The landing page mirrors eight screenshots.** `frontend/public/shots/*.png` are copies of
  `docs/images/` (`dashboard`, `exam-workspace`, `programming`, `course-workspace`, `examinations`,
  `question-banks`, `assessment`, `student-dashboard`), because the SPA cannot serve files from
  `docs/`. Recapture both copies together — a stale second copy photographs as an older product.
- **`/` is conditional, and that is the only public screen.** `HomePage` in `frontend/src/app/router.tsx`
  shows the landing page when signed out and the dashboard (inside `RootLayout`) when signed in;
  every other protected path still redirects to `/auth/login`. Do not add API calls to the landing
  page: it must paint without a session.
- **A lazy `<img>` without intrinsic dimensions has zero height until it decodes.** Measuring section
  offsets on a page that has not been scrolled reports collapsed heights for every section below the
  fold (the landing gallery read 687px instead of 1707px). Scroll to the bottom first, wait for the
  images, then measure — or the crops taken from a full-page capture will land on the wrong sections.
- **Headless Chrome clamps its window width near 500px.** `--window-size=390,...` does not produce a
  390px layout viewport, so a mobile screenshot comes out clipped on the right while the page is
  actually fine. Verify small breakpoints with DOM metrics (`scrollWidth === clientWidth`, computed
  font sizes, grid column counts) or `Emulation.setDeviceMetricsOverride`; treat a narrow
  `--screenshot` as unreliable rather than a layout bug.
- **A sticky header needs `scroll-mt` on every anchor target.** The landing header is 64px on
  desktop and 105px on mobile (the anchor strip adds a row), so sections carry `scroll-mt-28`;
  without it every in-page jump lands with the heading under the header.
