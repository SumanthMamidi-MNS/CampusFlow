# Agent Guidelines for CampusFlow

This document contains permanent instructions for software engineering agents and autonomous coding assistants working on the CampusFlow repository.

---

## 1. Core Operating Principles

1. **Consult Authoritative Documentation First**
   - Always read `docs/master-plan.md` before making architectural or product decisions.
   - Consult `docs/architecture.md`, `docs/development.md`, `docs/decisions.md`, `docs/memory.md`, and `docs/progress.md` before initiating changes to related subsystems.

2. **Inspect Existing Code Before Modifying or Adding**
   - Never assume missing functionality without inspecting existing backend and frontend packages.
   - Maintain structural consistency with existing conventions and patterns.

3. **Preserve Architectural Boundaries**
   - **Bedrock (Foundation Layer):** Project-agnostic core (`campusflow.bedrock`). Must **never** import from `campusflow.domain`.
   - **Domain Modules:** Academic, examination, and LMS business logic (`campusflow.domain`). Imports from Bedrock; domain modules interact with each other via well-defined service interfaces rather than raw cross-table queries.
   - **Frontend Core vs. Features:** Reusable UI components and API/auth infrastructure live in `src/core/`. Domain-specific UI belongs in `src/features/`.

4. **Code Quality and Portability Standards**
   - Do not hardcode institution-specific names, URLs, or secrets in application logic. Configuration must be driven by settings and environment variables.
   - Never introduce temporary file paths, broken relative imports, mock placeholder architectures, or agent-specific dependencies into production code.
   - All Python imports must be absolute (`campusflow...`).
   - Frontend imports must use the `@/*` alias for `src/*`.

5. **UI & Design Philosophy**
   - The user interface must maintain a clean, accessible, modern, **light-themed institutional design**.
   - Do **not** apply dark-mode, neon, or terminal/hacker visual themes to default user workflows.

6. **Documentation Synchronization**
   - Update `docs/progress.md` after every completed milestone and phase.
   - Update `docs/architecture.md` whenever architectural boundaries, interfaces, or models change.
   - Update `docs/decisions.md` whenever significant technical choices are made.
   - Record durable discoveries, operational gotchas, and technical constraints in `docs/memory.md`.
   - Update `docs/development.md` whenever dependencies, commands, testing methods, or deployment steps evolve.
   - Documentation must accurately reflect actual working code; never state features are complete when they are not.

7. **Authorization, Scoping, and Audience Projections**
   - Backend authorization is the source of truth. Hiding a control in the UI is not security, and no frontend check may substitute for a server-side gate.
   - Every route must declare an explicit dependency: a permission (`require_permission` / `require_any_permission`), a role set (`require_any_role`), or be deliberately and obviously public (health, login). A route with no declared gate is a defect.
   - Permission alone is not enough for cohort data. Gradebook, roster, and course/exam analytics endpoints must also pass the offering-scope kernel in `campusflow.domain.courses.access` (`assert_can_manage_offering`, `assert_can_view_offering`, `visible_offering_ids`). Never re-implement scope checks inline in a router.
   - Preserve the two-projection rule: staff and students never share a response model. Candidate-facing payloads must not be able to carry answer keys, hidden test expectations, rubrics, or peer grades — see `ExamStudentResponse`, `MyCourseGradesResponse`.
   - Student-facing lookups for objects the caller may not see return **404** (anti-enumeration), not 403. Staff-facing denials stay 403.
   - `exam_controller` (exam bureau) reach is opt-in per call site with `allow_exam_bureau=True` and never extends to the gradebook.

8. **Verification and Automated Continuation**
   - Test and verify changes before marking any milestone or phase complete. Run automated test suites and ensure builds pass.
   - Fix all regressions and test failures immediately.
   - Commit completed milestones with clear, descriptive commit messages.
   - Automatically advance to the next implementation phase without pausing for confirmation until all roadmap phases or execution limits are reached.
