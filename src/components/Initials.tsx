// Pastille d'initiales d'une personne. Chaque nom garde toujours la même couleur, prise dans la DA
// (vert, orange, gris foncé, et leurs teintes claires) : on reconnaît chacun d'un coup d'œil.
const PALETTE: [string, string][] = [
  ['#007500', '#ffffff'], // vert
  ['#f24822', '#ffffff'], // orange
  ['#323232', '#ffffff'], // gris foncé
  ['#d3e8d3', '#005c00'], // vert clair
  ['#fde0d8', '#b8321a'], // orange clair
  ['#c2c1c1', '#323232'], // gris
]

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'

function hash(s: string) {
  let h = 0
  for (const ch of s.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

/** Couleurs d'une personne (null : anonyme ou pas encore de nom). */
export function avatarColors(name: string | null | undefined) {
  if (!name || !name.trim() || name.trim().toLowerCase() === 'anonyme' || name === '?') return null
  const [background, color] = PALETTE[hash(name) % PALETTE.length]
  return { background, color }
}

export function Initials({ name, className = '' }: { name: string | null | undefined; className?: string }) {
  const colors = avatarColors(name)
  return (
    <span className={`ds-initials${colors ? '' : ' is-anonymous'} ${className}`} style={colors ?? undefined} aria-hidden>
      {colors ? initialsOf(name!) : '?'}
    </span>
  )
}
