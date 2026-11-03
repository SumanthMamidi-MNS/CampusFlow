# CampusFlow Development & Operations Guide

## 1. Prerequisites

- **Docker Desktop** (Docker 24+, Docker Compose v2)
- **Python 3.12+** (for local backend development)
- **Node.js 20+** and **npm 10+** (for local frontend development)

Backend runtime dependencies are declared in `backend/pyproject.toml`; the current set includes
FastAPI, SQLAlchemy 2 async, asyncpg, Alembic, Redis, httpx and **openpyxl** (Excel `.xlsx`
roster import — imported lazily, so a deployment without it still accepts CSV rosters and
returns a clear error for `.xlsx`).

---

## 2. One-Click Local Development Startup System

For the fastest local development experience on Windows, use the dedicated one-click automation scripts located in the `startup/` directory:

### Starting the Full Stack
Double-click `startup/start-campusflow.bat` or run it via your IDE's Run/Play button:

```bat
startup\start-campusflow.bat
```

**What it automates:**
1. Dynamically detects repository root (no hardcoded machine paths).
2. Verifies required tools (`docker`, `docker compose`, `python`/`uv`, `node`, `npm`).
3. Checks if CampusFlow is already running to prevent redundant duplicate processes.
4. Starts Docker infrastructure services (`postgres`, `redis`, `mailpit`).
5. Launches FastAPI backend on port 8000 in a dedicated titled window (`CampusFlow Backend`) with live reload and tracks its PID.
6. Launches Vite frontend on port 5173 in a dedicated titled window (`CampusFlow Frontend`) and tracks its PID.
7. Performs automated HTTP readiness polling on `http://localhost:8000/api/health` and `http://localhost:5173`.
8. Automatically opens `http://localhost:5173` in Google Chrome when readiness is confirmed.

### Stopping the Full Stack
Double-click `startup/stop-campusflow.bat` or run:

```bat
startup\stop-campusflow.bat
```

**What it cleanly terminates:**
1. Gracefully terminates the backend and frontend process trees using tracked PIDs (does not blindly kill unrelated system Python/Node processes).
2. Releases and frees ports 8000 and 5173.
3. Stops Docker containers (`postgres`, `redis`, `mailpit`) while preserving database state.
4. Cleans up temporary PID tracking files.

---

## 3. Quickstart with Docker Compose

To start the full stack entirely inside Docker containers including PostgreSQL, Redis, Mailpit, Backend, and Frontend:

```bash
docker compose up --build
```

### Exposed Endpoints
- **Frontend SPA:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:8000](http://localhost:8000)
- **Interactive OpenAPI Documentation:** [http://localhost:8000/api/docs](http://localhost:8000/api/docs)
- **Mailpit Web UI (Dev Email Catcher):** [http://localhost:8025](http://localhost:8025)
- **PostgreSQL Database:** `localhost:5432` (`campusflow` / `campusflow`)
- **Redis Cache:** `localhost:6379`

---

## 4. Local Backend Development

### Environment Setup
```bash
cd backend
python -m venv .venv

# Windows PowerShell
.venv\Scripts\Activate.ps1
# Linux/macOS
source .venv/bin/activate

pip install -e ".[dev]"
cp .env.example .env
```

### Running the Development Server
```bash
uvicorn campusflow.main:app --reload --host 0.0.0.0 --port 8000
```

#### Without Docker (SQLite fallback)

Docker Desktop is not always running, and the backend venv is uv-managed (it has no `pip` —
use `uv run` / `uv sync`). When PostgreSQL is unreachable, bootstrap the app onto a local SQLite
file, then start uvicorn through uv so it uses the same environment:

```bash
cd backend
uv run --extra dev python ../scripts/bootstrap.py --sqlite   # schema + idempotent demo seed
uv run python -m uvicorn campusflow.main:app --host 127.0.0.1 --port 8000
```

`--sqlite` writes `DATABASE_URL` into `backend/.env` as an **absolute** path to the SQLite file at
the repository root (`<repo>/campusflow.db`), so a later `uvicorn` picks up the same file no matter
which directory it is started from — `start.bat` bootstraps from the root while uvicorn runs with
`backend/` as its working directory, and a relative URL made those two processes seed and serve
different files. If a database written by the old relative URL exists at `backend/campusflow.db`
and the root file does not, bootstrap adopts it instead of starting empty.

SQLite cannot apply Alembic migrations, so bootstrap reconciles the file against the model metadata
after `create_all`: missing columns are added with `ALTER TABLE … ADD COLUMN` and missing indexes
with `CREATE INDEX IF NOT EXISTS`, and each addition is logged. That covers the additive case, which
is what `create_all` silently skipped before. A change it cannot express in place (a dropped or
retyped column, or a `NOT NULL` column with no default) stops bootstrap with an explicit message:
delete `campusflow.db` and rerun, or use PostgreSQL for the real migration. This path exists for
machines without Docker; the PostgreSQL path above remains the authoritative one for migrations and
concurrency tests.

### Database Migrations (Alembic)
```bash
# Generate a new migration revision
alembic revision --autogenerate -m "describe_migration"

# Apply pending migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1
```

### Running Backend Tests
```bash
# Run test suite (in-memory SQLite, the fast feedback loop)
pytest

# Run the authoritative PostgreSQL pass. Concurrency and uniqueness criteria
# (Campus Lead advisory lock, concurrent roster commits, unique constraints)
# are ONLY evidenced here; they are skipped with a reason under SQLite.
# Create the database once: CREATE DATABASE campusflow_test OWNER campusflow;
TEST_DATABASE_URL="postgresql+asyncpg://campusflow:campusflow@localhost:5432/campusflow_test" pytest

# Run tests with coverage
pytest --cov=campusflow tests/

# Focused suites
pytest tests/test_campus_lead_invariant.py tests/test_multi_section_assessment.py \
      tests/test_roster_import.py tests/test_duplicate_prevention.py
```

> Piping pytest into `tail` hides its exit status unless `set -o pipefail` is set. Check the
> summary line, not just what you can see.

### Linting & Formatting
```bash
# Check code style with Ruff
ruff check .

# Format code with Ruff
ruff format .
```

---

## 5. Local Frontend Development

### Environment Setup
```bash
cd frontend
npm install
```

### Running Vite Development Server
```bash
npm run dev
```

### Production Build & Verification
```bash
# Typecheck and compile assets to dist/
# This is the real typecheck: the root tsconfig is a solution file of project
# references, so `npx tsc --noEmit -p tsconfig.json` succeeds without checking
# anything. `tsc -b` catches JSX/narrowing errors that command misses.
npm run build

# Preview production build locally
npm run preview

# Lint frontend code
npm run lint
```

### Verifying the assessment camera by hand

The camera check on `/exams/{id}/take` cannot be verified from an automated or embedded browser:
the preview browser reports camera permission as `denied` and cannot grant it. Use a normal
Chrome/Edge window over `http://localhost:5173` and confirm, in order:

1. **Live** — allow the camera: the tile shows a continuously moving picture, the panel reads
   "Camera ready — your live picture is showing", and "Begin assessment" is enabled. Raise your
   left hand: it must appear on the **left** of the tile (the feed is deliberately unmirrored).
2. **Black** — cover the lens: within a few seconds the panel switches to "sending a black
   picture" guidance and "Begin assessment" is **disabled**. Nothing may read "ready" here.
3. **Stopped** — unplug the camera or take it over in another app: the panel reports that the
   camera stopped and offers "Turn camera back on"; the begin button stays disabled.
4. **Denied** — block the camera in site settings and press "Turn on camera": the panel explains
   how to re-allow it.

For scripted checks inside a page (no physical camera required), stub the media APIs in the
console — this is the harness used to prove the black-tile defect and its fix:

```js
const c = document.createElement('canvas');
c.width = 640; c.height = 480;
const ctx = c.getContext('2d');
let t = 0;
setInterval(() => { t++; ctx.fillStyle = `hsl(${(t * 9) % 360},85%,55%)`; ctx.fillRect(0, 0, 640, 480); }, 100);
navigator.mediaDevices.getUserMedia = async () => c.captureStream(15);       // pure black canvas → black-feed path
navigator.permissions.query = async () => ({ state: 'granted', onchange: null, addEventListener() {}, removeEventListener() {} });
```

### Measuring device detection

The on-device prohibited-device detector ([device-detection.ts](frontend/src/features/exams/device-detection.ts), ADR-024)
claims accuracy only from a measurement, never from code review. The accuracy numbers live in
`docs/memory.md`; this is how they were produced and how to reproduce them.

```bash
# 1. Labelled sample: every COCO val2017 image whose annotated phone covers at
#    least --min-area of the frame (default 0.5%), plus an evenly spread set of
#    person-only negatives. Default run: 91 positives + 100 negatives, bucketed
#    0.5-1% (29), 1-2% (16), 2-5% (17), 5-10% (8), 10-20% (11), >20% (10) —
#    every size, not only the phones held against the lens. Writes
#    frontend/dev-measure/ — git-ignored, disposable, and deliberately outside
#    public/ so `npm run build` never copies ~100 MB of COCO stills into dist/
#    (~250 MB of annotations are cached under $TEMP/campusflow-coco between runs).
python backend/scripts/fetch_device_detection_sample.py
```

```js
// 2. With the dev server running, open http://127.0.0.1:5173 **in a fresh tab**
//    and run the harness in the browser console. It imports the *shipped* module
//    from the dev server (a Node re-implementation would measure different code),
//    scans each still through `frameForAnalysis` + `analyseFrame`, and prints a
//    confusion table, a (phoneScore × min-area) sweep, recall per phone size and
//    timings.
const m = await import('/scripts/measure-device-detection.js')
await m.runMeasurement()                 // summary + threshold sweep
await m.runMeasurement({ verbose: true }) // ... plus one line per image
```

A tab that has been open for hours across many hot reloads can stall inside the first
`analyseFrame` (a second TensorFlow.js session on a stale WebGL context never resolves); open a
fresh tab rather than waiting on it.

```bash
# 3. When finished, the sample is disposable:
rm -rf frontend/dev-measure
```

What the numbers cover: positives are COCO images annotated with a `cell phone` at a size a
webcam actually sees. COCO carries no earbud or smartwatch ground truth, so the MobileNet
wearable signal is reported as raw classifier output and **no wearable accuracy is claimed**.
The sample is stills, not recorded footage, so the measurement bounds the detector's
behaviour; re-measure against exam footage before quoting precision/recall as field numbers.

### Verifying face and head-direction monitoring

The detector needs a webcam and a model download, so it is not exercised automatically. Its
*decision layer* is deterministic, and
[check-face-monitoring.ts](frontend/scripts/check-face-monitoring.ts) drives the shipped module with
synthetic landmarks and a synthetic clock:

```bash
cd frontend
node scripts/check-face-monitoring.ts       # Node 22.6+ (type stripping); 47 checks
```

It exits non-zero on any mismatch. It covers a frontal face at ~0°, a 62° turn in both
directions, resolution invariance, the 50° threshold on both sides, the 2 s / 3 s / 1.5 s dwells,
the 20 s escalation, the accumulated-dwell rule (a one-frame return between two turns does not
reset the tally), a held return that does end the episode, and 60 s of unmeasurable frames
recording nothing and covering nothing.

### Verifying hand-at-face and voice monitoring (ADR-029)

Both new detectors need hardware — a hand landmarker needs a model download, the voice detector
needs a live microphone — so neither runs in CI. Their decision layers are deterministic and
[check-hand-voice-monitoring.ts](frontend/scripts/check-hand-voice-monitoring.ts) drives the
shipped modules with synthetic landmarks, synthetic analyser frames and a synthetic clock:

```bash
cd frontend
node scripts/check-hand-voice-monitoring.ts   # Node 22.6+; 44 checks
```

What it pins, and why each one matters:

* **Hand geometry.** The face extent from a detector box and from a bare landmark set; a hand at
the face versus a hand on the desk; the ratio threshold on both sides of the boundary; a hand
with too few landmarks ignored; the closest of two hands deciding; and a hand with no face
reference reading `unmeasurable` rather than `at_face`, so a candidate cannot be charged for a
measurement the geometry cannot make.
* **Hand decisions.** A one-second scratch is never an event; a blink away does not reset the
*dwell* (the accumulation survives it, which is the whole defence against the classic
evasion); an unmeasurable frame neither reports nor clears an open episode; a throttled tab
cannot leap the dwell in one gap; escalation keeps a minute-long episode to a handful of events;
and a real return closes the episode so the next one reports fresh.
* **Voice analysis.** In-band versus out-of-band energy; a level under the floor rejected; ordinary
room chatter rejected by the raised loudness floor while a raised voice clears it; a **steady loud
hum rejected for lack of modulation** (the false positive that would make a generic sound alarm
worthless); and syllabic speech detected at the same average level as the hum. The floor is RMS
0.025 (about −32 dBFS), with a 3.5 s dwell, so a chair, a fan or a single cough is never a signal.
* **Voice decisions.** A cough is not sustained enough to report; sustained speech reports; a
pause between sentences does not defeat the dwell; a long conversation stays a few events rather
than thousands; a suspended tab cannot leap the dwell; and a quiet room ends the episode.

The audio frames are synthesised as a 180 Hz carrier with an explicit in-band/out-of-band power
distribution, so `bandEnergyRatio` is exercised through the same dBFS-to-linear conversion the
analyser path uses. Neither harness claims detection *accuracy*: they prove the rules fire when
they should and stay silent when they should, which is what can be verified without a person in
front of a camera.

### Verifying full-screen detection (ADR-038)

Full-screen cannot be granted to the headless preview (it needs a trusted gesture and a real
display), so the state reader is driven directly with synthetic `screen`, viewport and API values:

```bash
cd frontend
node scripts/check-fullscreen.ts   # Node 22.6+; 11 checks
```

It pins the cases that caused the false alarm: F11 (a viewport that fills the display) is
full-screen even with `document.fullscreenElement` null; an API full-screen is still full-screen;
a maximised window with browser chrome and an ordinary window are not; a viewport that merely fills
a smaller window is not filling a larger display; a scrollbar's few missing pixels still count; an
installed full-screen display mode counts; and `document.fullscreenEnabled === false` (an iframe or
Permissions-Policy) reports the API as unavailable rather than promising a gate that cannot clear.

### Verifying mouth movement, the wrist crop and device labels (ADR-030/031)

Mouth movement is measured from pixels, and the watch read depends on a crop built from hand
landmarks, so neither can be exercised in CI either. Mouth-movement monitoring itself is opt-in
and off by default (ADR-039) after real-sitting false positives; the module and this harness stay,
and an author who enables it explicitly is still held to the tested rules. Everything that decides *whether an event is
recorded* is pure and is driven by
[check-integrity-signals.ts](frontend/scripts/check-integrity-signals.ts):

```bash
cd frontend
node scripts/check-integrity-signals.ts   # Node 22.6+; 50 checks
```

What it pins:

* **Bands.** The mouth and forehead rects for a landmarked face, the forehead band kept clear of
  the mouth, a face too small to measure returning nothing, and a band mostly outside the frame
  rejected rather than measured against background.
* **Motion and dominance.** Mean-luma extraction, region motion normalised so brightness cannot
  manufacture movement, the mouth-dominant classification, a head-move pattern (both bands moving
  together) classified as *not* talking, and an unmeasurable pair never reading as movement.
* **Mouth decisions.** A short burst below the dwell is silent; talking with pauses accumulates
  instead of restarting; one continuous episode escalates to a handful of events; a held still face
  ends it; and mouth motion without the voice check still reports, because a silent second person
  has to be caught by the camera alone.
* **Wrist crop and labels.** A normalised wrist point turned into a frame rect, a tiny hand
  rejected (the crop would be upscaled background), an out-of-frame wrist rejected, and the
  ImageNet label mapping that gives `digital watch` its `smartwatch` category while ignoring
  `stopwatch` and unknown labels.

The harness proves the rules fire and stay silent; it says nothing about accuracy. In particular no
watch footage has been scored, so `smartwatch` remains an unmeasured category (see
`docs/memory.md`).

The detector is `@tensorflow-models/face-detection` (BlazeFace, TF.js runtime). That package
imports MediaPipe's `@mediapipe/face_detection` at module scope; `vite.config.ts` aliases the
specifier to a small stand-in so the assessment bundle neither downloads several megabytes of
unused WASM nor fails to resolve a peer dependency. If the runtime ever changes to
`runtime: 'mediapipe'`, remove the alias and install the real solution — the stand-in throws
rather than pretending to work.

On a real machine, `/exams/{id}/take` shows the live state under the self-view (`Face check:
facing the screen`, `head turned away`, `no face visible`, `more than one face`,
`unavailable`). A full turn to either side held for two seconds must cover the question area and
add one `looking_away` event; a single glance back must not dismiss that cover, while facing the
paper for the recovery window must.
Covering the lens must cover the paper within the authored obstruction threshold. If the model
host is blocked, the strip says `Face check: unavailable` and the assessment still runs — the
pipeline never claims a check that is not running.

### Which frontend image runs where

The **development** stack builds `frontend/Dockerfile.dev`: `node:20-alpine`, `npm ci`, then the
Vite dev server on `:5173` with hot reload. It has no production build step, and its proxy target is
the compose service — `VITE_PROXY_TARGET=http://backend:8000` — because the dev server runs in a
container, not on the host (the host default is `http://localhost:8000`).

The **production** image (`frontend/Dockerfile`) ends on `nginx:alpine` and contains no Node runtime,
so it cannot serve `npm run dev`; `docker-compose.prod.yml` uses it for the static build only. If you
add a frontend container, check which image you are pointing at first — that mismatch is a startup
failure, not a fallback.

### Regenerating the README badges

`docs/assets/badges/*.svg` are generated, not drawn by hand:

```bash
python docs/assets/badges/build_badges.py
```

Change the figures in `BADGES` at the top of that file (the suite size lives there and in the
Verification block above) and rerun it. Every capsule is rebuilt from the same geometry, so the
nine files cannot drift in width, padding or animation phase. The badge is a dark obsidian capsule
with a pulsing accent gem, the label, a hairline divider and the value in mono; GitHub renders an
SVG inside `<img>` as a still frame, so the capsule is designed to read correctly without motion.

### Regenerating the README screenshots

`docs/images/*.png` are real captures of the running product at 1440 px wide, taken with
`puppeteer-core` driving the installed Chrome (`headless: 'shell'`). The viewport is 900 px tall;
`11-assessment.png` is a **full-page** capture because the candidate brief is taller than the
viewport, and cropping it would hide the disclosure the image exists to show. Refresh them when the
UI changes:

```bash
# 1. Capture against a CLEAN seeded database — manual QA leftovers photograph as unfinished work.
docker exec campusflow-postgres-1 psql -U campusflow -d postgres \
  -c "DROP DATABASE IF EXISTS campusflow_shots;" -c "CREATE DATABASE campusflow_shots OWNER campusflow;"
cd backend
export DATABASE_URL="postgresql+asyncpg://campusflow:campusflow@127.0.0.1:5432/campusflow_shots"
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe ../scripts/seed.py

# 2. Start the API against it, and the Vite dev server, then run the capture harness
#    (a throwaway script kept outside version control; the recipe is what matters):
#      - launch Chrome via puppeteer-core with executablePath to the installed browser
#      - sign in as the seeded accounts, walk the routes, screenshot the viewport
#      - capture the candidate journey through the exams page's "Take demo exam" button
```

Two traps worth knowing before you start: the Vite dev server binds `localhost` (which may resolve to
IPv6) while `127.0.0.1` can refuse the connection, and a capture run that signs in as several roles
must clear `localStorage` between sessions or the previous token wins. Nothing in the product is
modified to improve a screenshot — the images stay honest, which is why they age and need refreshing.

### Regenerating the landing-page tour

`frontend/public/tour/<portal>/*.webp` are the screens behind the landing page's chapter 03. Six
portals, 55 captures, all 1440×900 at the browser's own scale factor, encoded by Chrome as WebP
(quality 82) so the whole tour is ~2.6 MB and only the active portal is fetched.

Every capture must be a screen **that role can actually open**, and the caption beside it must
describe what the frame shows. Two mistakes are easy to make and both were made once:

* `/exams/{id}/results` is the *student's* scorecard. Signed in as staff it renders "Results
  Unavailable", so the staff "results board" is `/exams/{id}` → **Submissions & Grading**.
* The attempt and grading endpoints require `exams:grade`, which the exam bureau deliberately does
  not hold. A controller's tour therefore has no grading-queue screen to show — the role section
  says so instead of photographing an empty table.

The capture harness is a throwaway script kept outside version control; the recipe is what matters:

1. Seed a database and run the API and the Vite dev server against it.
2. Sign in over the API, then write `access_token` and `campusflow_user` into `localStorage` before
   navigating, so the SPA hydrates a session instead of showing the sign-in screen.
3. **Wait for `#boot` to be removed.** The boot screen holds for a minimum of 1.8 visible seconds
   plus a 0.42 s handover; a capture taken before that is a screenshot of the splash, not the
   product.
4. Drive the installed Chrome over CDP (`Page.captureScreenshot` with `format: 'webp'`) and capture
   one step per route or interaction: tabs, dialogs, a typed editor, an attempt in progress.
5. Press interactions through their real controls. React owns the textareas and the tab state, so a
   value has to go through the native setter and an `input` event, and a tab is a click, not a URL.

The in-progress attempt cannot be captured from the seeded attempts — they are already submitted —
so the recipe creates one temporary live exam (proctoring disabled) with five questions, starts an
attempt for a seeded student, captures the delivery screen, and deletes the exam afterwards. The
delete is the API's own `DELETE /exams/{id}`, which leaves no orphan attempts or responses.

The candidate **brief** (the pre-start screen) is simpler: call `POST /api/v1/exams/demo/login` with
any signed-in token, take the `access_token` and `exam_id` it returns, write the token into
`localStorage.access_token`, and navigate to `/exams/{exam_id}/take`. That is the same endpoint the
"Take demo exam" button uses, so the capture needs no click path through the list. Wait for `#boot`
to disappear **and** for the brief's own text ("CampusFlow Demo Assessment") before shooting: the
component renders a placeholder shell first, and a capture taken then shows em dashes where the
duration and marks belong.

---

## 6. Seed Data & Database Initialization

A comprehensive, realistic demo seeder is provided in `scripts/seed.py`:
```bash
# From repository root
uv run python scripts/seed.py

# Or from backend directory
cd backend
uv run python ../scripts/seed.py
```

### Pre-Configured Demo Accounts
| Role | Email | Password | Scope & Responsibilities |
|---|---|---|---|
| **Super Admin** | `admin@campusflow.edu` | `Admin@CampusFlow2026` | Full platform access, user provisioning, institution branding, audit logs |
| **Campus Lead** | `lead@campusflow.edu` | `Password@123` | The `admin` role without platform reach: accounts, academic structure, institution settings |
| **Exam Controller** | `controller@campusflow.edu` | `Password@123` | Institutional examination scheduling, question pool approvals, exam publishing |
| **Department Head (CSE)** | `hod.cse@campusflow.edu` | `Password@123` | Department management, program definitions, course offerings, analytics |
| **Faculty (CSE)** | `faculty.cse@campusflow.edu` | `Password@123` | Course instructor (CS201, CS301), question bank authoring, exam grading |
| **Faculty (MECH)** | `faculty.mech@campusflow.edu` | `Password@123` | Mechanical Engineering instructor (ME101) |
| **Student 1** | `student1@campusflow.edu` | `Password@123` | Alex Rivera (CS201, CS301), active submissions, exam attempts |
| **Student 2** | `student2@campusflow.edu` | `Password@123` | Brianna Patel (CS201, CS301), completed exam attempt |
| **Student 3** | `student3@campusflow.edu` | `Password@123` | Carlos Gomez (CS201), in-progress attempt |
| **Student 4** | `student4@campusflow.edu` | `Password@123` | Diana Prince (ME101) |

---

## 6.1 Programming Environment & Code Execution

The programming feature (`/programming`) lets students write and run Python entirely in the
browser, then submit for automated test-case grading. Execution is delegated to a **Piston**
sidecar container; the API never runs untrusted code itself (ADR-014).

### Local setup
`docker compose up -d postgres redis mailpit piston piston-init` starts the sandbox. The
`piston-init` one-shot container installs the Python runtime on first start (idempotent), so
the first launch can take a minute or two. `startup/start-campusflow.bat` includes this
automatically.

Piston is bound to host loopback only (`127.0.0.1:2000`); the backend reaches it at
`http://piston:2000` on the compose network.

### Configuration
| Variable | Default | Purpose |
|---|---|---|
| `CODE_RUNNER_ENABLED` | `true` | Master switch; set `false` to disable execution |
| `CODE_RUNNER_BACKEND` | `piston` | Runner implementation to use |
| `CODE_RUNNER_URL` | `http://localhost:2000` | Piston base URL (`http://piston:2000` in compose) |
| `CODE_RUNNER_PYTHON_VERSION` | `*` | Piston runtime version (`3.10.0` in compose) |
| `CODE_RUNNER_CLIENT_TIMEOUT_SECONDS` | `20` | Overall client timeout |
| `CODE_RUN_MAX_CONCURRENCY` | `4` | Global concurrent executions |
| `CODE_RUN_DEFAULT_TIMEOUT_MS` | `5000` | Default per-run CPU limit |
| `CODE_RUN_MAX_TIMEOUT_MS` | `10000` | Ceiling a problem may request |
| `CODE_RUN_DEFAULT_MEMORY_KB` | `131072` | Default 128 MB memory ceiling |
| `AUTH_RATE_LIMIT_REQUESTS` | `20` | Auth attempts allowed per window per IP |
| `AUTH_RATE_LIMIT_WINDOW_SECONDS` | `60` | Rate-limit window |

### API surface
```
GET    /api/v1/programming/problems
POST   /api/v1/programming/problems                      (programming:manage)
GET    /api/v1/programming/problems/{id}
PATCH  /api/v1/programming/problems/{id}                 (programming:manage)
DELETE /api/v1/programming/problems/{id}                 (programming:manage)
GET    /api/v1/programming/problems/{id}/test-cases      (programming:manage)
POST   /api/v1/programming/problems/{id}/test-cases      (programming:manage)
DELETE /api/v1/programming/test-cases/{test_case_id}     (programming:manage)
POST   /api/v1/programming/problems/{id}/run             (programming:submit)
POST   /api/v1/programming/problems/{id}/submit          (programming:submit)
GET    /api/v1/programming/problems/{id}/submissions     (programming:manage)
GET    /api/v1/programming/problems/{id}/my-submissions  (programming:submit)
GET    /api/v1/programming/health
```

New RBAC permissions: `programming:manage` (faculty, department head, admin) and
`programming:submit` (student, and staff for authoring/testing).

---

## 6.2 Institutional Hierarchy, Identity & Roster Import (Wave 3/4)

### The mandatory Campus Lead

The `admin` role is the institution's **Campus Lead / College Admin**. The service enforces at
least one active lead; see `campusflow/domain/institution/leadership.py` and ADR-019.

```
GET  /api/v1/admin/institution/campus-leads            (super_admin | admin)
POST /api/v1/admin/institution/campus-lead/recover     (super_admin only, audited)
```

Demoting, deactivating or deleting the last active Campus Lead returns **409**. Recovery is
only permitted while the institution has zero active leads, and only by the platform
`super_admin`; it is recorded as `institution.campus_lead_recover` in the audit trail.

### Roster import (`roster:import` permission)

```
GET    /api/v1/roster-imports
POST   /api/v1/roster-imports/preview                 multipart: file, kind, offering_id,
                                                      mapping (JSON), idempotency_key
POST   /api/v1/roster-imports/{batch_id}/commit
GET    /api/v1/roster-imports/{batch_id}/report       CSV
```

Gated by `roster:import | users:bulk_import | enrollments:manage` (held by Campus Lead,
department head and faculty) and, when a section is targeted, by the offering-scope kernel — a
lecturer can only import into a section they manage. Supported uploads are `.csv` (UTF-8/UTF-8-BOM)
and `.xlsx`; limits are 5 MiB per file, 5000 rows and 512 characters per cell.

### Migrations for this work

```
c3d4e5f6a7b8  registration_number + admission_year, exams.series_id,
              uq_faculty_assignment_offering_faculty,
              uq_exam_attempt_student_number (renumbers duplicate attempts first)
d4e5f6a7b8c9  roster_import_batches table, users.must_change_password
```

Both are reversible (`alembic downgrade -1` twice returns to `b1f2a3c4d5e6`).

---

## 7. Production Deployment

The production stack is a single `docker compose` project that runs the API, a
static build of the SPA behind Caddy, PostgreSQL, Redis, the Piston sandbox, a
daily backup loop and the camera-evidence retention job. Nothing in it mounts
host source code or runs a development server.

| File | What it is |
| :--- | :--- |
| `docker-compose.prod.yml` | The whole stack, under the distinct project name `campusflow-prod` so it never shares containers or volumes with the dev stack |
| `.env.production.example` | Every setting the stack reads; copy to `.env` and fill the two required secrets |
| `backend/Dockerfile` | Multi-stage image: dependencies installed once, no build tools in the runtime layer |
| `frontend/Dockerfile` | `npm ci && npm run build`, then the `dist/` output on `nginx:alpine` |
| `frontend/nginx.conf` | SPA history fallback, hashed-asset caching, no caching for `index.html` |
| `deploy/Caddyfile` | The only publicly bound service: `/api/*` to the backend, everything else to the SPA, with security headers and a 10 MB body cap |
| `deploy/backup.sh` | Nightly `pg_dump -Fc` into the `backups` volume with age-based pruning |

### 7.1 First deployment

Requirements: Docker Engine with Compose v2, and two ports (`80`, `443`) free on
the host. Nothing else needs to be installed on the server.

```bash
cp .env.production.example .env

# Generate the two required secrets and put them in .env:
python -c "import secrets; print(secrets.token_urlsafe(48))"   # POSTGRES_PASSWORD
python -c "import secrets; print(secrets.token_urlsafe(48))"   # JWT_SECRET_KEY

# Build and start everything. The backend applies migrations in-process before
# it starts serving (`alembic upgrade head`, idempotent, single replica), so the
# first `up` creates the schema.
docker compose -f docker-compose.prod.yml up -d --build

# Confirm the schema reached head.
docker compose -f docker-compose.prod.yml exec backend alembic current

# Create the first Campus Lead + platform operator account. There is no public
# sign-up, so this is the only way in to a fresh database.
docker compose -f docker-compose.prod.yml exec backend \
  python scripts/provision_admin.py \
  --email registrar@example.edu --password '<at least 12 characters>' \
  --first-name Ada --last-name Lovelace
```

The backend image runs the same two scripts the operator needs: `scripts/` is
copied into `/app/scripts` alongside `alembic/`.

When more than one API replica is ever introduced, move the migration out of the
container start: run `alembic upgrade head` as a one-off job before rolling the
replicas, otherwise concurrent starts can race on the same migration.

`provision_admin.py` is idempotent: an existing account only gains any missing
role, and `--reset-password` is required to change its password on purpose. It
prints the account and roles it assured, and writes a `user.bootstrap_admin`
audit record. Sign in once and rotate the bootstrap password through the normal
reset flow.

Compose refuses to start without `POSTGRES_PASSWORD` / `JWT_SECRET_KEY`
(`:?` interpolation), and the application itself refuses to start with the
shipped placeholder JWT secret when `DEBUG=false` (ADR-015). Both guards are
deliberate: a stack that silently comes up with a known secret is worse than one
that does not come up.

### 7.2 What runs, and what is reachable

| Service | Binding | Purpose |
| :--- | :--- | :--- |
| `proxy` (Caddy) | `0.0.0.0:80`, `:443` | The only public entry point. `/api/*` → backend, everything else → SPA |
| `backend` (FastAPI) | `127.0.0.1:8001` | API; loopback only so operators can curl it and a dev server can keep `:8000` |
| `frontend` (nginx) | `127.0.0.1:8080` | Static SPA build; loopback only, served through the proxy |
| `postgres` | `127.0.0.1:5433` | Database; loopback only for `psql`/`pg_dump` |
| `redis` | `127.0.0.1:6380` | Rate-limit and cache store, AOF persistence |
| `piston` | internal only | Code sandbox. Student code runs here, never in the API process |
| `piston-init` | — | One-shot: installs the Python, C, C++ and Java runtimes (idempotent) |
| `backup` | — | Nightly dump + prune loop |
| `evidence-retention` | — | Daily erasure of expired camera evidence frames (see §7.5) |

The loopback ports can be changed in `.env` and are only for maintenance; the
proxy is the only thing that needs to be reachable from the internet.

### 7.3 TLS and a real hostname

`deploy/Caddyfile` ships as `:80` so an internal or lab deployment works before
DNS exists. For a real deployment, replace the site address with the hostname:

```caddyfile
campusflow.example.edu {
    # …the same handle blocks as the shipped file…
}
```

Caddy then obtains and renews certificates automatically. Set `CORS_ORIGINS` in
`.env` to that same origin (`["https://campusflow.example.edu"]`) and restart the
backend; the SPA and API are same-origin, so one entry is enough.

### 7.4 Backups and restore

The `backup` service waits for PostgreSQL, sleeps until `BACKUP_START_HOUR`
(default 02:00 local), then writes `campusflow-YYYYmmdd-HHMMSS.dump`
(`pg_dump -Fc`) to the `backups` volume every 24 hours. A failed dump is logged
and the schedule continues; dumps older than `BACKUP_KEEP_DAYS` (default 14) are
pruned. Dumps are written to a `.tmp` name first and renamed only on success, so
a crashed dump can never be mistaken for a usable one.

```bash
# List what exists
docker compose -f docker-compose.prod.yml exec backup ls -lh /backups

# Copy the newest dump off the host (a backup on the same disk is not a backup)
docker compose -f docker-compose.prod.yml cp backup:/backups/campusflow-20261012-020000.dump .

# Restore into the live stack: stop the app, replace the schema, restart.
docker compose -f docker-compose.prod.yml stop backend frontend evidence-retention
docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists - \
  < campusflow-20261012-020000.dump
docker compose -f docker-compose.prod.yml up -d
```

Verify a restore by checking the schema version and a row count rather than by
the command's exit code:

```bash
docker compose -f docker-compose.prod.yml exec backend alembic current
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U campusflow -d campusflow -c 'select count(*) from users;'
```

### 7.5 Camera evidence retention (D-2)

Camera stills are the only personal-data payload the integrity trail stores. The
`evidence-retention` service runs `scripts/purge_proctoring_evidence.py` once a
day (after a two-minute settle delay on start). It erases the **image** from
`camera_snapshot` events older than `PROCTORING_EVIDENCE_RETENTION_DAYS`
(default 90) and leaves the event row — type, time, severity — in place with an
`evidence_purged_at` stamp, so the timeline is still reviewable. Each run that
erases anything writes a `proctoring.evidence_purge` audit record. `0` keeps
frames indefinitely and is never read as "erase everything".

Candidates are told the window in the assessment brief; the value is sent to the
client with the exam, not hard-coded in the copy.

```bash
# Run it by hand (safe and idempotent)
docker compose -f docker-compose.prod.yml exec backend \
  python scripts/purge_proctoring_evidence.py --retention-days 30
```

### 7.6 Sandbox limits

The Piston container runs privileged so its `isolate` sandbox can apply real
cgroup limits. `PISTON_RUN_TIMEOUT` / `PISTON_COMPILE_TIMEOUT` must stay at or
above `CODE_RUN_MAX_TIMEOUT_MS`, or Piston refuses the job with HTTP 400.

`CODE_RUN_MEMORY_LIMIT_KB` is enforced — measured on this stack: a 512 MB
allocation under a 128 MB ceiling is killed (`status: SG`, `SIGKILL`, "Caught
fatal signal 9") instead of succeeding, while an ordinary run still completes.
Only set it on hosts where the sandbox can enforce a cgroup cap; elsewhere a
requested limit makes the sandbox kill work it should have run.

### 7.7 Verifying a deployment

```bash
# 1. The proxy answers and the SPA is the SPA (not a JSON error)
curl -si http://127.0.0.1/ | head -5
curl -s http://127.0.0.1/ | grep -qi '<title>CampusFlow' && echo 'SPA ok'

# 2. The API through the proxy, on the same origin the browser uses
curl -s http://127.0.0.1/api/health

# 3. Unauthenticated API access is refused, not accidentally served
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/api/v1/users   # 401

# 4. Sign in with the provisioned account through the proxy
curl -s -X POST http://127.0.0.1/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"registrar@example.edu","password":"<password>"}'

# 5. Database schema is at head, and the backup volume has a dump
docker compose -f docker-compose.prod.yml exec backend alembic current
docker compose -f docker-compose.prod.yml exec backup ls -lh /backups
```

### 7.8 Upgrading an existing deployment

```bash
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -Fc -U campusflow campusflow > pre-upgrade.dump   # rollback point
docker compose -f docker-compose.prod.yml up -d              # migrates on start
docker compose -f docker-compose.prod.yml exec backend alembic current
```

Every migration in this repository is reversible; check `alembic history` against
`docs/development.md` §6.2 before downgrading, and take the dump first anyway.

### 7.9 Troubleshooting

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| Backend exits at start with a message about `JWT_SECRET_KEY` | `DEBUG=false` and the placeholder secret is still in `.env` | Set a generated secret; this guard is intentional |
| `compose` refuses to start: `Set POSTGRES_PASSWORD in .env` | The required-secret interpolation has no value | Fill `.env`; do not "fix" it by deleting the `:?` guard |
| Login returns 401 immediately after a deploy | Schema not migrated, or the account was created before the migration | `alembic upgrade head`, then re-run `provision_admin.py` |
| Code runs fail with 503 | Piston is not ready or the runtime is missing | `docker compose -f docker-compose.prod.yml logs piston-init`; the backend fails closed rather than faking a result |
| Browser calls fail with CORS errors | `CORS_ORIGINS` does not include the origin actually in the address bar | Set it to the deployment origin (scheme **and** host) and restart the backend |
| Evidence frames still present after the retention window | The project-specific `evidence-retention` service has not run yet, or `PROCTORING_EVIDENCE_RETENTION_DAYS=0` | Check its logs; run the purge by hand (safe) |

### 7.10 Continuous integration

`.github/workflows/ci.yml` runs the checks a reviewer would run: backend lint +
the full pytest suite against PostgreSQL (and SQLite), and the frontend
lint/typecheck/build. The PostgreSQL job is the one that matters for release —
the concurrency constraints and the JSON columns behave differently from SQLite.

### 7.11 Hosting the SPA on Vercel (optional split)

The supported deployment is still the single Compose host in §7.1. Vercel is a reasonable host for
the **static SPA only**; it cannot run this backend. The API needs a long-lived FastAPI process,
persistent PostgreSQL and Redis connections, the Piston sandbox container, the retention and backup
jobs, and cookie handling across an entire exam attempt. Vercel Functions are not a drop-in for any
of that, and a database-per-request serverless model would break the attempt transaction.

If the frontend is hosted separately:

1. Create a Vercel project with **Root Directory** `frontend`. The Vite preset builds with
   `npm run build` and serves `dist/`; keep `npm ci` as the install command.
2. Proxy the API through the same origin with a rewrite: `/api/:path*` to
   `https://<backend-host>/api/:path*`, placed **before** the SPA fallback
   (`/:path*` to `/index.html`).
3. Keep the backend, PostgreSQL, Redis and Piston on the Compose host, reachable over HTTPS at the
   same `/api/v1/...` paths.
4. Do not change the client's `baseURL` (`/api/v1`) and do not split the API onto a second origin.
   The `httpOnly`, `SameSite=Strict` refresh cookie and the access-token header are built around
   one origin. The Vercel rewrite keeps the browser on one origin, so no CORS or `SameSite=None`
   change is needed.
5. `CORS_ORIGINS` only needs the Vercel origin if a browser later calls the API directly from a
   different origin; the same-origin rewrite does not use it.

The SPA has no server-side dependency: every `/api` call is proxied and `index.html` is the only
entry point. No `vercel.json` is committed because the rewrite destination is institution-specific;
set it in the Vercel project (or in a local `frontend/vercel.json` at deploy time) so no placeholder
host ships in the repository.
