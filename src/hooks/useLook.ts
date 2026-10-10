// Regard vivant (photos de profil et logo) : la pupille se tourne vers des points de l'écran choisis
// au hasard, à des rythmes variés, et l'œil cligne de temps en temps (parfois deux fois de suite).
// Toujours animé, y compris sur téléphone avec « Réduire les animations » : le mouvement est petit et lent,
// et c'est l'identité de Visions.
import { useEffect, useState, type RefObject } from 'react'

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** `gaze` : direction du regard, de -1 à 1 sur chaque axe ; `blink` change à chaque clignement. */
export function useLook(ref: RefObject<Element | null>) {
  const [gaze, setGaze] = useState({ x: 0, y: 0, speed: 0.4 })
  const [blink, setBlink] = useState(0)

  useEffect(() => {
    let lookTimer: number
    let blinkTimer: number
    const look = () => {
      if (!document.hidden && ref.current) {
        const r = ref.current.getBoundingClientRect()
        const vx = rand(0, innerWidth) - (r.left + r.width / 2)
        const vy = rand(0, innerHeight) - (r.top + r.height / 2)
        const d = Math.max(1, Math.hypot(vx, vy))
        const reach = Math.min(1, d / 260) // un point proche : petit mouvement
        const centre = Math.random() < 0.18 // parfois, regard droit devant
        setGaze({ x: centre ? 0 : (vx / d) * reach, y: centre ? 0 : (vy / d) * reach, speed: rand(0.22, 0.5) })
      }
      lookTimer = window.setTimeout(look, Math.random() < 0.25 ? rand(250, 600) : rand(900, 3200))
    }
    const doBlink = () => {
      if (!document.hidden) setBlink((n) => n + 1)
      blinkTimer = window.setTimeout(doBlink, Math.random() < 0.2 ? rand(260, 380) : rand(2200, 6500))
    }
    lookTimer = window.setTimeout(look, rand(200, 1500))
    blinkTimer = window.setTimeout(doBlink, rand(800, 4000))
    return () => {
      window.clearTimeout(lookTimer)
      window.clearTimeout(blinkTimer)
    }
  }, [ref])

  return { gaze, blink }
}
