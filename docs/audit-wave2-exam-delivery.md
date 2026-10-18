# Audit — Wave 2: Exam Delivery, Full-Screen Integrity & Reliability

Date: 2026-10-09
Branch: `fix/wave-1-authorization-kernel` (HEAD `3bd587d`)
Scope: the candidate assessment journey (list → brief → start/resume → proctoring →
autosave → submit → results), the proctoring ingest path, exam configuration, and the
reliability of the running stack.
Method: live HTTP probes against the running stack (PostgreSQL + Redis + Mailpit + Piston,
FastAPI on `:8000`, Vite on `:5173`), direct database inspection, and a real-browser
walkthrough of the candidate flow.

> Every defect below was **reproduced first** and re-checked **after** the fix. Claims that
> could not be exercised in this environment are labelled as limitations, not as passes.

---

## 1. Baseline

| Item | State found |
|---|---|
| Branch / HEAD | `fix/wave-1-authorization-kernel` at `3bd587d` (Wave 1 authorization kernel) |
| Working tree | 8 files already modified but **uncommitted** (exam service/schemas/router, exam frontend) |
| Untracked | 5 agent scratch files (`backend/_*_tmp.py`, `*_resp.json`) — removed |
| Infrastructure | `campusflow-postgres-1`, `-redis-1`, `-mailpit-1`, `-piston-1` up; `qdrant` also up |
| Backend | `uvicorn` on `127.0.0.1:8000`, health `{"status":"healthy"}` |
| Frontend | Not running initially; started for verification on `:5173` (IPv6 loopback) |

Two backend processes were found: one stale server holding `:8000` whose Windows PID had
already exited (the listening socket was inherited by an orphaned multiprocessing child,
so `netstat` still attributed the port to the dead parent) and a second server on `:8099`.
Both were serving **older code than the working tree**, so every earlier "verification" was
reading a stale build. Both were stopped and a single server was started from the working
tree. This is what made the defects below invisible to the previous sessions.

---

## 2. Defects found and fixed

### D1 — P0: the assessment page did not compile at all
`frontend/src/features/exams/components/ExamDelivery.tsx`

`npm run build` (`tsc -b`) failed with three syntax errors introduced by earlier edits:

1. a section comment and the following statement had been merged onto one line
   (`// ── Begin / resume the attempt ───…  const beginAttempt = useCallback(…)`), so the
   declaration was swallowed by the comment;
2. a stray `)}` left a JSX expression unclosed in the assessment header;
3. a Python-style membership test inside a JS expression
   (`delivery.status in {'submitted', …}`).

Plus, in `frontend/src/features/exams/components/ExamsList.tsx`: a duplicated
`import { HelpCircle } from 'lucide-react'` and an unused `hasAttempt` binding.

**Impact:** the module could not be transformed, so the assessment-taking surface could not
render at all. This is the direct cause of the reported "Take Exam" failure — the button was
never the problem, the page it opened was.
**Fix:** repaired all five; `tsc -b && vite build` is clean.

### D2 — P0: a lecturer could not schedule or reschedule an examination (`PUT /exams/{id}` → 500)
`campusflow/domain/exams/service.py`, `campusflow/bedrock/audit/service.py`

`update_exam` handed the changed fields straight to the audit trail. Those fields include
`start_window` / `end_window` as `datetime` objects, which the `JSON` column cannot encode:

```
sqlalchemy.exc.StatementError: (builtins.TypeError) Object of type datetime is not JSON serializable
[SQL: INSERT INTO audit_logs (…) VALUES (…)]
```

Worse, the exam row was committed **before** the audit insert, so the edit silently applied
and the caller still received a 500. Evidence: after the first (failed) request, the exam's
window *had* changed. This also explains why every seeded examination had a stale window —
nobody could move one.

**Fix (two parts):**
- `bedrock/audit/service.py` gained `json_safe()`, a single normaliser for the whole platform
  (`datetime`/`date`/`time` → ISO-8601, `UUID` → `str`, `Enum` → value, containers recursed,
  anything else → `str`). A caller that forgets to convert a value now degrades the detail of
  one audit row instead of failing the request it was describing.
- `update_exam` now flushes, writes the audit entry, then commits, so an audited edit cannot
  be persisted without its audit record.
**Verified:** `PUT /exams/{id}` → 200; `GET` reflects the new window and config.

### D3 — P1: abandoned attempts stayed `in_progress` forever
`campusflow/domain/exams/service.py`

An attempt whose duration ran out or whose examination window closed was only ever closed if
the candidate came back and tried to save. If they closed the tab, the attempt remained
`in_progress` indefinitely — the candidate saw "Continue Attempt" for an examination that was
long over, and faculty saw a live attempt for a student who had gone home. Two such stale
attempts were present in the seeded data.

**Fix:** new `reconcile_expired_attempts(db, *, student_user=… | exam_id=…)` closes attempts
that are past their permitted duration (with a 60 s grace) or whose window has closed, using
the server clock and the attempt's own owner for the audit record. It is invoked when the
candidate's examination list is read, on start/resume, and when faculty read an examination's
attempt list — so no daemon is required and no reader can observe a stale state.
**Verified:** the two stale attempts were auto-submitted on the next list read
(`in_progress` → `auto_submitted`/`graded`), and 0 in-progress attempts remained.

### D4 — P1: proctoring ingest trusted the client
`campusflow/domain/exams/service.py`

- The recorded timestamp was `payload.timestamp or now` — a client could back-date or
  forward-date any event in an append-only trail.
- Any `event_type` string was accepted, so a client could invent signal names.
- Repeated identical signals each consumed the candidate's allowance.

**Fix:** the event kind must belong to the server-owned, disclosed vocabulary
(`PROCTORING_EVENT_TYPES`); unknown kinds are refused with **422**. The server clock is always
authoritative and a client timestamp is retained only as `details.client_timestamp`.
Repeats of the same kind within `PROCTORING_EVENT_DEDUPE_SECONDS` (3 s) are acknowledged
without consuming allowance.
**Verified live:** valid kind → 200 (count 1); repeat within 3 s → 200 with the count
unchanged; `"totally_forged"` → 422; a forged 1999 timestamp was accepted as a request but the
stored `timestamp` is the server's, with the client value demoted to `details`.

### D5 — P1: violation counts were lost under concurrency
`campusflow/domain/exams/service.py`

`attempt.proctor_violations_count += 1` is a read-modify-write across separate requests, so
concurrent signals lost updates. Reproduced in the browser: **5 `proctoring_events` rows on
attempt #3 but `proctor_violations_count = 2`**. A candidate could therefore evade the
auto-submit allowance by generating events concurrently, and faculty would be shown a count
their own trail contradicts.

**Fix:** increment atomically in SQL
(`values(proctor_violations_count=ExamAttempt.proctor_violations_count + 1)`), then re-read
the authoritative value.
**Verified:** on a fresh attempt, 3 sequential events then a 6-thread concurrent burst →
**8 event rows = 8 counter (CONSISTENT)**, previously impossible. The threshold path still
auto-submits (`auto_submitted: true`, status `graded`).

### D6 — P1: the delivery surface could not tell "begin" from "resume"
`campusflow/domain/exams/service.py`, `schemas.py`, frontend

`GET /exams/{id}/public` never loaded the caller's own attempt, and `GET /exams` never exposed
how many attempts the candidate had used. The list therefore offered "Take Exam" to a
candidate whose allowance was spent (the server correctly refused with
`Maximum exam attempts reached` / window-closed `400`), and offered "View Results" for a
retake the examination still allowed.

**Fix:** the candidate-facing summary now carries `latest_attempt_status` **and**
`attempts_used` (the caller's own data only). The list decides per examination:
`Continue Attempt` (in progress) → `Retake Exam` (concluded, allowance left, window open) →
`View Results` (allowance spent) → `Awaiting Instructor` (locked) → window labels.
**Verified** in the browser and over HTTP; a retake with allowance left starts with **200**
(this is the reported 404 path).

### D7 — P2: full-screen and clipboard policy
`frontend/src/features/exams/components/ExamDelivery.tsx`

- Three overlapping full-screen effects (including a duplicated block) were collapsed into one.
- Losing full-screen now shows an accessible `role="alert"` warning **with a deliberate
  "Return to full screen" action** — the browser only grants re-entry from a user gesture, so
  merely instructing the candidate was not enough.
- Copying question content is a best-effort deterrent (the copy is cancelled and recorded);
  `contextmenu` is suppressed over question content. Pasting, selecting and editing **inside
  answer fields is permitted and is never recorded as a violation**, and the context menu is
  left available inside answer fields for spellcheck/assistive use. Previously `paste`
  anywhere recorded a violation, which produced false signals for legitimate text answers.
- A `400` from autosave (attempt already concluded) now hands the candidate to their results
  instead of leaving them editing a page whose work can no longer be saved.

### D8 — Cleanup: agent scratch artifacts
`backend/_fix_brief_tmp.py`, `backend/brief_resp.json`, `backend/list_resp.json`,
`backend/start_resp.txt`, `backend/start_response.json` were removed from the production tree.

---

## 3. Verification evidence

### Automated
| Check | Command | Result |
|---|---|---|
| Backend suite | `python -m pytest -q` | **32 passed** (34.61 s) |
| Frontend build | `npm run build` (`tsc -b && vite build`) | **clean**, 0 TS errors |
| Frontend lint | `npx oxlint` | **0 errors**, 13 warnings (pre-existing style/react-compiler advisories) |

### Live HTTP (candidate `student1@campusflow.edu`)
- Candidate list exposes `latest_attempt_status` + `attempts_used`/`max_attempts` per examination.
- `POST /exams/{id}/start` on an examination with allowance left → **200**, delivery with
  server-computed `remaining_seconds`, `proctoring_enabled: true`, 2 questions.
- **No answer-key leak in delivery:** question fields are
  `body, id, marks, negative_marks, options, question_id, question_type, sort_order`;
  option fields are only `body, label` (no `is_correct`), and no `explanation`.
- Autosave `PUT /exam-attempts/{id}/answers` → 200 `{"status":"saved","count":1}`; the answer
  is present in `exam_responses` afterwards.
- `POST …/submit` → 200 `graded`; `GET /exams/{id}/my-result` → 200.
- Guards: autosave after submission → 400; a further start with the allowance spent → 400
  `Maximum exam attempts reached.`; a concluded window → 400 with the "submitted automatically"
  wording.
- Staff endpoints from a student session: `GET /exams/{id}` → 403; `GET /exams/{id}/attempts` → 403.

### Real browser (Vite dev server): candidate journey
Login → dashboard → Examinations → **Retake Exam** → assessment brief (with the integrity
disclosure) → **Begin assessment** → delivery canvas (countdown, 2 questions, navigator,
autosave indicator) → answer selected and **persisted** → integrity signals → **Submit
assessment** → official scorecard.

- Integrity signals raised in the page landed server-side with server timestamps:
  `clipboard_paste_attempt`, `context_menu`, `window_blur` rows in `proctoring_events`.
- The in-page notice rendered: *"Assessment-integrity notice: an off-screen activity was
  recorded. 3 of 5 allowance remaining before this session is submitted automatically."*
- The 5th recorded signal auto-submitted the attempt (`auto_submitted: true`).
- `contextmenu` over question content → `defaultPrevented: true`; paste outside an answer
  field → `defaultPrevented: false` (recorded, never blocked).
- Scorecard renders: "OFFICIAL EXAM SCORECARD", score, percentage, pass/fail, breakdown.

### Limitation — full-screen could not be exercised in this browser
The preview browser reports `document.fullscreenEnabled === true`, but
`requestFullscreen()` neither resolves nor rejects (the embedding host does not grant the
request). The refusal is **not** evidence about the product: the entry is issued from the
"Begin assessment" click handler, which is a trusted user gesture in a normal browser
window. **Full-screen entry, exit, the warning banner and the "Return to full screen" action
must be confirmed manually in Chrome/Edge.** Similarly, a real tab switch could not be
induced (the synthetic `visibilitychange` path is blocked by `document.hidden` being
read-only in the page context); the ingest side was verified directly over HTTP instead.

---

## 4. Findings reported but not changed (need a product decision)

These were left alone deliberately: they change institutional policy or the public contract.

1. **The results page always shows the *latest* attempt, not the one just completed.**
   `get_student_exam_result` selects `.order_by(desc(ExamAttempt.attempt_number)).first()`.
   On a multi-attempt examination, a candidate who finishes attempt 1 of 3 while attempt 2
   exists would be shown attempt 2's score. Suggested fix: accept an optional `attempt_id`
   (validated against the caller's own attempts) and have the scorecard request the attempt it
   just submitted.
2. **`window_blur` counts toward the auto-submit allowance.** A blur is a low-confidence
   signal — a second monitor, a notification, or a focus change can trigger it, and five of
   them end the candidate's examination. Recommendation: keep recording every signal in the
   trail (the review value is real) but weight only high-confidence signals
   (`visibilitychange`, `fullscreen_exit`) toward the allowance, or make the weighted set an
   institution setting. This is a fairness decision, not a bug fix.
3. **No uniqueness constraint on `(exam_id, student_id, attempt_number)`.** Two rows with
   `attempt_number = 1` exist for one student and one examination in the seeded data, proving
   the "concurrent start cannot create two active attempts" requirement is not enforced by the
   schema. Recommendation: a partial unique index on
   `(exam_id, student_id, attempt_number)` plus `in_progress` uniqueness, with the start path
   retried on conflict.
4. **An in-progress attempt is closed only when its surface is next read.** D3 makes this
   self-healing and cheap, but it is read-triggered rather than time-triggered. If
   institution-wide reconciliation is required (e.g. for reporting that never reads the
   candidate's list), a scheduled sweep is the next step.

---

## 5. Environment and data side effects (disclosed)

Verification wrote real records. No existing record was deleted or modified except the
deliberate configuration change below; the factory seed was not re-run and no table was
truncated.

- The **draft** examination `CS201 Live Quiz: Trees & Traversals` (`f83e3f90…`) was scheduled
  by its author (`faculty.cse@campusflow.edu`) with a window open today, so that a live
  candidate journey could be exercised at all — **no seeded examination had an open window**.
  Its config was then set to `max_attempts: 5, max_violations: 5, proctoring_enabled: true,
  show_results_immediately: true` (4 attempts are used, so today's demo can still sit it once).
- Four attempts on that quiz were created by this verification (one browser run, plus
  HTTP-level checks), their responses, proctoring events and audit entries are present.
- Two pre-existing stale attempts (on that quiz and on the published *CS201 Final*) were
  closed by the new reconciler rather than by hand.

To remove the verification attempts (they are the ones with
`attempt_number IN (2,3,4)` and any attempt started today on `f83e3f90…`):

```sql
-- inspect first
select a.attempt_number, a.status, a.started_at, count(r.id) as responses
from exam_attempts a
left join exam_responses r on r.attempt_id = a.id
where a.exam_id = 'f83e3f90-699d-43f3-9dc1-3fd6eb8f3eea' and a.started_at > '2026-10-09'
group by 1,2,3 order by 1;
```

`exam_responses` and `proctoring_events` cascade on attempt deletion; audit-log rows are
append-only and intentionally remain.

---

## 6. Files changed

| File | Change |
|---|---|
| `backend/campusflow/bedrock/audit/service.py` | `json_safe()` normaliser applied to `changes`/`extra_data` |
| `backend/campusflow/domain/exams/service.py` | `reconcile_expired_attempts`; candidate `attempts_used`; `json_safe`-safe audit ordering; hardened proctoring ingest (vocabulary, server clock, dedupe, atomic counter); clearer window-closed message |
| `backend/campusflow/domain/exams/schemas.py` | `attempts_used` on the candidate summary |
| `backend/campusflow/domain/exams/router.py` | brief docstring |
| `frontend/src/features/exams/components/ExamDelivery.tsx` | compile repairs; single full-screen entry; full-screen warning + return action; copy/paste policy; concluded-attempt redirect |
| `frontend/src/features/exams/components/ExamsList.tsx` | compile repairs; per-examination action from `attempts_used` vs `max_attempts` |
| `frontend/src/features/exams/api.ts` | list freshness; `start` invalidates list/brief; restored doc comments |
| `frontend/src/features/exams/types.ts` | `attempts_used` |

## 7. Definition of done for this wave

- [x] The candidate assessment surface compiles and renders in a real browser.
- [x] A permitted attempt starts/resumes (200) and a disallowed one is refused with an
      actionable message; "Take Exam" appears only when the server would allow it.
- [x] Full-screen is requested on begin, its loss is warned, and a gesture-driven re-entry is
      offered.
- [x] Observable integrity signals are recorded with server timestamps and attributed to the
      attempt; forged kinds are refused; repeats are not double-counted; the counter matches
      the trail.
- [x] Expired/abandoned attempts reach a terminal state without a live browser.
- [x] Answer keys never appear in a candidate payload.
- [x] Routing, autosave, submission and results verified end to end; 32/32 backend tests,
      clean build, 0 lint errors.
- [ ] Full-screen, tab-switch and a real disconnection/reconnection tested in Chrome/Edge by
      hand (this browser cannot grant full-screen).
- [ ] PostgreSQL-backed CI run and Playwright E2E remain outstanding (unchanged from Phase 13).
