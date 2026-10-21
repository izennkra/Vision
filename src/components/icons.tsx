// Icônes : Phosphor (graisse « bold », réglée dans main.tsx), identifiées sur les captures.
// Quelques icônes ne correspondent à aucune icône Phosphor et sont dessinées ici : « Filtre caméra », « INFO », pause, « Répondre ».
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
  ArrowUp as IconSend,
  Play as IconPlay,
  Check as IconCheck,
  Plus as IconPlus,
  CornersOut as IconFullscreen,
  Bell as IconBell,
  CaretLeft as IconBack,
  CaretDown as IconCaretDown,
  X as IconClose,
  EnvelopeSimple as IconMail,
  Copy as IconCopy,
  ArrowsClockwise as IconRefresh,
  LockSimple as IconLock,
  GlobeSimple as IconGlobe,
  SpeakerHigh as IconVolume,
  SpeakerLow as IconVolumeLow,
  SpeakerX as IconMuted,
  SlidersHorizontal as IconSettings,
  ClosedCaptioning as IconCaptions,
  CornersIn as IconFullscreenExit,
  Translate as IconTranslate,
  NotePencil as IconNotes,
} from '@phosphor-icons/react'

type P = { size?: number; color?: string }

/** Trois ondulations en diagonale (« Filtre caméra »). */
export function IconFilter({ size = 14, color = 'currentColor' }: P) {
  const wave = 'M0 6 q1.5 -1.6 3 0 t3 0 t3 0'
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke={color} strokeWidth="1" strokeLinecap="round">
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
export function IconPause({ color = 'currentColor', size = 11 }: P) {
  return (
    <svg width={2 * Math.round((size * 4) / 11)} height={size} viewBox="0 0 8 11" preserveAspectRatio="none" fill={color}>
      <rect x="0" y="0" width="2" height="11" />
      <rect x="6" y="0" width="2" height="11" />
    </svg>
  )
}

/** Petit triangle du dossier repliable (« ▾ Clients »). */
export function IconCaret({ open = true }: { open?: boolean }) {
  return (
    <svg width="5" height="4" viewBox="0 0 5 4" fill="currentColor" style={{ transform: open ? undefined : 'rotate(-90deg)' }}>
      <polygon points="0,0 5,0 2.5,4" />
    </svg>
  )
}

/** Flèche « Répondre » : pointe à gauche, retour vers le bas à droite (comme sur la capture). */
export function IconReply({ color = 'currentColor' }: P) {
  return (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 1 L1 4 L4.5 7" />
      <path d="M1.3 4 H13 V12.5" />
    </svg>
  )
}
