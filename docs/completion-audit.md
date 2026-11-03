# CampusFlow — Completion Checklist, Defect Register & Release Readiness

> **Date:** 2026-10-11 · **Branch:** `fix/wave-1-authorization-kernel`
> **Method:** every status below is tied to the evidence named beside it. Where a claim was not
> re-verified in this session, it says so and points at the record that supports it. Nothing here
> is marked complete on the strength of "the phase was implemented".

## 0. Evidence base

| Source | What it covers |
| :--- | :--- |
| Code inspection, this session | Authorization gates, camera pipeline, proctoring vocabulary, runner/Piston adapter, learning-platform absence |
| `pytest` this session | **69 passed, 2 skipped** (in-memory SQLite) — the 2 skips are the PostgreSQL-only concurrency cases; 4 of the 69 are the new cohort-boundary suite |
| `npx tsc -b` + `npx oxlint` this session | Clean (0 errors) |
| Live browser this session | FastAPI on `127.0.0.1:8000` + Vite on `127.0.0.1:5173`; demo candidate flow driven, camera pipeline exercised with a controlled synthetic stream |
| [docs/live-qa-log.md](live-qa-log.md) (2026-10-07) | Full browser walkthrough on the Docker stack (PostgreSQL + Piston), D1–D9 repaired and re-tested |
| [docs/qa-report.md](qa-report.md) (2026-10-06) | Phase-13 independent audit and its 22 findings/repairs |
| [docs/progress.md](progress.md) | Phase 0–17 implementation record |

**Environment limits in this session:** the Docker daemon is down, so PostgreSQL, Redis, Mailpit
and Piston were **not** exercised; the agent browser has **no physical camera**; and the seeded
dev database is the SQLite file behind `backend/.env`.

---

## A. Camera (spec §1)

| Acceptance criterion | Status | Evidence |
| :--- | :--- | :--- |
| Preview displays actual, continuously updating frames | ✅ | Synthetic asymmetric stream drove the tile: `currentTime` advanced (180.5 s), `readyState` 4, 320×240; the user's own browser screenshot shows their face |
| A black preview cannot be reported as ready | ✅ | Readiness requires a *live track* + frame ≥ 64×48 + progressing clock + sampled pixels; the previous 2×2-placeholder bug that let a black tile say "ready" was fixed and re-tested (black feed → "sending a black picture", Begin disabled) |
| Permission denial produces useful guidance | ✅ verified live | Agent browser has camera **denied** for the origin; the page short-circuits with "Camera access is blocked for this site… use the camera icon in the address bar", without ever calling `getUserMedia` |
| Missing hardware / unsupported browser | ⚠️ implemented, not exercised | `unsupported` and `idle` states carry guidance; no device-free path was run on hardware-less input |
| Refresh, remount, reconnect, recovery | ✅ | Fresh mount binds the existing stream; "Restart camera" stops the old tracks (verified `ended`), requests again and restores readiness; Ctrl+R no longer signs the candidate out |
| Camera resources released when no longer needed | ✅ | Tracks stopped in `restartCamera` and on unmount; the previous session observed old tracks end after restart |
| Multiple requests never create conflicting streams | ✅ | `startCamera` reuses a live track; restart releases before re-requesting |
| Status never contradicts the preview | ✅ | "Camera ready" is gated on verified frames, not on permission or track state |
| Preview orientation (left/right) | ✅ fixed this session | Self-view is mirrored via a single `SELF_VIEW_STYLE` (`matrix(-1, 0, 0, 1, 0, 0)`); raising the **right** hand now shows the hand on the **right**, as a mirror does |
| Recorded frames keep the camera's true orientation | ✅ | `drawImage` from the video element yields raw pixels: probe showed left = red, right = blue while the screen shows the mirror |
| Real-camera hand-raise confirmation | ⚠️ **yours to do** | No physical camera exists in the agent browser; the fix is verified structurally and with a controlled asymmetric stream |
| "Frames are saved to your lecturer's integrity log" is true | ✅ | 60 s capture → `camera_snapshot` event (data URL, ≤400 000 chars) → persisted on the attempt → rendered in `ExamDetail` for staff with `exams:proctor_view` |
| Retention / erasure policy for those frames | ❌ | No scheduled purge or erasure workflow exists; frames live as long as the attempt row |

### Copy/selection, full-screen, obstruction, warnings and examiner security (audited 2026-10-11)

| Brief item | Status | Evidence |
| :--- | :--- | :--- |
| §1.2 Copy/cut/paste and content protection | ✅ with disclosed limits | `ExamDelivery.tsx`: copying question content is blocked (`preventDefault`) and recorded as `clipboard_copy_attempt`; the context menu is suppressed over question content and recorded; paste is permitted inside answer fields and only *recorded* elsewhere. Editable targets are exempt, so typing, keyboard navigation, assistive technology and accommodations are untouched. A web page cannot block OS-level shortcuts, screenshots, a second device or another browser — stated as a limitation, never claimed as prevention |
| §1.3 Full-screen enforcement and recovery | ✅ | Full-screen is requested synchronously on the Begin click and again when a warning is acknowledged — both trusted gestures — before the camera handshake or start request. `fullscreen.ts` counts both the Fullscreen API and the browser's own F11 mode (a viewport that fills the reported display), so a candidate who is already full-screen is never told to return to it; a loss is acted on only after it persists 900 ms, which prevents a false panel and a false `fullscreen_exit` when moving between the two routes (ADR-038). The paper is covered behind a return gate until re-entry (not merely annotated), and the gate names F11 / Control+Command+F when the browser refuses. Where `document.fullscreenEnabled` is false the paper stays usable with an instruction banner instead of an impossible gate. The server timer and saved answers are untouched, and repeated exits are recorded normally. Detector pinned by `scripts/check-fullscreen.ts` (11 checks) |
| §1.5 Obstruction threshold | ⚠️ partial (D-12 open) | A four-second continuous still-frame window reports `camera_obstructed` once (recovering silently), and a pure-black feed is *not* reported as obstruction — it is named as a black picture with actionable guidance. The threshold is a client constant, not an administrator setting (D-12). It consumes the allowance **by explicit decision** (2026-10-12, D-13) |
| §1.6 Warning policy | ✅ resolved | Warnings are persisted on the attempt and server-owned (`config.max_violations`, default **10**, authored 1–20), and every confirmed cue — browser event or camera measurement — spends one (ADR-032). A counted warning stamps `last_warning_at` and stays pending until the candidate acknowledges the modal; the ladder cannot move at all in that state, so a second detector can never replace the warning being read. The acknowledgement starts the disclosed **5 s** gap (ADR-037/ADR-039), and signals inside it are recorded with `suppressed_by_cooldown` but do not move the counter (ADR-034). The mouth-movement cue is opt-in and off by default (ADR-039); the second-voice check is the supported talking signal. The gate is the WHERE clause of the counter UPDATE, so simultaneous detectors cannot both count (ADR-035); one blocking overlay at a time keeps the warning, the camera gate and the full-screen gate from stacking (ADR-036). The policy is disclosed before starting, with two authored outcomes (ADR-023): **remove** (default, ADR-015 lineage) or **review**, which flags the attempt for faculty at the authored limit while the candidate keeps working |
| §1.10 Examiner security | ✅ verified | Another student's attempt cannot be written to (`AuthorizationError`), event names outside the server vocabulary are refused (422), oversized evidence frames are refused (422), the recorded time is the server's, hidden answer material is absent from every candidate payload (canaried by `test_authorization_matrix.py`), the route table cannot grow an ungated endpoint (`test_route_policy.py`), and cross-offering reads are now refused (D-1) |
| §1.7 Electronic-device detection | ✅ **built and measured, with disclosed limits** (D-16 closed, ADR-024) | On-device only: COCO-SSD localises a `cell phone` and MobileNet v2 covers the electronics classes COCO lacks, over a 480px frame in the candidate's browser (no stream, no frame sent for analysis). Reported after 3 consecutive agreeing scans, at most once per category per 120 s, and on the server it is a **counted warning** — recorded with its evidence frame and raising the faculty review flag (ADR-032), never a verdict on its own. Authored per exam (`config.device_detection_enabled`, default on) and disclosed in the candidate brief before it starts. **Measured** against COCO val2017 (91 phone images bucketed by size + 100 person-only negatives): precision **0.973**, recall **0.396** at the shipped thresholds, with recall by phone size 9/10 (>20%), 11/11 (10–20%), 7/8 (5–10%), 7/17 (2–5%), 1/16 (1–2%), 1/29 (0.5–1%) — it detects a phone that is a substantial part of the frame and misses small ones. Wearables are **unmeasured** (no COCO ground truth; the classifier never cleared its 0.50 bar), and stills are not webcam footage, so these numbers bound the detector rather than promise field performance. Verified live end-to-end (probe attempt, synthetic phone in the camera feed → `second_device_detected`, confidence 0.983, bbox + 20.5 KB evidence frame stored, attempt still `in_progress`, violation count unchanged, review flag raised) |
| §1.9 Live invigilator console | ⚠️ partial (D-17) | Faculty do get the integrity log per attempt (timeline → `ExamDetail`), but there are **no live tiles**: the candidate streams nothing, and evidence arrives as a 60-second `camera_snapshot` per attempt. There is no multi-candidate view, no per-feed inspection, no disconnect/obstruction indicator in a wall, and no pagination for large cohorts |

---

## B. Python learning course (spec §2)

**Status: ❌ not implemented.** This is the largest unmet item in the brief.

Evidence: `backend/campusflow/domain/` contains `academic_terms, analytics, announcements,
assignments, courses, departments, enrollments, exams, institution, materials, notifications,
programming, question_banks, roster_import, users` — there is **no learning/lesson/quiz module**.
The frontend router exposes no lesson or learning route (`/courses/:id` tabs are Announcements,
Materials, Assignments, Gradebook, Roster), and no lesson, quiz, progress or capstone models
exist anywhere.

What does exist and is reusable as the platform's foundation:

- Courses, offerings, sections, enrolment and the offering-scope kernel (`domain/courses/access.py`).
- `materials` — per-offering files/text (not a lesson structure: no objectives, no ordering into
  modules, no completion).
- `programming` — graded coding problems with sample/hidden test cases, submissions and per-test
  results, executed by Piston (see §D).
- `assignments` — submission and grading.

So: syllabus/modules, lesson content, guided practice, interactive exercises, module quizzes,
capstone, resume-learning and progress tracking are all **not built**. The course cannot be
opened in CampusFlow today because it does not exist.

**Scope note:** a lesson/quiz course platform is also absent from the approved scope in
[docs/master-plan.md](master-plan.md) — that plan's teaching surface is *materials*,
*assignments* (type `quiz`), *question banks* and *exams*, and its only mention of learning is
"learning analytics … beyond a core LMS" in the deferred list. Building the Python course is
therefore a scope *addition*, and needs a plan entry plus an ADR for the learning engine before
implementation, not a silent extension of the existing modules.

---

## C. Full application audit (spec §3)

| Area | Status | Notes |
| :--- | :--- | :--- |
| Phases 0–17 implemented | ✅ documented | Roster import, multi-section assessment, campus-lead invariant, duplicate prevention, exam delivery, authz kernel waves |
| Independent audit performed | ✅ | Phase 13 (22 findings) + live QA (D1–D9), all repaired and re-tested |
| All six roles exercised live | ⚠️ partial | The 2026-10-07 walkthrough drove **super_admin + student** and probed role guards; the other four roles have no live-browser evidence |
| Authorization gates on every route | ✅ automated | `tests/test_route_policy.py` enforces a declared gate per route |
| Offering-scope kernel on cohort endpoints | ✅ fixed 2026-10-11 | D-1 closed: attempt/review/grade/export/publication services resolve scope through `_assert_can_manage_exam` / `_assert_can_manage_attempt`; ADR-022; `tests/test_exam_cohort_scope.py` (4 tests, proven to fail without the enforcement); live HTTP matrix with real logins |
| Two-projection rule (staff vs student payloads) | ✅ | Test-covered; candidate payloads carry no keys/rubrics |
| Migrations, constraints, concurrency | ⚠️ | PostgreSQL migration + constraints verified 2026-10-07 and in Waves 3/4; not re-run this session (Docker down) |
| Exports, notifications, analytics | ✅ documented | `test_notifications_and_analytics.py`; CSVs in the exam/course surfaces |

---

## D. Compilation, execution and judging (spec §8)

| Language | Status | Evidence / gap |
| :--- | :--- | :--- |
| Python | ✅ verified against real Piston | 2026-10-07: `print(1+1)` → `2`; real submission `PASSED 10/10`, hidden cases labelled `(hidden)` with expected outputs never exposed |
| C | ⚠️ unverified | The adapter sends `language: "c"` with `main.c`; no executed run, no test coverage |
| C++ | ⚠️ unverified | As C, with `main.cpp` |
| Java | ⚠️ unverified, convention risk | Filename is always `Main.java`; a student class named anything else fails to compile under Piston's Java runtime |
| SQL | ❌ not implemented | No SQL executor, no disposable assessment database, no isolation story |

Pipeline and grading:

| Requirement | Status | Evidence |
| :--- | :--- | :--- |
| Student code never runs inside the API process | ✅ | `campusflow.bedrock.runner` → Piston over HTTP |
| Fail-closed when the sandbox is down | ✅ test-verified | HTTP 503, never a fabricated result |
| Compile errors vs runtime errors vs wrong answer vs timeout | ✅ | Piston compile stage, signal mapping (`SIGXCPU`/`SIGKILL` → timeout, `SIGSEGV` → memory), per-test comparison |
| Time limits | ✅ | Per-problem budget with a single retry inside the sandbox ceiling |
| Memory limits enforced | ⚠️ **off by default** | `CODE_RUN_MEMORY_LIMIT_KB=0` on the verified host because isolate SIGKILLed capped runs; the ceiling exists but is not applied |
| Output limits | ✅ | `max_output_bytes` truncation with an explicit marker |
| Hidden tests stay server-side | ✅ test-verified | Hidden expectations never serialized to students |
| Comparison rules | ⚠️ | `trimmed` / `exact` only — no numeric tolerance; partial scoring exists per test case, aggregate verdict is deterministic |
| Concurrency safety | ⚠️ partial | Global semaphore in `run_code()`; no evidence of protection against duplicate/concurrent submissions for one student+problem |
| Programming grade → official gradebook | ⚠️ unverified | Submission scores persist per problem; no verified path into course gradebooks |

---

## E. Repair process, tests and docs (spec §4/§5)

| Requirement | Status |
| :--- | :--- |
| Reproduce → root cause → fix → regression test → browser re-test → docs | ✅ followed for every defect this wave (camera, session, orientation, authz) |
| PostgreSQL-backed integration tests where the DB matters | ❌ not run this session (Docker down); the 2 skipped concurrency criteria are exactly the PostgreSQL-only ones |
| Real-browser E2E (Playwright or equivalent) | ❌ not written (`frontend/package.json` has no Vitest/Playwright/Cypress; no CI) |
| Defect register with severity/repro/files/evidence | ✅ `qa-report.md`, `live-qa-log.md`, and §F below |
| Docs synchronized with reality | ✅ this session: `architecture.md` proctoring claim corrected, `progress.md` and `memory.md` updated, this file added |

---

## F. Defect register (open items first)

| ID | Severity | Defect | Repro | Files | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **D-1** | **High** | Exam/attempt **staff** endpoints were gated by permission alone — no offering-scope kernel. Any user with `exams:grade` / `exams:proctor_view` could read another offering's attempts (names, emails, scores, violation counts), responses, integrity timeline **including camera frames** and results CSV, and reopen/grade/publish, by supplying that offering's id | Was: a lecturer of offering A, `GET /api/v1/exams/{exam_of_offering_B}/attempts` → 200 with real cohort data | `domain/exams/service.py`, `domain/exams/router.py`, `tests/test_exam_cohort_scope.py`, ADR-022 | **Fixed 2026-10-11** — wiring + 4 regression tests (proven to fail when the assertion is neutralised) + live HTTP matrix: own lecturer 200, foreign lecturer 403, candidate 403, bureau 200 on invigilation / 403 on gradebook |
| D-11 | Medium (policy) | The warning ladder in the new brief (warnings 1–5, review at 5) differed from the shipping policy: reaching `config.max_violations` **removed** the candidate (`locked_violation`) until a lecturer reopened the attempt | Set `max_violations` low and drive N events: the attempt locks at the threshold | `domain/exams/service.py` `record_proctoring_event`, `domain/exams/schemas.py`, `ExamDelivery.tsx`, `ExamsList.tsx`, `tests/test_warning_policy.py`, ADR-023 | **Resolved 2026-10-12** — per-exam `config.warning_policy`: `remove` (default) or `review`. Under `review` the attempt is flagged once, audited once, and stays `in_progress`. Verified live: 1/3 → 2/3 → 3/3 flagged, 4/3 still working, answers saving (200), paper resumable |
| D-12 | Low | The four-second obstruction threshold is a client constant (`CAMERA_OBSTRUCTION_AFTER_MS`), not an administrator-configurable per-exam setting as the brief requires | Inspect `ExamDelivery.tsx` | `ExamDelivery.tsx`, `exams.config` | **Fixed** — `config.obstruction_threshold_seconds` (default 4, bounded 2–30) is validated at authoring time, resolved server-side, sent in the brief and delivery payload, enforced by the client poll and authored in the exam form (`tests/test_warning_policy.py`, `test_authorization_matrix.py`) |
| D-13 | Medium | `camera_obstructed` consumes the candidate's violation allowance even though it is framed as an evidence signal (it is absent from `NON_VIOLATION_EVENT_TYPES`) — a covered lens or a sleeping camera can therefore consume an allowance entry | Cover the lens for four seconds once | `domain/exams/service.py` | **Resolved 2026-10-30 (ADR-032)** — every confirmed camera and microphone cue (`camera_off`, `camera_obstructed`, `looking_away`, `face_not_visible`, `multiple_faces_detected`, `second_device_detected`, `hand_near_face`, `voice_detected`, `mouth_movement_detected`) spends exactly one warning, on the same ladder as browser telemetry, and still raises the review flag. The earlier review-only tier and its "does not use the allowance" copy are superseded. Pinned by `test_proctoring_security.py`, `test_demo_exam_and_integrity_vocab.py`, `test_integrity_profile.py`, `test_warning_policy.py`. **Superseded in part 2026-11-03 (ADR-040)** — the six inference cues (`looking_away`, `face_not_visible`, `multiple_faces_detected`, `hand_near_face`, `voice_detected`, `mouth_movement_detected`) are review-only again: recorded with their measurement, flagged for the lecturer, never counted and never able to lock. The deliberate acts (`camera_off`, `camera_obstructed`, `second_device_detected`) stay counted, which was the defect this row actually named. Pinned by `test_integrity_profile.py::test_every_signal_has_exactly_one_disposition` and `::test_inference_cues_are_recorded_and_never_counted` |
| D-14 | Low (documentation) | No restriction can stop OS-level shortcuts, screenshots, a second device or another browser. The brief requires these limits to be documented rather than claimed impossible | — | `docs/architecture.md` | Partially documented in the copy and the brief; the architecture section states the limits |
| D-2 | Medium | Camera evidence frames have **no retention or erasure policy**: they persist with the attempt indefinitely | Was: `proctoring_events.details.snapshot` had no lifecycle | `domain/exams/service.py`, `scripts/purge_proctoring_evidence.py`, `docker-compose.prod.yml`, `ExamDelivery.tsx`, ADR-026 | **Fixed 2026-10-12** — `PROCTORING_EVIDENCE_RETENTION_DAYS` (default 90) drives a daily purge that erases the image, keeps the event with `evidence_purged_at`, and audits `proctoring.evidence_purge`. A non-positive setting falls back to the finite 90-day default and cannot disable erasure. Disclosed to candidates. Verified: expired erased, recent kept, non-evidence untouched, second run a no-op |
| D-16 | ~~**High (feature absent)**~~ | **Electronic-device detection did not exist** — no model, dependency or inference, no client emitting a device event, `second_device_detected` vocabulary-only. Re-adding it reversed **ADR-013** (which removed camera "detection" that was canvas heuristics presented as AI) and so needed an explicit decision about where inference runs, what a positive means and what accuracy claim is defensible | Was: `grep -rniE "onnx|tensorflow|tfjs|coco-ssd|yolo|mediapipe" frontend/src backend/campusflow` → nothing | `device-detection.ts`, `ExamDelivery.tsx`, `service.py`, `schemas.py`, `frontend/scripts/measure-device-detection.js`, `backend/scripts/fetch_device_detection_sample.py`, ADR-024 | **Resolved 2026-10-12 (ADR-024)** — implemented on-device, disclosed per exam, server treats it as a counted cue + review flag (never a verdict), and measured: precision 0.973 / recall 0.396 overall with a size curve (0.90 above 20% of the frame, 0.41 at 2–5%, 0.03 below 1%). Wearable accuracy remains unmeasured |
| D-17 | Medium | **Live invigilator tiles absent.** Faculty have a per-attempt integrity log, but no live wall, no per-feed inspection, no disconnect/obstruction indicators and no pagination; the client sends a 60 s still frame rather than video and would need WebRTC/stream server work. ADR-012's video wall was removed by ADR-013 because it displayed fabricated candidates | Inspect `ExamDelivery.tsx` (`SNAPSHOT_INTERVAL_MS = 60_000`) and the absence of any tile component; `grep` for a stream endpoint finds none | `ExamDelivery.tsx`, `ExamDetail.tsx`, transport | **Open** — once scoped with D-16, now independent of it (D-16 closed on-device; a live wall would need transport work, not detection work) |
| D-3 | High | **Python learning course absent** (spec §2 entirely unfulfilled) | Visit `/` as a student → no course/lesson surface exists | — | Open — see §B |
| D-4 | High | C, C++, Java and SQL are **advertised by the adapter but unverified**; SQL has no implementation | Piston down in this environment; no tests per language | `bedrock/runner/piston.py`, `domain/programming/*` | Open — see §D |
| D-5 | Medium | Memory ceiling is **not enforced** on the verified host (`CODE_RUN_MEMORY_LIMIT_KB=0`) | Was: no cap was sent to the sandbox | `docker-compose.prod.yml`, `.env.production.example`, `bedrock/runner/piston.py`, `tests/test_runner_classification.py` | **Fixed 2026-10-12** — production sends 128 MB and Piston runs privileged, so the cap is enforced: a 512 MB allocation is killed (`SG`/`SIGKILL`) while normal runs complete. Also fixed the classification that reported an OOM kill as a timeout |
| D-6 | Medium | No frontend E2E/component suite and no CI pipeline | `frontend/package.json` | `.github/workflows/ci.yml` | **Partially fixed 2026-10-12** — CI runs the full backend suite against PostgreSQL, `ruff check`, frontend lint and the typechecking build, and asserts the measurement sample never reaches `dist/`. A browser-driven E2E journey is still absent |
| D-7 | Low | `architecture.md` claimed "no webcam capture" while camera-integrity mode captures evidence frames | Doc text | `docs/architecture.md` | **Fixed this session** |
| D-8 | High | "Camera ready" could sit over a 2×2 placeholder of a stopped track (the timeout-path `stop()` killed the just-granted stream) — the black-tile-reported-ready bug | Turn on camera with a real device | `ExamDelivery.tsx` | **Fixed** — verified in the user's browser (their face renders) |
| D-9 | High | Ctrl+R signed the candidate out: `/auth/me` was excluded from the refresh retry, the demo identity used a reserved TLD (`EmailStr` 500), and `localhost` resolved to another project's dev server on `[::1]:5173` | Reload the exam page | `core/api/client.ts`, `core/auth/context.tsx`, `bedrock/auth/cookies.py`, `domain/users/auth_router.py`, `domain/exams/demo*.py` | **Fixed** — session survives reload; use `http://127.0.0.1:5173` |
| D-10 | Medium | Self-view was un-mirrored while the copy claimed "exactly what your camera sees — not mirrored": a raised **right** hand read to the candidate as their **left** hand | Turn on camera, raise right hand | `ExamDelivery.tsx` | **Fixed this session** — mirrored self-view, evidence frames stay true, copy corrected |
| D-15 | Medium (latent, platform-wide) | The API's 422 handler put Pydantic error entries straight into `JSONResponse`, and a custom validator that raises leaves that exception object in `ctx` — so **any** validator raising an exception turned its intended 422 into a 500 whose body failed to serialize (`TypeError: Object of type ValueError is not JSON serializable`) | Before the fix: `POST /api/v1/exams` with `config.warning_policy="lockout"` (now 422) | `bedrock/api/errors.py` | **Fixed 2026-10-12** — every error field is encoded individually, degrading to its string form rather than taking the response down. Found while adding D-11 validation |

| D-18 | **High (found 2026-10-12)** | The anonymous demo surface (`/exams/demo/prepare`, `/exams/demo/login`) was mounted in **every** build, including `DEBUG=false` — a production instance accepted an unauthenticated request that created demo accounts/course/exam and minted a session. Demo objects only, but an anonymous write surface and a public sign-in do not belong on a live site | `curl -X POST http://host/api/v1/exams/demo/login` against the production stack returned 200; now returns 404 | `campusflow/main.py`, `tests/test_route_policy.py` | **Fixed 2026-10-12** — the demo router is mounted only when `DEBUG=true`; production answers 404 and the route-policy test pins both directions |

---

## G. Prioritized repair plan

1. ~~**D-1 — scope kernel on exam/attempt staff endpoints**~~ — **done 2026-10-11** (ADR-022,
   `tests/test_exam_cohort_scope.py`, live HTTP matrix).
2. **D-3 — Python course**: the largest unmet requirement, and the only one that is also absent
   from the approved master plan, so it needs a plan entry plus an ADR for the learning engine
   (lesson/quiz/progress models on the existing course + programming infrastructure) before
   content authoring begins.
3. ~~**D-11/D-13 — warning policy**~~ — **done 2026-10-12** (ADR-023): per-exam
   `config.warning_policy` with removal as the default and the review ladder as the alternative;
   `camera_obstructed` stays a charged warning by decision. The same pass found and fixed **D-15**
   (custom validators were turning 422s into non-serializable 500s).
4. ~~**D-12 — obstruction threshold**~~ — **done**: per-exam `config.obstruction_threshold_seconds`
   with the four-second default, bounded, disclosed and enforced.
5. **D-4 — language matrix**: verify C, C++, Java against the real Piston runtimes, add the Java
   class-convention handling, and implement the SQL executor against a disposable database.
   (D-5 is done: the production stack enforces the 128 MB cap and OOM is no longer reported as a
   timeout.)
6. ~~**D-2 — camera evidence retention**~~ — **done 2026-10-12** (ADR-026): institution window,
   daily erasure audited and disclosed.
7. **D-6 — E2E/CI**: CI exists and runs the suite on PostgreSQL; what is still missing is
   Playwright journeys for the candidate exam flow and the programming workspace.

## H. Release readiness

- **Demo-ready now:** the exam journey (brief → camera check → timed attempt → autosave →
  integrity trail → submit → scorecard), teaching flows (courses, materials, assignments,
  grading, question banks), programming with the real sandbox, notifications, analytics and
  exports — on SQLite. Staff cohort data is now confined to the teaching offering (D-1 closed,
  ADR-022), verified live with real accounts.
- **Deployable now:** one `docker-compose.prod.yml` stack (static SPA + API + Postgres + Redis +
  Piston + Caddy + backups + evidence retention), a first-admin provisioning script, and a runbook
  in `docs/development.md` §7. Verified on this host through the proxy: SPA and API served, 401 for
  unauthenticated access, a real login, a restorable 115 KB dump, and an enforced memory ceiling.
  D-2 (evidence retention) and D-12 (obstruction threshold) are closed; D-5 and the CI half of D-6
  are closed.
- **Not institution-ready yet:** D-3 (the required Python course), D-4 (advertised-but-unverified
  languages, no SQL), D-17 (live invigilator tiles absent), and the browser-driven E2E journeys
  still missing from D-6. PostgreSQL-backed tests now run in CI, but no GitHub Actions run has been
  observed here.
- **Device detection is no longer on that list but has its own limit to state:** it is built,
  disclosed, evidence-only and measured (D-16 closed, ADR-024) — but recall falls away below
  about 5% of frame area, so it catches a phone held up rather than a phone on a desk at the
  edge of the frame, and wearable detection is unmeasured and effectively inert.
- **Not verifiable by an agent in this environment:** real-camera orientation on hardware, Docker
  services, and anything requiring a second physical device.
