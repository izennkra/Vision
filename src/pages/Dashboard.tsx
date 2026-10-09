import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { owner } from '../config'
import { repo, type Client, type Video } from '../data'
import { Logo } from '../components/Logo'
import { Thumbnail } from '../components/Thumbnail'
import {
  IconCalendar, IconCaret, IconClock, IconEye, IconFolder, IconLink, IconProjects, IconSearch,
} from '../components/icons'
import { useInView } from '../hooks/useInView'
import { durationLabel, plural, shortDate, timeAgo } from '../lib/format'
import { copyShareLink } from '../lib/share'
import './dashboard.css'

const PAGE = 24

export default function Dashboard() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const clientId = params.get('client')
  const [clients, setClients] = useState<Client[]>([])
  const [foldersOpen, setFoldersOpen] = useState(true)
  const [search, setSearch] = useState('')
  const [videos, setVideos] = useState<Video[]>([])
  const [total, setTotal] = useState(0)
  const [next, setNext] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sentinel, atEnd] = useInView<HTMLDivElement>('600px')

  useEffect(() => {
    repo.listClients().then(setClients)
  }, [])

  // Première page à chaque changement de filtre.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    repo.listVideos({ clientId, search, limit: PAGE }).then((page) => {
      if (cancelled) return
      setVideos(page.items)
      setTotal(page.total)
      setNext(page.next)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [clientId, search])

  // Pages suivantes quand on approche du bas.
  const loadMore = useCallback(async () => {
    if (!next || loading) return
    setLoading(true)
    const page = await repo.listVideos({ clientId, search, cursor: next, limit: PAGE })
    setVideos((v) => [...v, ...page.items])
    setNext(page.next)
    setLoading(false)
  }, [next, loading, clientId, search])

  useEffect(() => {
    if (atEnd) loadMore()
  }, [atEnd, loadMore])

  const selectClient = (id: string | null) => setParams(id ? { client: id } : {})

  return (
    <div className="dash">
      <div className="dash__logo"><Logo /></div>
      <img className="ds-avatar dash__avatar" src={owner.avatarUrl} alt={owner.fullName} />

      <aside className="dash__side">
        <button className="ds-btn-primary" onClick={() => navigate('/record')}>Nouveau fichier</button>
        <nav className="dash__panel">
          <label className="ds-search">
            <IconSearch size={13} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Recherche..." />
          </label>
          <button
            className={`ds-nav-item ds-nav-item--main dash__all${clientId ? '' : ' is-active'}`}
            onClick={() => selectClient(null)}
          >
            <IconProjects size={14} />Tous les projets
          </button>
          <div className="dash__line" />
          <button className="ds-folder" onClick={() => setFoldersOpen((o) => !o)}>
            <IconCaret open={foldersOpen} />Clients
          </button>
          {foldersOpen &&
            clients.map((c) => (
              <button
                key={c.id}
                className={`ds-nav-item${clientId === c.id ? ' is-active' : ''}`}
                onClick={() => selectClient(c.id)}
              >
                <IconFolder size={14} className="ds-nav-item__folder" />{c.name}
              </button>
            ))}
        </nav>
      </aside>

      <main className="dash__main">
        <h1 className="dash__title">
          Bienvenue dans Visions, <span className="ds-accent-link dash__name">{owner.firstName}</span>
        </h1>
        <div className="dash__bar">
          <div className="dash__tabs">
            <button className={`ds-tab${clientId ? '' : ' is-active'}`} onClick={() => selectClient(null)}>Récents</button>
            {clients.map((c) => (
              <button key={c.id} className={`ds-tab${clientId === c.id ? ' is-active' : ''}`} onClick={() => selectClient(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
          <span className="dash__count">{plural(total, 'Vidéo', 'Vidéos')}</span>
        </div>

        <div className="dash__grid">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} onOpen={() => navigate(`/video/${v.id}`)} />
          ))}
        </div>
        <div ref={sentinel} className="dash__sentinel" />
      </main>
    </div>
  )
}

function VideoCard({ video, onOpen }: { video: Video; onOpen: () => void }) {
  return (
    <article className="dash__item">
      <div className="ds-card" onClick={onOpen}>
        <div className="ds-card__thumb">
          <Thumbnail thumbKey={video.thumbnailKey} />
          <button
            className="ds-link-dot"
            aria-label="Copier le lien de partage"
            onClick={(e) => {
              e.stopPropagation()
              copyShareLink(video.shareToken)
            }}
          >
            <IconLink size={12} />
          </button>
        </div>
        <div className="ds-card__meta">
          <div className="ds-card__title">{video.title}</div>
          <div className="ds-card__age">{timeAgo(video.createdAt)}</div>
        </div>
      </div>
      <div className="ds-stats">
        <span className="ds-stats__item"><IconEye size={12} />{video.viewCount}</span>
        <span className="ds-stats__item"><IconClock size={13} />{durationLabel(video.duration)}</span>
        <span className="ds-stats__item ds-stats__item--end"><IconCalendar size={12} />{shortDate(video.createdAt)}</span>
      </div>
    </article>
  )
}
