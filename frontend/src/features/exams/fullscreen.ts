/**
 * Whether the assessment surface is actually occupying the display.
 *
 * There are two ways a browser can be full-screen, and only one of them is
 * visible to the Fullscreen API:
 *
 *   - `requestFullscreen()` sets `document.fullscreenElement` and hides the
 *     browser chrome under the page's control.
 *   - The user presses F11 (or Control + Command + F) and the browser enters its
 *     own full-screen mode. `document.fullscreenElement` stays null, so a page
 *     that checks only the API tells a candidate who is visibly full-screen to
 *     "return to full screen" — the exact false alarm this module removes.
 *
 * The viewport test below treats a page that fills the display as full-screen
 * regardless of which route got it there. The edge tolerance absorbs the few
 * pixels a scrollbar or a browser's rounded reported size can take; a maximised
 * window still has a title bar, tab strip and toolbar, so it is nowhere near the
 * tolerance and is not mistaken for full-screen.
 */
export interface FullscreenState {
  /** The candidate is full-screen by either route. */
  active: boolean;
  /** The Fullscreen API is in control (`document.fullscreenElement` is set). */
  api: boolean;
  /** The browser's own full-screen mode (F11) is filling the display. */
  browser: boolean;
}

/** Pixels an edge may be short of the reported display size. */
const EDGE_TOLERANCE_PX = 16;

/**
 * Whether this document can actually enter Fullscreen API mode.
 *
 * `requestFullscreen` exists even where it is guaranteed to reject — an iframe
 * without `allow="fullscreen"`, or a page whose Permissions-Policy blocks the
 * API. `document.fullscreenEnabled` is the browser's own answer to that
 * question. A gate that demands an impossible transition would strand the
 * candidate, so the blocking gate is used only where the transition can work;
 * everywhere else the page instructs the keyboard route instead.
 */
export function canRequestFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    Boolean(document.documentElement?.requestFullscreen) &&
    (document as Document & { fullscreenEnabled?: boolean }).fullscreenEnabled !== false
  );
}

export function readFullscreenState(): FullscreenState {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { active: false, api: false, browser: false };
  }

  const api = Boolean(document.fullscreenElement);
  const standalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: fullscreen)').matches;

  const screenWidth = window.screen?.width ?? 0;
  const screenHeight = window.screen?.height ?? 0;
  const fillsDisplay =
    screenWidth > 0 &&
    screenHeight > 0 &&
    window.innerWidth >= screenWidth - EDGE_TOLERANCE_PX &&
    window.innerHeight >= screenHeight - EDGE_TOLERANCE_PX;

  const browser = !api && (standalone || fillsDisplay);
  return { active: api || browser, api, browser };
}
