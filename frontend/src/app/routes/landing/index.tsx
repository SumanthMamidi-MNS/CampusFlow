import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, ChevronRight, ExternalLink, Minus, ShieldCheck } from 'lucide-react';
import { BrandMark } from '@/core/components/brand/BrandMark';
import {
  ARCHITECTURE,
  BOOT_SEQUENCE,
  CAPABILITIES,
  DASHBOARD_SHOT,
  DISCONNECTED,
  ENV_VARS,
  FAQ,
  GALLERY,
  INSTALL,
  INTEGRITY_FACTS,
  LIMITS,
  MODULES,
  NAV,
  RECORD_ROWS,
  ROLES,
  SECURITY,
  STACK,
  STAGES,
  STATS,
  TRACKS,
  VERIFICATION,
} from './content';
import type { Shot } from './content';

/**
 * The landing page — the only screen a signed-out visitor can reach.
 *
 * It has one job: let somebody who has never seen the repository understand
 * what the platform is, how a college works inside it, and how to run it. So
 * the page follows the product rather than a marketing template: the record
 * that everything hangs off, the modules that act on it, the four workflows
 * that use it, the boundary that protects it, the evidence that it works, and
 * the limits stated plainly at the end.
 *
 * Nothing here fetches. Every number and claim is taken from the repository
 * (`docs/progress.md`, the RBAC catalogue, the exam policy vocabulary) and the
 * screenshots are real renders of the seeded development database, copied into
 * `public/shots/` from `docs/images/`.
 */

const GITHUB = 'https://github.com/SumanthMamidi-MNS/CampusFlow';

const SHELL = 'mx-auto w-full max-w-[1180px] px-6 lg:px-8';

function SectionHead({
  index,
  eyebrow,
  title,
  body,
  tone = 'light',
}: {
  index: string;
  eyebrow: string;
  title: string;
  body?: string;
  tone?: 'light' | 'dark';
}) {
  return (
    <div className="max-w-3xl">
      <p
        className={`flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] ${
          tone === 'dark' ? 'text-indigo-300' : 'text-indigo-600'
        }`}
      >
        <span className={tone === 'dark' ? 'text-indigo-400/60' : 'text-indigo-300'}>{index}</span>
        <span aria-hidden className={`h-px w-6 ${tone === 'dark' ? 'bg-indigo-400/30' : 'bg-indigo-200'}`} />
        {eyebrow}
      </p>
      <h2
        className={`mt-4 text-[28px] font-semibold leading-[1.12] tracking-[-0.03em] sm:text-[36px] ${
          tone === 'dark' ? 'text-white' : 'text-slate-900'
        }`}
      >
        {title}
      </h2>
      {body && (
        <p
          className={`mt-4 text-[15.5px] leading-relaxed sm:text-[16.5px] ${
            tone === 'dark' ? 'text-slate-300' : 'text-slate-600'
          }`}
        >
          {body}
        </p>
      )}
    </div>
  );
}

function BrowserFrame({
  shot,
  caption = true,
  priority = false,
}: {
  shot: Shot;
  caption?: boolean;
  priority?: boolean;
}) {
  return (
    <figure className="group">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_70px_-32px_rgba(23,20,64,0.35)]">
        <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100/80 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="ml-3 flex items-center gap-1.5 rounded-md bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
            <ShieldCheck className="h-3 w-3 text-emerald-600" aria-hidden="true" />
            CampusFlow · Academic Portal
          </span>
        </div>
        <img
          src={shot.src}
          alt={shot.alt}
          loading={priority ? 'eager' : 'lazy'}
          className="block w-full"
        />
      </div>
      {caption && (
        <figcaption className="mt-3 px-1 text-[13px] leading-relaxed text-slate-500">
          <span className="font-medium text-slate-700">{shot.title}.</span> {shot.caption}
        </figcaption>
      )}
    </figure>
  );
}

function ModuleExplorer() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = MODULES[active];

  const move = (next: number) => {
    const index = (next + MODULES.length) % MODULES.length;
    setActive(index);
    tabRefs.current[index]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      move(active + 1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      move(active - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      move(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      move(MODULES.length - 1);
    }
  };

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
      <div
        role="tablist"
        aria-label="CampusFlow modules"
        aria-orientation="vertical"
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {MODULES.map((module, index) => {
          const Icon = module.icon;
          const selected = index === active;
          return (
            <button
              key={module.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`module-tab-${module.id}`}
              aria-selected={selected}
              aria-controls={`module-panel-${module.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={onKeyDown}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors lg:w-full ${
                selected
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${selected ? 'text-indigo-600' : 'text-slate-400'}`}
                aria-hidden="true"
              />
              <span className="whitespace-nowrap lg:whitespace-normal">{module.label}</span>
              <ChevronRight
                className={`ml-auto hidden h-3.5 w-3.5 lg:block ${
                  selected ? 'text-indigo-400' : 'text-transparent'
                }`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`module-panel-${current.id}`}
        aria-labelledby={`module-tab-${current.id}`}
        tabIndex={0}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:p-8"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {current.kicker}
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-900 sm:text-2xl">
          {current.title}
        </h3>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{current.summary}</p>

        <ul className="mt-6 grid gap-3">
          {current.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-3 text-[14px] leading-relaxed text-slate-600">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Used by
          </span>
          {current.who.map((role) => (
            <span
              key={role}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11.5px] font-medium text-slate-600"
            >
              {role}
            </span>
          ))}
        </div>

        {current.shot && (
          <div className="mt-6">
            <BrowserFrame shot={current.shot} caption={false} />
          </div>
        )}
      </div>
    </div>
  );
}

function ExamJourney() {
  return (
    <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-6">
      {STAGES.map((stage, index) => (
        <li key={stage.kicker} className="bg-white p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold tabular-nums tracking-[0.14em] text-indigo-600">
              0{index + 1}
            </span>
            {index < STAGES.length - 1 && (
              <ArrowRight className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />
            )}
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {stage.kicker}
          </p>
          <p className="mt-1 text-[14px] font-semibold text-slate-900">{stage.title}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{stage.body}</p>
        </li>
      ))}
    </ol>
  );
}

function Walkthrough() {
  return (
    <div className="mt-10 grid gap-5 lg:grid-cols-2">
      {TRACKS.map((track) => {
        const Icon = track.icon;
        return (
          <section
            key={track.id}
            className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600">
                  {track.role}
                </p>
                <h3 className="text-[15px] font-semibold text-slate-900">{track.title}</h3>
              </div>
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-slate-500">{track.purpose}</p>
            <ol className="mt-5 space-y-3 border-t border-slate-100 pt-5">
              {track.steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[10.5px] font-semibold tabular-nums text-slate-500">
                    {index + 1}
                  </span>
                  <span className="text-[13.5px] leading-relaxed text-slate-600">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <a
        href="#product"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className={`${SHELL} flex h-16 items-center justify-between gap-6`}>
          <Link to="/" className="flex items-center gap-3" aria-label="CampusFlow home">
            <BrandMark className="h-8 w-8" />
            <span className="text-[15px] font-semibold tracking-tight text-slate-900">
              Campus<span className="text-indigo-600">Flow</span>
            </span>
          </Link>

          <nav aria-label="Sections" className="hidden items-center gap-7 text-[13px] font-medium text-slate-500 md:flex">
            {NAV.map((item) => (
              <a key={item.href} className="transition-colors hover:text-slate-900" href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <a
              href={GITHUB}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-900 sm:flex"
            >
              Repository
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <Link
              to="/auth/login"
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white shadow-xs transition-colors hover:bg-slate-800"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Below `md` the anchor row scrolls instead of hiding behind a menu:
            every section stays one tap away without adding JavaScript. */}
        <nav
          aria-label="Sections"
          className="flex gap-4 overflow-x-auto border-t border-slate-100 px-6 py-2 text-[12.5px] font-medium text-slate-500 md:hidden"
        >
          {NAV.map((item) => (
            <a key={item.href} className="whitespace-nowrap" href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main id="product">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-slate-100">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(780px 420px at 14% -12%, rgba(99,102,241,0.16), transparent 66%), radial-gradient(620px 340px at 92% -4%, rgba(56,189,248,0.12), transparent 62%)',
            }}
          />
          <div className={`${SHELL} relative grid gap-12 pb-16 pt-14 lg:grid-cols-[1.06fr_0.94fr] lg:items-start lg:gap-14 lg:pb-20 lg:pt-20`}>
            <div>
              <p className="cf-rise inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Self-hosted · one institution · MIT
              </p>

              <h1 className="cf-rise cf-delay-1 mt-6 text-[34px] font-semibold leading-[1.06] tracking-[-0.035em] text-slate-900 sm:text-[46px] lg:text-[54px]">
                One campus. Every course, every exam, and the
                <span className="text-indigo-700"> evidence behind every mark.</span>
              </h1>

              <p className="cf-rise cf-delay-2 mt-6 max-w-xl text-[16px] leading-relaxed text-slate-600 sm:text-[17px]">
                CampusFlow is the LMS and secure examination platform a college runs on its own
                server: rosters, materials, assignments, gradebooks, question banks, timed papers
                with an audited integrity trail, and sandboxed code grading — on one cohort record,
                behind one authorization model.
              </p>

              <div className="cf-rise cf-delay-3 mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/auth/login"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
                >
                  Sign in to your portal
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <a
                  href="#deploy"
                  className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-[14px] font-semibold text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:text-slate-900"
                >
                  Read the deployment runbook
                </a>
              </div>

              <p className="cf-rise cf-delay-4 mt-4 text-[12.5px] text-slate-500">
                No public sign-up. The first account is provisioned from the server.
              </p>

              <dl className="cf-rise cf-delay-4 mt-10 grid max-w-xl grid-cols-2 gap-x-6 gap-y-6 border-t border-slate-200 pt-7 sm:grid-cols-4 sm:gap-x-4">
                {STATS.map((stat) => (
                  <div key={stat.label}>
                    <dt className="sr-only">{stat.label}</dt>
                    <dd>
                      <span className="block text-[30px] font-semibold leading-none tracking-tight text-slate-900">
                        {stat.figure}
                      </span>
                      <span className="mt-1.5 block text-[12.5px] font-semibold text-slate-700">
                        {stat.label}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500">
                        {stat.note}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* The thesis, drawn: one section row that everything else hangs off. */}
            <aside className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-[0_30px_70px_-40px_rgba(23,20,64,0.45)] backdrop-blur sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  The record everything hangs off
                </p>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                  CSE-301 · Section A
                </span>
              </div>

              <ol className="mt-5 space-y-0">
                {RECORD_ROWS.map((row, index) => (
                  <li key={row.label} className="relative flex gap-4 pb-4 last:pb-0">
                    {index < RECORD_ROWS.length - 1 && (
                      <span
                        aria-hidden
                        className="absolute left-[5px] top-3 h-full w-px bg-slate-200"
                      />
                    )}
                    <span
                      aria-hidden
                      className="mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-white bg-indigo-500 ring-1 ring-indigo-200"
                    />
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-slate-900">{row.label}</p>
                      <p className="text-[12.5px] text-slate-500">{row.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <p className="mt-5 border-t border-slate-100 pt-4 text-[12.5px] leading-relaxed text-slate-500">
                Every row is a foreign key to the same section, so the roster, the material, the
                paper and the mark cannot drift apart.
              </p>
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-indigo-50/70 p-3 text-[12px] leading-relaxed text-indigo-900">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
                One scope kernel answers “may this person see this section?” — and every route has
                to ask it.
              </p>
            </aside>
          </div>
        </section>

        {/* ── Product shot ─────────────────────────────────────────────── */}
        <section className={`${SHELL} py-14`}>
          <BrowserFrame shot={DASHBOARD_SHOT} priority />
        </section>

        {/* ── 01 · Why it exists ───────────────────────────────────────── */}
        <section className="border-y border-slate-100 bg-slate-50/70 py-16 sm:py-20">
          <div className={SHELL}>
            <SectionHead
              index="01"
              eyebrow="Why it exists"
              title="Most colleges stitch four tools together and reconcile them forever."
              body="A general LMS cannot run a secure examination, so a forms tool, a proctoring subscription and a code judge get bolted on — then somebody spends the year matching four sets of identities and three kinds of truth about the same student."
            />

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {DISCONNECTED.map((tool, index) => (
                <div key={tool.title} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <span className="text-[11px] font-semibold tabular-nums tracking-[0.14em] text-slate-300">
                    0{index + 1}
                  </span>
                  <h3 className="mt-2 text-[15px] font-semibold text-slate-900">{tool.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600">{tool.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-indigo-100 bg-white p-7 sm:p-9">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600">
                The alternative
              </p>
              <p className="mt-3 max-w-4xl text-[19px] font-medium leading-[1.5] tracking-[-0.01em] text-slate-900 sm:text-[21px]">
                CampusFlow treats it as one cohort problem. The section that owns the roster, the
                material and the gradebook also owns the examinations sat by exactly those students,
                the integrity events recorded during those sittings, and the marks that flow back
                into the grade.
              </p>
              <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-[13px] font-medium text-slate-600">
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-indigo-600" aria-hidden="true" /> One roster
                </span>
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-indigo-600" aria-hidden="true" /> One authorization
                  model
                </span>
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-indigo-600" aria-hidden="true" /> One audit trail
                </span>
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-indigo-600" aria-hidden="true" /> One server
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 02 · Platform ────────────────────────────────────────────── */}
        <section id="platform" className={`${SHELL} scroll-mt-28 py-16 sm:py-20`}>
          <SectionHead
            index="02"
            eyebrow="The platform"
            title="Nine areas, one system of record."
            body="Everything below is shipped and reachable from the sidebar. Pick an area to see what it does and who it is for — the screenshots are the product, not an illustration of it."
          />
          <ModuleExplorer />
        </section>

        {/* ── 03 · Everything that ships ───────────────────────────────── */}
        <section className="border-y border-slate-100 bg-slate-50/70 py-16 sm:py-20">
          <div className={SHELL}>
            <SectionHead
              index="03"
              eyebrow="Capability ledger"
              title="Everything that ships, in one list."
              body="No tiers, no add-ons, no enterprise edition. These are the working parts of the deployed product, and each one is backed by the API the interface actually calls."
            />
            <ul className="mt-9 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((capability) => (
                <li
                  key={capability}
                  className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-slate-600"
                >
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" aria-hidden="true" />
                  {capability}
                </li>
              ))}
            </ul>
            <p className="mt-8 text-[13px] text-slate-500">
              What is not in it matters too — see{' '}
              <a className="font-medium text-indigo-700 underline decoration-indigo-200 underline-offset-2 hover:decoration-indigo-500" href="#limits">
                the limits
              </a>
              .
            </p>
          </div>
        </section>

        {/* ── 04 · Workflow ────────────────────────────────────────────── */}
        <section id="workflow" className={`${SHELL} scroll-mt-28 py-16 sm:py-20`}>
          <SectionHead
            index="04"
            eyebrow="How it is used"
            title="Four tracks, from an empty database to a released mark."
            body="This is the actual operating sequence: what the Campus Lead does first, what a department builds, how the examination bureau runs a paper, and what the candidate sees on the other side of it."
          />
          <Walkthrough />
          <p className="mt-6 text-[13px] leading-relaxed text-slate-500">
            For development there is a one-click path as well: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12.5px] font-medium text-slate-700">start.bat</code>{' '}
            on Windows bootstraps the environment, seeds a demo term with five accounts, and opens
            the app; <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12.5px] font-medium text-slate-700">docker compose up --build</code>{' '}
            does the same on any platform.
          </p>
        </section>

        {/* ── 05 · The examination journey ─────────────────────────────── */}
        <section id="journey" className="scroll-mt-28 border-y border-slate-100 bg-slate-50/70 py-16 sm:py-20">
          <div className={SHELL}>
            <SectionHead
              index="05"
              eyebrow="The examination, stage by stage"
              title="A paper is a chain of custody, not a form."
              body="Each stage leaves something the next one can rely on: an approved question, a paper with marks, a window the server enforces, an attempt with a timeline, a grade with a rubric, and a release that is written down."
            />
            <ExamJourney />
            <div className="mt-6 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-5 py-4 text-[13px] leading-relaxed text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Timing is server-authoritative and every attempt is autosaved — a closed tab is
                reconciled, not lost.
              </span>
              <a href="#integrity" className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:text-indigo-800">
                How the integrity trail works
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        {/* ── 06 · Roles ───────────────────────────────────────────────── */}
        <section id="roles" className={`${SHELL} scroll-mt-28 py-16 sm:py-20`}>
          <SectionHead
            index="06"
            eyebrow="Who it is for"
            title="Five people, six roles, a boundary the server enforces."
            body="Each role is a permission set and a data scope. The “cannot” column is the part that matters: in an examination platform, the negative space is the security model."
          />

          <dl className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
            {ROLES.map((role) => {
              const Icon = role.icon;
              return (
                <div
                  key={role.name}
                  className="grid gap-3 py-6 md:grid-cols-[190px_minmax(0,1fr)_minmax(0,1fr)] md:gap-8"
                >
                  <dt className="flex items-center gap-3 self-start">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="text-[14px] font-semibold text-slate-900">{role.name}</span>
                  </dt>
                  <dd className="text-[13.5px] leading-relaxed text-slate-600">
                    <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400 md:hidden">
                      Owns
                    </span>
                    {role.owns}
                  </dd>
                  <dd className="text-[13.5px] leading-relaxed text-slate-500">
                    <span className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-rose-500">
                      <Minus className="h-3 w-3" aria-hidden="true" />
                      Cannot
                    </span>
                    {role.cannot}
                  </dd>
                </div>
              );
            })}
          </dl>

          <p className="mt-6 text-[13px] leading-relaxed text-slate-500">
            The exam bureau’s reach is opt-in at each call site and never extends to the gradebook.
            A candidate and a member of staff are served by different response models, so no
            interface mistake can turn an answer key into a candidate payload.
          </p>
        </section>

        {/* ── 07 · Integrity & security ────────────────────────────────── */}
        <section id="integrity" className="relative scroll-mt-28 overflow-hidden bg-slate-950 py-16 text-slate-100 sm:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(700px 360px at 82% 0%, rgba(99,102,241,0.22), transparent 62%), radial-gradient(520px 280px at 8% 100%, rgba(56,189,248,0.10), transparent 60%)',
            }}
          />
          <div className={`${SHELL} relative`}>
            <SectionHead
              index="07"
              eyebrow="Integrity & security"
              title="Authorization is the product, not a wrapper around it."
              body="An examination platform is a target by design. Each rule below is enforced by the server and pinned by a test that fails the build when it regresses."
              tone="dark"
            />

            <dl className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2">
              {SECURITY.map((rule) => (
                <div key={rule.rule} className="bg-slate-950 p-6">
                  <dt className="flex items-start gap-2.5 text-[14px] font-semibold text-white">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" aria-hidden="true" />
                    {rule.rule}
                  </dt>
                  <dd className="mt-2 pl-[26px] text-[13px] leading-relaxed text-slate-400">
                    {rule.how}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
              {INTEGRITY_FACTS.map((fact) => (
                <div key={fact.figure} className="bg-slate-950 px-6 py-5">
                  <p className="text-[24px] font-semibold tracking-tight text-white">{fact.figure}</p>
                  <p className="mt-1 text-[12px] leading-snug text-slate-400">{fact.label}</p>
                </div>
              ))}
            </div>

            <p className="mt-8 max-w-3xl text-[13px] leading-relaxed text-slate-400">
              The last two hardening waves came from auditing the running stack rather than the test
              suite: candidate sessions could read answer keys and cohort gradebooks, six directory
              routes had no gate, and a department filter fell through to an unscoped query. Each
              defect, its reproduction and its fix is recorded in{' '}
              <a
                href={`${GITHUB}/blob/main/docs/audit-wave2-exam-delivery.md`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-indigo-300 underline decoration-indigo-500/40 underline-offset-2 hover:text-indigo-200"
              >
                the audit notes
              </a>
              .
            </p>
          </div>
        </section>

        {/* ── 08 · A look inside ───────────────────────────────────────── */}
        <section id="inside" className={`${SHELL} scroll-mt-28 py-16 sm:py-20`}>
          <SectionHead
            index="08"
            eyebrow="A look inside"
            title="The interface, as it runs."
            body="Real screens from a seeded development database — the same React build a deployed instance serves, with no mockups and no placeholder data invented for the photograph."
          />

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {GALLERY.slice(0, 2).map((shot) => (
              <BrowserFrame key={shot.src} shot={shot} />
            ))}
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {GALLERY.slice(2).map((shot) => (
              <BrowserFrame key={shot.src} shot={shot} />
            ))}
          </div>
        </section>

        {/* ── 09 · Stack & architecture ────────────────────────────────── */}
        <section id="stack" className="scroll-mt-28 border-y border-slate-100 bg-slate-50/70 py-16 sm:py-20">
          <div className={SHELL}>
            <SectionHead
              index="09"
              eyebrow="How it is built"
              title="A modular monolith with the boundaries written down."
              body="campusflow.bedrock — config, database, auth, RBAC, audit, storage, mail, runner — never imports from campusflow.domain. Domains cooperate through service interfaces rather than each other’s tables."
            />

            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 lg:grid-cols-4">
              {ARCHITECTURE.map((layer, index) => (
                <div key={layer.name} className="bg-white p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      0{index + 1}
                    </p>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />
                  </div>
                  <p className="mt-2 text-[14px] font-semibold text-slate-900">{layer.name}</p>
                  <p className="text-[12px] font-medium text-indigo-700">{layer.tag}</p>
                  <ul className="mt-3 space-y-1.5">
                    {layer.items.map((item) => (
                      <li key={item} className="text-[12px] leading-snug text-slate-500">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-left">
                <caption className="sr-only">Technology stack by layer</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10.5px] uppercase tracking-[0.14em] text-slate-500">
                    <th scope="col" className="px-5 py-3 font-semibold">Layer</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Choice</th>
                    <th scope="col" className="hidden px-5 py-3 font-semibold md:table-cell">Why</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {STACK.map((row) => (
                    <tr key={row.layer}>
                      <th scope="row" className="px-5 py-3.5 align-top text-[12.5px] font-semibold text-slate-900">
                        {row.layer}
                      </th>
                      <td className="px-5 py-3.5 align-top text-[12.5px] text-slate-600">{row.choice}</td>
                      <td className="hidden px-5 py-3.5 align-top text-[12.5px] text-slate-500 md:table-cell">
                        {row.why}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── 10 · Deploy ──────────────────────────────────────────────── */}
        <section id="deploy" className={`${SHELL} scroll-mt-28 py-16 sm:py-20`}>
          <SectionHead
            index="10"
            eyebrow="Deploy it"
            title="Three commands on any server."
            body="Docker Engine with Compose v2 and ports 80/443 free — nothing else on the host. Migrations run at start, the proxy is the only public service, and the last command provisions the first Campus Lead."
          />

          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-2.5">
              <span className="text-[11px] font-medium text-slate-400">production host</span>
              <span className="text-[11px] text-slate-500">bash</span>
            </div>
            <pre className="overflow-x-auto p-5 text-[12.5px] leading-relaxed text-slate-100">
              <code>{INSTALL}</code>
            </pre>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">What you set before it starts</h3>
              <dl className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
                {ENV_VARS.map((variable) => (
                  <div key={variable.key} className="py-3">
                    <dt className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11.5px] font-medium text-slate-700">
                        {variable.key}
                      </code>
                      {variable.required && (
                        <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                          required
                        </span>
                      )}
                    </dt>
                    <dd className="mt-1 text-[12.5px] leading-relaxed text-slate-500">{variable.note}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">What happens when it boots</h3>
              <ol className="mt-4 space-y-3">
                {BOOT_SEQUENCE.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[10.5px] font-semibold tabular-nums text-slate-500">
                      {index + 1}
                    </span>
                    <span className="text-[13px] leading-relaxed text-slate-600">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-[12.5px] leading-relaxed text-slate-600">
                <span className="font-semibold text-slate-800">Planning the cutover?</span> TLS,
                backups and a verified restore, evidence retention, upgrades and troubleshooting are
                in{' '}
                <a
                  href={`${GITHUB}/blob/main/docs/development.md`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-indigo-700 underline decoration-indigo-200 underline-offset-2 hover:decoration-indigo-500"
                >
                  the runbook
                </a>
                , and the Compose file ships with a nightly backup sidecar and a retention job.
              </p>
            </div>
          </div>
        </section>

        {/* ── 11 · Verification ────────────────────────────────────────── */}
        <section id="verification" className="scroll-mt-28 border-y border-slate-100 bg-slate-50/70 py-16 sm:py-20">
          <div className={SHELL}>
            <SectionHead
              index="11"
              eyebrow="Verification"
              title="Claims with commands behind them."
              body="The suite, the linter and the production build are what CI runs on main. Beyond the suite, the last hardening wave was verified against a running stack through its proxy."
            />

            <div className="mt-9 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left">
                  <caption className="sr-only">Verification commands and results</caption>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[10.5px] uppercase tracking-[0.14em] text-slate-500">
                      <th scope="col" className="px-5 py-3 font-semibold">Command</th>
                      <th scope="col" className="px-5 py-3 font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {VERIFICATION.map((row) => (
                      <tr key={row.command}>
                        <td className="px-5 py-3 font-mono text-[11.5px] text-slate-700">
                          <span className="mr-2 text-[10.5px] uppercase tracking-wide text-slate-400">
                            {row.dir}
                          </span>
                          {row.command}
                        </td>
                        <td className="px-5 py-3 text-[12px] font-medium text-slate-600">{row.result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                  <p className="text-[13px] font-semibold text-slate-900">Against a live stack</p>
                  <ul className="mt-3 space-y-2">
                    {[
                      'Production Compose project reached through its proxy, migrations at head.',
                      'A provisioned Campus Lead signed in; unauthenticated requests were refused.',
                      'The evidence purge ran inside its container and audited every erasure.',
                      'A pg_dump / pg_restore round trip listed and restored the schema.',
                      'A 512 MB allocation was killed under a 128 MB cap in ~20 ms.',
                    ].map((line) => (
                      <li key={line} className="flex gap-2.5 text-[12.5px] leading-relaxed text-slate-600">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
                <a
                  href={`${GITHUB}/actions/workflows/ci.yml`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300"
                >
                  <span>
                    <span className="block text-[13px] font-semibold text-slate-900">
                      Live CI status on main
                    </span>
                    <span className="mt-0.5 block text-[12px] text-slate-500">
                      GitHub Actions · suite against PostgreSQL
                    </span>
                  </span>
                  <ExternalLink className="h-4 w-4 text-slate-400" aria-hidden="true" />
                </a>
              </div>
            </div>

            <p className="mt-6 text-[12.5px] leading-relaxed text-slate-500">
              The two SQLite skips are PostgreSQL-only concurrency tests; CI runs them.
            </p>
          </div>
        </section>

        {/* ── 12 · Limits ──────────────────────────────────────────────── */}
        <section id="limits" className={`${SHELL} scroll-mt-28 py-16 sm:py-20`}>
          <SectionHead
            index="12"
            eyebrow="Limits"
            title="What it does not do yet."
            body="Stated plainly, because the omissions matter as much as the features — and because a demo that hides them is not telling you what you are deploying."
          />
          <ul className="mt-9 grid gap-4 sm:grid-cols-2">
            {LIMITS.map((limit) => (
              <li key={limit.title} className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900">
                  <Minus className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  {limit.title}
                </p>
                <p className="mt-2 pl-[22px] text-[12.5px] leading-relaxed text-slate-500">
                  {limit.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── 13 · Questions ───────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-28 border-t border-slate-100 bg-slate-50/70 py-16 sm:py-20">
          <div className={`${SHELL} grid gap-10 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-14`}>
            <div>
              <SectionHead
                index="13"
                eyebrow="Questions"
                title="The things people ask first."
              />
              <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-slate-500">
                Anything not answered here is in the repository — the architecture map, the ADRs
                behind each trade-off, and the runbook that covers the operational detail.
              </p>
              <a
                href={`${GITHUB}/tree/main/docs`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-indigo-700 hover:text-indigo-800"
              >
                Browse the documentation
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {FAQ.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-4 text-[14px] font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronRight
                      className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="pb-4 pr-8 text-[13px] leading-relaxed text-slate-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Close ────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-t border-slate-200 bg-white py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(620px 280px at 50% 0%, rgba(99,102,241,0.14), transparent 68%)',
            }}
          />
          <div className="relative mx-auto max-w-2xl px-6 text-center">
            <BrandMark className="mx-auto h-14 w-14" />
            <h2 className="mt-6 text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-slate-900 sm:text-[38px]">
              Run it on your own server.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15.5px] leading-relaxed text-slate-600">
              One host, one origin, one front door. Bring the stack up, provision the first Campus
              Lead, and the college’s academic year begins in the same database it will end in.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/auth/login"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
              >
                Sign in to your portal
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a
                href={GITHUB}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-[14px] font-semibold text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:text-slate-900"
              >
                Read the repository
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <p className="mt-6 text-[12px] text-slate-500">
              MIT licensed · no public sign-up · one institution per deployment
            </p>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-slate-50 py-12">
        <div className={`${SHELL} grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]`}>
          <div>
            <div className="flex items-center gap-3">
              <BrandMark className="h-9 w-9" />
              <div>
                <p className="text-[14px] font-semibold text-slate-900">CampusFlow</p>
                <p className="text-[11.5px] text-slate-500">Academic Portal</p>
              </div>
            </div>
            <p className="mt-4 max-w-xs text-[12px] leading-relaxed text-slate-500">
              A college LMS and secure examination platform, self-hosted on one server. MIT
              licensed, designed and developed by{' '}
              <a
                href="https://github.com/SumanthMamidi-MNS"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
              >
                Sumanth Mamidi
              </a>
              .
            </p>
          </div>

          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Product
            </p>
            <ul className="mt-3 space-y-2 text-[12.5px] text-slate-600">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a className="transition-colors hover:text-slate-900" href={item.href}>
                    {item.label}
                  </a>
                </li>
              ))}
              <li>
                <a className="transition-colors hover:text-slate-900" href="#roles">
                  Roles
                </a>
              </li>
              <li>
                <a className="transition-colors hover:text-slate-900" href="#limits">
                  Limits
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Documentation
            </p>
            <ul className="mt-3 space-y-2 text-[12.5px] text-slate-600">
              {[
                ['Architecture', 'docs/architecture.md'],
                ['Decisions', 'docs/decisions.md'],
                ['Development', 'docs/development.md'],
                ['Progress', 'docs/progress.md'],
              ].map(([label, path]) => (
                <li key={path}>
                  <a
                    className="transition-colors hover:text-slate-900"
                    href={`${GITHUB}/blob/main/${path}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Repository
            </p>
            <ul className="mt-3 space-y-2 text-[12.5px] text-slate-600">
              <li>
                <a className="transition-colors hover:text-slate-900" href={GITHUB} target="_blank" rel="noreferrer">
                  Source on GitHub
                </a>
              </li>
              <li>
                <a
                  className="transition-colors hover:text-slate-900"
                  href={`${GITHUB}/actions/workflows/ci.yml`}
                  target="_blank"
                  rel="noreferrer"
                >
                  CI status
                </a>
              </li>
              <li>
                <a
                  className="transition-colors hover:text-slate-900"
                  href={`${GITHUB}/blob/main/LICENSE`}
                  target="_blank"
                  rel="noreferrer"
                >
                  MIT licence
                </a>
              </li>
              <li>
                <a
                  className="transition-colors hover:text-slate-900"
                  href="#faq"
                >
                  Questions
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className={`${SHELL} mt-10 flex flex-col gap-2 border-t border-slate-200 pt-6 text-[11.5px] text-slate-500 sm:flex-row sm:items-center sm:justify-between`}>
          <p>© 2026 Sumanth Mamidi · MIT License</p>
          <p>Examination data is personal data — the retention window is yours to set.</p>
        </div>
      </footer>
    </div>
  );
}
