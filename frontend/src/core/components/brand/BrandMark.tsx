/**
 * The CampusFlow mark: the indigo square holding the graduate's cap.
 *
 * One definition for every surface in the app (sidebar, splash screen) so the
 * brand cannot drift between them. The tile, cap and gradient values are the
 * project's original ones — `docs/assets/campusflow-logo.svg` uses the same
 * geometry, so the mark is identical everywhere it appears.
 */
interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="6 10 84 84"
      className={className}
      fill="none"
      role="img"
      aria-label="CampusFlow"
    >
      <defs>
        <linearGradient id="cf-mark-border" x1="6" y1="6" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A5B4FC" />
          <stop offset="50%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#312E81" />
        </linearGradient>
        <linearGradient id="cf-mark-bg" x1="48" y1="6" x2="48" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#111533" />
          <stop offset="100%" stopColor="#0A0C22" />
        </linearGradient>
        <linearGradient id="cf-mark-cap" x1="24" y1="28" x2="72" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E0E7FF" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>
      </defs>

      <rect x="6" y="10" width="84" height="84" rx="20" fill="url(#cf-mark-bg)" stroke="url(#cf-mark-border)" strokeWidth="3" />
      <path d="M48 28 L76 42 L48 56 L20 42 Z" fill="url(#cf-mark-cap)" />
      <path
        d="M32 50 V62 C32 66 40 70 48 70 C56 70 64 66 64 62 V50 L48 58 Z"
        fill="url(#cf-mark-cap)"
        opacity="0.85"
      />
      <path d="M76 42 V58" stroke="#818CF8" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
