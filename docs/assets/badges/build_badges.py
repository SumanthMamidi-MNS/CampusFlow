"""Build the README's capsule badges.

Run from the repository root:

    python docs/assets/badges/build_badges.py

Why a generator: nine hand-tuned files drifted in width, padding and animation
timing, and `tests.svg` still read "101 Passing" long after the suite had grown.
The badge content lives in `BADGES` below, so the figures in the README are
changed in one place and every capsule is rebuilt from the same geometry.

Each badge is a dark obsidian capsule: a pulsing accent gem, the label, a
hairline divider and the value in mono. The perimeter flashes in the badge's own
accent and a specular sheen travels down the capsule once every 3.6 s. The
gestures are staggered per badge so a row does not bloom in lockstep.

GitHub serves README images through <img>, which does not run script or CSS
animation; the capsules are therefore designed to read correctly as a still
frame, and the motion is a bonus wherever an SVG is opened directly. Nothing in
the badge is load-bearing for comprehension.
"""

from __future__ import annotations

from pathlib import Path

HERE = Path(__file__).resolve().parent

# label, value, accent, link target (the href lives in README.md; kept here so a
# reader of this file can see where each capsule is meant to point).
BADGES: list[tuple[str, str, str]] = [
    ("Python", "3.12", "#38BDF8"),
    ("FastAPI", "REST + WS", "#34D399"),
    ("React", "19", "#22D3EE"),
    ("PostgreSQL", "15", "#818CF8"),
    ("Docker", "Compose", "#60A5FA"),
    ("Authorization", "offering scope", "#A78BFA"),
    ("Sandbox", "Piston isolate", "#FBBF24"),
    ("Tests", "105 passing", "#22C55E"),
    ("License", "MIT", "#F472B6"),
]

LABEL_TEXT_X = 28.0
LABEL_CHAR_W = 6.62  # bold 12px system sans, averaged over the labels above
VALUE_CHAR_W = 6.34  # bold 10.5px mono, averaged over the values above
LABEL_PAD = 8.0  # slack so no glyph touches the divider
DIVIDER_GAP = 10.0
VALUE_GAP = 10.0
RIGHT_PAD = 16.0


def _slug(label: str) -> str:
    return label.lower().replace(" ", "-")


def build(label: str, value: str, accent: str) -> str:
    ident = _slug(label)
    label_w = LABEL_CHAR_W * len(label) + LABEL_PAD
    divider_x = round(LABEL_TEXT_X + label_w + DIVIDER_GAP, 1)
    value_x = round(divider_x + VALUE_GAP, 1)
    value_w = VALUE_CHAR_W * len(value) + LABEL_PAD
    width = round(value_x + value_w + RIGHT_PAD, 1)
    inner = width - 1.5
    # The perimeter flash and the sheen start at different moments per badge;
    # the phase is derived from the label so it is stable across rebuilds.
    begin = round(sum(ord(c) for c in ident) % 36 / 10.0, 1)

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width:g}" height="31" viewBox="0 0 {width:g} 31" fill="none" role="img" aria-label="{label} {value}">
  <title>{label}: {value}</title>
  <defs>
    <linearGradient id="bg_{ident}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#161D29" stop-opacity="0.98"/>
      <stop offset="100%" stop-color="#0A0E16" stop-opacity="0.99"/>
    </linearGradient>
    <linearGradient id="sheen_{ident}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="30%" stop-color="#FFFFFF" stop-opacity="0.06"/>
      <stop offset="50%" stop-color="{accent}" stop-opacity="0.30"/>
      <stop offset="70%" stop-color="#FFFFFF" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow_{ident}" x="-60%" y="-160%" width="220%" height="420%">
      <feGaussianBlur stdDeviation="2.6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <clipPath id="clip_{ident}">
      <rect x="0.75" y="0.75" width="{inner:g}" height="29.5" rx="14.75"/>
    </clipPath>
    <style>
      @keyframes gem_pulse_{ident} {{
        0%, 100% {{ transform: scale(0.92); transform-origin: 16px 15.5px; }}
        50% {{ transform: scale(1.16); transform-origin: 16px 15.5px; }}
      }}
      .gem-{ident} {{ animation: gem_pulse_{ident} 2.4s ease-in-out infinite; }}
      @media (prefers-reduced-motion: reduce) {{ .gem-{ident} {{ animation: none; }} }}
    </style>
  </defs>

  <rect x="0.75" y="0.75" width="{inner:g}" height="29.5" rx="14.75" fill="url(#bg_{ident})"/>
  <rect x="0.75" y="0.75" width="{inner:g}" height="29.5" rx="14.75" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="1.2">
    <animate attributeName="stroke" values="#FFFFFF;{accent};#FFFFFF" dur="3.6s" begin="{begin}s" repeatCount="indefinite"/>
    <animate attributeName="stroke-opacity" values="0.18;0.85;0.18" dur="3.6s" begin="{begin}s" repeatCount="indefinite"/>
  </rect>
  <path d="M 14 1.5 L {width - 14:g} 1.5" stroke="#FFFFFF" stroke-opacity="0.32" stroke-width="0.9" stroke-linecap="round"/>

  <g clip-path="url(#clip_{ident})">
    <g transform="rotate(14)">
      <rect x="-30" y="-40" width="{width + 50:g}" height="18" fill="url(#sheen_{ident})" opacity="0">
        <animateTransform attributeName="transform" type="translate" additive="sum"
          values="0 -30; 0 71; 0 71; 0 -30" keyTimes="0; 0.45; 0.50; 1"
          dur="3.6s" begin="{begin}s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0; 0.8; 0.8; 0; 0" keyTimes="0; 0.10; 0.40; 0.46; 1"
          dur="3.6s" begin="{begin}s" repeatCount="indefinite"/>
      </rect>
    </g>
  </g>

  <circle cx="16" cy="15.5" r="3.8" fill="none" stroke="{accent}">
    <animate attributeName="r" values="3.8;8.5;12" dur="2.4s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.85;0.25;0" dur="2.4s" repeatCount="indefinite"/>
    <animate attributeName="stroke-width" values="1.5;0.9;0.2" dur="2.4s" repeatCount="indefinite"/>
  </circle>
  <g filter="url(#glow_{ident})">
    <circle class="gem-{ident}" cx="16" cy="15.5" r="3.7" fill="{accent}"/>
  </g>
  <circle cx="16" cy="15.5" r="1.3" fill="#FFFFFF" opacity="0.92"/>

  <text x="{LABEL_TEXT_X:g}" y="19.9" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Plus Jakarta Sans', sans-serif" font-size="12" font-weight="700" fill="#F8FAFC" letter-spacing="0.2">{label}</text>
  <line x1="{divider_x:g}" y1="9" x2="{divider_x:g}" y2="22" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="1"/>
  <text x="{value_x:g}" y="19.6" font-family="'JetBrains Mono', Consolas, Monaco, monospace" font-size="10.5" font-weight="700" fill="#94A3B8" letter-spacing="0.25">{value}
    <animate attributeName="fill" values="#94A3B8;{accent};#94A3B8" dur="3.6s" begin="{begin}s" repeatCount="indefinite"/>
  </text>
</svg>
"""


def main() -> None:
    for label, value, accent in BADGES:
        path = HERE / f"{_slug(label)}.svg"
        path.write_text(build(label, value, accent), encoding="utf-8", newline="\n")
        print(f"wrote {path.name}")


if __name__ == "__main__":
    main()
