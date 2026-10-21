/**
 * The CampusFlow mark: a deep-indigo square holding the graduate's cap.
 *
 * One definition for every surface in the app (sidebar, splash screen) so the
 * brand cannot drift between them. The README lockup in
 * `docs/assets/campusflow-logo.svg` uses the same geometry.
 */
interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="6 6 84 84"
      className={className}
      fill="none"
      role="img"
      aria-label="CampusFlow"
    >
      <defs>
        <linearGradient id="cf-mark-core" x1="48" y1="6" x2="48" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1D2358" />
          <stop offset="58%" stopColor="#161C44" />
          <stop offset="100%" stopColor="#0C1130" />
        </linearGradient>
        <linearGradient id="cf-mark-edge" x1="10" y1="10" x2="86" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C7D2FE" />
          <stop offset="42%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#4338CA" />
        </linearGradient>
        <linearGradient id="cf-mark-plate" x1="26" y1="26" x2="70" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#C7D2FE" />
        </linearGradient>
        <linearGradient id="cf-mark-head" x1="48" y1="46" x2="48" y2="69" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#DDE3FF" />
          <stop offset="100%" stopColor="#98A2F0" />
        </linearGradient>
      </defs>

      <rect x="6" y="6" width="84" height="84" rx="21" fill="url(#cf-mark-core)" />
      <rect x="6" y="6" width="84" height="84" rx="21" fill="none" stroke="url(#cf-mark-edge)" strokeWidth="3.2" />
      <rect x="9.2" y="9.2" width="77.6" height="77.6" rx="18.4" fill="none" stroke="#FFFFFF" strokeOpacity="0.1" />
      <path d="M6 27 A21 21 0 0 1 27 6 H69 A21 21 0 0 1 90 27 V40 H6 Z" fill="#FFFFFF" fillOpacity="0.035" />

      <path d="M48 26.5 L78 39.5 L48 52.5 L18 39.5 Z" fill="#070B22" opacity="0.5" transform="translate(0 3)" />
      <path
        d="M48 26.5 L78 39.5 L48 52.5 L18 39.5 Z"
        fill="url(#cf-mark-plate)"
        stroke="url(#cf-mark-plate)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M34.5 47.5 V59 C34.5 63.7 40.5 67.3 48 67.3 C55.5 67.3 61.5 63.7 61.5 59 V47.5 L48 53.6 Z"
        fill="url(#cf-mark-head)"
      />

      <path d="M78 39.5 C78.6 47.4 75.2 53.6 72.9 58.6" stroke="#A5B4FC" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="71.9" cy="62.6" r="3.4" fill="#E0E7FF" />
    </svg>
  );
}
