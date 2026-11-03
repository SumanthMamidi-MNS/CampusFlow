"""Build the README's capsule badges.

Run from the repository root:

    python docs/assets/badges/build_badges.py

Geometry is not guessed. Every label and value was measured in Chrome with the
exact family, size, weight and letter-spacing the SVG declares, and the advances
live in `LABEL_ADVANCE` / `VALUE_ADVANCE` below. A capsule is then laid out the
way the reference set is: gem at 16, label at 28, an 8 px gap to the divider,
8 px to the value, 13 px of right padding. No empty space is left inside a pill,
and a longer label widens the capsule instead of crowding the divider.

Each badge is a dark obsidian capsule: a pulsing accent gem, the label, a
hairline divider and the value in mono. The perimeter flashes in the badge's own
accent and a specular sheen travels down the capsule once every 3.6 s, staggered
per badge so a row does not bloom in lockstep. `live-deployment.svg` is the wide
royal-indigo action capsule above the row, matching the reference at 276 × 48.

GitHub serves README images through <img>, which does not run CSS or SMIL
animation; the capsules are therefore designed to read correctly as a still
frame, and the motion is a bonus wherever an SVG is opened directly.
"""

from __future__ import annotations

from pathlib import Path

HERE = Path(__file__).resolve().parent

# label, value, accent. The README lays them out 4 · 5 · 4.
BADGES: list[tuple[str, str, str]] = [
    # Core stack
    ("Python", "3.12", "#38BDF8"),
    ("FastAPI", "REST + WS", "#34D399"),
    ("React", "19", "#22D3EE"),
    ("TypeScript", "6", "#3178C6"),
    # Data, interface, and the runtime it ships in
    ("PostgreSQL", "15", "#818CF8"),
    ("Tailwind", "v4", "#38BDF8"),
    ("Docker", "Compose", "#60A5FA"),
    ("Caddy", "TLS", "#22C55E"),
    ("Piston", "Isolate", "#FBBF24"),
    # What the platform promises
    ("Authorization", "scoped", "#A78BFA"),
    ("GitHub Actions", "CI", "#7DD3FC"),
    ("Tests", "105 passing", "#22C55E"),
    ("License", "MIT", "#F472B6"),
]

# Text advances measured in Chrome (Segoe UI / system sans at 700 12px, and
# JetBrains Mono / Consolas at 700 10.8px), before letter-spacing. Regenerate
# them with `document.createElement("canvas").getContext("2d").measureText` in a
# browser if a label or value changes; do not eyeball a width.
LABEL_ADVANCE: dict[str, float] = {
    "Python": 40.34,
    "FastAPI": 41.90,
    "React": 30.91,
    "TypeScript": 59.71,
    "PostgreSQL": 64.86,
    "Tailwind": 46.96,
    "Docker": 39.75,
    "Caddy": 35.26,
    "Piston": 35.28,
    "Authorization": 78.04,
    "GitHub Actions": 85.97,
    "Tests": 27.67,
    "License": 40.83,
}

VALUE_ADVANCE: dict[str, float] = {
    "3.12": 23.75,
    "REST + WS": 53.44,
    "19": 11.88,
    "6": 5.94,
    "15": 11.88,
    "v4": 11.88,
    "Compose": 41.57,
    "TLS": 17.81,
    "Isolate": 41.57,
    "scoped": 35.63,
    "CI": 11.88,
    "105 passing": 65.32,
    "MIT": 17.81,
}

LIVE_LABEL = "Open Live Deployment"

LABEL_X = 28.0
LABEL_SPACING = 0.2
VALUE_SPACING = 0.25
DIVIDER_GAP = 8.0
VALUE_GAP = 8.0
RIGHT_PAD = 13.0


def _slug(label: str) -> str:
    return label.lower().replace(" ", "-")


def _begin(ident: str) -> float:
    """Stagger the flash and the sheen so a row does not pulse in unison."""
    return round(sum(ord(c) for c in ident) % 36 / 10.0, 1)


def build(label: str, value: str, accent: str) -> str:
    ident = _slug(label)
    label_adv = LABEL_ADVANCE[label] + LABEL_SPACING * (len(label) - 1)
    divider_x = round(LABEL_X + label_adv + DIVIDER_GAP, 1)
    value_x = round(divider_x + VALUE_GAP, 1)
    value_adv = VALUE_ADVANCE[value] + VALUE_SPACING * (len(value) - 1)
    width = round(value_x + value_adv + RIGHT_PAD, 1)
    inner = width - 1.5
    begin = _begin(ident)

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width:g}" height="31" viewBox="0 0 {width:g} 31" fill="none" role="img" aria-label="{label} {value}">
  <title>{label}: {value}</title>
  <defs>
    <linearGradient id="bg_{ident}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#161D29" stop-opacity="0.98"/>
      <stop offset="100%" stop-color="#0A0E16" stop-opacity="0.99"/>
    </linearGradient>
    <linearGradient id="sheen_{ident}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="30%" stop-color="#FFFFFF" stop-opacity="0.08"/>
      <stop offset="50%" stop-color="#FFFFFF" stop-opacity="0.45"/>
      <stop offset="70%" stop-color="#FFFFFF" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="clip_{ident}">
      <rect x="0.75" y="0.75" width="{inner:g}" height="29.5" rx="14.75"/>
    </clipPath>
  </defs>

  <rect x="0.75" y="0.75" width="{inner:g}" height="29.5" rx="14.75" fill="url(#bg_{ident})"/>
  <rect x="0.75" y="0.75" width="{inner:g}" height="29.5" rx="14.75" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.2">
    <animate attributeName="stroke" values="rgba(255,255,255,0.18);{accent};rgba(255,255,255,0.18)" dur="3.6s" begin="{begin}s" repeatCount="indefinite"/>
    <animate attributeName="stroke-width" values="1.1;1.7;1.1" dur="3.6s" begin="{begin}s" repeatCount="indefinite"/>
  </rect>
  <path d="M 14 1.5 L {width - 14:g} 1.5" stroke="rgba(255,255,255,0.35)" stroke-width="0.9" stroke-linecap="round"/>

  <g clip-path="url(#clip_{ident})">
    <g transform="rotate(14)">
      <rect x="-30" y="-40" width="{width + 50:g}" height="18" fill="url(#sheen_{ident})" opacity="0">
        <animateTransform attributeName="transform" type="translate" additive="sum"
          values="0 -30; 0 71; 0 71; 0 -30" keyTimes="0; 0.45; 0.50; 1"
          dur="3.6s" begin="{begin}s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0; 0.85; 0.85; 0; 0" keyTimes="0; 0.10; 0.40; 0.46; 1"
          dur="3.6s" begin="{begin}s" repeatCount="indefinite"/>
      </rect>
    </g>
  </g>

  <circle cx="16" cy="15.5" r="3.8" fill="none" stroke="{accent}">
    <animate attributeName="r" values="3.8;8.5;12" dur="2.4s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.85;0.25;0" dur="2.4s" repeatCount="indefinite"/>
    <animate attributeName="stroke-width" values="1.5;0.9;0.2" dur="2.4s" repeatCount="indefinite"/>
  </circle>
  <circle cx="16" cy="15.5" r="3.4" fill="{accent}">
    <animate attributeName="r" values="3.4;4.4;3.4" dur="2.4s" repeatCount="indefinite"/>
  </circle>
  <circle cx="16" cy="15.5" r="1.4" fill="#FFFFFF" opacity="0.95"/>

  <text x="{LABEL_X:g}" y="19.8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Plus Jakarta Sans', sans-serif" font-size="12" font-weight="700" fill="#F8FAFC" letter-spacing="{LABEL_SPACING}px">{label}</text>
  <line x1="{divider_x:g}" y1="9" x2="{divider_x:g}" y2="22" stroke="rgba(255,255,255,0.22)" stroke-width="1.0"/>
  <text x="{value_x:g}" y="19.5" font-family="'JetBrains Mono', Consolas, Monaco, monospace" font-size="10.8" font-weight="700" fill="#94A3B8" letter-spacing="{VALUE_SPACING}px">{value}
    <animate attributeName="fill" values="#94A3B8;{accent};#94A3B8" dur="3.6s" begin="{begin}s" repeatCount="indefinite"/>
  </text>
</svg>
"""


def build_live() -> str:
    """The public landing page, as the wide royal-indigo action capsule.

    Matches the reference capsule exactly: 276 × 48, midnight-indigo body, an
    indigo border that breathes, a beating indicator, the label at 46 and the
    arrow at 238 that nudges right. Only the target differs.
    """
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="276" height="48" viewBox="0 0 276 48" fill="none" role="img" aria-label="{LIVE_LABEL}">
  <title>{LIVE_LABEL}</title>
  <defs>
    <linearGradient id="bg_live_large" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#231E56" stop-opacity="0.98"/>
      <stop offset="100%" stop-color="#0E1226" stop-opacity="0.99"/>
    </linearGradient>
    <linearGradient id="sheen_live_large" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="30%" stop-color="#FFFFFF" stop-opacity="0.10"/>
      <stop offset="50%" stop-color="#FFFFFF" stop-opacity="0.55"/>
      <stop offset="70%" stop-color="#FFFFFF" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="clip_live_large">
      <rect x="0.75" y="0.75" width="274.5" height="46.5" rx="23.25"/>
    </clipPath>
  </defs>

  <rect x="0.75" y="0.75" width="274.5" height="46.5" rx="23.25" fill="url(#bg_live_large)"/>
  <rect x="0.75" y="0.75" width="274.5" height="46.5" rx="23.25" fill="none" stroke="#6366F1" stroke-width="1.6">
    <animate attributeName="stroke" values="#6366F1;#A5B4FC;#6366F1" dur="3.6s" begin="0.0s" repeatCount="indefinite"/>
    <animate attributeName="stroke-width" values="1.4;2.2;1.4" dur="3.6s" begin="0.0s" repeatCount="indefinite"/>
  </rect>
  <path d="M 28 2 L 248 2" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>

  <g clip-path="url(#clip_live_large)">
    <g transform="rotate(14)">
      <rect x="-30" y="-55" width="356" height="26" fill="url(#sheen_live_large)" opacity="0">
        <animateTransform attributeName="transform" type="translate" additive="sum"
          values="0 -45; 0 103; 0 103; 0 -45" keyTimes="0; 0.45; 0.50; 1"
          dur="3.6s" begin="0.0s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0; 0.9; 0.9; 0; 0" keyTimes="0; 0.10; 0.40; 0.46; 1"
          dur="3.6s" begin="0.0s" repeatCount="indefinite"/>
      </rect>
    </g>
  </g>

  <circle cx="26" cy="24" r="5" fill="none" stroke="#818CF8">
    <animate attributeName="r" values="5;11;16" dur="2.2s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.9;0.25;0" dur="2.2s" repeatCount="indefinite"/>
    <animate attributeName="stroke-width" values="1.8;1.0;0.2" dur="2.2s" repeatCount="indefinite"/>
  </circle>
  <circle cx="26" cy="24" r="4.5" fill="#818CF8">
    <animate attributeName="r" values="4.5;5.5;4.5" dur="2.2s" repeatCount="indefinite"/>
  </circle>
  <circle cx="26" cy="24" r="2" fill="#FFFFFF" opacity="0.95"/>

  <text x="46" y="29.5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Plus Jakarta Sans', sans-serif" font-size="15" font-weight="800" fill="#FFFFFF" letter-spacing="0.3px">{LIVE_LABEL}</text>
  <text x="238" y="30" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#C7D2FE">&#8594;
    <animate attributeName="x" values="238;242;238" dur="1.8s" repeatCount="indefinite"/>
  </text>
</svg>
"""


def main() -> None:
    for label, value, accent in BADGES:
        path = HERE / f"{_slug(label)}.svg"
        path.write_text(build(label, value, accent), encoding="utf-8", newline="\n")
        print(f"wrote {path.name}")
    live = HERE / "live-deployment.svg"
    live.write_text(build_live(), encoding="utf-8", newline="\n")
    print(f"wrote {live.name}")


if __name__ == "__main__":
    main()
