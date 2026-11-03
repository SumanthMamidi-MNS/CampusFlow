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
- **Observable proctoring, disclosed and on-device:** Camera cues are measured in the
  candidate's browser — presence and head direction, prohibited devices, a hand at the face and a
  sustained voice — and are recorded with browser telemetry (`tab_switch`,
  `window_blur`, `fullscreen_exit`, `copy_paste_attempt`, `context_menu`). Nothing is streamed:
  a confirmed camera cue attaches one still to the event, and no audio is recorded, stored or
  transmitted (ADR-024–032). The old "no webcam" rule from ADR-013 is historical; do not use it
  to remove the current, disclosed checks.
- **Single tolerance source:** `_resolve_max_violations(exam)` in
  `campusflow.domain.exams.service` is the only place the tolerance is read, from
  `exam.config["max_violations"]` with a default of `DEFAULT_MAX_VIOLATIONS = 10` and an authored
  range of 1–20. Under `remove` (the default) reaching it **locks** the attempt with
  `max_violations_exceeded`; it does not auto-submit. Under `review` it flags the attempt for
  faculty and the candidate keeps working. A counted warning stamps `last_warning_at` and waits
  for the candidate's acknowledgement; once acknowledged, no further warning can be counted for
  `PROCTORING_WARNING_COOLDOWN_SECONDS` (5); signals in that gap are recorded but annotated
  `suppressed_by_cooldown` (ADR-034, ADR-037, ADR-039).
- **Neutral Candidate Copy:** Warning strings must stay calm and informational. No strobe,
  no shouting, no "breach" language. Follow the responsible-UX rules in AGENTS.md §13.
- **What a cue costs is server-owned:** `_proctoring_event_disposition` in
  `campusflow.domain.exams.service` is the only classifier of a signal's cost, and
  `COUNTED_EVENT_TYPES` is derived from the vocabulary minus the evidence and review-only sets.
  A frontend list of "signals that count" is a bug waiting to happen — the brief renders the ids
  the delivery payload discloses (`counted_event_types`, `review_only_event_types`). If you add a
  signal, `test_every_signal_has_exactly_one_disposition` fails until you decide what it costs, and
  `frontend/scripts/check-integrity-signals.ts` fails until it has a candidate-facing sentence.
- **Faculty-authorised resumption:** `POST /exams/{exam_id}/attempts/{attempt_id}/unlock`
  requires `exams:grade`, is always audited, resets the recorded count and clears
  `last_warning_at`. Students receive 403. A student-facing unlock affordance must never be
  reintroduced outside the demo's own restart control.
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
- **`create_all` is not a migration, and a relative SQLite URL is not a database choice.** Two
  compounding defects broke `start.bat` after the attempt-delivery work added
  `exam_attempts.delivery_variant`: the SQLite path used to be `sqlite+aiosqlite:///./campusflow.db`,
  which `start.bat` resolved against the repository root while uvicorn ran with `backend/` as its
  working directory — so the seed wrote one file and the server served another (both existed, with
  different row counts) — and `Base.metadata.create_all` only creates *missing* tables, never a
  missing column, so the seeded file already had `exam_attempts` without the new column and every
  `SELECT` that named it raised `sqlite3.OperationalError: no such column`. The URL is now absolute
  and anchored to the repository root, and `apply_schema` runs an additive reconciliation
  (`ALTER TABLE … ADD COLUMN`, `CREATE INDEX IF NOT EXISTS`, both logged) after `create_all`. Adding
  a column to a model is therefore safe on the SQLite fallback; dropping or retyping one is not, and
  bootstrap says so instead of failing later inside a seed query.
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
- **A whole-frame classifier cannot see a watch; the wrist crop is the only path that can.** At
  exam distance a watch is a few thousand pixels of a 480 px frame, which is why the whole-frame
  read never cleared its bar. `wristCropFromNormalised` turns the hand landmarker's wrist point and
  hand span into a crop that is mostly wrist, and that crop is what the classifier is shown. Two
  things follow: the crop requires the hands to be *in view* (a watch on a hand under the desk is
  still invisible), and the hand loop must be running for the device scan to get any crop at all —
  it now runs when either `hand_monitoring_enabled` or `device_detection_enabled` is authored
  (ADR-031), but the hand-at-face monitor is still only fed when that check is authored.
- **Wiring a crop is not measuring a detector.** The wrist path changed what the classifier is
  shown, not how well it does; there is still no labelled watch footage here, so the wearable
  signal carries no claimed accuracy anywhere in the docs or the UI.
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
- **`PROCTORING_EVIDENCE_RETENTION_DAYS=0` does not mean keep.** A non-positive value falls back to
  the finite 90-day default, so a half-configured deployment can never retain candidate images
  indefinitely; the other extreme ("cutoff today", deleting every frame already captured) is
  equally unreachable.
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
- **A staff-only query must be disabled, not just hidden.** The exams index fetched the question-bank
  list for every visitor because the scheduling form's hook was mounted unconditionally, so a
  candidate opening `/exams` produced two 403s and two console errors while the form itself was
  hidden. `useQuestionBanks` now accepts an `enabled` option and the page passes the same role check
  that hides the form. Hiding a control is not a gate on the request; every query behind a
  staff-only surface needs the hook switched off for everyone else.
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
- **`position: sticky` dies inside an `overflow: hidden` ancestor.** The examination section was
  `overflow-hidden` for its radial gradients, and its pinned stage simply scrolled away — no error,
  no warning, just a blank screen where the sequence should hold. Any ancestor with `overflow`
  other than `visible` becomes the sticky element's scroll container, and a page-level scroller is
  no longer the one it sticks to. Check every ancestor, not just the immediate parent, and move the
  decorative clipping to a sibling layer if a section needs both.
- **Headless Chrome can resolve `prefers-color-scheme` to dark.** A first screenshot of the lockup
  showed only "Flow" on a white page: the wordmark's `.cf-name` had correctly switched to `#FFFFFF`
  for dark mode while the screenshot background stayed white. That is not a broken asset. When
  checking a theme-aware SVG, force the scheme you mean (`preview_set_color_scheme`) or strip the
  media query into a temporary copy, and judge the geometry — not the missing fill.
- **A contiguous-dwell detector is defeated by one good frame.** `FaceMonitor` must accumulate
  away time across a brief return, not reset its `since` whenever the condition changes, or a
  candidate can turn for 1.9 s, glance back, and turn again forever without ever reaching the
  dwell. The recovery window (1.6 s, two 700 ms scans) is what makes a return real; the cost is
  that the cover lingers for that window after the candidate faces the paper, which is the
  correct trade. A capped sample delta is equally important: timers in a background tab can fire
  minutes apart and would otherwise add the whole gap as away time.
- **Vercel is a frontend-only target for this repository.** The SPA is a static Vite build and can
  be served there, but `/api` must be rewritten to the Compose backend origin; the API needs
  long-lived FastAPI, PostgreSQL, Redis and Piston processes plus a connection pool that
  serverless functions do not provide. The client's relative `/api/v1` base URL and the
  `SameSite=Strict` refresh cookie assume one origin, so a same-origin rewrite is the simple
  split; moving the API to a second origin means revisiting cookie and CORS configuration.
- **The candidate exam `config` projection is an exact-key allowlist.**
  `tests/test_authorization_matrix.py` asserts the full set of keys returned by `GET /exams`, so
  adding a disclosure (`max_violations`) fails the leak test until the set is extended on purpose.
  That is the intended behaviour: never delete the assertion to make a new field pass, and never
  expose an authoring or grading switch there. Delivery counters (`violations_count`) belong on
  `ExamDeliveryResponse`, not in `ExamStudentConfig`.

### The landing page must be reachable without a session

`GET /auth/me` answers 401 to a visitor who has never signed in — that is correct, and it is also
the first request the SPA makes. The API client's response interceptor originally treated any 401
whose refresh also failed as a dead session and navigated to `/auth/login`, which made `/` (the
only public route) unreachable on a real backend; it only "worked" while the dev proxy pointed at a
server that answered 404 instead of 401. **Only a request that carried an access token can be signed
out.** When touching that interceptor, keep the distinction between "the session I had is gone" and
"there was never a session", and test the signed-out landing page against a running API, not a mock.

### The boot screen holds, and captures must wait for it

`main.tsx` keeps `#boot` on screen for a minimum of 1.8 *visible* seconds (`BOOT_MIN_VISIBLE_MS`,
measured from the first-contentful-paint entry, so it is time the reader saw the splash rather than
time since navigation) and then hands over in `0.42 s`. A headless capture taken at a fixed moment
photographs the splash, which looks like a broken app rather than a slow one. Poll for `#boot`
disappearing before taking any screenshot of the product — and when a script drives the SPA, seed
`access_token` and `campusflow_user` in `localStorage` first, then navigate, so the app hydrates the
intended role instead of showing sign-in.

The handover itself lives in `index.html` (`#boot.is-leaving`), not in an inline style set from JS:
the overlay fades while the mark and the copy lift ~6 px and shrink 1%, so the page behind is
revealed rather than switched on. `BOOT_EXIT_MS` in `main.tsx` must stay in step with that CSS
transition, and the removal is still guaranteed by a timer because `transitionend` never fires in a
background tab.

**Never gate the release on a frame callback.** `releaseBootScreen` was started from a double
`requestAnimationFrame`, and in a renderer that produces no frames — an occluded or backgrounded
window, a headless capture, an embedded webview — that callback never runs. The splash then sat at
full opacity over a fully painted application for its whole lifetime: `#root` had the landing page,
`performance.getEntriesByType('paint')` was empty, `document.elementFromPoint` over every button
returned an element inside `#boot`, and nothing on the page could be clicked. The poll now starts
synchronously and waits for React's first paint (`#root` child count) before dismissing, which is
what actually protects against a blank page; frames were only ever a timing nicety. If you add
work to this file, use `setTimeout` for anything that must happen.

### Engagement for the tour is derived, never latched

The landing page's screen tour stops its clock while the reader is looking closer — hover, focus,
the pause control. The first implementation set one `engaged` boolean from pointer and focus
events, and it could not be undone: pressing **Play** puts focus on the button and leaves the
pointer over it, so the very act of resuming re-engaged the pause, and the tour looked frozen.
Focus also fires on the way *out* as well as in, so a naive `setEngaged(true)` on `focusin` latches
on the blur that follows.

Derive engagement from `document.activeElement` instead of toggling it per event, treat `body`
(what Chrome reports during blur) as "nowhere", exclude the transport controls by a data attribute
so resting the pointer on Pause is not "reading", and clear the derived state when the play/pause
button is actually operated — pressing it is the reader stating intent, which outranks focus. Any
new control added to that cluster needs the same exclusion or it will freeze the tour.

### Sign-in is one seam, and it is currently closed

There is no deployed instance, so every sign-in entry point — header, hero, closing CTA, and the
`/auth/login` route if it is opened by URL — must state that plainly rather than navigating to a
portal that does not exist. The landing page funnels all its CTAs through a single
`campusflow:deploy-notice` event handled by one component, so switching to real links on deployment
day is a one-line change per CTA and one component removed, not a copy hunt. The login page carries
its own amber status panel because it is reachable directly. **When the instance is deployed, all of
these go, and the footer's "presented, not deployed" Status column changes with them** — leaving
either behind would be the dishonest direction.

### A grid child's min-content width widens a phone page

The landing page's deployment chapter originally put a terminal (`<pre>` with command lines up to
~90 characters) inside a `grid gap-8 lg:grid-cols-[...]` section. At 1024 px and above it was two
columns and everything was fine; at 390 px the implicit single column is `auto`-sized, so it took
the terminal's **min-content** width — about 530 px — and the whole document became horizontally
scrollable on a phone. `overflow-x: auto` was already on the `<pre>` and was not enough: the
min-content contribution propagates through the grid item above it. The terminal itself has since
been replaced by a presentation card, but the layout rule still applies: `min-w-0` on the grid
children (the `Reveal` wrappers), not a smaller font or a truncated command. Any future panel that
contains an unbreakable wide child — a table, a code block, a terminal — needs the same treatment
at every level between it and the grid.

Two measurement traps found while chasing it, both worth remembering:

* **A page resized after a desktop load is not a phone.** Chrome's mobile emulation only applies
  the phone layout viewport when emulation is set *before* navigation; `setDeviceMetricsOverride`
  on an already-loaded desktop page leaves some layout reads stale. Emulate, then navigate.
* **`document.documentElement.scrollWidth` can disagree with `window.innerWidth`.** Content wider
  than the device makes Chrome expand the *layout* viewport (≈700 px in this case) instead of
  scrolling, so a horizontal-overflow check must read `scrollWidth - clientWidth` at a settled
  scroll position, and verify per section with `scrollIntoView` rather than trusting one number
  taken mid-scroll.

### An unfocused tab never delivers IntersectionObserver callbacks

While verifying the landing page's tour autoplay, the tour sat frozen at 01/13 with its timer
reported as `paused`, even though the window was fully inside the viewport, `document.hidden` was
false and `prefers-reduced-motion` was `no-preference`. The page had lost input focus
(`document.hasFocus() === false`), and in that state Chrome does not deliver IntersectionObserver
callbacks — a freshly attached observer with a 400 ms budget reported nothing at all, while
`document.getAnimations()` still listed 16 running animations, so the tab was not frozen, only
unfocused.

The consequence for testing: **a headless check of anything gated on `useInView` must give the tab
focus first** (a real click on the page is enough), otherwise a correct implementation reads as
broken. It is not a product bug — a real visitor's tab has focus — but it will silently poison an
automated visual/behavioural check, and it looks exactly like a latched flag in the component.

### The staff "results" screen is not `/exams/{id}/results`

The matching image for a staff results board is easy to get wrong. `/exams/{id}/results` renders
`ExamResult`, which fetches **the signed-in user's own attempt** (`useStudentExamResult`). Signed in
as a lead, an HOD or an admin there is no attempt, so the page renders "Results Unavailable — No
exam attempt found for this student" while a caption promising candidate scores sits underneath it.
The board those roles actually get is the exam page's **Submissions & Grading** tab.

Related and deliberate: `GET /exams/{id}/attempts` and the unlock route both require
`exams:grade`, and the service enforces offering scope with "exam grading and attempt review". The
exam bureau (`exam_controller`) is **not** inside that scope, so it cannot read a candidate's
attempt record at all — the screen is empty for that role, not slow. `allow_exam_bureau=True` is
opt-in per call site and the grading/attempt routes do not opt in. A tour that shows the controller
a grading queue is therefore describing a screen the role cannot have.

Capture lesson: an empty state photographs perfectly. When a frame is meant to show rows, assert
that the rows exist (an API call as that role, or a DOM count) before trusting the screenshot.

## Integrity signals: three lessons from "I demonstrated cheating and nothing warned"

**A webcam stream requested without audio has no audio track, and no analyser can invent one.**
`getUserMedia({ video: ... })` returns a video-only stream; `AnalyserNode` fed from it reads
silence forever while the candidate screen says a voice check is listening. The capture must request
`{ video, audio }` in one call, and a refused microphone must fall back to the video-only request so
the paper still starts — with `voiceScan` honestly reporting `unavailable` rather than `active`.
Check `stream.getAudioTracks().length` before claiming to listen.

**What a cue costs is a separate decision from what it measures.** The advisory tier failed because
a cue recorded but never counted looked like a detector that did nothing, and ADR-032 answered by
charging everything — which charged the candidate for the model's error rate. The rule is now one
disposition per signal (ADR-040): a deliberate act the browser can attest to (leaving the paper,
closing or covering the camera, a device in shot) spends the allowance; an inference about the
candidate (gaze, presence, face count, hand, voice, mouth) is recorded with its measurement and
raises the review flag, and never touches the counter. `event_category` answers where a cue came
from; `disposition` answers what it costs, and conflating the two is how the inference ended up
charged in the first place. A new signal has to be added to one of the three sets —
`test_every_signal_has_exactly_one_disposition` fails otherwise, deliberately.

**Server-side duplicate debounce must not apply to a cue the client has already confirmed.**
`PROCTORING_EVENT_DEDUPE_SECONDS` collapses a repeat of the same `event_type` inside a few seconds.
That is right for `visibilitychange` + `blur` pairs and doubled listeners, and wrong for a confirmed
camera cue: the client paid the dwell, resets its episode after each report, and a candidate who
keeps the phone up has to keep climbing. The dedupe is now scoped to non-camera events.

Also worth remembering: the seeder only *inserts* missing rows, so an exam created by an older run
keeps its old `config` forever. When a policy default changes, the seed script has to repair the
row (as `scripts/seed.py` and `demo.py` now do for the integrity profile) or the running app keeps
serving the old contract while the code claims the new one.

### A demo sitting is only "fresh" if its old attempts are gone

`start_or_resume_attempt` treats **any** `locked_violation` attempt for the candidate as a permanent
lock: it answers 423 before it looks at the attempt number, the window or the allowance. That is
correct for an institution — only a lecturer's unlock should release a stopped paper — but wrong for
the demo, where the previous reviewer's seventh warning left every later "Try the demo" click on the
same stopped screen. The demo login now deletes the demo student's attempts for the demo exam before
minting the session, so attempt 1, a full 20-minute clock and a zero warning count are what the next
reviewer sees. Do not "fix" this by raising `max_attempts`; the blocker is the locked row, not the
attempt allowance.

The handover also has to be a document navigation, not `navigate()`: a demo session replaces the
signed-in identity, and the previous user's auth context and TanStack cache must not survive into the
candidate surface. `features/exams/demo.ts` clears the cached profile and uses `location.replace`, so
Back cannot restore the page the demo was launched from.

The demo endpoints are **DEBUG-only**: `main.py` mounts `demo_router` only when `settings.debug` is
true, because the endpoints mint a session anonymously and write demo rows. The production frontend
must not advertise them, and the public landing page must never call them. The exams board button is
gated on `import.meta.env.DEV`, so a production bundle does not render a control that would answer
404. That button is the only entry point; if the response shape changes, its launcher is the one
place to update.

### The brief's summary and its full disclosure share one source of truth

The candidate brief used to print every integrity paragraph at once, which pushed the camera check
and the Begin button below the fold. It now shows a four-line TL;DR plus one expander containing the
full per-check text. Both halves read the same server-echoed fields (`max_violations`,
`warning_policy`, `dwell_ms`, the cue switches, `evidence_retention_days`), so a policy change must
not be hard-coded into either half. The demo-specific sentence ("you can start a fresh sitting
straight away") is chosen by the `demo` flag, not by the paper's title.

The student tour's `student-11-exam-brief` capture is a screenshot of this screen. When the brief's
layout or its disclosed numbers change, re-shoot it with
`CF_API=... CF_APP=... CF_EMAIL=student1@campusflow.edu CF_PASSWORD=... node scratch/tour.mjs brief frontend/public/tour/student`
(a one-step `scratch/tour-brief.mjs` module), or the landing page will show an old-allowance paper
beside a ten-warning product.

### "Two tabs" was two overlays (and browser state), not a navigation

There is no `window.open` in `frontend/src`; the demo launcher uses `window.location.replace`, which
is a same-tab navigation by definition. The only new-tab links in the product are the tour's
"Full size" image, the author profile on the landing page, and a course material's external "Open
Link". Pressing "Take demo exam" was checked in the browser: the URL changed and the tab count did
not. A real second CampusFlow tab therefore comes from the browser (session restore, a manually
opened tab, or the automation/preview browser), not from the demo flow.

The two panels in the report were the **warning modal and the observation gate** rendering at the
same time: the warning sat at `z-60` over the camera gate at `z-57`. They are now mutually exclusive,
with one blocking overlay at a time in priority order (warning → camera gate → full-screen gate).
Do not reintroduce a second full-page layer "just in case"; it reads as a duplicated tab and the
count behind it contradicts the modal. The shared preview browser can still carry a background tab;
close it before treating a browser tab count as a finding.

### A mouth cue that spends warnings must earn them

`mouth_movement_detected` is opt-in and off by default (ADR-039). The pixel heuristic (mouth band
motion versus a forehead reference) fired on still, silent faces — jaw shifts, cheek movement and
compression noise can pass both `MOUTH_MOTION_MIN` and `MOUTH_DOMINANCE`. Because every confirmed
cue spends a warning, that is a false accusation with a real cost. Do not turn it back on by
default, and do not remove the voice check as the supported talking signal. The module and its
harness stay for an author who explicitly enables the experiment; the server default, the demo
config, the client fallback and the authoring form must all stay off.

### A warning ladder needs a clock between the rungs

The allowance is ten, and `ExamAttempt.last_warning_at` gates the next count. The gate is checked
inside `record_proctoring_event`, not in the browser: a client burst, a duplicated listener or a
reload cannot spend the ladder faster than the candidate can read it. The clock starts at the
acknowledgement, not the count (ADR-037), and it is five seconds since ADR-039. A signal inside the
gap is still written to `proctoring_events` with `counted: false`, `suppressed_by_cooldown: true` and
`cooldown_seconds_remaining`; a camera cue still raises the review flag. Do not "simplify" this by
deleting suppressed events — the lecturer needs the timeline, and the counter needs to explain why it
did not move.

The gate is part of the conditional `UPDATE`, not a read followed by a write (ADR-035). Two
detectors reporting in the same second used to load the same null timestamp and both increment; the
row lock plus the `WHERE` predicate now lets exactly one win. Compare epoch seconds, not datetimes
(SQLite returns naive values while PostgreSQL keeps the offset), and keep
`synchronize_session=False` on the statement. Concurrent `tab_switch` + `window_blur` and
`looking_away` + `face_not_visible` requests were both checked live: one counted, one suppressed.

Full-screen is requested synchronously at the top of `beginAttempt`, before the camera handshake or
the start request, because the click is the gesture the browser trusts. The acknowledgement button
for a warning is the second trusted moment, so it re-enters full-screen before dismissing the modal.
A browser may always refuse; the full-screen gate then asks the candidate in words and names F11 and
Control+Command+F. Native F11 is invisible to the Fullscreen API, so `document.fullscreenElement`
stays null in that mode; read `fullscreen.ts`, which also treats a viewport that fills the reported
screen as full-screen. Judging only the API element produced the "return to full screen" panel for
candidates who were already in F11 — the reported false alarm.

Chrome clears the API element one frame before F11 becomes visible to the viewport. Treat a
full-screen loss as real only after it has persisted (900 ms in `ExamDelivery.tsx`), and use the
same window for the gate and the `fullscreen_exit` event; reporting on `fullscreenchange` itself
logged an exit every time somebody switched routes. The gate is armed only after the entry promise
settles, and `canRequestFullscreen()` checks `document.fullscreenEnabled`, because
`requestFullscreen` exists even in an iframe that can never use it. The acknowledgement clock is
server-side: `warning_acknowledged_at` is set by the owner-only endpoint, and the conditional
UPDATE refuses to increment while it is null or newer than `last_warning_at` (ADR-037). Do not
move that comparison into a Python `if`; that is how the simultaneous-detector burst got through.

The test suite sets `PROCTORING_WARNING_COOLDOWN_SECONDS` to 0 in an autouse fixture, because almost
every ladder test fires three cues in a row. `test_a_counted_warning_opens_a_ten_second_gap` turns it
back to 10 and backdates `last_warning_at` rather than sleeping. If you add a test that asserts the
shipped cooldown in a payload, monkeypatch the constant to 10 in that test too; otherwise the
disclosure will read 0 under the test seam.

The landing page now shows the candidate paper and a faithful warning card in the integrity chapter.
The card is markup, not a screenshot, so it cannot drift from the copy; the paper image is the real
`student-12-exam-attempt.webp`. When the warning copy changes, update both the product and that card
(and the brief screenshot if its chips change).
