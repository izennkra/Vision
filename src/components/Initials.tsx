// Photo de profil d'une personne.
// - Photo importée par le propriétaire si elle existe ;
// - sinon l'œil animé de la DA (rond de couleur, œil blanc, pupille de la couleur du fond) :
//   il regarde des points de l'écran choisis au hasard et cligne de temps en temps, sans rythme fixe.
// - Le propriétaire garde sa photo ; « Anonyme » a un œil gris.
import { createContext, useContext, useEffect, useRef, useState } from 'react'
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
const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** Œil animé : regard aléatoire et clignements. */
export function Eye({ color }: { color: string }) {
  const ref = useRef<SVGSVGElement>(null)
  const [gaze, setGaze] = useState({ x: 0, y: 0, speed: 0.4 })
  const [blink, setBlink] = useState(0)

  useEffect(() => {
    if (reduceMotion()) return
    let lookTimer: number
    let blinkTimer: number
    const look = () => {
      if (!document.hidden && ref.current) {
        // Un point de l'écran au hasard ; la pupille se tourne vers lui.
        const r = ref.current.getBoundingClientRect()
        const vx = rand(0, innerWidth) - (r.left + r.width / 2)
        const vy = rand(0, innerHeight) - (r.top + r.height / 2)
        const d = Math.max(1, Math.hypot(vx, vy))
        const reach = Math.min(1, d / 260) // un point proche : petit mouvement
        const centre = Math.random() < 0.18 // parfois, regard droit devant
        setGaze({
          x: centre ? 0 : (vx / d) * 18 * reach,
          y: centre ? 0 : (vy / d) * 15 * reach,
          speed: rand(0.22, 0.5),
        })
      }
      // Parfois un petit enchaînement rapide, parfois une longue pause.
      lookTimer = window.setTimeout(look, Math.random() < 0.25 ? rand(250, 600) : rand(900, 3200))
    }
    const doBlink = () => {
      if (!document.hidden) setBlink((n) => n + 1)
      // De temps en temps, un double clignement.
      blinkTimer = window.setTimeout(doBlink, Math.random() < 0.2 ? rand(260, 380) : rand(2200, 6500))
    }
    lookTimer = window.setTimeout(look, rand(200, 1500))
    blinkTimer = window.setTimeout(doBlink, rand(800, 4000))
    return () => {
      window.clearTimeout(lookTimer)
      window.clearTimeout(blinkTimer)
    }
  }, [])

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
        style={{ transform: `translate(${gaze.x}px, ${gaze.y}px)`, transitionDuration: `${gaze.speed}s` }}
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
