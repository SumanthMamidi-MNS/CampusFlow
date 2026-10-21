import { Link } from 'react-router-dom';
import { BrandMark } from '@/core/components/brand/BrandMark';
import {
  ClipboardCheck,
  Code2,
  GraduationCap,
  Landmark,
  Server,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';

/**
 * The landing page — what a signed-out visitor sees at `/`.
 *
 * It is the public face of a product that has no public instance, so it does
 * the honest version of the job: what the platform is, who works in it, how it
 * is secured, and how an institution runs it. Nothing here calls the API, so it
 * stays a static, cheap first paint; every claim on it is one the repository
 * can back (the verification numbers come from `docs/progress.md`).
 *
 * Screenshots live in `frontend/public/shots/` and mirror `docs/images/`: the
 * README uses the originals, these are the copies the deployed bundle can serve.
 */
const HERO_SHOT = '/shots/dashboard.png';
const EXAM_SHOT = '/shots/exam-workspace.png';
const CODE_SHOT = '/shots/programming.png';

const PILLARS = [
  {
    icon: Landmark,
    title: 'Academic operations',
    body: 'Departments, programmes, terms, courses and sections; CSV roster import with duplicate prevention; materials, announcements, rubrics and a weighted gradebook.',
  },
  {
    icon: ClipboardCheck,
    title: 'Integrity-monitored assessment',
    body: 'Question banks, paper assembly, scheduling windows, server-timed attempts, per-exam tolerance policies, and an audited timeline behind every signal.',
  },
  {
    icon: Code2,
    title: 'Sandboxed code grading',
    body: 'An in-browser programming environment whose student code runs in a Piston isolate with real CPU, memory and concurrency ceilings — never in the API.',
  },
] as const;

const ROLES = [
  { icon: Landmark, role: 'Campus Lead', line: 'Institution, users, permissions, audit' },
  { icon: Users, role: 'Department Head', line: 'Programmes, courses, faculty, analytics' },
  { icon: GraduationCap, role: 'Faculty', line: 'Materials, assignments, gradebook' },
  { icon: ShieldCheck, role: 'Exam Controller', line: 'Banks, papers, schedule, integrity policy' },
  { icon: UserRound, role: 'Student', line: 'Own cohort, timed attempt, own results' },
] as const;

const SECURITY = [
  {
    rule: 'Every route declares a gate',
    how: 'A test walks the live route table and fails the build if a route has neither a permission nor a deliberate place on the public allowlist.',
  },
  {
    rule: 'Cohort data needs scope, not just permission',
    how: 'Gradebook, roster, materials, analytics and attempt surfaces pass one offering-scope kernel; checks are never re-implemented inline.',
  },
  {
    rule: 'Two projections, never one',
    how: 'Staff and candidate payloads are different models; canary tests assert answer keys, rubrics and hidden tests never reach a candidate response.',
  },
  {
    rule: 'A student asking for something they may not see gets 404',
    how: 'Anti-enumeration: no 403 that confirms an object exists. Staff denials stay 403.',
  },
] as const;

const INSTALL = `cp .env.production.example .env          # set POSTGRES_PASSWORD and JWT_SECRET_KEY
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend \\
  python scripts/provision_admin.py --email you@example.edu --password 'at least 12 characters'`;

function BrowserFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(23,20,64,0.35)]">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100/80 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="ml-3 hidden rounded-md bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-500 sm:inline">
          campusflow.institute
        </span>
      </div>
      <img src={src} alt={alt} loading="lazy" className="block w-full" />
    </figure>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-slate-900 sm:text-[34px]">{title}</h2>
      {body && <p className="mt-4 text-[16px] leading-relaxed text-slate-600">{body}</p>}
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
          <Link to="/" className="flex items-center gap-3">
            <BrandMark className="h-8 w-8" />
            <span className="text-[15px] font-semibold tracking-tight text-slate-900">
              Campus<span className="text-indigo-600">Flow</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-[13px] font-medium text-slate-500 md:flex">
            <a className="transition-colors hover:text-slate-900" href="#product">Product</a>
            <a className="transition-colors hover:text-slate-900" href="#roles">Who it is for</a>
            <a className="transition-colors hover:text-slate-900" href="#security">Security</a>
            <a className="transition-colors hover:text-slate-900" href="#run">Run it</a>
          </nav>

          <Link
            to="/auth/login"
            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white shadow-xs transition-colors hover:bg-slate-800"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-slate-100">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(760px 380px at 18% -10%, rgba(99,102,241,0.16), transparent 65%), radial-gradient(620px 320px at 88% 0%, rgba(56,189,248,0.12), transparent 60%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-14 sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700">
            <Server className="h-3.5 w-3.5" aria-hidden="true" />
            Self-hosted · one college · MIT licensed
          </p>

          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.025em] text-slate-900 sm:text-5xl lg:text-[56px]">
            The academic year, the examinations and the
            <span className="text-indigo-700"> integrity trail </span>
            that connects them — one platform.
          </h1>

          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-slate-600">
            Departments, courses, materials, assignments and gradebooks; question banks and scheduled
            examinations with audited integrity signals; and a programming environment where student
            code runs in a sandbox. Same cohort, same records, one authorization model.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to="/auth/login"
              className="inline-flex items-center rounded-xl bg-indigo-600 px-6 py-3 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Sign in to CampusFlow
            </Link>
            <a
              href="#run"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-[14px] font-semibold text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              Run it in three commands
            </a>
          </div>

          <dl className="mt-12 grid max-w-3xl grid-cols-2 gap-x-8 gap-y-6 border-t border-slate-200 pt-8 sm:grid-cols-4">
            {[
              ['83', 'backend tests, run on PostgreSQL'],
              ['6', 'roles, one permission catalogue'],
              ['0', 'SaaS dependencies, public sign-up'],
              ['1', 'server: API, database, sandbox, proxy'],
            ].map(([figure, caption]) => (
              <div key={caption}>
                <dt className="text-3xl font-semibold tracking-tight text-slate-900">{figure}</dt>
                <dd className="mt-1 text-[13px] leading-snug text-slate-500">{caption}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Hero product shot ──────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <BrowserFrame
          src={HERO_SHOT}
          alt="CampusFlow institutional analytics: enrolment, faculty load, course performance and examination readiness computed from live records"
        />
      </section>

      {/* ── Pillars ────────────────────────────────────────────── */}
      <section id="product" className="border-t border-slate-100 bg-slate-50/60 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeading
            eyebrow="Why it exists"
            title="Most colleges stitch four tools together and reconcile them forever."
            body="A general LMS cannot run a secure examination, so an exam tool, a proctoring subscription and a code judge get bolted on. CampusFlow treats all of it as one cohort problem."
          />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PILLARS.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition-shadow hover:shadow-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Roles ──────────────────────────────────────────────── */}
      <section id="roles" className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeading
            eyebrow="Who it is for"
            title="Five roles, one hierarchy, a boundary the server enforces."
          />
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {ROLES.map(({ icon: Icon, role, line }) => (
              <li key={role} className="rounded-2xl border border-slate-200 bg-white p-5">
                <Icon className="h-5 w-5 text-indigo-600" aria-hidden="true" />
                <p className="mt-3 text-[14px] font-semibold text-slate-900">{role}</p>
                <p className="mt-1 text-[13px] leading-snug text-slate-500">{line}</p>
              </li>
            ))}
          </ul>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <BrowserFrame
              src={EXAM_SHOT}
              alt="Examination workspace with the paper structure, the questions and the grading queue"
            />
            <BrowserFrame
              src={CODE_SHOT}
              alt="Sandboxed programming problem with the in-browser editor and per-test results"
            />
          </div>
        </div>
      </section>

      {/* ── Security ───────────────────────────────────────────── */}
      <section id="security" className="border-t border-slate-100 bg-slate-900 py-16 text-slate-100">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-300">
              Security model
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-white sm:text-[34px]">
              Authorization is the product, not a wrapper around it.
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-slate-300">
              An examination platform is a target by design. These rules are enforced by the server
              and pinned by tests that fail the build when they regress.
            </p>
          </div>

          <dl className="mt-10 divide-y divide-slate-800 border-y border-slate-800">
            {SECURITY.map(({ rule, how }) => (
              <div key={rule} className="grid gap-1 py-5 md:grid-cols-[minmax(0,20rem)_1fr] md:gap-10">
                <dt className="text-[15px] font-semibold text-white">{rule}</dt>
                <dd className="text-[14px] leading-relaxed text-slate-400">{how}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Run it ─────────────────────────────────────────────── */}
      <section id="run" className="py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start">
          <div>
            <SectionHeading
              eyebrow="Run it"
              title="Three commands on any server."
              body="Docker Engine with Compose v2 and ports 80/443 — nothing else on the host. Migrations run at start, the proxy is the only public service, and there is no public sign-up: the last command provisions the first Campus Lead."
            />
            <p className="mt-6 text-[14px] text-slate-500">
              For development, double-click <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px] font-medium text-slate-700">start.bat</code>,
              or <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px] font-medium text-slate-700">docker compose up --build</code> on
              any platform. The full runbook — TLS, backups and verified restore, retention,
              upgrades — is in <span className="font-medium text-slate-700">docs/development.md</span>.
            </p>
          </div>

          <pre className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 text-[13px] leading-relaxed text-slate-100">
            <code>{INSTALL}</code>
          </pre>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <BrandMark className="h-8 w-8" />
            <div>
              <p className="text-[14px] font-semibold text-slate-900">CampusFlow</p>
              <p className="text-[12px] text-slate-500">MIT licensed · single-institution deployment</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-[13px] font-medium text-slate-500">
            <a className="transition-colors hover:text-slate-900" href="#product">Product</a>
            <a className="transition-colors hover:text-slate-900" href="#security">Security</a>
            <Link className="transition-colors hover:text-slate-900" to="/auth/login">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
