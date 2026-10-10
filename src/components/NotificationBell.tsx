// Cloche de notifications : point orange quand quelqu'un a regardé ou commenté une vidéo.
// Vérifie toutes les 30 secondes (et au retour sur l'onglet) ; une nouveauté affiche un message
// et, si tu l'as autorisé, une notification du bureau (même quand Visions est en arrière-plan).
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { repo, type AppNotification } from '../data'
import { timeAgo } from '../lib/format'
import { initialsOf } from './Comments'
import { IconBell } from './icons'
import { useToast } from './Toast'

const POLL_MS = 30_000

const sentence = (n: AppNotification) =>
  `${n.actor} a ${n.type === 'view' ? 'regardé' : 'commenté'} « ${n.videoTitle} »`

export function NotificationBell() {
  const navigate = useNavigate()
  const toast = useToast()
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [permission, setPermission] = useState(() => (typeof Notification === 'undefined' ? 'denied' : Notification.permission))
  const seen = useRef<Set<string> | null>(null)
  const box = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    const r = await repo.listNotifications().catch(() => null)
    if (!r) return
    // Nouveautés depuis la dernière vérification (pas au premier chargement).
    if (seen.current) {
      const fresh = r.items.filter((n) => !n.read && !seen.current!.has(n.id))
      if (fresh.length) {
        toast(fresh.length === 1 ? sentence(fresh[0]) : `${fresh.length} nouvelles notifications`)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden)
          for (const n of fresh.slice(0, 3)) {
            const desk = new Notification('Visions', { body: n.text ? `${sentence(n)} : ${n.text}` : sentence(n), tag: n.id, icon: '/logo-ik.svg' })
            desk.onclick = () => {
              window.focus()
              navigate(`/video/${n.videoId}`)
            }
          }
      }
    }
    seen.current = new Set(r.items.map((n) => n.id))
    setItems(r.items)
    setUnread(r.unread)
  }, [navigate, toast])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, POLL_MS)
    const onFocus = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const readAll = async () => {
    await repo.markNotificationsRead()
    setItems((list) => list.map((n) => ({ ...n, read: true })))
    setUnread(0)
  }

  const openItem = async (n: AppNotification) => {
    setOpen(false)
    if (!n.read) await repo.markNotificationsRead([n.id])
    navigate(`/video/${n.videoId}`)
  }

  return (
    <div ref={box} className="bell">
      <button
        className="bell__button ds-hover"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `${unread} notification(s) non lue(s)` : 'Notifications'}
        aria-expanded={open}
      >
        <IconBell size={19} weight="regular" />
        {unread > 0 && <span className="bell__dot" />}
      </button>
      {open && (
        <div className="bell__panel">
          <div className="bell__head">
            <span>Notifications</span>
            {unread > 0 && <button className="ds-hover bell__all" onClick={readAll}>Tout marquer comme lu</button>}
          </div>
          {items.length === 0 && <p className="bell__empty">Rien pour l’instant. Tu seras prévenu dès qu’un client regarde ou commente une vidéo.</p>}
          <ul className="bell__list">
            {items.map((n) => (
              <li key={n.id}>
                <button className={`bell__item${n.read ? '' : ' is-unread'}`} onClick={() => openItem(n)}>
                  <span className="ds-initials">{n.actor === 'Anonyme' ? '?' : initialsOf(n.actor)}</span>
                  <span className="bell__text">
                    <span className="bell__line">
                      <strong>{n.actor}</strong> a {n.type === 'view' ? 'regardé' : 'commenté'} « {n.videoTitle} »
                    </span>
                    {n.text && <span className="bell__quote">{n.text}</span>}
                    <span className="bell__time">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {permission === 'default' && (
            <button
              className="ds-hover bell__desktop"
              onClick={async () => setPermission(await Notification.requestPermission())}
            >
              Recevoir aussi les notifications sur le bureau
            </button>
          )}
        </div>
      )}
    </div>
  )
}
