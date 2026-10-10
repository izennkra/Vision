// Photo de profil d'une personne.
// - Photo importée par le propriétaire si elle existe ;
// - sinon l'œil animé de la DA (rond de couleur, œil blanc, pupille de la couleur du fond) :
//   il regarde des points de l'écran choisis au hasard et cligne de temps en temps, sans rythme fixe.
// - Le propriétaire garde sa photo ; « Anonyme » a un œil gris.
import { createContext, useContext, useRef } from 'react'
import { useLook } from '../hooks/useLook'
import { owner } from '../config'
import type { Person } from '../data/types'
import { mediaHref } from '../lib/api'
import { colorFor } from '../lib/people'

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'

/** Personnes connues sur la page (pour retrouver la couleur ou la photo d'un nom de commentaire). */
export const PeopleContext = createContext<Person[]>([])

const ANON_COLOR = '#c4c4c4'

/** Œil animé : regard aléatoire et clignements. */
export function Eye({ color }: { color: string }) {
  const ref = useRef<SVGSVGElement>(null)
  const { gaze, blink } = useLook(ref)
  return (
    <svg ref={ref} className="eye" viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="50" fill={color} />
      <path key={blink} className={`eye__white${blink ? ' is-blinking' : ''}`} d="M17 50 Q50 13 83 50 Q50 87 17 50 Z" fill="#fff" />
      <circle
        className="eye__pupil"
        cx="50"
        cy="50"
        r="12"
        fill={color}
        style={{ transform: `translate(${gaze.x * 18}px, ${gaze.y * 15}px)`, transitionDuration: `${gaze.speed}s` }}
      />
    </svg>
  )
}

interface AvatarProps {
  name: string | null | undefined
  /** Personne (couleur, photo) ; sinon retrouvée d'après le nom parmi les personnes de la page. */
  person?: Pick<Person, 'color' | 'avatar'> | null
  className?: string
}

export function Initials({ name, person, className = '' }: AvatarProps) {
  const people = useContext(PeopleContext)
  const trimmed = name?.trim() ?? ''
  const anonymous = !trimmed || trimmed === '?' || trimmed.toLowerCase() === 'anonyme'
  const known = person ?? (anonymous ? null : people.find((p) => p.name === trimmed))
  const photo = trimmed === owner.fullName ? owner.avatarUrl : known?.avatar ? mediaHref(known.avatar) : null
  return (
    <span className={`ds-initials ds-avatar-eye ${className}`} title={trimmed || undefined} aria-hidden>
      {photo ? <img src={photo} alt="" /> : <Eye color={anonymous ? ANON_COLOR : colorFor(trimmed, known?.color)} />}
    </span>
  )
}

export const Avatar = Initials
