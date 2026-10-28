import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  ClipboardCopy,
  Copy,
  ExternalLink,
  Minus,
  Pause,
  Play,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { BrandMark } from '@/core/components/brand/BrandMark';
import { Counter, Reveal, Typewriter, Words } from './motion';
import {
  useActiveSection,
  useInView,
  useReducedMotion,
  useScrollVar,
  useSectionProgress,
  useSpotlightField,
  useTilt,
} from './use-motion';
import {
  ARCHITECTURE,
  BOOT_SEQUENCE,
  CAPABILITIES,
  DISCONNECTED,
  FAQ,
  INSTALL,
  INTEGRITY_CUES,
  INTEGRITY_FACTS,
  LIMITS,
  MARQUEE,
  MODULES,
  NAV,
  RECORD_ROWS,
  ROLES,
  SECURITY,
  STAGES,
  STATS,
  TOURS,
  TRACKS,
  VERIFICATION,
} from './content';
import type { Shot } from './content';
import './landing.css';

/**
 * The landing page — the only screen a signed-out visitor can reach.
 *
 * It is built as a scroll story rather than a stack of cards: a blueprint
 * canvas and a tilted record card in the hero, a marquee that states the thesis
 * in one line, then ten chapters that move from *what it is* through *how a
 * college works inside it* to *how to run it and where it stops*. Depth comes
 * from real CSS 3D (perspective, translateZ, pointer tilt), not from stock
 * illustrations; motion comes from one IntersectionObserver per block, one
 * scroll value for the examination journey, and a typewriter in the terminal.
 *
 * Everything degrades: `prefers-reduced-motion` shows the finished state,
 * coarse pointers get no tilt, and no content is hidden behind an animation.
 * Nothing here calls the API — the page must paint without a session.
 */

const SHELL = 'mx-auto w-full max-w-[1180px] px-6 lg:px-8';

/** The scroll story, in the order the page tells it. */
const CHAPTERS = [
  { id: 'why', label: 'Why' },
  { id: 'platform', label: 'Platform' },
  { id: 'screens', label: 'Screens' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'journey', label: 'Examination' },
  { id: 'roles', label: 'Roles' },
  { id: 'integrity', label: 'Integrity' },
  { id: 'run', label: 'Run it' },
  { id: 'proof', label: 'Proof & limits' },
  { id: 'faq', label: 'Questions' },
];

/**
 * A section's opening.
 *
 * The title assembles word by word while the eyebrow and the dek fade in
 * behind it, and a hairline draws itself across the top of the block. The
 * oversized index is a watermark rather than a heading, so it stays inside
 * the container's padding and never clips at the viewport edge.
 */
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
    <div className="relative max-w-3xl">
      <span
        aria-hidden
        className={`pointer-events-none absolute -top-6 right-2 hidden select-none text-[124px] font-semibold leading-[0.8] tracking-[-0.07em] lg:block ${
          tone === 'dark' ? 'text-white/[0.05]' : 'text-slate-900/[0.035]'
        }`}
      >
        {index}
      </span>

      <Reveal y={10}>
        <p
          className={`relative flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] ${
            tone === 'dark' ? 'text-indigo-300' : 'text-indigo-600'
          }`}
        >
          <span className={tone === 'dark' ? 'text-indigo-400/60' : 'text-indigo-300'}>{index}</span>
          <span
            aria-hidden
            className={`cf-rule h-px w-10 ${tone === 'dark' ? 'bg-indigo-400/40' : 'bg-indigo-300'}`}
          />
          {eyebrow}
        </p>
      </Reveal>

      <h2
        className={`mt-4 text-[30px] font-semibold leading-[1.04] tracking-[-0.035em] text-balance sm:text-[40px] ${
          tone === 'dark' ? 'text-white' : 'text-slate-900'
        }`}
      >
        <Words text={title} step={34} />
      </h2>

      {body && (
        <Reveal delay={90} y={16}>
          <p
            className={`mt-5 text-[15.5px] leading-relaxed sm:text-[16.5px] ${
              tone === 'dark' ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
            {body}
          </p>
        </Reveal>
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
    <figure className="group/frame">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_2px_6px_-2px_rgba(23,20,64,0.08),0_24px_60px_-32px_rgba(23,20,64,0.4)]">
        <div className="flex items-center gap-1.5 border-b border-slate-200/80 bg-slate-100/70 px-4 py-2.5">
          <span className="h-2 w-2 rounded-full bg-slate-300" />
          <span className="h-2 w-2 rounded-full bg-slate-300" />
          <span className="h-2 w-2 rounded-full bg-slate-300" />
          <span className="ml-3 flex items-center gap-1.5 rounded-md bg-white/90 px-2.5 py-0.5 text-[10.5px] font-medium text-slate-500">
            <ShieldCheck className="h-3 w-3 text-emerald-600" aria-hidden="true" />
            CampusFlow · Academic Portal
          </span>
        </div>
        <img
          src={shot.src}
          alt={shot.alt}
          loading={priority ? 'eager' : 'lazy'}
          className="block w-full transition-transform duration-[900ms] ease-[cubic-bezier(.22,1,.36,1)] group-hover/frame:scale-[1.015]"
        />
      </div>
      {caption && (
        <figcaption className="mt-3 px-1 text-[12.5px] leading-relaxed text-slate-500">
          <span className="font-medium text-slate-700">{shot.title}.</span> {shot.caption}
        </figcaption>
      )}
    </figure>
  );
}

function TiltFrame({ shot, priority = false, strength = 4 }: { shot: Shot; priority?: boolean; strength?: number }) {
  const ref = useTilt<HTMLDivElement>(strength);
  return (
    <div className="cf-scene">
      <div ref={ref} className="cf-tilt">
        <BrowserFrame shot={shot} priority={priority} />
      </div>
    </div>
  );
}

/**
 * The hero's right-hand scene.
 *
 * The thesis of the product — one section record that everything hangs off —
 * set on a dark stage so it reads as a lit object rather than another white
 * card on a white page. Three planes at different depths: the gradebook sheet
 * behind (translateZ -90), the record itself, and two status chips in front.
 * Pointer tilt moves them against each other; on a coarse pointer the resting
 * angle holds the depth.
 */
function HeroStage() {
  const tiltRef = useTilt<HTMLDivElement>(6, { x: 3, y: -8 });

  return (
    <div className="cf-scene relative mx-auto w-full max-w-[540px]">
      {/* Orbital rings and a slow beam: the stage is lit, not pasted on. */}
      <div aria-hidden className="cf-aura pointer-events-none absolute inset-0 -z-10">
        <div className="cf-aura-ring cf-aura-ring-a" />
        <div className="cf-aura-ring cf-aura-ring-b" />
        <div className="cf-aura-beam" />
        <div className="cf-floor" />
      </div>

      <div className="cf-dive">
        <div ref={tiltRef} className="cf-tilt relative">
          {/* A sheet from the next surface back: the gradebook this record feeds. */}
          <div
            aria-hidden
            className="absolute -right-10 -top-20 hidden w-[300px] sm:block"
            style={{ transform: 'translate3d(24px,-16px,-60px) rotate(4deg)' }}
          >
            <div className="rounded-2xl border border-white/10 bg-[#1a1946]/85 p-4 shadow-[0_30px_60px_-40px_rgba(0,0,0,0.9)] backdrop-blur-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[9px] font-semibold uppercase tracking-[0.18em] text-indigo-200/70">
                  Weighted gradebook
                </p>
                <span className="shrink-0 whitespace-nowrap rounded border border-white/15 bg-white/10 px-1.5 py-0.5 text-[8.5px] font-medium text-indigo-100/80">
                  62 students
                </span>
              </div>
              <div className="mt-3.5 space-y-2.5">
                {[92, 74, 86, 63].map((width, index) => (
                  <div key={index} className="flex items-center gap-2.5">
                    <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-indigo-300 to-sky-300"
                        style={{ width: `${width}%` }}
                      />
                    </span>
                    <span className="h-[3px] w-7 rounded-full bg-white/10" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* The lit stage. */}
          <div className="cf-hero-stage relative overflow-hidden rounded-[32px] border border-white/10 p-3 sm:p-4">
            <div
              aria-hidden
              className="cf-stage-grid pointer-events-none absolute inset-0"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-indigo-400/25 blur-3xl"
            />

            <div className="relative mb-3 flex items-center gap-2 px-1.5">
              <span className="flex gap-1.5">
                <span className="h-2 w-2 rounded-full bg-white/20" />
                <span className="h-2 w-2 rounded-full bg-white/20" />
                <span className="h-2 w-2 rounded-full bg-white/20" />
              </span>
              <span className="ml-2 hidden rounded-md bg-white/[0.08] px-2 py-1 font-mono text-[9.5px] text-indigo-100/70 sm:block">
                CSE-301 · Section A
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
                <span className="cf-pulse h-1.5 w-1.5 rounded-full bg-emerald-400" />
                live
              </span>
            </div>

            <div className="cf-shadow-deep relative rounded-[24px] bg-white p-5 sm:p-6">
              <div aria-hidden className="cf-tilt-glow pointer-events-none absolute inset-0 rounded-[24px]" />
              <div className="relative">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    The record everything hangs off
                  </p>
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-600">
                    6 relations
                  </span>
                </div>

                <ol className="mt-4">
                  {RECORD_ROWS.map((row, index) => (
                    <li key={row.label} className="relative flex gap-3.5 pb-3.5 last:pb-0">
                      {index < RECORD_ROWS.length - 1 && (
                        <span
                          aria-hidden
                          className="absolute left-[5px] top-3 h-full w-px bg-gradient-to-b from-indigo-200 to-slate-200"
                        />
                      )}
                      <span
                        aria-hidden
                        className="mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-white bg-indigo-500 shadow-[0_0_0_1px_rgba(129,140,248,0.6)]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-[12.5px] font-semibold text-slate-900">{row.label}</p>
                          <span className="hidden text-[9.5px] tabular-nums text-slate-300 sm:block">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-slate-500">{row.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                <p className="mt-4 border-t border-slate-100 pt-3.5 text-[11.5px] leading-relaxed text-slate-500">
                  Every row is a foreign key to the same section, so the roster, the material, the paper
                  and the mark cannot drift apart.
                </p>
                <p className="mt-2.5 flex items-start gap-2 rounded-xl bg-indigo-50/80 p-2.5 text-[11px] leading-relaxed text-indigo-900">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" aria-hidden="true" />
                  One scope kernel answers “may this person see this section?” — and every route has to
                  ask it.
                </p>
              </div>
            </div>
          </div>

          {/* Front plane: what came out of the record. */}
          <div className="absolute -bottom-7 -left-4 hidden sm:block" style={{ transform: 'translateZ(80px)' }}>
            <div className="cf-float flex items-center gap-3 rounded-2xl border border-white/15 bg-[#12112f]/92 px-3.5 py-2.5 shadow-[0_24px_50px_-24px_rgba(0,0,0,0.8)] backdrop-blur">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-400/15">
                <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[11px] font-semibold text-white">Integrity trail</p>
                <p className="text-[10px] tabular-nums text-indigo-200/60">41 signals · 3 reviewed</p>
              </div>
              <span className="flex items-end gap-[3px]">
                {[10, 16, 7, 13, 5].map((height, index) => (
                  <span
                    key={index}
                    className="w-[3px] rounded-full bg-indigo-300/70"
                    style={{ height }}
                  />
                ))}
              </span>
            </div>
          </div>

          <div className="absolute -bottom-3 -right-3 hidden sm:block" style={{ transform: 'translateZ(110px)' }}>
            <div className="cf-float-slow flex items-center gap-2.5 rounded-2xl border border-white/15 bg-[#12112f]/92 px-3 py-2 shadow-[0_20px_44px_-22px_rgba(0,0,0,0.8)] backdrop-blur">
              <BrandMark className="h-7 w-7" />
              <span className="pr-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-100/70">
                67 permissions
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModuleExplorer() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = MODULES[active];
  const ModuleIcon = current.icon;

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
    <div className="mt-12 grid min-w-0 gap-6 lg:grid-cols-[292px_minmax(0,1fr)] lg:gap-8">
      <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
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
                className={`group relative flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-medium transition-all duration-300 lg:w-full ${
                  selected
                    ? 'cf-rail-active border-indigo-200/80 bg-white text-indigo-900'
                    : 'border-transparent text-slate-600 hover:border-slate-200/80 hover:bg-white/70 hover:text-slate-900'
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                    selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="whitespace-nowrap lg:whitespace-normal">{module.label}</span>
                <ChevronRight
                  className={`ml-auto hidden h-3.5 w-3.5 transition-all duration-300 lg:block ${
                    selected ? 'translate-x-0 text-indigo-400' : '-translate-x-1 text-transparent'
                  }`}
                  aria-hidden="true"
                />
                {selected && (
                  <span
                    aria-hidden
                    className="absolute inset-y-2 left-0 hidden w-[3px] rounded-full bg-indigo-500 lg:block"
                  />
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-4 hidden text-[11.5px] leading-relaxed text-slate-400 lg:block">
          Use the arrow keys to walk the modules.
        </p>
      </div>      <div
        key={current.id}
        role="tabpanel"
        id={`module-panel-${current.id}`}
        aria-labelledby={`module-tab-${current.id}`}
        tabIndex={0}
        className="cf-panel-in cf-spot relative min-w-0 overflow-hidden rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_1px_0_#fff_inset,0_24px_60px_-40px_rgba(23,20,64,0.4)] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:p-8"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -right-8 flex h-56 w-56 items-center justify-center rounded-full border border-indigo-100/70 bg-indigo-50/40 text-indigo-500/[0.14]"
        >
          <ModuleIcon className="h-28 w-28" strokeWidth={1.2} aria-hidden="true" />
        </span>
        <span aria-hidden className="cf-dots pointer-events-none absolute inset-0" />

        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {current.kicker}
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-900 sm:text-2xl">
            {current.title}
          </h3>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600">{current.summary}</p>

          <ul className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-x-8">
            {current.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3 text-[13.5px] leading-relaxed text-slate-600">
                <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-50">
                  <Check className="h-2.5 w-2.5 text-indigo-600" aria-hidden="true" />
                </span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Used by
            </span>
            {current.who.map((role) => (
              <span
                key={role}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] font-medium text-slate-600 shadow-xs"
              >
                {role}
              </span>
            ))}
          </div>

          {current.shot && (
            <div className="mt-7">
              <TiltFrame shot={current.shot} strength={3} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** How long one screen stays up before the tour advances on its own. */
const TOUR_DWELL_MS = 6200;

/** How long the outgoing screen stays mounted while it slides away. */
const TOUR_EXIT_MS = 720;

type TourStep = (typeof TOURS)[number]['steps'][number];

/**
 * A look inside, as a guided tour.
 *
 * One portal at a time, and inside it the screens that person meets in order.
 * The window sits beside a rail of steps that scrolls with the tour rather than
 * with the page, so nobody has to scroll down and then reach for an arrow. The
 * tour advances on its own while it is on screen and the reader is not
 * interacting with it; hovering, focusing, pausing or reduced motion stops the
 * clock. Every step is clickable and the arrow keys work when the region has
 * focus.
 */
function Screens() {
  const reduced = useReducedMotion();
  const { ref: stageRef, inView } = useInView<HTMLDivElement>({ threshold: 0.35, once: false });
  const [roleId, setRoleId] = useState(TOURS[0].id);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [holding, setHolding] = useState(false);
  const [docHidden, setDocHidden] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const [outgoing, setOutgoing] = useState<{ step: TourStep; key: number } | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const stepRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const seq = useRef(0);

  const tour = TOURS.find((candidate) => candidate.id === roleId) ?? TOURS[0];
  const total = tour.steps.length;
  const current = tour.steps[Math.min(active, total - 1)];

  /**
   * Move to a step in a given direction.
   *
   * The outgoing screen is kept mounted for the length of its exit, so the two
   * frames overlap: a crossfade where one copy slides and shrinks away while the
   * next arrives from the opposite edge is what reads as a camera panning
   * between two pages, rather than one image replacing another.
   */
  const go = (target: number, direction: 1 | -1) => {
    const next = ((target % total) + total) % total;
    if (next === active) return;
    setDir(direction);
    if (!reduced) {
      const previous = tour.steps[active];
      if (previous) {
        seq.current += 1;
        setOutgoing({ step: previous, key: seq.current });
      }
    }
    setActive(next);
  };

  const move = (delta: number) => go(active + delta, delta > 0 ? 1 : -1);

  const chooseRole = (next: string) => {
    setRoleId(next);
    setActive(0);
    setOutgoing(null);
    setDir(1);
  };

  // The tour runs only while it is being looked at: off-screen, in a background
  // tab, held open over the step list, or against a reduced-motion reader it
  // stands still.
  //
  // Deliberately *not* paused by hovering the window. That panel is the size of
  // a screenshot and the pointer rests over it after any scroll, so a hover-pause
  // there kept the tour frozen in exactly the situation it exists for.
  useEffect(() => {
    if (reduced || !playing || holding || docHidden || !inView || total < 2) return;
    const id = window.setTimeout(() => {
      const previous = tour.steps[active];
      if (previous) {
        seq.current += 1;
        setOutgoing({ step: previous, key: seq.current });
      }
      setDir(1);
      setActive((value) => (value + 1) % total);
    }, TOUR_DWELL_MS);
    return () => window.clearTimeout(id);
  }, [active, playing, holding, docHidden, inView, reduced, total, tour]);

  // Retire the exiting frame once its slide has finished.
  useEffect(() => {
    if (!outgoing) return;
    const id = window.setTimeout(() => setOutgoing(null), TOUR_EXIT_MS);
    return () => window.clearTimeout(id);
  }, [outgoing]);

  // A tab in the background must not race through the tour unnoticed.
  useEffect(() => {
    const sync = () => setDocHidden(document.visibilityState === 'hidden');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  // Warm the neighbours so a step change is a decode, not a request.
  useEffect(() => {
    for (const step of [
      tour.steps[(active + 1) % total],
      tour.steps[(active - 1 + total) % total],
    ]) {
      if (!step) continue;
      const img = new Image();
      img.src = step.src;
    }
  }, [tour, active, total]);

  // Keep the chosen step visible inside its own rail, without moving the page.
  useEffect(() => {
    const rail = railRef.current;
    const node = stepRefs.current[active];
    if (!rail || !node) return;
    const behaviour: ScrollBehavior = reduced ? 'auto' : 'smooth';
    if (rail.scrollHeight > rail.clientHeight + 4) {
      const top = node.offsetTop - (rail.clientHeight - node.clientHeight) / 2;
      rail.scrollTo({ top: Math.max(0, top), behavior: behaviour });
    } else {
      const left = node.offsetLeft - (rail.clientWidth - node.clientWidth) / 2;
      rail.scrollTo({ left: Math.max(0, left), behavior: behaviour });
    }
  }, [active, roleId, reduced]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(total - 1);
    }
  };

  return (
    <section id="screens" className="scroll-mt-24 bg-white py-20 sm:py-28">
      <div className={SHELL}>
        <SectionHead
          index="03"
          eyebrow="A look inside"
          title="One portal at a time, every screen in order."
          body="Pick who is signing in, then follow their day: the dashboard, the course, the coursework, the editor, the paper. Real captures from the seeded development database — the same React build a deployed instance serves."
        />

        <div className="mt-9 flex flex-wrap gap-1.5" role="group" aria-label="Choose a portal">
          {TOURS.map((candidate) => {
            const on = candidate.id === tour.id;
            return (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={on}
                onClick={() => chooseRole(candidate.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  on
                    ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700'
                }`}
              >
                {candidate.label}
                <span
                  aria-hidden
                  className={`text-[10.5px] font-medium tabular-nums ${
                    on ? 'text-slate-300' : 'text-slate-400'
                  }`}
                >
                  {candidate.steps.length}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
          <span className="font-medium text-slate-700">{tour.who}.</span> {tour.blurb}
        </p>

        <div
          id="tour-stage"
          role="group"
          aria-roledescription="carousel"
          aria-label={`${tour.label} screens`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="mt-7 grid gap-6 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-4 lg:grid-cols-[minmax(0,1fr)_292px] lg:items-start lg:gap-8"
        >
          <figure className="min-w-0">
            <div className="cf-tour-window" ref={stageRef}>
              {/* Time left on this frame. Restarts with each screen and freezes
                  whenever the clock does, so the tour never looks stuck. */}
              <span
                key={`timer-${tour.id}-${active}`}
                aria-hidden
                className="cf-tour-timer"
                style={{
                  animationDuration: `${TOUR_DWELL_MS}ms`,
                  animationPlayState:
                    playing && inView && !reduced && !holding && !docHidden
                      ? 'running'
                      : 'paused',
                }}
              />

              <div className="relative z-[2] flex items-center gap-1.5 border-b border-slate-200/80 bg-slate-100/70 px-4 py-2.5">
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                <span className="ml-3 flex min-w-0 items-center gap-1.5 truncate whitespace-nowrap rounded-md bg-white/90 px-2.5 py-0.5 text-[10.5px] font-medium text-slate-500">
                  <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span className="truncate">
                    <span className="hidden sm:inline">CampusFlow · </span>
                    {tour.label} portal
                  </span>
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
                  <span
                    aria-hidden
                    className={`cf-tour-live${
                      playing && inView && !reduced && !holding ? ' is-live' : ''
                    }`}
                  />
                  <span
                    key={`${tour.id}-${active}`}
                    className="cf-tour-count text-[10.5px] font-semibold tabular-nums text-slate-400"
                  >
                    {String(active + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
                  </span>
                </span>
              </div>

              <div className="cf-tour-viewport">
                {outgoing && (
                  <img
                    key={`out-${outgoing.key}`}
                    src={outgoing.step.src}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className={`cf-tour-layer cf-tour-layer-out ${
                      dir > 0 ? 'is-left' : 'is-right'
                    }`}
                  />
                )}
                <img
                  key={`in-${tour.id}-${current.src}`}
                  src={current.src}
                  alt={current.alt}
                  width={1440}
                  height={900}
                  loading="eager"
                  decoding="async"
                  draggable={false}
                  data-dir={dir > 0 ? 'next' : 'prev'}
                  className="cf-tour-layer cf-tour-layer-in"
                />
                {/* A light band crossing the frame marks the cut without
                    hiding the content that just arrived. */}
                <span key={`sweep-${tour.id}-${active}`} aria-hidden className="cf-tour-sweep" />

                <button
                  type="button"
                  onClick={() => move(-1)}
                  aria-label="Previous screen"
                  className="cf-tour-arrow cf-tour-arrow-prev"
                >
                  <ArrowLeft className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => move(1)}
                  aria-label="Next screen"
                  className="cf-tour-arrow cf-tour-arrow-next"
                >
                  <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Where this screen sits in the run: a still strip, not a second set
                of controls — the step list beside it already scrubs. */}
            <div aria-hidden className="cf-tour-ticks">
              {tour.steps.map((step, index) => (
                <span
                  key={step.src}
                  className={`cf-tour-tick${index < active ? ' is-done' : ''}${
                    index === active ? ' is-on' : ''
                  }`}
                />
              ))}
            </div>

            {/* Announced only while the reader is driving the tour: an auto-advancing
                region that talks every five seconds is noise, not help. */}
            <figcaption
              className="mt-3.5 min-h-[70px]"
              aria-live={playing && !holding ? 'off' : 'polite'}
              onMouseEnter={() => setHolding(true)}
              onMouseLeave={() => setHolding(false)}
            >
              <div key={`cap-${tour.id}-${active}`} className="cf-tour-caption">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-indigo-600">
                  <span className="tabular-nums">
                    {String(active + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
                  </span>
                  <span aria-hidden className="mx-2 text-slate-300">
                    ·
                  </span>
                  {current.title}
                </p>
                <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-slate-600">
                  {current.body}
                </p>
              </div>
            </figcaption>

            <div className="mt-4 flex items-center gap-2" data-tour-controls>
              <button
                type="button"
                onClick={() => setPlaying((value) => !value)}
                aria-pressed={!playing}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-xs transition-colors hover:border-indigo-200 hover:text-indigo-700"
              >
                {playing ? (
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {playing ? 'Pause' : 'Play tour'}
              </button>
              <a
                href={current.src}
                target="_blank"
                rel="noreferrer"
                className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-xs transition-colors hover:border-indigo-200 hover:text-indigo-700"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Full size
              </a>
              <span className="ml-auto hidden text-[11.5px] text-slate-400 sm:block">
                {reduced
                  ? 'Pick a step, or use the arrow keys.'
                  : !playing
                    ? 'Paused — press Play to continue.'
                    : holding
                      ? 'Held while you read the steps.'
                      : 'Auto-playing · hover the steps to hold.'}
              </span>
            </div>
          </figure>

          <div className="relative min-w-0">
            <div className="flex items-baseline justify-between">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {tour.label} · the tour
              </p>
              <span className="text-[11px] font-semibold tabular-nums text-slate-400">
                {String(active + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
              </span>
            </div>

            <div
              ref={railRef}
              className="cf-tour-rail mt-2.5"
              onMouseEnter={() => setHolding(true)}
              onMouseLeave={() => setHolding(false)}
            >
              {tour.steps.map((step, index) => {
                const on = index === active;
                return (
                  <button
                    key={step.src}
                    ref={(node) => {
                      stepRefs.current[index] = node;
                    }}
                    type="button"
                    onClick={() => go(index, index > active ? 1 : -1)}
                    aria-current={on ? 'step' : undefined}
                    className={`cf-tour-step${on ? ' is-on' : ''}`}
                  >
                    <span className="cf-tour-step-index tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1 text-left">{step.title}</span>
                    {on && (
                      <span
                        key={`${tour.id}-${active}`}
                        aria-hidden
                        className="cf-tour-progress"
                        style={{
                          animationDuration: `${TOUR_DWELL_MS}ms`,
                          animationPlayState:
                            playing && !holding && !reduced && inView ? 'running' : 'paused',
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Walkthrough() {
  return (
    <div className="mt-12 grid gap-5 lg:grid-cols-2">
      {TRACKS.map((track, index) => {
        const Icon = track.icon;
        return (
          <Reveal key={track.id} delay={index * 80} y={30}>
            <section className="cf-lift cf-spot group relative h-full overflow-hidden rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_1px_0_#fff_inset] sm:p-7">
              <span
                aria-hidden
                className="pointer-events-none absolute -right-2 -top-6 select-none text-[88px] font-semibold leading-none tracking-tighter text-slate-50 transition-colors duration-500 group-hover:text-indigo-50"
              >
                {String(index + 1).padStart(2, '0')}
              </span>

              <div className="relative flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_10px_20px_-12px_rgba(79,70,229,0.9)]">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-indigo-600">
                    {track.role}
                  </p>
                  <h3 className="text-[15px] font-semibold text-slate-900">{track.title}</h3>
                </div>
              </div>

              <p className="relative mt-3 text-[13px] leading-relaxed text-slate-500">{track.purpose}</p>

              <ol className="relative mt-5 space-y-0 border-t border-slate-100 pt-5">
                {track.steps.map((step, stepIndex) => (
                  <li key={step} className="relative flex gap-3 pb-3.5 last:pb-0">
                    {stepIndex < track.steps.length - 1 && (
                      <span aria-hidden className="absolute left-[10px] top-5 h-full w-px bg-slate-100" />
                    )}
                    <span className="relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-semibold tabular-nums text-slate-500">
                      {stepIndex + 1}
                    </span>
                    <span className="text-[13px] leading-relaxed text-slate-600">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          </Reveal>
        );
      })}
    </div>
  );
}

function Journey() {
  const { ref, progress } = useSectionProgress<HTMLDivElement>();
  const reached = Math.floor(progress * STAGES.length + 0.001);

  return (
    <div ref={ref} className="mt-14">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-300/60">
        <span>Author</span>
        <span className="hidden sm:block">Chain of custody</span>
        <span>Release</span>
      </div>

      <div className="relative mt-4 h-[2px] w-full rounded-full bg-white/10">
        <div
          className="cf-track-fill absolute inset-0 rounded-full bg-gradient-to-r from-indigo-400 via-indigo-300 to-sky-300"
          style={{ '--cf-p': progress } as CSSProperties}
        />
        <div
          className="absolute -top-[5px] h-3 w-3 rounded-full bg-indigo-300 shadow-[0_0_0_5px_rgba(129,140,248,0.16),0_0_22px_rgba(129,140,248,0.85)]"
          style={{ left: `calc(${progress * 100}% - 6px)` }}
        />
      </div>

      <ol className="mt-10 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-6 lg:gap-3">
        {STAGES.map((stage, index) => {
          const on = index <= reached;
          return (
            <li
              key={stage.kicker}
              className={`cf-stage-card relative h-full overflow-hidden rounded-2xl border p-4 transition-all duration-500 ${
                on
                  ? 'is-on border-indigo-400/40 bg-white/[0.08]'
                  : 'border-white/10 bg-white/[0.025]'
              }`}
            >
              <span
                aria-hidden
                className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/70 to-transparent transition-opacity duration-500 ${
                  on ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <span
                className={`cf-orb inline-flex h-7 w-7 items-center justify-center rounded-full border text-[10.5px] font-semibold tabular-nums ${
                  on
                    ? 'is-on border-indigo-300/60 bg-indigo-500 text-white'
                    : 'border-white/15 bg-white/[0.04] text-slate-400'
                }`}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <p
                className={`mt-4 text-[9.5px] font-semibold uppercase tracking-[0.18em] transition-colors duration-500 ${
                  on ? 'text-indigo-300' : 'text-slate-500'
                }`}
              >
                {stage.kicker}
              </p>
              <p className="mt-1 text-[13.5px] font-semibold text-white">{stage.title}</p>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-400">{stage.body}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Roles() {
  return (
    <dl className="mt-12 divide-y divide-slate-200/80 border-y border-slate-200/80">
      {ROLES.map((role, index) => {
        const Icon = role.icon;
        return (
          <Reveal
            key={role.name}
            delay={index * 55}
            y={18}
            className="group grid gap-4 rounded-2xl px-4 py-6 transition-colors duration-300 hover:bg-white md:grid-cols-[210px_minmax(0,1fr)_minmax(0,1fr)] md:gap-8"
          >
            <dt className="flex items-center gap-3 self-start">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-indigo-600 shadow-xs transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:shadow-md">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-[14px] font-semibold text-slate-900">{role.name}</span>
              </span>
            </dt>
            <dd className="text-[13.5px] leading-relaxed text-slate-600">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 md:hidden">
                Owns
              </span>
              {role.owns}
            </dd>
            <dd className="border-l-2 border-transparent pl-4 text-[13.5px] leading-relaxed text-slate-500 transition-colors duration-300 group-hover:border-rose-200">
              <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-500">
                <Minus className="h-3 w-3" aria-hidden="true" />
                Cannot
              </span>
              {role.cannot}
            </dd>
          </Reveal>
        );
      })}
    </dl>
  );
}

function Integrity() {
  return (
    <section
      id="integrity"
      className="relative scroll-mt-24 overflow-hidden bg-slate-950 py-20 text-slate-100 sm:py-28"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(760px 380px at 84% -6%, rgba(99,102,241,0.24), transparent 62%), radial-gradient(560px 300px at 4% 104%, rgba(14,165,233,0.10), transparent 60%)',
        }}
      />
      <div aria-hidden className="pointer-events-none absolute right-[-8%] top-[-18%] h-[560px] w-[560px]">
        <div className="absolute inset-0" style={{ transform: 'rotateX(66deg)' }}>
          <div className="cf-orbit absolute inset-0 rounded-full border border-indigo-400/20" />
          <div className="cf-orbit-reverse absolute inset-12 rounded-full border border-sky-300/15" />
          <div className="absolute inset-24 rounded-full border border-white/5" />
        </div>
      </div>

      <div className={`${SHELL} relative`}>
        <SectionHead
          index="07"
          eyebrow="Integrity & security"
          title="Authorization is the product, not a wrapper around it."
          body="An examination platform is a target by design. Each rule below is enforced by the server and pinned by a test that fails the build when it regresses."
          tone="dark"
        />

        <dl className="mt-12 grid gap-px overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.08] sm:grid-cols-2">
          {SECURITY.map((rule, index) => (
            <Reveal
              key={rule.rule}
              delay={(index % 2) * 60}
              y={16}
              className="cf-spot cf-spot-dark group h-full bg-slate-950 p-6 transition-colors duration-300 hover:bg-slate-900/80"
            >
              <dt className="flex items-start gap-3 text-[14px] font-semibold text-white">
                <span className="mt-0.5 flex h-2 w-2 shrink-0 rounded-full bg-indigo-400 shadow-[0_0_0_3px_rgba(129,140,248,0.18)]" />
                {rule.rule}
              </dt>
              <dd className="mt-2 pl-5 text-[13px] leading-relaxed text-slate-400">{rule.how}</dd>
            </Reveal>
          ))}
        </dl>

        <div className="mt-8 grid gap-px overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.08] sm:grid-cols-2 lg:grid-cols-4">
          {INTEGRITY_FACTS.map((fact) => (
            <div key={fact.figure} className="bg-slate-950 px-6 py-5">
              <p className="text-[26px] font-semibold tracking-tight text-white">{fact.figure}</p>
              <p className="mt-1 text-[12px] leading-snug text-slate-400">{fact.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-px overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.08] lg:grid-cols-2">
          {INTEGRITY_CUES.map((group, index) => (
            <Reveal
              key={group.tier}
              delay={index * 70}
              y={16}
              className="bg-slate-950 p-6 sm:p-7"
            >
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${
                    index === 0 ? 'bg-amber-400' : 'bg-sky-400'
                  }`}
                />
                <span className={index === 0 ? 'text-amber-300' : 'text-sky-300'}>
                  {group.tier}
                </span>
              </p>
              <ul className="mt-4 space-y-2.5">
                {group.items.map((item) => (
                  <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-400">
                    <span
                      aria-hidden
                      className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-600"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <p className="mt-8 max-w-3xl text-[13px] leading-relaxed text-slate-400">
            Every camera cue runs inside the candidate’s own browser: frames are measured and
            discarded, nothing is streamed, and no audio is ever recorded or transmitted. The tier
            a paper runs at, every threshold it implies and every cue it switches on are shown to
            the candidate before they start. The last two hardening waves came from auditing the
            running stack rather than the test suite: candidate sessions could read answer keys and
            cohort gradebooks, six directory routes had no gate, and a department filter fell
            through to an unscoped query. Each defect, its reproduction and its fix is recorded in
            the audit notes that ship with the deployment.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * The product tour, as a deck.
 *
 * The screens sit in a real 3D coverflow: the chosen one is flat and lit, and
 * its neighbours stand back on either side, angled away with depth on the Z
 * axis. Arrow keys, the two controls or the strip below all move the deck, and
 * every screen stays mounted, so a switch is a transform rather than a load.
 *
 * On a narrow screen the neighbours tuck almost entirely behind the active
 * screen: the deck still moves, but the reading width belongs to one shot.
 */
function Run() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      id="run"
      className="scroll-mt-24 border-y border-slate-200/70 bg-slate-50/70 py-20 sm:py-28"
    >
      <div className={SHELL}>
        <SectionHead
          index="08"
          eyebrow="How it is built and operated"
          title="A modular monolith, deployed as one Compose project."
          body="campusflow.bedrock — config, database, auth, RBAC, audit, storage, mail, runner — never imports from campusflow.domain. Domains cooperate through service interfaces rather than each other’s tables, and the college runs the whole system as a single supervised Compose project on one server."
        />

        {/* `min-w-0` on both children is load-bearing: the terminal's longest
            command line would otherwise set a min-content width for the whole
            single-column grid, which on a phone widens the page instead of
            scrolling inside the terminal. */}
        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:gap-10">
          <Reveal y={30} className="min-w-0">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                The layers
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {ARCHITECTURE.map((layer, index) => (
                  <div
                    key={layer.name}
                    className="cf-spot relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-indigo-500 via-indigo-400 to-sky-400"
                      style={{ opacity: 1 - index * 0.16 }}
                    />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      0{index + 1}
                    </p>
                    <p className="mt-1 text-[13.5px] font-semibold text-slate-900">{layer.name}</p>
                    <p className="text-[11.5px] font-medium text-indigo-700">{layer.tag}</p>
                    <p className="mt-2 text-[11.5px] leading-snug text-slate-500">
                      {layer.items.join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[12.5px] leading-relaxed text-slate-500">
                The full layer-by-layer choice table is in the project documentation; TLS, backups, evidence
                retention and upgrades are in the runbook.
              </p>
            </div>
          </Reveal>

          <Reveal delay={90} y={30} className="min-w-0">
            <div>
              <div className="overflow-hidden rounded-[24px] border border-slate-800 bg-slate-900 shadow-[0_30px_70px_-40px_rgba(15,23,42,0.9)]">
                <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-5 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="flex gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-white/15" />
                      <span className="h-2 w-2 rounded-full bg-white/15" />
                      <span className="h-2 w-2 rounded-full bg-white/15" />
                    </span>
                    <span className="text-[11px] font-medium text-slate-400">production host</span>
                  </div>
                  <button
                    type="button"
                    onClick={copy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[10.5px] font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {copied ? (
                      <>
                        <ClipboardCopy className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <Typewriter text={INSTALL} />
              </div>

              <ol className="mt-5 space-y-2.5">
                {BOOT_SEQUENCE.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-semibold tabular-nums text-slate-500">
                      {index + 1}
                    </span>
                    <span className="text-[12.5px] leading-relaxed text-slate-600">{step}</span>
                  </li>
                ))}
              </ol>

              <p className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-[12.5px] leading-relaxed text-slate-600">
                <span className="font-semibold text-slate-800">Planning the cutover?</span> TLS,
                backups and a verified restore, evidence retention, upgrades and troubleshooting are
                all covered by the deployment runbook that ships with the instance.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Proof() {
  return (
    <section id="proof" className={`${SHELL} scroll-mt-24 py-20 sm:py-28`}>
      <SectionHead
        index="09"
        eyebrow="Proof and limits"
        title="Claims with commands behind them — and what it does not do yet."
        body="The suite, the linter and the production build are what CI runs on main. The limits beside them are stated plainly, because a demo that hides the omissions is not telling you what you are deploying."
      />

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-14">
        <Reveal>
          <div>
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
              <table className="w-full text-left">
                <caption className="sr-only">Verification commands and results</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Command
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {VERIFICATION.map((row) => (
                    <tr key={row.command} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-mono text-[11.5px] text-slate-700">
                        <span className="mr-2 text-[10px] uppercase tracking-wide text-slate-400">
                          {row.dir}
                        </span>
                        {row.command}
                      </td>
                      <td className="px-5 py-3 text-[12px] font-medium text-slate-600">
                        {row.result}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-600">
                <span className="cf-pulse h-1.5 w-1.5 rounded-full bg-emerald-500" />
                The same suite runs on every change
              </span>
              <span>· PostgreSQL suite · the two SQLite skips are PostgreSQL-only.</span>
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
              The last hardening wave was also verified against a running Compose stack through its
              proxy: a provisioned Campus Lead signed in, unauthenticated requests were refused, the
              evidence purge audited every erasure, a pg_dump/pg_restore round trip restored the
              schema, and a 512 MB allocation was killed under a 128 MB cap.
            </p>
          </div>
        </Reveal>

        <Reveal delay={90}>
          <div>
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              <Minus className="h-3 w-3" aria-hidden="true" />
              What it does not do yet
            </p>
            <ul className="mt-4 space-y-3">
              {LIMITS.map((limit) => (
                <li key={limit.title} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[13px] font-semibold text-slate-900">{limit.title}</p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">{limit.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}


function FaqItem({ item, index }: { item: { q: string; a: string }; index: number }) {
  const [open, setOpen] = useState(index === 0);
  return (
    <div className="cf-accordion" data-open={open}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="group flex w-full items-start justify-between gap-4 py-4 text-left text-[14px] font-medium text-slate-900 transition-colors hover:text-indigo-800"
      >
        {item.q}
        <span className="cf-accordion-icon mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors group-hover:border-indigo-200 group-hover:text-indigo-600">
          <Plus className="h-3 w-3" aria-hidden="true" />
        </span>
      </button>
      <div className="cf-accordion-body">
        <div>
          <p className="pb-4 pr-9 text-[13px] leading-relaxed text-slate-600">{item.a}</p>
        </div>
      </div>
    </div>
  );
}

function Faq() {
  return (
    <section
      id="faq"
      className="scroll-mt-24 border-t border-slate-200/70 bg-slate-50/70 py-20 sm:py-28"
    >
      <div className={`${SHELL} grid gap-10 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-16`}>
        <div>
          <SectionHead index="10" eyebrow="Questions" title="The things people ask first." />
          <Reveal delay={80}>
            <p className="mt-5 max-w-sm text-[13px] leading-relaxed text-slate-500">
              Anything not answered here is covered by the documentation that ships with the
              deployment — the architecture map, the decisions behind each trade-off, and the
              runbook that covers the operational detail.
            </p>
          </Reveal>
        </div>
        <Reveal delay={60}>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {FAQ.map((item, index) => (
              <FaqItem key={item.q} item={item} index={index} />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="relative overflow-hidden bg-white py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(680px 320px at 50% -10%, rgba(99,102,241,0.16), transparent 68%)',
        }}
      />
      <div aria-hidden className="cf-rings pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative mx-auto max-w-2xl px-6 text-center">
        <Reveal y={18}>
          <div className="cf-scene relative mx-auto w-fit">
            <div className="absolute inset-0 -z-10 scale-[1.9] rounded-full bg-indigo-500/10 blur-2xl" />
            <div className="absolute inset-0 -z-10">
              <div className="cf-orbit absolute -inset-6 rounded-full border border-indigo-200/70" />
              <div className="cf-orbit-reverse absolute -inset-12 rounded-full border border-slate-200/70" />
            </div>
            <BrandMark className="h-[88px] w-[88px] drop-shadow-[0_18px_30px_rgba(23,20,64,0.28)]" />
          </div>
        </Reveal>

        <Reveal delay={80}>
          <h2 className="mt-8 text-[34px] font-semibold leading-[1.04] tracking-[-0.04em] text-balance text-slate-900 sm:text-[46px]">
            Ready for <span className="cf-ink">your campus.</span>
          </h2>
        </Reveal>
        <Reveal delay={150}>
          <p className="mx-auto mt-5 max-w-xl text-[15.5px] leading-relaxed text-slate-600">
            One host, one origin, one front door. When the instance is deployed, the first Campus
            Lead is provisioned and the college’s academic year begins in the same database it will
            end in.
          </p>
        </Reveal>
        <Reveal delay={220}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={requestDeployNotice}
              className="cf-shine group inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-[14px] font-semibold text-white shadow-[0_16px_30px_-16px_rgba(79,70,229,0.9)] transition-colors hover:bg-indigo-700"
            >
              Sign in to your portal
              <ArrowRight className="cf-arrow-slide h-4 w-4" aria-hidden="true" />
            </button>
            <a
              href="#screens"
              className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-[14px] font-semibold text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              See every screen
              <ArrowRight className="cf-arrow-slide h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <p className="mt-6 text-[12px] text-slate-500">
            Not deployed yet · no public sign-up · one institution per deployment
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 py-12">
      <div className={`${SHELL} grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]`}>
        <div>
          <div className="flex items-center gap-3">
            <BrandMark className="h-10 w-10" />
            <div>
              <p className="text-[14px] font-semibold text-slate-900">CampusFlow</p>
              <p className="text-[11.5px] text-slate-500">Academic Portal</p>
            </div>
          </div>
          <p className="mt-4 max-w-xs text-[12px] leading-relaxed text-slate-500">
            A college LMS and secure examination platform, self-hosted on one server. Designed and
            developed by{' '}
            <a
              href="https://github.com/SumanthMamidi-MNS"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-slate-900"
            >
              Sumanth Mamidi
            </a>
            .
          </p>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Product</p>
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
              <a className="transition-colors hover:text-slate-900" href="#proof">
                Proof &amp; limits
              </a>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Status
          </p>
          <ul className="mt-3 space-y-2 text-[12.5px] text-slate-600">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden />
              <span>
                Presented, not yet deployed — the hosted instance is coming soon, so sign-in is
                closed for now.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" aria-hidden />
              <span>No public sign-up — accounts are provisioned by the college.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
              <span>One institution per deployment — your data stays on your server.</span>
            </li>
            <li>
              <a className="transition-colors hover:text-slate-900" href="#faq">
                Questions
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div
        className={`${SHELL} mt-10 flex flex-col gap-2 border-t border-slate-200 pt-6 text-[11.5px] text-slate-500 sm:flex-row sm:items-center sm:justify-between`}
      >
        <p>© 2026 Sumanth Mamidi</p>
        <p>Examination data is personal data — the retention window is yours to set.</p>
      </div>
    </footer>
  );
}

/**
 * The chapter rail.
 *
 * A fixed index for a long page: the active chapter is always visible, and the
 * label arrives on hover so the rail stays a hairline until it is wanted. It
 * is a nav, not decoration — every tick is a real anchor.
 */
function ChapterRail() {
  const active = useActiveSection(CHAPTERS.map((chapter) => chapter.id));

  return (
    <nav
      aria-label="Page chapters"
      className="fixed right-5 top-1/2 z-30 hidden -translate-y-1/2 xl:block"
    >
      <ol className="flex flex-col items-end gap-0.5">
        {CHAPTERS.map((chapter, index) => {
          const on = active === chapter.id;
          return (
            <li key={chapter.id}>
              <a
                href={`#${chapter.id}`}
                aria-current={on ? 'true' : undefined}
                className="cf-rail-link group flex items-center justify-end gap-2.5 py-1.5"
              >
                <span className="cf-rail-label rounded-md bg-white/90 px-2 py-0.5 text-[10.5px] font-medium text-slate-600 shadow-xs ring-1 ring-slate-200/70 backdrop-blur">
                  {String(index + 1).padStart(2, '0')} · {chapter.label}
                </span>
                <span className="cf-rail-tick" />
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The product is presented, not deployed.
 *
 * Every sign-in entry point explains that instead of navigating to a portal
 * that does not exist yet: one event, one notice, and the page never pretends
 * an instance is live. When the college deployment goes live, the CTAs go back
 * to linking and this notice comes out in one change.
 */
const DEPLOY_NOTICE_EVENT = 'campusflow:deploy-notice';

function requestDeployNotice() {
  window.dispatchEvent(new CustomEvent(DEPLOY_NOTICE_EVENT));
}

function DeployNotice() {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(DEPLOY_NOTICE_EVENT, show);
    return () => window.removeEventListener(DEPLOY_NOTICE_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setOpen(false), 10000);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 sm:bottom-7"
    >
      <div className="cf-notice pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-2xl border border-indigo-200 bg-white/95 p-4 shadow-[0_28px_60px_-28px_rgba(23,20,64,0.45)] backdrop-blur">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
          <ShieldCheck className="h-4.5 w-4.5 text-indigo-600" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-900">
            Not deployed yet — the hosted instance is coming soon
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
            {reduced
              ? 'The live portal is being prepared and will open soon. Once it is deployed, this button goes straight to your institution’s sign-in.'
              : 'You are looking at the finished product, presented. The hosted instance is being prepared and will be deployed soon — once it is live, this button goes straight to your institution’s sign-in, and your college provisions the account. There is no public sign-up.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Dismiss notice"
          className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <span aria-hidden className="text-[15px] leading-none">×</span>
        </button>
      </div>
    </div>
  );
}

export function LandingPage() {
  // Both of these drive CSS only. Keeping them out of state is deliberate: a
  // scroll frame must not re-render the page.
  const progressRef = useScrollVar<HTMLDivElement>('--cf-page');
  const heroRef = useScrollVar<HTMLElement>('--cf-dive', { target: 'self', span: 1.05 });
  useSpotlightField();

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 antialiased">
      <a
        href="#product"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className={`${SHELL} flex h-16 items-center justify-between gap-6`}>
          <Link to="/" className="group flex items-center gap-3" aria-label="CampusFlow home">
            <BrandMark className="h-10 w-10 transition-transform duration-500 group-hover:-translate-y-0.5" />
            <span className="text-[19px] font-semibold tracking-[-0.015em] text-slate-900">
              Campus<span className="text-indigo-600">Flow</span>
            </span>
          </Link>

          <nav aria-label="Sections" className="hidden items-center gap-7 text-[13px] font-medium text-slate-500 md:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                className="relative py-1 transition-colors hover:text-slate-900 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:w-0 after:bg-indigo-500 after:transition-all after:duration-300 hover:after:w-full"
                href={item.href}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={requestDeployNotice}
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white shadow-xs transition-colors hover:bg-slate-800"
            >
              Sign in
            </button>
          </div>
        </div>

        <nav
          aria-label="Sections"
          className="flex gap-5 overflow-x-auto border-t border-slate-100 px-6 py-2 text-[12.5px] font-medium text-slate-500 md:hidden"
        >
          {NAV.map((item) => (
            <a key={item.href} className="whitespace-nowrap" href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div aria-hidden className="absolute inset-x-0 bottom-[-1px] h-px bg-transparent">
          <div
            ref={progressRef}
            className="cf-page-progress h-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-sky-400"
          />
        </div>
      </header>

      <DeployNotice />

      <main id="product">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section ref={heroRef} className="relative isolate overflow-hidden">
          <div aria-hidden className="cf-blueprint pointer-events-none absolute inset-0" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(880px 460px at 10% -16%, rgba(99,102,241,0.2), transparent 62%), radial-gradient(620px 380px at 94% 8%, rgba(14,165,233,0.13), transparent 60%)',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-white"
          />

          <div className={`${SHELL} relative`}>
            <div className="grid gap-16 pb-16 pt-14 lg:grid-cols-[1.03fr_0.97fr] lg:items-center lg:gap-10 lg:pb-24 lg:pt-20">
              <div className="cf-hero-copy">
                <Reveal y={14}>
                  <p className="inline-flex items-center gap-2.5 rounded-full border border-indigo-200/70 bg-white/70 py-1.5 pl-3 pr-4 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-indigo-700 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] backdrop-blur">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="cf-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-500" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                    Self-hosted · one institution · presented, not deployed
                  </p>
                </Reveal>

                <h1 className="mt-7 text-[38px] font-semibold leading-[1.02] tracking-[-0.045em] text-balance text-slate-900 sm:text-[52px] lg:text-[57px]">
                  <Words
                    text="One campus. Every course, every exam, and the evidence behind every mark."
                    emphasis="evidence behind every mark."
                    delay={90}
                    step={26}
                  />
                </h1>

                <Reveal delay={150} y={24}>
                  <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-slate-600 sm:text-[17px]">
                    CampusFlow is the LMS and secure examination platform a college runs on its own
                    server: rosters, materials, assignments, gradebooks, question banks, timed papers
                    with an audited integrity trail, and sandboxed code grading — on one cohort
                    record, behind one authorization model.
                  </p>
                </Reveal>

                <Reveal delay={220} y={20}>
                  <div className="mt-8 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={requestDeployNotice}
                      className="cf-shine group inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-[14px] font-semibold text-white shadow-[0_16px_30px_-16px_rgba(79,70,229,0.9)] transition-colors hover:bg-indigo-700"
                    >
                      Sign in to your portal
                      <ArrowRight className="cf-arrow-slide h-4 w-4" aria-hidden="true" />
                    </button>
                    <a
                      href="#run"
                      className="group inline-flex items-center rounded-xl border border-slate-200 bg-white/80 px-6 py-3 text-[14px] font-semibold text-slate-700 shadow-xs backdrop-blur transition-colors hover:border-slate-300 hover:text-slate-900"
                    >
                      Read the deployment runbook
                    </a>
                  </div>
                  <p className="mt-4 text-[12.5px] text-slate-500">
                    No public sign-up. The first account is provisioned from the server.
                  </p>
                </Reveal>

                <dl className="mt-10 grid grid-cols-2 gap-y-7 border-t border-slate-200/80 pt-7 sm:grid-cols-4 sm:gap-4">
                  {STATS.map((stat, index) => (
                    <Reveal key={stat.label} delay={280 + index * 60} y={14}>
                      <div className={index > 0 ? 'sm:border-l sm:border-slate-200/80 sm:pl-5' : ''}>
                        <dt className="sr-only">{stat.label}</dt>
                        <dd>
                          <span className="block text-[32px] font-semibold leading-none tracking-tight text-slate-900">
                            <Counter value={Number(stat.figure)} />
                          </span>
                          <span className="mt-1.5 block text-[12.5px] font-semibold text-slate-700">
                            {stat.label}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500">
                            {stat.note}
                          </span>
                        </dd>
                      </div>
                    </Reveal>
                  ))}
                </dl>
              </div>

              <HeroStage />
            </div>
          </div>
        </section>

        {/* ── Marquee ──────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden border-y border-slate-800/80 bg-slate-950 py-3.5">
          <div className="cf-marquee-mask">
            <div className="cf-marquee gap-0">
              {[0, 1].map((copyIndex) => (
                <div key={copyIndex} className="flex shrink-0 items-center">
                  {MARQUEE.map((item) => (
                    <span
                      key={`${copyIndex}-${item}`}
                      className="flex items-center gap-6 px-6 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-slate-400"
                    >
                      {item}
                      <span aria-hidden className="h-1 w-1 rounded-full bg-indigo-400/80" />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 01 · Why it exists ───────────────────────────────────────── */}
        <section id="why" className="relative scroll-mt-24 bg-white py-20 sm:py-28">
          <div className={SHELL}>
            <SectionHead
              index="01"
              eyebrow="Why it exists"
              title="Most colleges stitch four tools together and reconcile them forever."
              body="A general LMS cannot run a secure examination, so a forms tool, a proctoring subscription and a code judge get bolted on — then somebody spends the year matching four sets of identities and three kinds of truth about the same student."
            />

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {DISCONNECTED.map((tool, index) => (
                <Reveal key={tool.title} delay={index * 90} y={30}>
                  <div
                    className={`relative h-full rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/70 p-6 shadow-[0_18px_40px_-34px_rgba(23,20,64,0.4)] transition-all duration-500 hover:-translate-y-1.5 hover:rotate-0 hover:shadow-[0_28px_50px_-30px_rgba(23,20,64,0.4)] ${
                      index === 0 ? '-rotate-[1.2deg]' : index === 1 ? 'rotate-[0.9deg]' : '-rotate-[0.6deg]'
                    }`}
                  >
                    <span
                      aria-hidden
                      className="absolute left-1/2 top-2 h-2 w-2 -translate-x-1/2 rounded-full bg-slate-200 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_1px_2px_rgba(23,20,64,0.2)]"
                    />
                    <span className="text-[11px] font-semibold tabular-nums tracking-[0.14em] text-slate-300">
                      0{index + 1}
                    </span>
                    <h3 className="mt-2 text-[15px] font-semibold text-slate-900">{tool.title}</h3>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600">{tool.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal delay={120} y={30}>
              <div className="relative mt-8 overflow-hidden rounded-[26px] border border-indigo-100 bg-gradient-to-br from-indigo-50/60 via-white to-white p-7 sm:p-10">
                <BrandMark className="pointer-events-none absolute -right-10 -top-12 h-72 w-72 opacity-[0.05]" />
                <div aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-indigo-500 to-sky-400" />
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
                  The alternative
                </p>
                <p className="mt-3 max-w-4xl text-[20px] font-medium leading-[1.45] tracking-[-0.015em] text-balance text-slate-900 sm:text-[24px]">
                  CampusFlow treats it as one cohort problem. The section that owns the roster, the
                  material and the gradebook also owns the examinations sat by exactly those students,
                  the integrity events recorded during those sittings, and the marks that flow back
                  into the grade.
                </p>
                <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-[13px] font-medium text-slate-600">
                  {['One roster', 'One authorization model', 'One audit trail', 'One server'].map(
                    (item) => (
                      <span key={item} className="flex items-center gap-2">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-100">
                          <Check className="h-2.5 w-2.5 text-indigo-700" aria-hidden="true" />
                        </span>
                        {item}
                      </span>
                    ),
                  )}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── 02 · Platform ────────────────────────────────────────────── */}
        <section
          id="platform"
          className="scroll-mt-24 border-y border-slate-200/70 bg-slate-50/70 py-20 sm:py-28"
        >
          <div className={SHELL}>
            <SectionHead
              index="02"
              eyebrow="The platform"
              title="Nine areas, one system of record."
              body="Everything below is shipped and reachable from the sidebar. Pick an area to see what it does and who it is for — the screenshots are the product, not an illustration of it."
            />
            <ModuleExplorer />

            <details className="group mt-10 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-xs">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                <span>
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Everything that ships
                  </span>
                  <span className="mt-0.5 block text-[13.5px] font-semibold text-slate-900">
                    The full capability ledger — {CAPABILITIES.length} working parts, no tiers
                  </span>
                </span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-transform duration-300 group-open:rotate-45">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </summary>
              <div className="grid border-t border-slate-100 lg:grid-cols-3">
                {[0, 1, 2].map((column) => (
                  <ul
                    key={column}
                    className="divide-y divide-slate-100 border-b border-slate-100 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0"
                  >
                    {CAPABILITIES.filter((_, index) => index % 3 === column).map((capability) => (
                      <li
                        key={capability}
                        className="flex items-start gap-2.5 px-5 py-3 text-[12.5px] leading-relaxed text-slate-600"
                      >
                        <Check
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500"
                          aria-hidden="true"
                        />
                        {capability}
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
              <p className="border-t border-slate-100 px-5 py-3 text-[12.5px] text-slate-500">
                What is not in it matters too — see{' '}
                <a
                  className="font-medium text-indigo-700 underline decoration-indigo-200 underline-offset-2 transition-colors hover:decoration-indigo-500"
                  href="#proof"
                >
                  the limits
                </a>
                .
              </p>
            </details>
          </div>
        </section>

        {/* ── 03 · A look inside ───────────────────────────────────────── */}
        <Screens />

        {/* ── 04 · Workflow ────────────────────────────────────────────── */}
        <section
          id="workflow"
          className="scroll-mt-24 border-y border-slate-200/70 bg-slate-50/70 py-20 sm:py-28"
        >
          <div className={SHELL}>
            <SectionHead
              index="04"
              eyebrow="How it works"
              title="Four tracks, from an empty database to a released mark."
              body="Set up once, teach in your own scope, sit one paper under monitoring, release a mark with its evidence. Each track below is the real operating sequence for that role, not a marketing order."
            />

            <Reveal delay={70}>
              <div className="mt-8 max-w-3xl rounded-2xl border border-slate-200 bg-white/80 p-5 sm:p-6">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
                  In one paragraph
                </p>
                <p className="mt-2.5 text-[14px] leading-relaxed text-slate-600">
                  A college sets its own structure once — departments, terms, courses, sections — and
                  every roster, material, paper, mark and integrity signal hangs off the section it
                  belongs to. One authorization kernel decides who may see which of those records, so a
                  lecturer sees their sections, a department head their department, the examination
                  bureau every paper but never the gradebook. Because nothing is copied between modules,
                  a released mark can always be traced back to the paper that produced it and the
                  signals recorded while it was sat.
                </p>
              </div>
            </Reveal>

            <Walkthrough />
          </div>
        </section>

        {/* ── 05 · Examination journey ─────────────────────────────────── */}
        <section
          id="journey"
          className="relative scroll-mt-24 bg-slate-950 py-20 text-slate-100 sm:py-28"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(820px 420px at 8% -10%, rgba(99,102,241,0.22), transparent 64%), radial-gradient(620px 360px at 92% 108%, rgba(14,165,233,0.12), transparent 62%)',
            }}
          />
          <div aria-hidden className="cf-blueprint-dark pointer-events-none absolute inset-0" />

          <div className={`${SHELL} relative`}>
            <SectionHead
              index="05"
              eyebrow="The examination, stage by stage"
              title="A paper is a chain of custody, not a form."
              body="Each stage leaves something the next one can rely on: an approved question, a paper with marks, a window the server enforces, an attempt with a timeline, a grade with a rubric, and a release that is written down."
              tone="dark"
            />
            <Journey />
          </div>

          <div className={`${SHELL} relative`}>
            <Reveal delay={100}>
              <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-[12.5px] leading-relaxed text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Timing is server-authoritative and every attempt is autosaved — a closed tab is
                  reconciled, not lost.
                </span>
                <a
                  href="#integrity"
                  className="group inline-flex shrink-0 items-center gap-1 font-semibold text-indigo-300 transition-colors hover:text-indigo-200"
                >
                  How the integrity trail works
                  <ArrowRight className="cf-arrow-slide h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── 06 · Roles ───────────────────────────────────────────────── */}
        <section
          id="roles"
          className="scroll-mt-24 border-y border-slate-200/70 bg-slate-50/70 py-20 sm:py-28"
        >
          <div className={SHELL}>
            <SectionHead
              index="06"
              eyebrow="Who it is for"
              title="Five people, six roles, a boundary the server enforces."
              body="Each role is a permission set and a data scope. The “cannot” column is the part that matters: in an examination platform, the negative space is the security model."
            />
            <Roles />
            <p className="mt-6 text-[13px] leading-relaxed text-slate-500">
              The exam bureau’s reach is opt-in at each call site and never extends to the gradebook. A
              candidate and a member of staff are served by different response models, so no interface
              mistake can turn an answer key into a candidate payload.
            </p>
          </div>
        </section>

        {/* ── 07 · Integrity & security ────────────────────────────────── */}
        <Integrity />

        {/* ── 08 · Run it ──────────────────────────────────────────────── */}
        <Run />

        {/* ── 09 · Proof & limits ──────────────────────────────────────── */}
        <Proof />

        {/* ── 10 · Questions ───────────────────────────────────────────── */}
        <Faq />

        {/* ── Close ────────────────────────────────────────────────────── */}
        <Closing />
      </main>

      <ChapterRail />
      <Footer />
    </div>
  );
}
