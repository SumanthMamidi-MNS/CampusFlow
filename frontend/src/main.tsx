import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * The boot screen is a deliberate part of the product, not just a placeholder
 * for a pending paint: it names the platform, who it serves, and what the wait
 * is for. It therefore stays up for a minimum of *visible* time — enough to be
 * read, short enough not to be waited through — so the screen is never a 120 ms
 * flash between two paints either.
 *
 * Two conditions, whichever finishes last, release it:
 *   1. React has actually painted inside #root. A slow bundle must never leave
 *      a blank page behind a fading overlay.
 *   2. The hold below has elapsed since the splash first reached the screen.
 *      That moment is the First Contentful Paint entry — the inline markup is
 *      the first content — so the hold is time the user spent seeing the
 *      splash, not time since navigation start, part of which may have been a
 *      blank tab waiting for the bundle. When the browser does not expose the
 *      entry, the module start is the fallback; the splash was already on
 *      screen by then, so the guarantee still holds.
 *
 * `index.html` paints an identical screen, and React's own `SplashScreen` is
 * the same design, so whichever layer the user is looking at during the
 * handover, the pixels do not change.
 */
// Long enough to read the mark, the name and the line of copy once; short
// enough that a returning visitor is not kept waiting for a screen that has
// nothing left to tell them. 1.8 s from the first paint, with the handover
// below adding its own 0.42 s fade.
const BOOT_MIN_VISIBLE_MS = 1_800;
const BOOT_PAINT_POLL_MS = 100;

/** Must match `#boot`'s opacity transition in index.html, plus a frame of slack. */
const BOOT_EXIT_MS = 520;

function firstContentfulPaint(): number | null {
  if (typeof performance === 'undefined') return null;
  const entries = performance.getEntriesByType?.('paint') ?? [];
  const entry = entries.find((candidate) => candidate.name === 'first-contentful-paint');
  return entry ? entry.startTime : null;
}

/** The clock the hold is measured against: when the splash became visible. */
const BOOT_VISIBLE_SINCE =
  firstContentfulPaint() ?? (typeof performance !== 'undefined' ? performance.now() : 0);

function remainingHoldMs(): number {
  if (typeof performance === 'undefined' || typeof performance.now !== 'function') return 0;
  // Re-read the paint entry here, not only at module load: the browser may not
  // have recorded it yet when this module runs, and the hold must be measured
  // from the paint whenever the browser exposes it.
  const visibleSince = firstContentfulPaint() ?? BOOT_VISIBLE_SINCE;
  return Math.max(0, BOOT_MIN_VISIBLE_MS - (performance.now() - visibleSince));
}

/**
 * Hand the page over.
 *
 * The exit lives in CSS (`#boot.is-leaving`), not in an inline style, so the
 * splash and its contents leave together: the overlay fades while the mark and
 * the copy lift a few pixels and settle back, which reads as one surface being
 * taken away rather than a rectangle switching off. The landing page has been
 * painted underneath for the whole hold, so what the fade reveals is already
 * settled — no second entrance animation behind a dissolving curtain.
 */
function dismissBoot(boot: HTMLElement) {
  boot.classList.add('is-leaving');
  boot.style.pointerEvents = 'none';
  const remove = () => boot.remove();
  boot.addEventListener('transitionend', (event) => {
    if (event.target === boot) remove();
  });
  // transitionend does not fire when the element is already hidden (a tab in
  // the background never animates, and reduced motion may shorten it to
  // nothing), so removal is also guaranteed by a timer.
  window.setTimeout(remove, BOOT_EXIT_MS + 400);
}

function releaseBootScreen() {
  const boot = document.getElementById('boot');
  if (!boot) return;

  const waitForPaint = window.setInterval(() => {
    const painted = (document.getElementById('root')?.childElementCount ?? 0) > 0;
    if (!painted) return;
    window.clearInterval(waitForPaint);

    window.setTimeout(() => dismissBoot(boot), remainingHoldMs());
  }, BOOT_PAINT_POLL_MS);
}

// Double rAF: the first frame schedules, the second fires once the browser is
// about to present — so the poll below never measures the pre-paint window.
requestAnimationFrame(() => requestAnimationFrame(releaseBootScreen));
