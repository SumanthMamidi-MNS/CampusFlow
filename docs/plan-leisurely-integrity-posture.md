# CampusFlow — Integrated Plan: A Leisurely Integrity Posture

Status: **Implemented 2026-11-03 — ADR-040.** §9's evidence block was run on this tree; the wave
states below are kept as the record of the plan, not as current status.
Date: 2026-11-03 (plan), 2026-11-03 (implemented)
Base: working tree after ADR-039 (5 s gap, mouth cue opt-in and off by default).

> **Honesty rule.** Nothing below was claimed to work until the named test in
> `backend/tests/` reproduced it and the named command in §9 had run. §0 records
> the behaviour this plan replaced; the dispositions in §1 are now the shipped
> contract.

> **The request, in one sentence.** Keep the integrity system observable and
> evidence-based, but make it *leisurely*: an act the candidate deliberately
> performs against the paper (switch tab, close the camera, cover the lens, put a
> phone in shot, copy, exit full-screen) spends the allowance; a measurement a
> model infers *about the candidate* (looking away, no face, two faces, a hand at
> the face, a voice, mouth motion) is recorded, raises the lecturer's review flag,
> and never spends anything.

---

## 0. What exists today (verified, with evidence)

| Fact | Evidence |
|---|---|
| Server-owned vocabulary of 20 signal names | `backend/campusflow/domain/exams/service.py:1956` `PROCTORING_EVENT_TYPES` |
| Evidence-only set, today `{camera_snapshot, quick_tab_return}` | `service.py:2023` `NON_VIOLATION_EVENT_TYPES` |
| Nine camera/microphone cues, **all counted** today (ADR-032) | `service.py:2055` `CAMERA_OBSERVATION_EVENT_TYPES` |
| Ingest order: vocabulary → frame ceiling → dedupe (camera exempt) → append event → evidence early-return → ack-gated atomic counter UPDATE → review flag → ladder response | `service.py:2461`–`2780` `record_proctoring_event` |
| Ladder defaults: 10 warnings, 5 s gap, `remove`/`review` policies | `schemas.py:384`, `service.py` `DEFAULT_*`; ADR-023/034/037/039 |
| Candidate disclosure keys (`max_violations`, `warning_cooldown_seconds`, `warning_policy`, per-check booleans, `dwell_ms`, `obstruction_threshold_seconds`, `evidence_retention_days`) | `schemas.py:373` `ExamStudentConfig`, `schemas.py:490` `ExamDeliveryResponse` |
| Candidate surface shows a modal only when `res.warning` is set; header chip tooltip claims *every* confirmed cue spends one | `frontend/src/features/exams/components/ExamDelivery.tsx:1696`, `:2790` |
| Lecturer timeline labels by `event_category` only (`browser_signal` / `camera_observation` / `evidence`) | `ExamDetail.tsx:944`–`953`, `schemas.py:612` |
| Landing states one counted list | `frontend/src/app/routes/landing/content.ts:535`–`570` `INTEGRITY_CUES`; `landing/index.tsx:1277` |
| Tests pinning "every confirmed cue spends one" | `test_integrity_profile.py` (`test_camera_cues_warn_and_raise_a_review`, `test_hand_near_face_reaches_the_lock_and_only_lecturer_reopens`), `test_warning_policy.py:466`, `test_proctoring_security.py:230`, `test_demo_exam_and_integrity_vocab.py:313` |
| Docs asserting the same | `docs/architecture.md:265`, `decisions.md` ADR-032:771, `completion-audit.md` D-13:152, `memory.md:718`, `progress.md:1850` |

**The research this plan is built on** (`docs/progress.md:1508`): browser events are
near-deterministic; webcam inference is only ever a flag for a human; a generic audio alarm is
not evidence; the 2022 AI-auto-proctor study produced 74 incorrect decisions across 244
attempts. The current code already says "never a verdict" — but it still *charges* the
inference, which is the part this plan removes.

---

## 1. The target posture — three dispositions

Every signal in `PROCTORING_EVENT_TYPES` gets exactly one disposition. The disposition is
server-owned, disclosed before the first event, and returned with every event response.

### 1.1 `counted` — deliberate acts against the paper

| Signal | Why it counts |
|---|---|
| `tab_switch`, `window_blur`, `fullscreen_exit` | Deterministic browser events; the candidate left the paper. |
| `clipboard_copy_attempt`, `clipboard_paste_attempt`, `copy_paste_attempt` (legacy) | Deterministic, deliberate. |
| `context_menu`, `window_resized` | Deterministic, low-signal but unambiguous. |
| `ip_change` | Server-observed; the sitting moved networks. |
| `camera_off` | The candidate stopped the required camera. The browser reports the track ending; there is no model in the path. |
| `camera_obstructed` | The lens was deliberately made useless (lid, finger, phone held in front) past the authored grace. Same family as `camera_off`. |
| `second_device_detected` | A phone, earbud or watch in the camera picture, confirmed by three agreeing scans on the candidate's own device. The classic route back to an answer; directed by product decision to stay on the ladder. |

### 1.2 `review_only` — inference about the candidate, recorded for a human

| Signal | What the lecturer receives | What the candidate gets |
|---|---|---|
| `looking_away` | Event with the measured angle and dwell; review flag | The paper is covered while the head is turned; no warning, no count |
| `face_not_visible` | Event with the absence dwell; review flag | The cover gate while no face is in frame; no warning, no count |
| `multiple_faces_detected` | Event with the face count and dwell; review flag | The cover gate; no warning, no count |
| `hand_near_face` | Event with proximity/hand count/dwell; review flag | Nothing beyond the existing gates |
| `voice_detected` | Event with level and dwell (`recorded: false`); review flag | Nothing |
| `mouth_movement_detected` (opt-in, off by default) | Event with mouth/forehead dominance; review flag | Nothing |

A `review_only` cue **never** increments `proctor_violations_count`, **never** reaches the
ladder, **never** locks, **never** auto-submits, and is **never** hidden: it is appended to the
timeline and raises the same review flag the lecturer already works from.

### 1.3 `evidence` — passive, never a violation (unchanged)

`camera_snapshot` (the periodic evidence frame) and `quick_tab_return` (returned inside the
5 s grace). Neither counts today; neither changes.

### 1.4 The partition is exhaustive

`counted ∪ review_only ∪ evidence == PROCTORING_EVENT_TYPES` and the three sets are pairwise
disjoint. A test fails if a new event type is added without a disposition, so a future cue
cannot silently inherit "counted".

---

## 2. What changes, and what deliberately does not

**Changes**
1. The disposition of six inference cues moves from `counted` to `review_only`.
2. Every event response and every timeline row carries an explicit `disposition`, so the
   candidate surface and the lecturer surface stop inferring intent from `event_category`.
3. The brief and the delivery payload disclose the counted and review-only vocabularies as
   server-derived lists; the candidate reads the split before the clock starts.
4. The candidate surface no longer raises a blocking modal for a review-only cue.
5. The landing chapter, the architecture text, the audit, the memory and the ADRs describe the
   split instead of the uniform ladder.

**Does not change**
- The allowance (`DEFAULT_MAX_VIOLATIONS = 10`, authored 1–20), the two policy outcomes
  (`remove`, `review`), the 5 s ack-gated gap, the conditional-UPDATE concurrency gate, the
  three sensitivity tiers and their dwells, obstruction grace, evidence retention (90 days),
  the opt-in mouth cue, dedupe of browser signals, or the 3 s/20 s episode behaviour of the
  camera monitors.
- No new event type, no new endpoint, no migration: the change is classification, disclosure
  and copy. `exam_attempts` already stores everything needed.

---

## 3. Backend implementation

All paths relative to `backend/campusflow/domain/exams/`.

### 3.1 Classification (`service.py`)

- Keep `PROCTORING_EVENT_TYPES`, `NON_VIOLATION_EVENT_TYPES`, `DEVICE_OBSERVATION_EVENT_TYPES`,
  `HAND_AUDIO_OBSERVATION_EVENT_TYPES`, `MOUTH_OBSERVATION_EVENT_TYPES` and
  `CAMERA_OBSERVATION_EVENT_TYPES` as they are: they name *sources*, which the timeline and the
  audit actions still need.
- Add `REVIEW_ONLY_EVENT_TYPES = frozenset({"looking_away", "face_not_visible",
  "multiple_faces_detected", "hand_near_face", "voice_detected", "mouth_movement_detected"})`
  with the research rationale in the comment block (browser events near-deterministic; webcam
  inference is a flag for a human; a charged inference is a penalty on a model's error rate).
- Derive `COUNTED_EVENT_TYPES = PROCTORING_EVENT_TYPES - NON_VIOLATION_EVENT_TYPES -
  REVIEW_ONLY_EVENT_TYPES` so the three dispositions cannot drift.
- Add `_proctoring_event_disposition(event_type: str) -> str` returning `"evidence"`,
  `"review_only"` or `"counted"`. `_proctoring_event_category` stays for source labelling.

### 3.2 Ingest (`record_proctoring_event`)

Restructure the section between the append-only insert and the counter UPDATE:

1. Compute `disposition = _proctoring_event_disposition(payload.event_type)` once, after the
   vocabulary check.
2. Insert the event exactly as today (server clock, `client_timestamp` retained as context).
3. If `disposition` is `"evidence"` **or** `"review_only"`:
   - for `"review_only"`, call the existing `_raise_review_flag(...)` with the same action
     naming the audit already uses (`exam.attempt_observation_<type>` for hand/voice/mouth,
     `exam.attempt_camera_observation_<type>` for face signals), so the review queue and the
     audit trail are unchanged in shape;
   - `await db.commit()`;
   - return `ProctoringStatusResponse(..., warning=None, warning_pending=_warning_is_pending(attempt),
     event_category=_proctoring_event_category(type), disposition=disposition)`.
   The candidate is told nothing new; the response states the truth (`counted: false`,
   `disposition: review_only`).
4. Otherwise (counted): unchanged — the conditional UPDATE, the cooldown/ack gate, the review
   flag for camera-derived counted cues, and the ladder/lock/flag responses. Add
   `disposition="counted"` to all three ladder responses and to the suppressed/duplicate
   responses.

Guardrails to preserve explicitly:
- Camera-derived **counted** cues (`camera_off`, `camera_obstructed`, `second_device_detected`)
  keep raising the review flag and stay exempt from the 3 s dedupe.
- Review-only cues are also exempt from the server dedupe: the client has already paid the
  dwell, `_raise_review_flag` writes one flag and one audit entry, and repeated episodes are
  meant to be visible.
- A locked, submitted or expired attempt still short-circuits before classification.

### 3.3 Schemas (`schemas.py`)

- `ProctoringStatusResponse`: add `disposition: str = "counted"` (values `counted` /
  `review_only` / `evidence`).
- `ProctoringEventResponse`: add `disposition: str = "counted"`, derived in the timeline
  endpoint (`service.py:~3040`) beside `event_category`.
- `ExamStudentConfig` and `ExamDeliveryResponse`: add
  `counted_event_types: list[str] = Field(default_factory=list)` and
  `review_only_event_types: list[str] = Field(default_factory=list)`, populated from the
  module sets, sorted for a stable payload. The candidate is entitled to the exact split; the
  values are ids the frontend maps to sentences (§4.1).

### 3.4 Audit vocabulary

Unchanged action names (`exam.attempt_flagged_for_review`,
`exam.attempt_flagged_device_observation`, `exam.attempt_observation_*`,
`exam.attempt_camera_observation_*`). The `extra_data` gains `disposition` so an auditor can
tell a counted cue from a recorded one without reading the counter.

---

## 4. Frontend implementation

### 4.1 Disclosure module (new)

`frontend/src/features/exams/integrity-disclosure.ts`: one map from event id → a candidate
sentence ("Closing or covering the camera", "A phone or earbud in the picture", "Turning away
from the paper for the disclosed time", …) and two helpers that render a disclosed list. Used
by the brief. Pinned by `frontend/scripts/check-integrity-signals.ts`: every id in
`counted_event_types` and `review_only_event_types` has a sentence and no orphan sentence
exists.

### 4.2 Candidate surface (`ExamDelivery.tsx`)

- `reportEvent` (~1696): the modal path already requires `res.warning`; a review-only response
  carries `warning: null`, so no modal appears. Keep that, and add an explicit
  `res.disposition === 'review_only'` branch that records nothing beyond the updated
  observation time (no toast, no alarm, no count).
- Do not touch the coverage gates: `looking_away`, `face_not_visible` and
  `multiple_faces_detected` still cover the question until the candidate sustains a return,
  and that behaviour is unchanged by this plan.
- Header chip tooltip (`:2790`): replace "Every confirmed cue … spends one of the disclosed
  warnings" with the split — deterministic and deliberate acts spend the allowance; camera
  inferences are recorded for the lecturer and never counted.
- The face-cue explanation at `:829` ("The cue is recorded and, if it is counted, spends one of
  the disclosed warnings") is finalised to the new truth: "recorded for your lecturer and never
  counted against the allowance".
- The pre-start integrity card renders the two disclosed lists from the delivery payload under
  two honest headings: **"Counts toward your allowance"** and **"Recorded for your lecturer —
  never counted"**. No disclosure is removed; only the split is named.

### 4.3 Lecturer timeline (`ExamDetail.tsx`)

Use `disposition` in addition to `event_category`: a counted cue reads as a warning with its
number; a review-only cue reads as "recorded for review — not counted". The measurement line
(confidence, dwell, region, category) is unchanged.

### 4.4 Types (`types.ts`)

Add `disposition?: 'counted' | 'review_only' | 'evidence'` to the proctoring status and event
shapes, and the two disclosed string arrays to the brief/delivery types.

---

## 5. Disclosure and public copy

| Surface | Change |
|---|---|
| Assessment brief (`ExamDelivery`, pre-start card) | Two columns from the disclosed lists; the allowance line says counted cues only. |
| `frontend/src/app/routes/landing/content.ts` `INTEGRITY_CUES` | Restore the honest two-column split: "counts toward the disclosed allowance" (browser events, camera closed/obstructed, phone in picture) and "recorded for a human, never counted" (head turn, no face, two faces, hand at the face, a second voice, mouth motion when authored). |
| `landing/index.tsx:1277` | Remove "Every confirmed cue costs one"; say what happens instead. |
| `INTEGRITY_FACTS` | Unchanged (3 tiers, 10 warnings, 5 s, 90 days, 0 keys) — the numbers did not move. |
| `README.md` | Only the test figures if the suite count changes. |

---

## 6. Documentation

| Document | Required update |
|---|---|
| `docs/decisions.md` | **ADR-040: A Leisurely Integrity Posture — Deliberate Acts Count, Inference Is Evidence.** Accepted; supersedes the counting half of ADR-032 (and D-13's resolution) for the six inference cues, keeps ADR-034/035/037/039 mechanics, records the research basis and the two cues promoted by explicit product decision (`camera_off`, `camera_obstructed`, `second_device_detected`). |
| `docs/architecture.md` | §integrity: the signal list gains dispositions; the camera paragraph says inference raises the review flag and never spends; candidate messaging and the timeline description follow. |
| `docs/completion-audit.md` | D-13 gets a dated superseding note (review-only tier restored for inference; camera closed/obstructed/device remain counted). §1.6's "every confirmed cue spends one" is corrected. |
| `docs/memory.md` | Replace the "decide explicitly whether a new cue counts" rule with the three-disposition rule and the test that enforces the partition. Note that `event_category` answers *where a cue came from*, `disposition` answers *what it costs*. |
| `docs/progress.md` | New phase entry: what changed, the tests rewritten rather than loosened, and the verification block from §9. |
| `docs/master-plan.md` | §10 (observable proctoring): one paragraph so the architecture summary does not contradict the code. |

---

## 7. Test matrix

| # | Criterion | Test | State |
|---|---|---|---|
| 1 | Every event type has exactly one disposition; the three sets partition the vocabulary | `test_integrity_profile.py::test_every_signal_has_exactly_one_disposition` | Planned |
| 2 | Each inference cue leaves the counter unchanged, appears on the timeline with its measurement, and raises the review flag | `test_integrity_profile.py::test_review_only_cues_are_recorded_and_never_counted` (parametrised over the six) | Planned |
| 3 | `camera_off` still spends one warning and is classified `camera_observation` | `test_proctoring_security.py` step 12 (exists) | Exists, unchanged |
| 4 | `camera_obstructed` still spends one warning | `test_demo_exam_and_integrity_vocab.py:317` (exists) | Exists, unchanged |
| 5 | `second_device_detected` still warns, still raises one review flag, second episode warns again | `test_warning_policy.py::test_device_observation_raises_review_and_never_a_failure` (exists) | Exists, unchanged |
| 6 | An inference cue cannot lock the attempt even at the authored limit; a counted cue still can | rewrite `test_integrity_profile.py::test_hand_near_face_reaches_the_lock_and_only_lecturer_reopens` → `test_review_only_cue_never_reaches_the_lock_and_a_deliberate_act_does` | Rewritten |
| 7 | The split is disclosed before the first event, on both the brief and the delivery | `test_integrity_profile.py` (delivery/brief payload) + `test_authorization_matrix.py` exact-key canary gains the two keys | Planned |
| 8 | A review-only response never carries `warning`, `is_locked` or an incremented count | `test_proctoring_security.py` (new case) | Planned |
| 9 | The existing cooldown/concurrency/lock tests still pass unchanged | `test_warning_policy.py`, `test_proctoring_security.py` | Exists |
| 10 | The brief's sentences cover exactly the disclosed vocabulary | `node scripts/check-integrity-signals.ts` | Planned (extend harness) |

Tests are **rewritten to the new contract, never loosened**: the parametrisation that asserted
`violations_count == 2` for a hand cue becomes an assertion that the count is unchanged *and*
the review flag exists *and* the timeline carries the dwell — the same evidence, opposite
expectation.

---

## 8. Implementation waves

| Wave | Content | Depends on | State |
|---|---|---|---|
| **A** | Backend classification, `disposition`, ingest restructure, schema + disclosure fields | — | Planned |
| **B** | Backend tests rewritten and added (§7 rows 1–8); `ruff` clean | A | Planned |
| **C** | Frontend types, disclosure module, brief columns, candidate messaging, timeline label | A | Planned |
| **D** | Landing chapter, index copy, README figures | C | Planned |
| **E** | ADR-040, architecture, audit, memory, progress, master-plan | A–D | Planned |
| **F** | Full verification (§9), including the live probe and the demo sitting | A–E | Planned |

Wave A is the only place behaviour changes; B locks it down before any surface is touched; C
and D may not invent a disposition the server does not return.

---

## 9. Acceptance evidence

```bash
cd backend
python -m ruff check .                      # clean
python -m pytest -q                         # full suite, no new skips

cd ../frontend
npx tsc -b                                  # clean
npm run lint                                # 0 errors
npm run build                               # exit 0
node scripts/check-integrity-signals.ts     # every disclosed id has a sentence
node scripts/check-face-monitoring.ts       # unchanged
node scripts/check-hand-voice-monitoring.ts # unchanged
```

Live probe against a running API, on a paper with `max_violations: 2`, policy `remove`:

| Step | Expected |
|---|---|
| `hand_near_face` ×3 (separated by the monitors' episode) | `violations_count` stays **0**, `warning: null`, `disposition: review_only`, attempt `in_progress`, review queue lists it |
| `looking_away`, `face_not_visible`, `multiple_faces_detected` | same: recorded, flagged, not counted |
| `camera_off` | count **1**, warning modal, `disposition: counted` |
| `camera_obstructed` after the authored grace | count **2**, attempt `locked_violation`, only the lecturer's unlock reopens it |
| second sitting: `second_device_detected` | count **1**, warning names the phone, review flag raised |

Then a browser pass on the demo paper: the brief shows both columns, a head turn covers the
paper with no warning modal and no counter change, and the lecturer's timeline labels the same
event "recorded for review — not counted".

---

## 10. Non-goals

- No change to the allowance, the two policy outcomes, the cooldown, the concurrency gate,
  the tiers/dwells, obstruction grace, evidence retention, or the mouth cue's opt-in default.
- No new event type, endpoint or migration.
- No per-exam authoring of dispositions in this pass. The table is one server constant. If an
  institution wants `multiple_faces_detected` back on the ladder, that is a one-line move plus
  an ADR — stated here so the choice is visible, not smuggled in.
- Not the live-invigilation transport or console (waves 6–7 of
  `plan-hierarchy-roster-invigilation.md`), and not the research paper.

---

## 11. Risks and how the plan handles them

| Risk | Handling |
|---|---|
| A candidate could read a phone under the desk and glance repeatedly without spending anything | The glances are on the timeline with dwell and raise the review flag; the camera cannot be closed, covered, or a phone brought into shot without spending a warning; the lecturer can act on the flagged attempt. |
| A proxy sitter (`multiple_faces_detected`) is no longer charged automatically | It is still recorded, flagged and shown with its dwell; §10 names the one-line promotion if an institution disagrees. |
| The candidate is told they are "not counted" and treats the camera as optional | Closing or covering the camera and a phone in shot *are* counted; the brief says exactly that, in the same card. |
| The `event_category` label is mistaken for a disposition | `disposition` is a separate field, returned on every response and every timeline row, and the tests assert the partition. |
| Tests are "fixed" by loosening them | §7 states the rewrite shape: same evidence, opposite expectation; loosening an assertion is a review failure. |
