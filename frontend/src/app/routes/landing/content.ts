import {
  BookOpen,
  Building2,
  ClipboardList,
  FileEdit,
  GraduationCap,
  Landmark,
  Library,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  TrendingUp,
  UserRound,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Copy for the landing page, kept out of the JSX so the page stays readable.
 *
 * Every claim here is one the repository can back: the figures come from
 * `docs/progress.md`, the permission catalogue in `bedrock/rbac/service.py`,
 * the exam policy vocabulary in `domain/exams/schemas.py`, and the runbook in
 * `docs/development.md`. Nothing on this page is a roadmap promise dressed as
 * a feature — the gaps live in LIMITS, stated plainly.
 */

export const NAV = [
  { label: 'Platform', href: '#platform' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Integrity', href: '#integrity' },
  { label: 'Stack', href: '#stack' },
  { label: 'Deploy', href: '#deploy' },
] as const;

export const STATS = [
  { figure: '1', label: 'server', note: 'API, database, sandbox and proxy' },
  { figure: '6', label: 'roles', note: 'over one 67-permission catalogue' },
  { figure: '83', label: 'backend tests', note: 'passing on PostgreSQL' },
  { figure: '0', label: 'SaaS dependencies', note: 'no public sign-up, no vendor' },
] as const;

export interface RecordRow {
  label: string;
  detail: string;
}

export const RECORD_ROWS: RecordRow[] = [
  { label: 'Roster', detail: '62 students, imported from CSV' },
  { label: 'Materials', detail: '14 files in 3 folders' },
  { label: 'Assignments', detail: '6, weighted to 100%' },
  { label: 'Examinations', detail: '2 scheduled, 1 released' },
  { label: 'Integrity', detail: '41 signals, 3 reviewed' },
  { label: 'Marks', detail: '62 rows in the gradebook' },
];

export interface DisconnectedTool {
  title: string;
  body: string;
}

export const DISCONNECTED: DisconnectedTool[] = [
  {
    title: 'An LMS that cannot invigilate',
    body: 'Folders, quizzes and a gradebook — with no notion of a scheduled window, a timed attempt, or a signal recorded during one.',
  },
  {
    title: 'A proctoring tool with no roster',
    body: 'A separate subscription that reports on an account it cannot resolve to a section, an examination, or the mark that should follow.',
  },
  {
    title: 'A code judge in another identity space',
    body: 'A public judge that never learns who is enrolled, under which instructor, or where the verdict belongs once it exists.',
  },
];

export interface Shot {
  src: string;
  alt: string;
  title: string;
  caption: string;
}

export const DASHBOARD_SHOT: Shot = {
  src: '/shots/dashboard.png',
  alt: 'CampusFlow institutional analytics: enrolment, faculty load, course performance and examination readiness computed from live records',
  title: 'Institutional analytics',
  caption: 'Enrolment, faculty load, course performance and examination readiness — computed from the same records the students and faculty see.',
};

export interface Module {
  id: string;
  label: string;
  icon: LucideIcon;
  title: string;
  kicker: string;
  summary: string;
  bullets: string[];
  who: string[];
  shot?: Shot;
}

export const MODULES: Module[] = [
  {
    id: 'structure',
    label: 'Academic structure',
    icon: Building2,
    title: 'The institution, modelled once',
    kicker: 'Departments · programmes · batches · terms',
    summary:
      'Departments own programmes, programmes own batches, and a term turns a course into the section a student actually enrols in. Everything downstream hangs off that one row.',
    bullets: [
      'Departments, programmes, batches and academic terms, each editable from one administrative page.',
      'Courses belong to a department; a section is that course in a term, with its own roster and faculty.',
      'Offerings are filtered by the caller’s department — a head cannot browse another department’s draft sections.',
      'Faculty assignment is a scoped action on the section, not a global role change.',
    ],
    who: ['Campus Lead', 'Department Head'],
  },
  {
    id: 'workspace',
    label: 'Course workspace',
    icon: BookOpen,
    title: 'One section, everything the cohort needs',
    kicker: 'Materials · announcements · roster',
    summary:
      'The workspace a student opens and an instructor teaches from: folders, files, announcements and the roster that decides who may open any of it.',
    bullets: [
      'Folder-based materials with authenticated download — a file is served only to a caller the offering scope permits.',
      'Announcements addressed to the section, not broadcast to the whole institution.',
      'Roster import from CSV that skips duplicates, so re-running a corrected file never enrols anyone twice.',
      'The roster, the materials and the gradebook share one scope check; there is no second answer to “may this person see this?”',
    ],
    who: ['Faculty', 'Student'],
    shot: {
      src: '/shots/course-workspace.png',
      alt: 'Course workspace with announcements, materials and the section roster',
      title: 'The course workspace',
      caption: 'Materials, announcements and the roster behind one section.',
    },
  },
  {
    id: 'assignments',
    label: 'Assignments & grades',
    icon: FileEdit,
    title: 'Work handed in, marks handed back',
    kicker: 'Rubrics · late policy · weighted gradebook',
    summary:
      'An assignment knows its marks, its weight in the final grade, whether late work is accepted and what it is graded against.',
    bullets: [
      'Due dates, late windows with a per-day penalty, and a publish state per assignment.',
      'Text or file submission; the instructor downloads the artefact and grades it with written feedback.',
      'A rubric per assignment, so partial credit is structured rather than improvised.',
      'A weighted gradebook computed from weightages, with CSV export for the registry.',
      'Students read their own submissions and marks — a separate projection, never a peer’s.',
    ],
    who: ['Faculty', 'Student'],
  },
  {
    id: 'banks',
    label: 'Question banks',
    icon: Library,
    title: 'The syllabus, remembered as questions',
    kicker: 'Six types · approval state · CSV in and out',
    summary:
      'Questions live in a bank scoped to a department and optionally a course, carry marks and negative marks, and must be approved before a paper can draw on them.',
    bullets: [
      'Single choice, multiple response, true/false, fill-in-the-blank, short answer and essay.',
      'Marks, negative marks and an explanation — held back from the candidate until release.',
      'A draft → approved workflow, so a scheduled paper only draws on vetted questions.',
      'CSV import and export, for the backlog that already exists in a spreadsheet.',
    ],
    who: ['Faculty', 'Exam Controller'],
    shot: {
      src: '/shots/question-banks.png',
      alt: 'Question bank authoring with departments, approval state and question types',
      title: 'Banks, not spreadsheets',
      caption: 'Every question type, an approval state, and CSV import for the backlog.',
    },
  },
  {
    id: 'exams',
    label: 'Examinations',
    icon: ClipboardList,
    title: 'A paper, from draft to released mark',
    kicker: 'Assembly · windows · server timing · release',
    summary:
      'Sections and marks, a scheduling window, an attempt the server times, a grading queue for the subjective answers, and a release that feeds the gradebook.',
    bullets: [
      'Paper sections with per-question marks and negative marks, plus question shuffling.',
      'Random paper generation by bank, tag, difficulty and type — one assessment can span several sections.',
      'Server-authoritative timing with autosaved answers; a refresh or a dropped connection is reconciled, not lost.',
      'Objective questions score automatically; subjective answers wait in a queue with their rubric.',
      'Publishing releases the scorecard, updates the gradebook and recomputes exam analytics from the same records.',
    ],
    who: ['Exam Controller', 'Faculty', 'Student'],
    shot: {
      src: '/shots/exam-workspace.png',
      alt: 'Examination workspace with the paper structure, questions and the grading queue',
      title: 'The paper, assembled',
      caption: 'Sections, question sources and the grading queue in one workspace.',
    },
  },
  {
    id: 'integrity',
    label: 'Integrity monitoring',
    icon: ShieldAlert,
    title: 'Signals recorded, policies enforced, decisions audited',
    kicker: 'Tolerance · outcome · review · retention',
    summary:
      'An examination records what happened during the attempt and judges it against a policy the paper’s author set — disclosed to the candidate before the clock starts.',
    bullets: [
      'Tab switches, window blur, focus loss, clipboard use and full-screen exit, each timestamped against the attempt.',
      'Optional on-device camera checks: a periodic frame, a timed obstruction threshold, and prohibited-device detection that is off unless an exam turns it on.',
      'A tolerance of 1–20 events per exam, and an explicit outcome: remove the candidate, or let them continue and flag the attempt for review.',
      'A live invigilation view of active attempts as their signals arrive, and a review queue with the full timeline.',
      'Resumption and unlocking are faculty decisions written to the audit trail — never a silent reset.',
    ],
    who: ['Exam Controller', 'Faculty', 'Student'],
  },
  {
    id: 'programming',
    label: 'Code sandbox',
    icon: Terminal,
    title: 'Student code, run somewhere it cannot hurt',
    kicker: 'Piston isolate · public and hidden tests',
    summary:
      'An in-browser editor posts to the API, which hands the program to a Piston sidecar. The code runs inside an isolate with CPU, memory and concurrency ceilings — never in the API process.',
    bullets: [
      'Problems with public sample tests and a hidden grading suite.',
      '“Run” checks the public tests while the student writes; “Submit” grades against the hidden suite in the sandbox.',
      'Runtime verdicts and per-test results, with submission history for both the author and the student.',
      'An unreachable sandbox is a fail-closed 503 — an outage never becomes an invented pass.',
    ],
    who: ['Faculty', 'Student'],
    shot: {
      src: '/shots/programming.png',
      alt: 'Sandboxed programming problem with the in-browser editor and per-test results',
      title: 'Code, graded',
      caption: 'Public tests while writing; the hidden suite runs in the sandbox.',
    },
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: TrendingUp,
    title: 'Two projections of the same records',
    kicker: 'Institution · course · exam · student',
    summary:
      'The institution gets an operating picture; a student gets their own. Both are computed from the cohort records, not from a separate reporting warehouse.',
    bullets: [
      'Institution overview: enrolment, faculty load, course performance and examination readiness.',
      'Course and exam analytics scoped to the offering — a department head sees their department, not the campus.',
      'An integrity trend computed from recorded signals, not from a satisfaction survey.',
      'A student dashboard of deadlines, marks and the next examination, scoped to their own cohort.',
    ],
    who: ['Campus Lead', 'Department Head', 'Faculty', 'Student'],
    shot: {
      src: '/shots/student-dashboard.png',
      alt: 'Student dashboard with their own deadlines, marks and upcoming examinations',
      title: 'The student’s own view',
      caption: 'A different projection of the same records — never a peer’s.',
    },
  },
  {
    id: 'identity',
    label: 'Identity & audit',
    icon: ShieldCheck,
    title: 'The layer everything else rests on',
    kicker: 'Sessions · permissions · audit trail',
    summary:
      'Six roles over a 67-permission catalogue, short-lived access tokens with rotating refresh cookies, and an append-only record of every consequential action.',
    bullets: [
      'JWT access tokens, rotating refresh cookies (httpOnly, SameSite=Strict), and per-IP rate limits on credential endpoints.',
      'Bulk user import, role assignment, password reset request and reset, and deactivation instead of deletion.',
      'Institution settings that include the camera-evidence retention window candidates are told about.',
      'An append-only audit trail for role changes, roster commits, paper edits, grades, releases, threshold changes and purges.',
      'In-app notifications with per-user preferences, so the platform does not depend on outbound mail.',
    ],
    who: ['Campus Lead'],
  },
];

export const CAPABILITIES = [
  'Departments, programmes, batches and terms',
  'Courses with a section per term',
  'Faculty assigned per section',
  'Duplicate-safe CSV roster import',
  'Folders, uploads and authenticated download',
  'Section announcements',
  'Six question types with approval state',
  'Marks and negative marks per question',
  'CSV import and export for banks',
  'Random papers by tag, difficulty and type',
  'One assessment across several sections',
  'Question shuffling',
  'Scheduled windows with server timing',
  'Autosaved attempts that survive a refresh',
  'Auto-scoring plus a subjective queue',
  'Per-exam integrity tolerance and outcome',
  'Tab, blur, focus, clipboard and full-screen signals',
  'Optional on-device device detection',
  'Camera evidence with expiry and audit',
  'Live invigilation of active attempts',
  'Piston isolate with CPU and memory ceilings',
  'Public sample tests and a hidden suite',
  'Weighted gradebook with CSV export',
  'Institution, course and student analytics',
  'Append-only audit trail',
  'Notifications with per-user preferences',
  'Six roles over 67 permissions',
  'Docker Compose production stack with TLS',
] as const;

export interface Track {
  id: string;
  role: string;
  icon: LucideIcon;
  title: string;
  purpose: string;
  steps: string[];
}

export const TRACKS: Track[] = [
  {
    id: 'institution',
    role: 'Campus Lead',
    icon: Landmark,
    title: 'Stand up the institution',
    purpose: 'From an empty database to a term that staff and students can sign in to.',
    steps: [
      'Deploy the stack, then provision the first Campus Lead from the command line — there is no public sign-up.',
      'In Settings, set the institution name, timezone, grading defaults and the camera-evidence retention window.',
      'Create departments, then the programmes and batches that belong to each one.',
      'Add the academic term. It bounds every course section and every examination window.',
      'Import staff and students from CSV, or create them one at a time.',
      'Assign roles: department heads, faculty, and the exam controller for the term.',
    ],
  },
  {
    id: 'course',
    role: 'Department Head · Faculty',
    icon: GraduationCap,
    title: 'Build the course',
    purpose: 'A section with a roster, material and work that carries marks.',
    steps: [
      'Create the course, then open its section in the current term.',
      'Attach the faculty who teach it — they can now open the workspace and nothing else.',
      'Import the roster CSV. Students already enrolled are skipped, not duplicated.',
      'Add material folders, upload the first files, and post the announcement that opens the term.',
      'Author assignments with marks, weightage, a due date and a rubric.',
      'Check the gradebook: the weighted total is visible before the first submission arrives.',
    ],
  },
  {
    id: 'exam',
    role: 'Exam Controller',
    icon: ClipboardList,
    title: 'Run the examination',
    purpose: 'A scheduled paper, an invigilated sitting, and a released result.',
    steps: [
      'Open a question bank for the course; author questions or import the backlog from CSV.',
      'Approve the questions the paper may draw on — assembly only sees approved questions from the bank.',
      'Assemble the paper: sections, marks, negative marks, shuffling. Or generate it by tag, difficulty and type.',
      'Schedule the window and author the integrity policy: tolerance, outcome, device checks, retention disclosure.',
      'During the sitting, watch active attempts and their signals; review any attempt the policy flagged.',
      'Grade the subjective answers, publish, and export results. Marks and analytics update from the same records.',
    ],
  },
  {
    id: 'student',
    role: 'Student',
    icon: UserRound,
    title: 'Sit the paper',
    purpose: 'One cohort, one timed attempt, one honest scorecard.',
    steps: [
      'Sign in and land on your own dashboard: deadlines, marks, and the next examination.',
      'Open the brief early. Timing, marks and the integrity policy are disclosed before the clock starts.',
      'Complete the camera check if this exam requires one; a failed check is explained, not hidden.',
      'Sit the attempt: answers autosave, and the remaining time comes from the server, not the browser.',
      'Submit — or let the window close, and the server submits what was saved.',
      'Read the released scorecard. Per-question feedback appears only after publication.',
    ],
  },
];

export interface Stage {
  kicker: string;
  title: string;
  body: string;
}

export const STAGES: Stage[] = [
  {
    kicker: 'Author',
    title: 'Question bank',
    body: 'Types, marks, negative marks and an approval state. CSV brings the backlog in.',
  },
  {
    kicker: 'Assemble',
    title: 'Paper sections',
    body: 'Sections, shuffling and per-question marks — or draw a random paper by tag and difficulty.',
  },
  {
    kicker: 'Schedule',
    title: 'Window + policy',
    body: 'A start and end the server enforces, with the integrity tolerance and outcome authored on the paper.',
  },
  {
    kicker: 'Sit',
    title: 'Timed attempt',
    body: 'Server clock, autosaved answers, camera check where required, every signal recorded.',
  },
  {
    kicker: 'Grade',
    title: 'Score + rubric',
    body: 'Objective answers score themselves; subjective answers wait in a queue with the rubric attached.',
  },
  {
    kicker: 'Publish',
    title: 'Result + gradebook',
    body: 'The scorecard is released, the section grade updates, and analytics recompute from the same rows.',
  },
];

export interface Role {
  name: string;
  icon: LucideIcon;
  owns: string;
  cannot: string;
}

export const ROLES: Role[] = [
  {
    name: 'Campus Lead',
    icon: Landmark,
    owns: 'Institution identity, users and roles, academic structure, retention, the audit trail, institution-wide analytics.',
    cannot: 'Delete the audit trail. Consequential actions are appended, never erased.',
  },
  {
    name: 'Department Head',
    icon: Users,
    owns: 'Programmes, courses, sections and faculty for one department, plus that department’s analytics.',
    cannot: 'Open another department’s sections, roster or gradebook — the query is scoped before it runs.',
  },
  {
    name: 'Faculty',
    icon: GraduationCap,
    owns: 'Materials, announcements, assignments and rubrics for the sections they teach; the weighted gradebook; question authoring.',
    cannot: 'Open a section they are not assigned to. Permission without scope is not access.',
  },
  {
    name: 'Exam Controller',
    icon: ShieldAlert,
    owns: 'Question banks, paper assembly, scheduling windows, the integrity policy, and the release of results.',
    cannot: 'Reach the gradebook. Exam-bureau reach is opt-in per call site and never extends to marks.',
  },
  {
    name: 'Student',
    icon: UserRound,
    owns: 'Their own cohort only: materials, assignments, one timed attempt, and their own scorecard.',
    cannot: 'See a peer’s work or marks. Asking for an object outside the cohort returns 404, not a confirmation that it exists.',
  },
];

export interface Rule {
  rule: string;
  how: string;
}

export const SECURITY: Rule[] = [
  {
    rule: 'Every route declares a gate',
    how: 'A test walks the live route table and fails the build if a route has neither a permission or role dependency nor a deliberate place on the public allowlist.',
  },
  {
    rule: 'Cohort data needs scope, not just permission',
    how: 'Gradebook, roster, materials, analytics and attempt surfaces all pass one offering-scope kernel. Scope checks are never re-implemented inline.',
  },
  {
    rule: 'Two projections, never one',
    how: 'Staff and candidate payloads are different models. Canary tests assert answer keys, rubrics and hidden test expectations never appear in a candidate response.',
  },
  {
    rule: 'Anti-enumeration, not just denial',
    how: 'A student asking for something outside their cohort gets 404. Staff denials stay 403. The error cannot be used to confirm an object exists.',
  },
  {
    rule: 'Untrusted code never runs in-process',
    how: 'Submissions go to a Piston sidecar inside an isolate with CPU, memory and concurrency ceilings. An unreachable sandbox is a fail-closed 503.',
  },
  {
    rule: 'Credentials are cookies, not JSON',
    how: 'Refresh tokens live in an httpOnly SameSite=Strict cookie, credential endpoints are rate-limited per IP, and the API refuses to start with the shipped placeholder secret.',
  },
  {
    rule: 'Personal data expires',
    how: 'Camera frames are erased after an institution-configured window. The integrity event and its timeline survive, and every erasure writes an audit record.',
  },
  {
    rule: 'Consequential actions are appended',
    how: 'Role changes, roster commits, paper edits, grading, publishing, threshold changes, resumption and purges all write to an immutable trail.',
  },
];

export const INTEGRITY_FACTS = [
  { figure: '4 s', label: 'default obstruction threshold, authored per exam (2–30 s)' },
  { figure: '1–20', label: 'integrity events tolerated, set on the paper' },
  { figure: '90 days', label: 'default camera-evidence retention, disclosed to candidates' },
  { figure: '0', label: 'answer keys reachable from a candidate payload' },
] as const;

export const GALLERY: Shot[] = [
  {
    src: '/shots/examinations.png',
    alt: 'Scheduled, live and published examinations with attempt counts',
    title: 'The examination board',
    caption: 'What is scheduled, what is live, and what is waiting to be released.',
  },
  {
    src: '/shots/assessment.png',
    alt: 'Candidate assessment brief with the timed-paper summary, integrity disclosure and camera notice',
    title: 'The candidate’s brief',
    caption: 'Timing, marks and the integrity policy are disclosed before the clock starts.',
  },
  {
    src: '/shots/course-workspace.png',
    alt: 'Course workspace with announcements, materials and the roster',
    title: 'The course workspace',
    caption: 'Materials, announcements and the roster behind one section.',
  },
  {
    src: '/shots/question-banks.png',
    alt: 'Question bank authoring with departments, approval state and question types',
    title: 'Banks, not spreadsheets',
    caption: 'Six question types, an approval state, and CSV for the backlog.',
  },
  {
    src: '/shots/programming.png',
    alt: 'Sandboxed programming problem with the in-browser editor and per-test results',
    title: 'Code, graded',
    caption: 'The editor runs public tests; grading runs the hidden suite in the sandbox.',
  },
  {
    src: '/shots/student-dashboard.png',
    alt: 'Student dashboard with their own deadlines, marks and upcoming examinations',
    title: 'The student’s own view',
    caption: 'A different projection of the same data — deadlines, marks, next examination.',
  },
];

export const STACK = [
  {
    layer: 'API',
    choice: 'Python 3.12 · FastAPI · Pydantic v2',
    why: 'Request schemas double as the validation and authorization surface.',
  },
  {
    layer: 'Data',
    choice: 'PostgreSQL 15 · SQLAlchemy 2 (async) · Alembic',
    why: 'Invariants live in constraints, not in application hope.',
  },
  {
    layer: 'Frontend',
    choice: 'React 19 · TypeScript · Vite · TanStack Query · Tailwind CSS 4',
    why: 'A typed SPA on a light institutional theme — no separate UI kit to keep in sync.',
  },
  {
    layer: 'Identity',
    choice: 'JWT access tokens · rotating refresh cookies · RBAC · audit',
    why: 'Six roles over 67 permissions, with every consequential change written down.',
  },
  {
    layer: 'Sandbox',
    choice: 'Piston (isolate) in a dedicated container',
    why: 'Real CPU, memory and concurrency ceilings around untrusted student code.',
  },
  {
    layer: 'Delivery',
    choice: 'Docker Compose · Caddy with TLS · GitHub Actions',
    why: 'One host, one origin, one front door; CI runs the suite against PostgreSQL.',
  },
] as const;

export interface ArchitectureLayer {
  name: string;
  tag: string;
  items: string[];
}

export const ARCHITECTURE: ArchitectureLayer[] = [
  {
    name: 'Client',
    tag: 'React 19 SPA',
    items: ['Typed API client', 'TanStack Query', 'Session guard'],
  },
  {
    name: 'Edge',
    tag: 'Caddy',
    items: ['TLS termination', 'Only public listener', 'SPA + API on one origin'],
  },
  {
    name: 'API',
    tag: 'campusflow',
    items: ['bedrock: config · db · auth · rbac · audit · storage · mail · runner', 'domain: users · institution · courses · assessments · exams · programming · analytics'],
  },
  {
    name: 'Data',
    tag: 'Stateful services',
    items: ['PostgreSQL 15', 'Piston isolate', 'Redis (optional)', 'Local object storage'],
  },
];

export const INSTALL = `cp .env.production.example .env          # set POSTGRES_PASSWORD and JWT_SECRET_KEY
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend \\
  python scripts/provision_admin.py --email you@example.edu --password 'at least 12 characters'`;

export interface EnvVar {
  key: string;
  required?: boolean;
  note: string;
}

export const ENV_VARS: EnvVar[] = [
  {
    key: 'POSTGRES_PASSWORD',
    required: true,
    note: 'Compose refuses to start without it. Generate one with secrets.token_urlsafe(48).',
  },
  {
    key: 'JWT_SECRET_KEY',
    required: true,
    note: 'The API refuses to boot outside debug while this is still the shipped placeholder.',
  },
  {
    key: 'CORS_ORIGINS',
    note: 'The deployment origin. Same-origin by default; add a second only if one exists.',
  },
  {
    key: 'INSTITUTION_NAME · INSTITUTION_TIMEZONE',
    note: 'What the interface calls the college, and the clock its windows are authored in.',
  },
  {
    key: 'PROCTORING_EVIDENCE_RETENTION_DAYS',
    note: 'How long camera stills are kept. The event and its timeline always survive.',
  },
  {
    key: 'CODE_RUN_MEMORY_LIMIT_KB · CODE_RUN_MAX_TIMEOUT_MS',
    note: 'The ceilings the sandbox enforces on submitted code.',
  },
  {
    key: 'EMAIL_BACKEND',
    note: 'Console by default. Set to smtp with a relay of your own — none is bundled.',
  },
];

export const BOOT_SEQUENCE = [
  'Compose interpolates `.env` and starts PostgreSQL, Redis, the Piston sandbox and the API.',
  'Migrations run at start; the API stays unhealthy until the schema is at head.',
  'The SPA is built and served by Caddy, the only service bound to the host.',
  'The evidence-retention job erases frames past the configured window, every day.',
  'The backup sidecar takes a nightly pg_dump and prunes dumps past the keep window.',
];

export const VERIFICATION = [
  { dir: 'backend', command: 'ruff check .', result: 'clean' },
  { dir: 'backend', command: 'pytest -q · SQLite', result: '81 passed, 2 skipped' },
  { dir: 'backend', command: 'pytest -q · PostgreSQL', result: '83 passed' },
  { dir: 'frontend', command: 'npm run lint', result: '0 errors' },
  { dir: 'frontend', command: 'npm run build', result: 'success' },
];

export const LIMITS = [
  {
    title: 'The guided Python course is not built',
    body: 'Problems, tests, grading and the sandbox are complete. A course with lessons and progress tracking is the largest remaining product gap.',
  },
  {
    title: 'Only Python is verified end to end',
    body: 'C, C++ and Java runtimes ship with the sandbox, but their grading paths are not exercised yet.',
  },
  {
    title: 'No browser-driven end-to-end suite yet',
    body: 'The backend suite and the live HTTP walkthroughs are thorough. Playwright coverage is the honest next step.',
  },
  {
    title: 'The camera check needs a human',
    body: 'It cannot be automated in a headless browser, so it is verified against a documented manual procedure.',
  },
  {
    title: 'One institution per deployment',
    body: 'Multiple colleges means a second deployment, not a tenant in this one. Multi-tenancy is deliberately out of scope.',
  },
];

export const FAQ = [
  {
    q: 'Is there a hosted demo I can click through?',
    a: 'No. A live instance would be a writable, multi-tenant examination platform with a privileged sandbox and real proctoring data — not something to leave on a public URL. The three-command stack is the demo, and a seeded development database ships with the five demo accounts.',
  },
  {
    q: 'How long does it take to get running?',
    a: 'Three commands on a host with Docker Engine, Compose v2 and free ports 80/443: copy the production env file, bring the stack up, then provision the first Campus Lead. Migrations run at start, so the first sign-in works immediately afterwards.',
  },
  {
    q: 'Does it need a GPU, or a proctoring vendor?',
    a: 'Neither. Camera verification runs in the candidate’s browser and the device model runs on-device; the server receives an event, not a video stream. There is no third-party proctoring service in the request path.',
  },
  {
    q: 'Can I run it without Docker?',
    a: 'Yes, for development. The bootstrap falls back to a local SQLite file and everything runs except sandboxed execution — and the interface says so rather than pretending the sandbox is available.',
  },
  {
    q: 'Which database does production use?',
    a: 'PostgreSQL 15 in both development and production Compose stacks. SQLite is the fallback for a host without Docker, and the test suite runs against both; CI uses PostgreSQL, where the concurrency tests actually execute.',
  },
  {
    q: 'What happens to camera stills?',
    a: 'They are personal data, so they expire. A daily job erases frames older than the institution’s retention window, while the integrity event — what happened and when — is kept for review. The window is disclosed to candidates in the assessment brief, and every purge is audited.',
  },
  {
    q: 'Can a student see another student’s marks?',
    a: 'No. Candidates and staff are served by different response models, and every listing is filtered by the offering-scope kernel before it reaches the query. A request for an object outside the cohort returns 404 rather than a 403 that confirms it exists.',
  },
  {
    q: 'Is it really MIT licensed?',
    a: 'Yes — the whole repository, with no open-core split. One deployment per institution, and no licence server to call.',
  },
] as const;
