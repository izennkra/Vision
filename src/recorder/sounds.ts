// Sound design minimaliste, synthétisé (aucun fichier audio) : petits « blips » doux.
let ctx: AudioContext | null = null
const audio = () => (ctx ??= new AudioContext())

function blip(freq: number, start: number, length = 0.12, volume = 0.18) {
  const a = audio()
  const t = a.currentTime + start
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, t)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
  osc.connect(gain).connect(a.destination)
  osc.start(t)
  osc.stop(t + length + 0.02)
}

/** Un battement du décompte (3, 2, 1). */
export const tick = () => blip(660, 0)
/** Départ : note plus aiguë, un peu plus longue. */
export const go = () => blip(990, 0, 0.28, 0.2)
/** Fin d'enregistrement : deux notes qui descendent. */
export const done = () => {
  blip(990, 0, 0.16)
  blip(740, 0.13, 0.32)
}
/** Débloque le son (doit être appelé pendant un clic). */
export const unlock = () => audio().resume()
