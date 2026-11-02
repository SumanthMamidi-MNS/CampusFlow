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
  { label: 'Screens', href: '#screens' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Integrity', href: '#integrity' },
  { label: 'Deployment', href: '#deployment' },
  { label: 'Proof', href: '#proof' },
] as const;

export const MARQUEE = [
  'One roster',
  'One authorization model',
  'One audit trail',
  'One server',
  'No public sign-up',
  'Delivered per college',
] as const;

export const STATS = [
  { figure: '1', label: 'server', note: 'API · database · sandbox · proxy' },
  { figure: '6', label: 'roles', note: 'one 26-permission catalogue' },
  { figure: '103', label: 'backend tests', note: 'in the suite · CI runs PostgreSQL' },
  { figure: '0', label: 'SaaS deps', note: 'no sign-up, no vendor' },
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
      'On-device camera checks: face and head direction, prohibited devices, and opt-in hand, voice and mouth cues — all measured in the candidate’s browser, with no video streamed.',
      'A tolerance of 1–20 events per exam, and an explicit outcome: remove the candidate, or let them continue and flag the attempt for review.',
      'A live invigilation view of active attempts as their signals arrive, and a review queue with the full timeline.',
      'Resumption and unlocking are faculty decisions written to the audit trail — never a silent reset.',
    ],
    who: ['Exam Controller', 'Faculty', 'Student'],
    shot: {
      src: '/tour/faculty/faculty-10-exam-grading.webp',
      alt: 'Candidate attempts with status, score, integrity event count and the review and reopen actions a lecturer can take',
      title: 'The review queue',
      caption:
        'Each candidate’s status, score and integrity events, with the review and reopen actions the lecturer is authorised for.',
    },
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
      'Six roles over a 26-permission catalogue, short-lived access tokens with rotating refresh cookies, and an append-only record of every consequential action.',
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
  'Six roles over 26 permissions',
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
  /** What this stage hands to the next one. */
  leaves: string;
}

export const STAGES: Stage[] = [
  {
    kicker: 'Author',
    title: 'Question bank',
    body: 'Types, marks, negative marks and an approval state. CSV brings the backlog in.',
    leaves: 'An approved question with its marks and its key.',
  },
  {
    kicker: 'Assemble',
    title: 'Paper sections',
    body: 'Sections, shuffling and per-question marks — or draw a random paper by tag and difficulty.',
    leaves: 'A paper whose sections add up, ready to be scheduled.',
  },
  {
    kicker: 'Schedule',
    title: 'Window + policy',
    body: 'A start and end the server enforces, with the integrity tolerance and outcome authored on the paper.',
    leaves: 'A window the server will close, whoever is still typing.',
  },
  {
    kicker: 'Sit',
    title: 'Timed attempt',
    body: 'Server clock, autosaved answers, camera check where required, every signal recorded.',
    leaves: 'One attempt, with a timeline and an autosaved answer set.',
  },
  {
    kicker: 'Grade',
    title: 'Score + rubric',
    body: 'Objective answers score themselves; subjective answers wait in a queue with the rubric attached.',
    leaves: 'A score, and the rubric every mark on it was given against.',
  },
  {
    kicker: 'Publish',
    title: 'Result + gradebook',
    body: 'The scorecard is released, the section grade updates, and analytics recompute from the same rows.',
    leaves: 'A released result the gradebook and analytics both read.',
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
  { figure: '3', label: 'sensitivity tiers — relaxed, standard, strict — authored per paper' },
  { figure: '10', label: 'warnings by default, authored per paper between 1 and 20' },
  { figure: '5 s', label: 'minimum gap after an acknowledgement; signals inside it are still logged' },
  { figure: '90 days', label: 'default camera-evidence retention, disclosed to candidates' },
  { figure: '0', label: 'answer keys reachable from a candidate payload' },
] as const;

/**
 * What a paper records, and what the lecturer receives (ADR-029, ADR-032).
 *
 * Every confirmed cue — browser event or camera measurement — spends exactly one
 * of the disclosed warnings. None of them is a verdict on its own: each warning
 * also carries what was seen and, for a camera cue, a still, and a person
 * decides. The split is between the ladder and the evidence, not between
 * "counted" and "advisory", because the advisory tier no longer exists.
 */
export const INTEGRITY_CUES = [
  {
    tier: 'counts toward the disclosed allowance' as const,
    items: [
      'Leaving the paper — tab switch, focus loss, full-screen exit',
      'Head turned past the threshold for the tier, sustained',
      'No face in frame for the tier\u2019s absence window',
      'Two or more faces at the desk',
      'Camera stopped or obstructed past the authored grace',
      'Clipboard and context-menu attempts, window resize, network change',
      'A probable phone, earbuds or smartwatch in the camera picture',
      'A hand held at the face past the dwell \u2014 reading off something in the hand',
      'A sustained, loud second voice in the room',
    ],
  },
  {
    tier: 'what the lecturer reviews' as const,
    items: [
      'The warning as the candidate saw it, with the cue that raised it',
      'A still frame attached to a confirmed camera warning',
      'The full event timeline for the sitting, kept after frames expire',
      'The disclosed ladder \u2014 how many warnings, and what the last one does',
      'A human decision: a cue can be mistaken and never fails a candidate by itself',
    ],
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

export const BOOT_SEQUENCE = [
  'One supervised Compose project starts PostgreSQL, Redis, the Piston sandbox and the API.',
  'Migrations run at start; the API stays unhealthy until the schema is at head.',
  'The SPA is built and served by Caddy, the only service bound to the host.',
  'The evidence-retention job erases frames past the configured window, every day.',
  'The backup sidecar takes a nightly pg_dump and prunes dumps past the keep window.',
];

export const VERIFICATION = [
  { dir: 'backend', command: 'ruff check .', result: 'clean' },
  { dir: 'backend', command: 'pytest -q · SQLite', result: '101 passed, 2 skipped' },
  { dir: 'backend', command: 'pytest -q · PostgreSQL', result: 'CI · the same 103' },
  { dir: 'frontend', command: 'npm run lint', result: '0 errors' },
  { dir: 'frontend', command: 'npm run build', result: 'success' },
];

export interface TourStep {
  src: string;
  alt: string;
  title: string;
  body: string;
}

export interface Tour {
  id: string;
  label: string;
  who: string;
  blurb: string;
  steps: TourStep[];
}

/**
 * The guided tour: one portal at a time, every screen a real capture of the
 * running build against the seeded development database.
 *
 * Each step says what the person is looking at and what the screen lets them do;
 * nothing here describes a state the application cannot reach. Captures are
 * regenerated with `scratch/tour-*.mjs` (see `docs/development.md`).
 */
export const TOURS: Tour[] = [
  {
    id: 'student',
    label: 'Student',
    who: 'Alex Rivera · CS201 and CS301',
    blurb: 'A candidate’s term from the first sign-in to a graded scorecard.',
    steps: [
      {
        src: '/tour/student/student-01-dashboard.webp',
        alt: 'Student dashboard showing two enrolled courses, one completed task, a 94.2 percent average and recent graded work',
        title: 'The student’s home',
        body: 'Enrolled courses, completed work, the running average and recent marks — every number scoped to their own record.',
      },
      {
        src: '/tour/student/student-02-courses.webp',
        alt: 'Course list with CS201 and CS301, section A, the instructor and an active status',
        title: 'The sections they belong to',
        body: 'Two offerings, each one a section of a course in a term. The roster is what decides what appears here.',
      },
      {
        src: '/tour/student/student-03-course.webp',
        alt: 'Course workspace showing announcements from the instructor, with the pinned welcome note',
        title: 'Inside the course',
        body: 'Announcements addressed to this section — the pinned welcome and the midterm logistics note.',
      },
      {
        src: '/tour/student/student-04-course-materials.webp',
        alt: 'Course materials tab with a lecture notes folder and a linked module file',
        title: 'Materials',
        body: 'Folders and files shared with the cohort. A download is authorised for the caller, not for whoever holds the link.',
      },
      {
        src: '/tour/student/student-05-course-assignments.webp',
        alt: 'Assignments tab showing one coursework item already graded at 95 out of 100 with feedback',
        title: 'Coursework in place',
        body: 'The assignment for this section: weighting, late policy, the mark awarded and the instructor’s feedback.',
      },
      {
        src: '/tour/student/student-06-assignments.webp',
        alt: 'All coursework across courses, tabulated by pending, awaiting evaluation and graded',
        title: 'Every deadline in one list',
        body: 'All coursework across their courses, filtered by what is pending, awaiting evaluation or finished.',
      },
      {
        src: '/tour/student/student-07-programming.webp',
        alt: 'Programming problem list with a Python problem, its marks, test count and time limit',
        title: 'The programming environment',
        body: 'Sandboxed problems this section may attempt, with the marks, the test count and the execution limit stated up front.',
      },
      {
        src: '/tour/student/student-08-problem.webp',
        alt: 'Problem detail with the statement, examples and a starter code editor with a line-number gutter',
        title: 'Opening a problem',
        body: 'The statement and its examples on the left, a real editor on the right, and the constraints the judge will enforce.',
      },
      {
        src: '/tour/student/student-09-problem-run.webp',
        alt: 'Solution in the editor with the sandbox output panel showing HELLO WORLD as stdout',
        title: 'Run it in the sandbox',
        body: 'Run sends the code to the isolated Piston sandbox and returns stdout, stderr and the exit status. Nothing is graded yet.',
      },
      {
        src: '/tour/student/student-10-exams.webp',
        alt: 'Examination list showing a published midterm with results and a scheduled final with its window',
        title: 'Examinations',
        body: 'What is scheduled, what is live, and what has been released, with the window and the marks disclosed.',
      },
      {
        src: '/tour/student/student-11-exam-brief.webp',
        alt: 'Assessment brief disclosing duration, total marks, the integrity policy, camera check and retention window',
        title: 'The brief before the clock',
        body: 'Duration, marks, the integrity rule, the camera check and the retention window — all disclosed before the paper starts.',
      },
      {
        src: '/tour/student/student-12-exam-attempt.webp',
        alt: 'Timed paper in progress with the server-owned countdown, a question navigator, autosave and flag for review',
        title: 'Writing the paper',
        body: 'The server owns the clock; answers autosave, questions can be flagged, and the navigator shows what is still unanswered.',
      },
      {
        src: '/tour/student/student-13-result.webp',
        alt: 'Official exam scorecard with 14 of 15 marks and a per-question breakdown showing the answer given and the key',
        title: 'The scorecard',
        body: 'Marks per question with the answer given and the correct key — served only after the instructor publishes results.',
      },
    ],
  },
  {
    id: 'faculty',
    label: 'Faculty',
    who: 'Sarah Chen · teaches CS201 and CS301',
    blurb: 'Teaching two sections: materials, coursework, the gradebook and the papers.',
    steps: [
      {
        src: '/tour/faculty/faculty-01-courses.webp',
        alt: 'Faculty course list showing the two sections they are assigned to',
        title: 'The sections they teach',
        body: 'Two offerings, each with its section, term and status. A lecturer sees the sections they are assigned to, not the catalogue.',
      },
      {
        src: '/tour/faculty/faculty-02-course.webp',
        alt: 'Teaching workspace with announcements and a post announcement action',
        title: 'The teaching workspace',
        body: 'The same section the student sees, with the actions that publish into it — starting with announcements.',
      },
      {
        src: '/tour/faculty/faculty-03-coursework.webp',
        alt: 'Assignments tab with a create assignment action, the weighting, late policy and three submissions to grade',
        title: 'Coursework management',
        body: 'Create an assignment with its weighting and late policy, then open the submissions that need marking.',
      },
      {
        src: '/tour/faculty/faculty-04-gradebook.webp',
        alt: 'Course gradebook with weighted scores per student and a CSV export',
        title: 'The gradebook',
        body: 'Weighted marks assembled from coursework and examinations, per student, exportable as a CSV.',
      },
      {
        src: '/tour/faculty/faculty-05-roster.webp',
        alt: 'Class roster with three enrolled students and an enrol student action',
        title: 'The roster',
        body: 'Everyone enrolled in the section, with the ability to add a student to it — the roster that gates every other screen.',
      },
      {
        src: '/tour/faculty/faculty-06-banks.webp',
        alt: 'Question bank repository filtered by department with a DSA bank and its question count',
        title: 'The question repository',
        body: 'Banks scoped by department and course, so a paper is drawn from material the section actually covers.',
      },
      {
        src: '/tour/faculty/faculty-07-bank.webp',
        alt: 'Question bank detail listing authored questions with their types and marks',
        title: 'Inside a bank',
        body: 'Questions in one bank with their types and marks — the pool a paper is built from or randomised out of.',
      },
      {
        src: '/tour/faculty/faculty-08-exams.webp',
        alt: 'Examination board with a published midterm and a scheduled final, each with window and marks',
        title: 'The examination board',
        body: 'Scheduled, live and published papers for the sections they teach, with windows and question counts.',
      },
      {
        src: '/tour/faculty/faculty-09-exam.webp',
        alt: 'Exam detail showing six questions with types and marks, and the tabs for grading and performance',
        title: 'One paper, as built',
        body: 'Questions in order with type and marks, plus the three views a paper needs: content, grading and performance.',
      },
      {
        src: '/tour/faculty/faculty-10-exam-grading.webp',
        alt: 'Candidate attempts with status, score, integrity event count and review and reopen actions',
        title: 'The grading queue',
        body: 'Each candidate’s status, score and integrity events, with the review and reopen actions the lecturer is authorised for.',
      },
      {
        src: '/tour/faculty/faculty-11-exam-performance.webp',
        alt: 'Performance analytics with attempt count, average score, median, pass percentage and high and low marks',
        title: 'Cohort performance',
        body: 'Attempts, average, median, pass percentage and the high and low — computed from the submissions, not typed in.',
      },
    ],
  },
  {
    id: 'hod',
    label: 'Department head',
    who: 'Marcus Sterling · Computer Science',
    blurb: 'Everything in one department, and nothing outside it.',
    steps: [
      {
        src: '/tour/hod/hod-01-dashboard.webp',
        alt: 'Department head dashboard with institutional counts, pass rate, department performance and audited activity',
        title: 'The department head’s view',
        body: 'The counts they are permitted to see, department performance, and the audited actions behind the numbers.',
      },
      {
        src: '/tour/hod/hod-02-academics.webp',
        alt: 'Academic structure page listing departments with codes and heads',
        title: 'Academic structure',
        body: 'Departments, their codes and heads, and the academic terms every offering belongs to.',
      },
      {
        src: '/tour/hod/hod-03-course.webp',
        alt: 'A section workspace opened from within the department scope',
        title: 'A section in scope',
        body: 'Their department’s section, opened through the same offering check the instructor passes.',
      },
      {
        src: '/tour/hod/hod-04-roster.webp',
        alt: 'Roster of the section with three students and their enrolment status',
        title: 'The cohort',
        body: 'The students enrolled in the section — visible because the section belongs to the department they head.',
      },
      {
        src: '/tour/hod/hod-05-gradebook.webp',
        alt: 'Course gradebook with weighted results per student and a CSV export',
        title: 'The gradebook, read',
        body: 'Weighted marks for the section, exportable for departmental review rather than for re-marking.',
      },
      {
        src: '/tour/hod/hod-06-banks.webp',
        alt: 'Question banks filtered to the departments the head is responsible for',
        title: 'Banks in the department',
        body: 'Question banks limited to the department’s courses, so assessment material cannot leak across departments.',
      },
      {
        src: '/tour/hod/hod-07-bank.webp',
        alt: 'Question bank detail with authored questions, types and marks',
        title: 'Authoring material',
        body: 'The same bank, opened for authoring: question types, marks and the pool a paper draws from.',
      },
      {
        src: '/tour/hod/hod-08-exams.webp',
        alt: 'Examination board for the department, from scheduled to published',
        title: 'Department examinations',
        body: 'Papers for the department’s sections, from the draft slate to the published results.',
      },
      {
        src: '/tour/hod/hod-09-exam.webp',
        alt: 'Exam detail with its questions, marks and the grading and performance tabs',
        title: 'One paper',
        body: 'The paper as delivered: question types, marks and the moderation views behind the score.',
      },
      {
        src: '/tour/hod/hod-10-performance.webp',
        alt: 'Performance analytics for the paper with attempts, average, median and pass percentage',
        title: 'Paper analytics',
        body: 'Attempts, average, median, pass percentage and the spread — the departmental read on one paper.',
      },
    ],
  },
  {
    id: 'controller',
    label: 'Exam controller',
    who: 'Eleanor Vance · examination office',
    blurb: 'Every paper and every bank, without owning the gradebook.',
    steps: [
      {
        src: '/tour/controller/controller-01-dashboard.webp',
        alt: 'Exam controller dashboard with institution counts, department performance and audited recent activity',
        title: 'The examination office',
        body: 'The institutional picture the bureau is allowed to see, and the audited activity behind it.',
      },
      {
        src: '/tour/controller/controller-02-exams.webp',
        alt: 'Examination board listing every paper in the institution with status and window',
        title: 'Every paper, one board',
        body: 'All papers in the institution, from scheduled to published, with windows and marks.',
      },
      {
        src: '/tour/controller/controller-03-exam.webp',
        alt: 'Exam detail with the question set, types and marks',
        title: 'A paper end to end',
        body: 'The paper itself: questions, types and marks. The bureau reads the paper and its results; grading and attempt review stay with the section they belong to.',
      },
      {
        src: '/tour/controller/controller-04-performance.webp',
        alt: 'Performance analytics for the published paper',
        title: 'Performance',
        body: 'Aggregated attempts, average and pass percentage for the paper, computed from the submissions.',
      },
      {
        src: '/tour/controller/controller-05-banks.webp',
        alt: 'Question banks across departments, with their course and question counts',
        title: 'Banks across departments',
        body: 'Every department’s banks in one repository, which is the bureau’s reach without the gradebook.',
      },
      {
        src: '/tour/controller/controller-06-bank.webp',
        alt: 'Question bank detail with the authored question set',
        title: 'One bank',
        body: 'The question set inside a bank, with types, marks and its approval state.',
      },
    ],
  },
  {
    id: 'lead',
    label: 'Campus lead',
    who: 'Priya Nair · college administrator',
    blurb: 'The institution’s accounts, structure and settings.',
    steps: [
      {
        src: '/tour/lead/lead-01-dashboard.webp',
        alt: 'Campus lead dashboard with enrolment counts, pass rate, department performance and audited recent activity',
        title: 'The campus lead’s dashboard',
        body: 'Institution-wide counts, department performance and the audited actions that produced them.',
      },
      {
        src: '/tour/lead/lead-02-users.webp',
        alt: 'User management table listing accounts with their roles, status and join date',
        title: 'User management',
        body: 'Every account with its roles and status, filtered by role or state, and the place accounts are provisioned.',
      },
      {
        src: '/tour/lead/lead-03-add-user.webp',
        alt: 'Create new user dialog with name, institutional email, phone, status and role checkboxes',
        title: 'Creating an account',
        body: 'One account, one explicit role set, one initial password. There is no public sign-up to fall back on.',
      },
      {
        src: '/tour/lead/lead-04-bulk-import.webp',
        alt: 'Bulk import dialog documenting the CSV columns and the default initial password',
        title: 'Importing a cohort',
        body: 'A CSV with its columns documented in the dialog, so a whole intake arrives with roles already assigned.',
      },
      {
        src: '/tour/lead/lead-05-academics.webp',
        alt: 'Academic structure page with departments, codes and heads',
        title: 'The academic structure',
        body: 'Departments, heads and terms — the frame every course, section and paper hangs from.',
      },
      {
        src: '/tour/lead/lead-06-settings.webp',
        alt: 'Institution branding settings with the name, code, accent colours and a live preview',
        title: 'Institution settings',
        body: 'Name, code, contact details, timezone and the accent colour, previewed on the sign-in card before it is saved.',
      },
      {
        src: '/tour/lead/lead-07-courses.webp',
        alt: 'Course offerings across the institution with their sections and instructors',
        title: 'Courses and offerings',
        body: 'Every offering in the term, with its section and instructor — the institutional view of who teaches what.',
      },
      {
        src: '/tour/lead/lead-08-exams.webp',
        alt: 'Examination board for the institution with statuses and windows',
        title: 'The paper slate',
        body: 'The institution’s papers in one board, from scheduled to published, with the windows candidates see.',
      },
      {
        src: '/tour/lead/lead-09-results.webp',
        alt: 'Results board for a published examination listing candidates and their scores',
        title: 'The results board',
        body: 'The released paper, candidate by candidate, with the score and the integrity trail behind each attempt.',
      },
    ],
  },
  {
    id: 'super',
    label: 'Super admin',
    who: 'System Administrator · platform operations',
    blurb: 'The install itself: accounts, structure, branding and the audited trail.',
    steps: [
      {
        src: '/tour/super/super-01-dashboard.webp',
        alt: 'System administrator dashboard with enrolment counts, pass rate, department performance and audited activity',
        title: 'The platform view',
        body: 'The same institution as everyone else sees it, plus the administrative surface the platform role reaches.',
      },
      {
        src: '/tour/super/super-02-users.webp',
        alt: 'User management table with every account, its roles, status and join date',
        title: 'Accounts',
        body: 'Every account and role in one table, including the accounts that hold the campus lead role.',
      },
      {
        src: '/tour/super/super-03-academics.webp',
        alt: 'Academic structure with departments and academic terms',
        title: 'Structure',
        body: 'Departments and terms — created once here, then inherited by every course and section.',
      },
      {
        src: '/tour/super/super-04-settings.webp',
        alt: 'System settings with institutional identity, accent colours, contact details and a live preview',
        title: 'Branding and policy',
        body: 'The institution’s name, accent colour and contact details, previewed before they are written.',
      },
      {
        src: '/tour/super/super-05-exams.webp',
        alt: 'Examination board listing the institution’s papers',
        title: 'The examination board',
        body: 'Every paper in the deployment, with its status and window — the same data the bureau works from.',
      },
      {
        src: '/tour/super/super-06-results.webp',
        alt: 'Results board listing candidates and scores for a published paper',
        title: 'Released results',
        body: 'A published paper’s results, candidate by candidate, with the integrity trail attached to each attempt.',
      },
    ],
  },
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
  {
    title: 'No webcam can see everything',
    body: 'A phone under the desk, a second screen out of shot and a crib sheet on a knee are invisible to any single camera. The hand, voice and device cues are review evidence with no published accuracy figure, so they never fail a candidate on their own — a person decides.',
  },
];

export const FAQ = [
  {
    q: 'Is there a hosted demo I can click through?',
    a: 'Not yet — this page is the presentation. A live instance would be a writable, multi-tenant examination platform with a privileged sandbox and real proctoring data, so it stays closed until it is deployed for a college. Everything on these screens is the working product, captured from a seeded development database.',
  },
  {
    q: 'How long does deployment take?',
    a: 'It is a single supervised stack on the college’s host: the API, PostgreSQL, the sandbox and the web server come up together, migrations run at start, and the first Campus Lead is provisioned before handover. The first sign-in works as soon as the stack is healthy.',
  },
  {
    q: 'Does it need a GPU, or a proctoring vendor?',
    a: 'Neither. Camera verification runs in the candidate’s browser and the device model runs on-device; the server receives an event, not a video stream. There is no third-party proctoring service in the request path.',
  },
  {
    q: 'How is it deployed, and who operates it?',
    a: 'The college owns the instance: one Compose stack on one supervised host, with the API, a PostgreSQL database, the sandbox and the web server behind a single TLS listener. TLS, nightly backups with a verified restore, evidence retention and upgrades are covered by the runbook that ships with it. There is no shared tenancy and no vendor in the request path.',
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
    q: 'Can I sign in right now?',
    a: 'Not yet — this page is a presentation of the working product. The instance is not publicly deployed; when it is, the sign-in portal opens for the accounts the college provisions, and there is still no public sign-up.',
  },
  {
    q: 'Who is behind CampusFlow?',
    a: 'Designed and developed by Sumanth Mamidi as a complete product for one college at a time — the whole system, not a hosted service with tiers.',
  },
] as const;
