// Logo « IK » : deux ellipses accolées, lettres à empattements, sur fond #dfdfdf (comme sur les captures).
export function Logo({ width = 65 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 26) / 65} viewBox="0 0 65 26" aria-label="IK">
      <rect width="65" height="26" fill="var(--c-surface-button)" />
      <g fill="none" stroke="var(--c-ink-soft)" strokeWidth="1.6">
        <ellipse cx="17" cy="13" rx="15.6" ry="11.6" />
        <ellipse cx="48" cy="13" rx="15.6" ry="11.6" />
      </g>
      <g fill="var(--c-ink-soft)">
        {/* I */}
        <rect x="13" y="8" width="7.5" height="1.7" />
        <rect x="15.9" y="8" width="1.7" height="10" />
        <rect x="13" y="16.3" width="7.5" height="1.7" />
        {/* K */}
        <rect x="45" y="8" width="1.8" height="10" />
        <polygon points="46.6,13.4 51.2,8 53.4,8 48.2,13.9" />
        <polygon points="47.6,12.6 49.1,11.7 53.6,18 51.4,18" />
      </g>
    </svg>
  )
}
