// Page vidéo, en deux versions :
// - « owner » : page personnelle modifiable (titre, client, description, publier, supprimer) ;
// - « client » : page de partage (regarder et commenter, rien d'autre).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { owner } from '../config'
import { repo, type Client, type Comment, type ID, type Video } from '../data'
import { Comments, initialsOf } from '../components/Comments'
import { InlineEdit } from '../components/InlineEdit'
import { Logo } from '../components/Logo'
import { Player, type PlayerHandle } from '../components/Player'
import { useContextMenu } from '../components/ContextMenu'
import { IconCheck, IconEye, IconInfo, IconLink } from '../components/icons'
import { plural, timeAgo } from '../lib/format'
import { shareUrl, shareVideo, useCopied } from '../lib/share'
import './video-page.css'

type Mode = 'owner' | 'client'

const VIEWER_KEY = 'visions:viewer-name'
const readViewer = () => {
  try {
    return localStorage.getItem(VIEWER_KEY)
  } catch {
    return null
  }
}
const saveViewer = (name: string) => {
  try {
    localStorage.setItem(VIEWER_KEY, name)
  } catch {
    /* navigation privée : le nom sera redemandé */
  }
}

export default function VideoPage({ mode }: { mode: Mode }) {
  const { id, token } = useParams()
  const navigate = useNavigate()
  const openMenu = useContextMenu()
  const isOwner = mode === 'owner'
  const [video, setVideo] = useState<Video | null | undefined>(undefined)
  const [client, setClient] = useState<Client | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [src, setSrc] = useState('')
  const [poster, setPoster] = useState<string | null>(null)
  const [viewer, setViewer] = useState<string | null>(isOwner ? owner.fullName : readViewer())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, flash] = useCopied()
  const player = useRef<PlayerHandle>(null)
  const viewId = useRef<ID | null>(null)
  const lastRatio = useRef(0)

  // Chargement de la vidéo, de son client, de ses commentaires et de sa source.
  useEffect(() => {
    let cancelled = false
    let posterUrl: string | null = null
    ;(async () => {
      const v = isOwner ? await repo.getVideo(id!) : await repo.getVideoByShareToken(token!)
      if (cancelled) return
      if (!v || (!isOwner && v.status !== 'published')) return setVideo(null)
      setVideo(v)
      const [all, list, url, thumb] = await Promise.all([
        repo.listClients(),
        repo.listComments(v.id),
        repo.getPlaybackUrl(v.id),
        v.thumbnailKey ? repo.getThumbnail(v.thumbnailKey) : null,
      ])
      if (cancelled) return
      setClients(all)
      setClient(all.find((c) => c.id === v.clientId) ?? null)
      setComments(list)
      setSrc(url)
      if (thumb) setPoster((posterUrl = URL.createObjectURL(thumb)))
    })()
    return () => {
      cancelled = true
      if (posterUrl) URL.revokeObjectURL(posterUrl)
    }
  }, [id, token, isOwner])

  const update = useCallback(
    async (patch: Parameters<typeof repo.updateVideo>[1]) => {
      if (!video) return
      const v = await repo.updateVideo(video.id, patch)
      setVideo(v)
      if ('clientId' in patch) setClient(clients.find((c) => c.id === v.clientId) ?? null)
    },
    [video, clients],
  )

  // Vues : comptées sur la page client uniquement, avec la proportion regardée.
  const onFirstPlay = async () => {
    if (isOwner || !video) return
    const view = await repo.recordView({
      videoId: video.id,
      viewer: viewer ?? 'Anonyme',
      startedAt: new Date().toISOString(),
      watchedRatio: 0,
    })
    viewId.current = view.id
    setVideo((v) => (v ? { ...v, viewCount: v.viewCount + 1 } : v))
  }
  const onProgress = (ratio: number) => {
    if (!viewId.current || ratio < lastRatio.current + 0.05) return
    lastRatio.current = ratio
    repo.updateView(viewId.current, ratio)
  }

  if (video === undefined) return <div className="vp" />
  if (video === null)
    return (
      <div className="vp vp--empty">
        <p>Cette vidéo n’est pas disponible.</p>
        {isOwner && <Link className="ds-accent-link" to="/">Retour au dashboard</Link>}
      </div>
    )

  const share = async () => {
    setVideo(await shareVideo(video))
    flash()
  }

  const chooseClient = (e: React.MouseEvent) =>
    openMenu(e, [
      ...clients.map((c) => ({ label: c.name, muted: c.id === video.clientId, onSelect: () => update({ clientId: c.id }) })),
      'separator' as const,
      { label: 'Aucun client', muted: !video.clientId, onSelect: () => update({ clientId: null }) },
    ])

  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true)
    await repo.deleteVideo(video.id)
    navigate('/')
  }

  const published = video.status === 'published'

  return (
    <div className="vp">
      <main className="vp__main">
        <header className="vp__top">
          {isOwner ? <Link to="/" aria-label="Dashboard" className="ds-hover"><Logo /></Link> : <Logo />}
          <div className="vp__actions">
            {isOwner ? (
              <>
                <button className="ds-action ds-action--ghost" onClick={remove} onMouseLeave={() => setConfirmDelete(false)}>
                  {confirmDelete ? 'Confirmer' : 'Supprimer'}
                </button>
                <button
                  className="ds-action ds-action--dark"
                  onClick={() => update({ status: published ? 'draft' : 'published' })}
                  title={published ? 'Cliquer pour dépublier' : 'Rendre la vidéo visible par le client'}
                >
                  {published ? 'Publiée' : 'Publier'}
                </button>
              </>
            ) : (
              <button
                className="ds-action ds-action--dark"
                onClick={async () => {
                  const url = shareUrl(video.shareToken)
                  if (navigator.share) await navigator.share({ title: video.title, url }).catch(() => {})
                  else {
                    await navigator.clipboard.writeText(url)
                    flash()
                  }
                }}
              >
                Partager
              </button>
            )}
            <button
              className="ds-link-dot vp__link"
              onClick={isOwner ? share : async () => (await navigator.clipboard.writeText(shareUrl(video.shareToken)), flash())}
              aria-label="Copier le lien client"
              title={copied ? 'Lien copié' : 'Copier le lien client'}
            >
              {copied ? <IconCheck size={12} /> : <IconLink size={12} />}
            </button>
          </div>
        </header>

        <section className="vp__card">
          <div className="vp__head">
            <div className="vp__title-row">
              <h1 className="vp__title">
                <InlineEdit value={video.title} readOnly={!isOwner} onSave={(title) => update({ title })} />
                {isOwner ? (
                  <button className="ds-accent-link vp__client" onClick={chooseClient}>
                    {client ? `${owner.firstName} x ${client.name}` : 'Choisir un client'}
                  </button>
                ) : (
                  client && <span className="ds-accent-link vp__client">{owner.firstName} x {client.name}</span>
                )}
              </h1>
              <span className="ds-chip vp__views"><IconEye size={12} />{plural(video.viewCount, 'vue', 'vues')}</span>
            </div>
            <div className="vp__author">
              <img className="ds-avatar" src={owner.avatarUrl} alt="" />
              <span>Publié par {owner.fullName}</span>
              <span className="vp__dash">-</span>
              <span>{timeAgo(video.createdAt)}</span>
            </div>
          </div>

          <div className="vp__player">
            <Player
              ref={player}
              src={src}
              poster={poster}
              knownDuration={video.duration}
              markers={comments.filter((c) => c.timestamp !== null).map((c) => c.timestamp!)}
              onFirstPlay={onFirstPlay}
              onProgress={onProgress}
            />
          </div>

          {(isOwner || video.description) && (
            <div className="vp__desc">
              <div className="vp__desc-label"><IconInfo />Description</div>
              <InlineEdit
                className="vp__desc-text"
                value={video.description}
                readOnly={!isOwner}
                multiline
                allowEmpty
                placeholder="Ajouter une description..."
                onSave={(description) => update({ description })}
              />
            </div>
          )}
        </section>
      </main>

      <Comments
        comments={comments}
        author={viewer}
        onAuthorChange={(name) => {
          setViewer(name)
          saveViewer(name)
        }}
        canDelete={isOwner}
        onSeek={(t) => player.current?.seek(t)}
        currentTime={() => player.current?.currentTime() ?? 0}
        onAdd={async ({ text, timestamp, parentId, authorName }) => {
          const c = await repo.addComment({
            videoId: video.id,
            parentId,
            authorName,
            authorInitials: initialsOf(authorName),
            text,
            timestamp,
          })
          setComments((list) => [...list, c])
        }}
        onDelete={async (cid) => {
          await repo.deleteComment(cid)
          setComments((list) => list.filter((c) => c.id !== cid && c.parentId !== cid))
        }}
      />
    </div>
  )
}
