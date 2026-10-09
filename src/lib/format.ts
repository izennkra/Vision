// Formats d'affichage (dates, durées, pluriels).

/** « À l'instant », « Il y a 5 min », « Il y a 2h », « Il y a 11 jours », « Il y a 3 mois », « Il y a 2 ans ». */
export function timeAgo(iso: string, from = Date.now()) {
  const s = Math.max(0, (from - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'À l’instant'
  const m = Math.floor(s / 60)
  if (m < 60) return `Il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `Il y a ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `Il y a ${d} jour${d > 1 ? 's' : ''}`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `Il y a ${mo} mois`
  const y = Math.floor(d / 365)
  return `Il y a ${y} an${y > 1 ? 's' : ''}`
}

/** 26/03/2026 */
export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Durée pour la pastille des cartes : « 0min », « 4min », « 1h32 ». */
export function durationLabel(seconds: number) {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m}min`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

/** Temps dans la vidéo : « 1:32 », « 1:02:05 ». */
export function clock(seconds: number) {
  const t = Math.max(0, Math.floor(seconds))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
