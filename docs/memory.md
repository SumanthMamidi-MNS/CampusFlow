# Engineering Memory & Constraints

This document preserves durable technical context, implementation constraints, and discovered system behaviors for CampusFlow.

---

## 1. Environment & Platform Nuances

### Operating System & Shell (Windows PowerShell)
- The host environment runs **Windows with PowerShell**.
- Avoid chaining directory changes (`cd`); always pass explicit relative or absolute paths or specify the working directory parameter.
- Remember path quoting when dealing with paths containing spaces (e.g. `Anti Gravity`).
- Use cross-platform path handling in Python (`pathlib.Path`).

### Python & Database (SQLAlchemy 2.x Async)
- **SQLAlchemy 2.0+ Async Style:** All models must use the modern `Mapped[...]` and `mapped_column(...)` declarative syntax.
- **Async Engine:** Always use `asyncpg` as the database driver (`postgresql+asyncpg://...`).
- **Session Lifecycle:** Always use the async generator dependency `get_db()` which guarantees proper transaction commit/rollback and connection closure.
- **Pydantic Settings v2:** `SettingsConfigDict` is configured with `case_sensitive=False` and no prefix, allowing standard environment variables (`DATABASE_URL`, `REDIS_URL`, `DEBUG`, etc.) to map directly to settings fields without prefix duplication.

### Frontend (React 19, Tailwind CSS v4, TypeScript)
- **Tailwind CSS v4:** Configuration uses `@import "tailwindcss";` in `src/index.css` with the `@tailwindcss/vite` plugin.
- **TypeScript Aliases:** The path alias `@/*` maps to `./src/*` across both `tsconfig.app.json` and `vite.config.ts`.
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
- **Proctoring Privacy:** The proctoring system is observable and behavioral only. Do not introduce webcam, audio, or biometric collection.
