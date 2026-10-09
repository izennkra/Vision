// Icônes : Phosphor (graisse « regular »), identifiées sur les captures.
// Trois icônes ne correspondent à aucune icône Phosphor et sont dessinées ici : « Filtre caméra », « INFO » et pause.
export {
  CardsThree as IconProjects,
  FolderOpen as IconFolder,
  MagnifyingGlass as IconSearch,
  Link as IconLink,
  Eye as IconEye,
  Clock as IconClock,
  CalendarBlank as IconCalendar,
  Monitor as IconWindow,
  VideoCamera as IconCamera,
  Microphone as IconMic,
  ArrowClockwise as IconRestart,
  ArrowElbowUpLeft as IconReply,
  ArrowUp as IconSend,
  Play as IconPlay,
} from '@phosphor-icons/react'

type P = { size?: number; color?: string }

/** Trois ondulations en diagonale (« Filtre caméra »). */
export function IconFilter({ size = 14, color = 'currentColor' }: P) {
  const wave = 'M0 6 q1.5 -1.6 3 0 t3 0 t3 0'
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round">
      <g transform="rotate(-55 7 7)">
        <path d={wave} transform="translate(2.5 -3)" />
        <path d={wave} transform="translate(2.5 1)" />
        <path d={wave} transform="translate(2.5 5)" />
      </g>
    </svg>
  )
}

/** Pastille « INFO » devant « Description ». */
export function IconInfo({ color = 'currentColor' }: P) {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
      <rect x="0.5" y="0.5" width="19" height="9" rx="4.5" stroke={color} />
      <text x="10" y="7.2" textAnchor="middle" fontSize="5.5" fontWeight="600" fontFamily="var(--font)" fill={color}>
        INFO
      </text>
    </svg>
  )
}

/** Poignée de déplacement de la barre de contrôle (6 points blancs). */
export function IconGrip() {
  return (
    <svg width="10" height="7" viewBox="0 0 10 7" fill="var(--c-white)">
      {[0, 4, 8].map((x) => [0, 5].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="2" height="2" />))}
    </svg>
  )
}

/** Pause : deux barres pleines (la pause Phosphor est en contour, différente de la capture). */
export function IconPause({ color = 'currentColor' }: P) {
  return (
    <svg width="8" height="11" viewBox="0 0 8 11" fill={color}>
      <rect x="0" y="0" width="2" height="11" />
      <rect x="6" y="0" width="2" height="11" />
    </svg>
  )
}
