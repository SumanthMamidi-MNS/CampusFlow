/**
 * Verification harness for `fullscreen.ts`.
 *
 * The reported failure was a "Return to full screen" gate shown to a candidate
 * whose display was already full-screen through F11. The Fullscreen API is
 * blind to that mode, so the module also measures the viewport. These checks
 * pin the difference between F11, a maximised window and an ordinary window.
 *
 * Run from `frontend/`: `node scripts/check-fullscreen.ts`.
 */
import { canRequestFullscreen, readFullscreenState } from '../src/features/exams/fullscreen.ts';

let checks = 0;
let failures = 0;

function check(label: string, ok: boolean): void {
  checks += 1;
  if (ok) return;
  failures += 1;
  console.log(`  FAIL  ${label}`);
}

function state(options: {
  api?: boolean;
  fullscreenElement?: boolean;
  width?: number;
  height?: number;
  screenWidth?: number;
  screenHeight?: number;
  displayMode?: boolean;
  enabled?: boolean;
}) {
  const api = options.api ?? false;
  (globalThis as any).document = {
    fullscreenElement: api && (options.fullscreenElement ?? true) ? {} : null,
    documentElement: { requestFullscreen: () => Promise.resolve() },
    fullscreenEnabled: options.enabled ?? true,
  };
  (globalThis as any).window = {
    screen: {
      width: options.screenWidth ?? 1920,
      height: options.screenHeight ?? 1080,
    },
    innerWidth: options.width ?? 1280,
    innerHeight: options.height ?? 720,
    matchMedia: () => ({ matches: options.displayMode ?? false }),
  };
  return readFullscreenState();
}

console.log('\nfullscreen detection');
{
  const f11 = state({ width: 1920, height: 1080 });
  check('F11 mode (viewport fills the display) is full-screen', f11.active && f11.browser && !f11.api);

  const api = state({ api: true, width: 1920, height: 1080, fullscreenElement: true });
  check('the Fullscreen API is full-screen and distinguished from F11', api.active && api.api && !api.browser);

  const maximised = state({ width: 1920, height: 980 });
  check('a maximised window with browser chrome is not full-screen', !maximised.active);

  const windowed = state({ width: 1280, height: 720 });
  check('an ordinary window is not full-screen', !windowed.active);

  const biggerDisplay = state({ width: 1920, height: 1080, screenWidth: 2560, screenHeight: 1440 });
  check('filling a smaller window is not filling a larger display', !biggerDisplay.active);

  const scrollbar = state({ width: 1905, height: 1064 });
  check('a scrollbar or rounded edge still counts as full-screen', scrollbar.active);

  const pwa = state({ displayMode: true });
  check('the installed full-screen display mode counts', pwa.active && pwa.browser);

  const apiElementMismatch = state({ api: false, fullscreenElement: false, width: 1920, height: 1080 });
  check('no API element does not cancel a filling viewport', apiElementMismatch.active);

  // A page that cannot enter the API (an iframe without allow="fullscreen",
  // Permissions-Policy) must not be walled behind a gate that can never clear.
  check('the API is supported when the browser enables it', canRequestFullscreen());
  state({ enabled: false });
  check('a disabled Fullscreen API is reported as unsupported', !canRequestFullscreen());
  (globalThis as any).document.documentElement = {};
  check('a missing requestFullscreen is unsupported', !canRequestFullscreen());
}

console.log(
  `\n${checks - failures}/${checks} checks passed` + (failures ? ` — ${failures} FAILED` : '')
);
if (failures > 0) process.exit(1);
