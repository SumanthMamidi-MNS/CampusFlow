import { useId } from 'react';

/**
 * The CampusFlow mark: the indigo tile holding the graduate's cap.
 *
 * One definition for every surface in the app (sidebar, landing page, login,
 * splash screen) so the brand cannot drift between them. The canvas is a full
 * 96x96 and the tile's 3px border is drawn *inside* it, so nothing is clipped at
 * any size — the previous artwork sat at (6,10) with the stroke hanging outside
 * an 84-wide viewBox, which is why it looked cut on the right and bottom.
 *
 * Geometry, all optically centred on the canvas:
 *   tile   x 1.5 → 94.5, radius 23 (outer radius 24.5 with the stroke)
 *   board  62 wide diamond, y 26.5 → 56.5
 *   bowl   tucked under the board's lower edges, floor at y 69.5
 *   tassel dropped from the board's right corner, with a knot
 *
 * `docs/assets/campusflow-mark.svg`, `public/favicon.svg` and the boot screen
 * in `index.html` carry the same artwork as a static file; change them together.
 */
interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  // Gradient ids are global in the document, and this mark appears several times
  // per page (header, closing, footer, sidebar). A per-instance suffix keeps a
  // second copy from re-pointing the first one's fills.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const border = `cf-mark-border-${uid}`;
  const bg = `cf-mark-bg-${uid}`;
  const sheen = `cf-mark-sheen-${uid}`;
  const cap = `cf-mark-cap-${uid}`;
  const clip = `cf-mark-clip-${uid}`;

  return (
    <svg viewBox="0 0 96 96" className={className} fill="none" role="img" aria-label="CampusFlow">
      <defs>
        <linearGradient id={border} x1="6" y1="4" x2="90" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C7D2FE" />
          <stop offset="42%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#3730A3" />
        </linearGradient>
        <linearGradient id={bg} x1="48" y1="3" x2="48" y2="93" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#302E7A" />
          <stop offset="52%" stopColor="#1D1B4E" />
          <stop offset="100%" stopColor="#0F0E2C" />
        </linearGradient>
        <linearGradient id={sheen} x1="48" y1="3" x2="48" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.17" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={cap} x1="22" y1="28" x2="74" y2="66" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#C7D2FE" />
        </linearGradient>
        <clipPath id={clip}>
          <rect x="3" y="3" width="90" height="90" rx="22" />
        </clipPath>
      </defs>

      <rect x="1.5" y="1.5" width="93" height="93" rx="23" fill={`url(#${bg})`} />
      <g clipPath={`url(#${clip})`}>
        <rect x="3" y="3" width="90" height="46" fill={`url(#${sheen})`} />
      </g>
      <rect
        x="1.5"
        y="1.5"
        width="93"
        height="93"
        rx="23"
        stroke={`url(#${border})`}
        strokeWidth="3"
      />

      <g transform="translate(-0.6 3.7)">
        {/* The board, split down the middle so the cap reads as a solid object. */}
        <path d="M48 27 L80 39 L48 51 L16 39 Z" fill={`url(#${cap})`} />
        <path d="M48 27 L80 39 L48 51 Z" fill="#A5B4FC" opacity="0.35" />
        {/* The bowl: top edge follows the board's lower edges, floor curves under. */}
        <path
          d="M33 45.4 V55 C33 59 39.5 61.5 48 61.5 C56.5 61.5 63 59 63 55 V45.4 L48 51 Z"
          fill={`url(#${cap})`}
        />
        <path d="M48 51 L63 45.4 V55 C63 59 56.5 61.5 48 61.5 Z" fill="#A5B4FC" opacity="0.32" />
        {/* Tassel and knot. */}
        <path d="M80 39 V52" stroke="#A5B4FC" strokeWidth="3" strokeLinecap="round" />
        <circle cx="80" cy="55.2" r="2.4" fill="#A5B4FC" />
      </g>
    </svg>
  );
}
