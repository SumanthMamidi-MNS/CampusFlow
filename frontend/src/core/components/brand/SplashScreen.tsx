import { BrandMark } from './BrandMark';

/**
 * The loading page.
 *
 * It is deliberately a product surface rather than a spinner: a session check
 * can take a moment on a cold API, and the wait is the only chance to tell the
 * user what they are signing in to. The copy is the product in one line, the
 * four audiences it serves, and an indeterminate bar that never claims progress
 * it does not have.
 *
 * `index.html` ships an identical static version so the first paint is branded
 * before this bundle parses; keep the two in step.
 */
export function SplashScreen() {
  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-50 px-6"
      role="status"
      aria-live="polite"
      aria-label="Loading CampusFlow"
    >
      {/* Institutional light, not a gradient wash */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-200/35 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>

      <div className="relative flex flex-col items-center text-center">
        <div className="relative cf-rise">
          <div className="absolute inset-0 -z-10 rounded-[28px] bg-indigo-500/25 blur-2xl" />
          <BrandMark className="cf-mark h-[78px] w-[78px] drop-shadow-[0_14px_28px_rgba(23,20,64,0.28)]" />
        </div>

        <h1 className="cf-rise cf-delay-1 mt-7 text-[27px] font-semibold tracking-[-0.02em] text-slate-900">
          Campus<span className="text-indigo-700">Flow</span>
        </h1>
        <p className="cf-rise cf-delay-2 mt-2 text-[13px] font-medium text-slate-500">
          College LMS &amp; secure examination platform
        </p>

        <p className="cf-rise cf-delay-3 mt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Campus leads &middot; Faculty &middot; Exam controllers &middot; Students
        </p>

        <div className="cf-rise cf-delay-4 mt-10 h-[3px] w-60 overflow-hidden rounded-full bg-slate-200">
          <div className="cf-sweep h-full w-1/3 rounded-full bg-gradient-to-r from-indigo-400 via-indigo-600 to-indigo-400" />
        </div>
        <span className="cf-rise cf-delay-4 mt-3 text-[11px] font-medium tracking-wide text-slate-400">
          Preparing your workspace&hellip;
        </span>
      </div>

      <p className="absolute bottom-7 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400/80">
        Single-institution deployment &middot; no public sign-up
      </p>
    </div>
  );
}
