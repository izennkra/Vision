// Pastille « N vues » cliquable : liste des personnes qui ont regardé la vidéo,
// quand, combien de fois, et combien de temps.
import { useEffect, useRef, useState } from 'react'
import { repo, type Video, type View } from '../data'
import { clock, plural, timeAgo } from '../lib/format'
import { Initials } from './Initials'
import { IconEye } from './icons'

interface Viewer {
  id: string
  name: string
  last: string
  sessions: number
  ratio: number
}

/** Regroupe les vues par navigateur : une ligne par personne. */
function group(views: View[]): Viewer[] {
  const map = new Map<string, Viewer>()
  for (const v of views) {
    const g = map.get(v.viewerId)
    if (!g) map.set(v.viewerId, { id: v.viewerId, name: v.viewer, last: v.startedAt, sessions: 1, ratio: v.watchedRatio })
    else {
      g.sessions++
      g.ratio = Math.max(g.ratio, v.watchedRatio)
      if (v.startedAt > g.last) g.last = v.startedAt
      if (g.name === 'Anonyme' && v.viewer !== 'Anonyme') g.name = v.viewer
    }
  }
  return [...map.values()].sort((a, b) => b.last.localeCompare(a.last))
}

export function ViewsChip({ video }: { video: Video }) {
  const [open, setOpen] = useState(false)
  const [viewers, setViewers] = useState<Viewer[] | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    repo.listViews(video.id).then((v) => setViewers(group(v)))
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open, video.id, video.viewCount])

  const detailed = viewers?.reduce((n, v) => n + v.sessions, 0) ?? 0
  const older = Math.max(0, video.viewCount - detailed)

  return (
    <div ref={ref} className="viewers">
      <button className="ds-chip ds-hover vp__views" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <IconEye size={12} />
        {plural(video.viewCount, 'vue', 'vues')}
      </button>
      {/* Téléphone : la liste monte du bas de l'écran, par-dessus la vidéo (comme le choix du profil). */}
      {open && <div className="sheet-backdrop viewers__backdrop" onClick={() => setOpen(false)} aria-hidden />}
      {open && (
        <div className="viewers__panel" role="dialog" aria-label="Qui a regardé la vidéo">
          <span className="sheet-grip" aria-hidden />
          <div className="viewers__head">
            {plural(video.viewCount, 'vue', 'vues')}
            {viewers && viewers.length > 0 && <span> · {plural(viewers.length, 'personne', 'personnes')}</span>}
          </div>
          {viewers?.length === 0 && older === 0 && <p className="viewers__empty">Personne n’a encore regardé cette vidéo.</p>}
          <ul className="viewers__list">
            {viewers?.map((v) => (
              <li key={v.id} className="viewers__row">
                <Initials name={v.name} />
                <div className="viewers__text">
                  <div className="viewers__name">{v.name}</div>
                  <div className="viewers__meta">
                    {timeAgo(v.last)}
                    {v.sessions > 1 && ` · ${v.sessions} fois`}
                  </div>
                </div>
                <div className="viewers__watch">
                  <div className="viewers__time">{clock(v.ratio * video.duration)}</div>
                  <div className="viewers__bar"><span style={{ width: `${Math.round(v.ratio * 100)}%` }} /></div>
                </div>
              </li>
            ))}
          </ul>
          {older > 0 && <p className="viewers__empty">{plural(older, 'vue plus ancienne', 'vues plus anciennes')}, sans détail.</p>}
        </div>
      )}
    </div>
  )
}
