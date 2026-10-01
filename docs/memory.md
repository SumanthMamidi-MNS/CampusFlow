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
- **Zero-Tolerance Prohibited Hardware Detection:** Detection of mobile phones, smartwatches, or secondary devices (`mobile_phone_detected`) skips the warning countdown entirely, instantly locking the session to `locked_violation` and requiring faculty re-entry authorization.
- **Strict 6-Warning Escalation:** For non-fatal infractions (gaze deflections, window blur, tab switches), exactly 6 warnings are permitted. On warning 6, the attempt is immediately terminated and placed into `locked_violation` state with `auto_submitted: true`.
- **Fixed Position Browser Lockdown:** In Chromium browsers, calling `window.history.pushState(null, '', window.location.href)` on mount establishes a history state that enables the `popstate` event to intercept and trap back-button navigation. Intercepted events record a `navigation_attempt` violation while keeping the student securely on the exam canvas.
- **High-Urgency Visual Strobe Border:** Applying a full-viewport blinking red strobe border (`animate-pulse border-8 border-rose-600 bg-rose-500/15`) provides immediate, unmissable feedback to candidates that an infraction occurred.
- **Faculty Re-Entry Authorization:** Locked attempts cannot be resumed without an instructor or proctor invoking `POST /exams/{exam_id}/attempts/{attempt_id}/unlock`. Unlocking resets violation locks and restores status to `in_progress`.
- **Answer Durability:** Client answers are synchronized to localStorage and debounced server PUT requests; upon unlock, student returns to the delivery screen with all previously entered responses intact.
- **Live Vision Proctoring Heuristics:** Client-side camera analysis runs offscreen without raw video streaming to avoid privacy violations or bandwidth costs, reporting discrete gaze events (`side_viewing`, `looking_down`, `face_missing`, `multiple_faces`) with biometric simulation fallback.
- **Proctor Communication Boundaries:** All candidate inquiries during proctored exams must be strictly 1-to-1 between the candidate and the invigilator via the Proctor Help Desk. Student-to-student peer chat is disabled.


