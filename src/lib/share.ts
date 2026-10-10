// Lien de partage client (étape 1 : simulé en local, étape 2 : vrai lien public).
import { useCallback, useEffect, useRef, useState } from 'react'
import { owner } from '../config'
import { repo, type Client, type Person, type Video } from '../data'
import { audienceOf } from './people'

export const shareUrl = (token: string) => `${window.location.origin}/v/${token}`

/** Lien personnel d'une personne invitée : elle est reconnue sans rien choisir, même si la vidéo est privée. */
export const personalUrl = (video: Video, person: Person) => `${shareUrl(video.shareToken)}?p=${person.token}`

/** Le lien direct n'est proposé qu'une fois la vidéo publiée et les personnes prévues. */
export const linkReady = (video: Video, clients: Client[]) => video.status === 'published' && audienceOf(video, clients).length > 0

/** Code d'accès lisible : 6 caractères, sans 0/O ni 1/I pour éviter les confusions. */
export function newAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => chars[n % chars.length]).join('')
}

/** Invitation par e-mail : ouvre l'app Mail avec le message prérempli et le lien personnel. */
export function inviteMailto(video: Video, person: Person) {
  const first = person.name.split(/\s+/)[0]
  const lines = [
    `Bonjour ${first},`,
    '',
    `Voici la vidéo « ${video.title} » :`,
    personalUrl(video, person),
    '',
    'Vous pouvez la regarder et laisser vos commentaires directement sur la vidéo, au moment qui vous intéresse.',
    '',
    'À bientôt,',
    owner.fullName,
  ]
  const q = `subject=${encodeURIComponent(`Vidéo : ${video.title}`)}&body=${encodeURIComponent(lines.join('\n'))}`
  return `mailto:${encodeURIComponent(person.email ?? '')}?${q}`
}

/**
 * Copie le lien de la page client. Partager une vidéo encore en brouillon la publie :
 * sinon le client tomberait sur une page indisponible.
 */
export async function shareVideo(video: Video) {
  await navigator.clipboard.writeText(shareUrl(video.shareToken))
  if (video.status !== 'published') return repo.updateVideo(video.id, { status: 'published' })
  return video
}

/** Retour visuel bref après une copie (l'icône lien devient une coche). */
export function useCopied(delay = 1400) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const flash = useCallback(() => {
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), delay)
  }, [delay])
  return [copied, flash] as const
}

/** Télécharge le fichier vidéo sur le Mac (dossier Téléchargements). */
export async function downloadVideo(video: Video) {
  const href = await repo.getDownloadUrl(video.id)
  if (!href) return false
  const ext = video.mimeType.includes('mp4') ? 'mp4' : 'webm'
  const a = document.createElement('a')
  a.href = href
  a.download = `${video.title.replace(/[\\/:*?"<>|]/g, '-')}.${ext}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (href.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(href), 60_000)
  return true
}
