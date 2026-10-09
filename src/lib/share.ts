// Lien de partage client (étape 1 : simulé en local, étape 2 : vrai lien public).
import { useCallback, useEffect, useRef, useState } from 'react'
import { repo, type Video } from '../data'

export const shareUrl = (token: string) => `${window.location.origin}/v/${token}`

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

/** Télécharge le fichier vidéo enregistré (assemblé à partir de ses morceaux). */
export async function downloadVideo(video: Video) {
  const file = await repo.getVideoFile(video.id)
  const href = file ? URL.createObjectURL(file) : video.sampleUrl
  if (!href) return false
  const ext = (file?.type ?? 'video/webm').includes('mp4') ? 'mp4' : 'webm'
  const a = document.createElement('a')
  a.href = href
  a.download = `${video.title.replace(/[\\/:*?"<>|]/g, '-')}.${ext}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (file) setTimeout(() => URL.revokeObjectURL(href), 60_000)
  return true
}
