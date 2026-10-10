// Page vidéo, en deux versions :
// - « owner » : page personnelle modifiable (titre, client, description, publier, supprimer) ;
// - « client » : page de partage (regarder et commenter, rien d'autre).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { owner } from '../config'
import { repo, type Client, type Comment, type ID, type Video } from '../data'
import type { SharedResult } from '../data/repository'
import { ANONYMOUS, Comments, initialsOf } from '../components/Comments'
import { InlineEdit } from '../components/InlineEdit'
import { Logo } from '../components/Logo'
import { Player, type PlayerHandle } from '../components/Player'
import { useContextMenu } from '../components/ContextMenu'
import { IconBack, IconCheck, IconInfo, IconLink, IconLock } from '../components/icons'
import { SharePanel } from '../components/SharePanel'
import { ViewsChip } from '../components/Viewers'
import { clientLabel, folderTree } from '../lib/clients'
import { timeAgo } from '../lib/format'
import { linkReady, shareUrl, useCopied } from '../lib/share'
import { profileFor, saveProfile, saveShareKey, saveViewerName, shareKeyFor, viewerId, viewerName } from '../lib/viewer'
import './video-page.css'

type Mode = 'owner' | 'client'
type Lock = Extract<SharedResult, { locked: string }>

export default function VideoPage({ mode }: { mode: Mode }) {
  const { id, token } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const openMenu = useContextMenu()
  const isOwner = mode === 'owner'
  const [video, setVideo] = useState<Video | null | undefined>(undefined)
  const [client, setClient] = useState<Client | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [src, setSrc] = useState('')
  const [poster, setPoster] = useState<string | null>(null)
  const [viewer, setViewer] = useState<string | null>(isOwner ? owner.fullName : null)
  const [me, setMe] = useState<{ id: ID; name: string } | null>(null)
  const [lock, setLock] = useState<Lock | null>(null)
  const [reload, setReload] = useState(0)
  const [panel, setPanel] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [now, setNow] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, flash] = useCopied(1600)
  const player = useRef<PlayerHandle>(null)
  const viewId = useRef<ID | null>(null)
  const lastRatio = useRef(0)

  // Lien personnel (?p=) : gardé dans ce navigateur puis retiré de l'adresse (pour ne pas être recopié).
  // ?partage=1 (depuis le dashboard) : ouvre le panneau « Partager ».
  const urlKey = params.get('p')
  useEffect(() => {
    if (!urlKey && !params.has('partage')) return
    if (urlKey && token) saveShareKey(token, urlKey)
    if (params.has('partage')) setPanel(true)
    setParams({}, { replace: true })
  }, [urlKey, params, setParams, token])

  // Chargement de la vidéo, de son client, de ses commentaires et de sa source.
  useEffect(() => {
    let cancelled = false
    let posterUrl: string | null = null
    ;(async () => {
      let v: Video | null
      let all: Client[]
      if (isOwner) {
        ;[v, all] = await Promise.all([repo.getVideo(id!), repo.listClients()])
      } else {
        const shared = await repo.getShared(token!, urlKey ?? shareKeyFor(token!))
        if (cancelled) return
        if (shared && 'locked' in shared) return setLock(shared)
        setLock(null)
        v = shared?.video ?? null
        all = shared?.clients ?? []
        if (shared && v) {
          setMe(shared.me)
          // Nom affiché pour les vues : lien personnel, sinon profil déjà choisi sur cette vidéo.
          const names = (v.people ?? []).map((p) => p.name)
          const stored = profileFor(v.id)
          setViewer(shared.me?.name ?? (names.length ? (stored && (stored === ANONYMOUS || names.includes(stored)) ? stored : null) : viewerName()))
        }
      }
      if (cancelled) return
      if (!v) return setVideo(null)
      setVideo(v)
      const [list, url, thumb] = await Promise.all([
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
    // urlKey : lu une seule fois au chargement (l'adresse est nettoyée juste après).
  }, [id, token, isOwner, reload])

  const update = useCallback(
    async (patch: Parameters<typeof repo.updateVideo>[1]) => {
      const v = await repo.updateVideo(video!.id, patch)
      setVideo(v)
      if ('clientId' in patch) setClient(clients.find((c) => c.id === v.clientId) ?? null)
      return v
    },
    [video, clients],
  )

  // Vues : comptées sur la page client uniquement, avec la proportion regardée.
  const onFirstPlay = async () => {
    if (isOwner || !video) return
    const view = await repo.recordView({
      videoId: video.id,
      viewerId: viewerId(),
      viewer: viewer ?? 'Anonyme',
      startedAt: new Date().toISOString(),
      watchedRatio: 0,
    })
    viewId.current = view.id
    setVideo((v) => (v ? { ...v, viewCount: v.viewCount + 1 } : v))
  }
  const onProgress = (ratio: number, seconds: number) => {
    setNow(Math.floor(seconds))
    if (!viewId.current || ratio < lastRatio.current + 0.05) return
    lastRatio.current = ratio
    repo.updateView(viewId.current, ratio)
  }

  if (lock) return <AccessGate lock={lock} onUnlock={(code) => repo.unlockShare(token!, code)} onDone={() => setReload((n) => n + 1)} />
  if (video === undefined) return <div className="vp" />
  if (video === null)
    return (
      <div className="vp vp--empty">
        <p>Cette vidéo n’est pas disponible.</p>
        {isOwner && <Link className="ds-accent-link" to="/">Retour au dashboard</Link>}
      </div>
    )

  const published = video.status === 'published'
  // Côté propriétaire, le lien direct reste grisé tant que les personnes ne sont pas prévues.
  const ready = !isOwner || linkReady(video)

  const copyLink = async () => {
    if (!ready) return setPanel(true)
    await navigator.clipboard.writeText(shareUrl(video.shareToken))
    flash()
  }

  // Publier : « Supprimer » et « Publier » s'effacent, puis « Partager » et le lien apparaissent.
  const publish = async () => {
    setLeaving(true)
    const [v] = await Promise.all([update({ status: 'published' }), new Promise((r) => setTimeout(r, 220))])
    setLeaving(false)
    if (!v.people?.length) setTimeout(() => setPanel(true), 260)
  }

  const clientShare = async () => {
    const url = shareUrl(video.shareToken)
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: video.title, url }).catch(() => {})
    else await copyLink()
  }

  const chooseClient = (e: React.MouseEvent) =>
    openMenu(e, [
      ...folderTree(clients).map(({ client: c, depth }) => ({
        label: `${depth ? '↳ ' : ''}${c.name}`,
        checked: c.id === video.clientId,
        onSelect: () => update({ clientId: c.id }),
      })),
      'separator' as const,
      { label: 'Aucun client', muted: !video.clientId, onSelect: () => update({ clientId: null }) },
    ])

  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true)
    await repo.deleteVideo(video.id)
    navigate('/')
  }

  return (
    <div className="vp">
      <main className="vp__main">
        <header className="vp__top">
          <div className="vp__brand">
            {isOwner && (
              <Link to="/" className="ds-hover vp__back" aria-label="Retour au dashboard" title="Retour au dashboard">
                <IconBack size={16} />
              </Link>
            )}
            {isOwner ? <Link to="/" aria-label="Dashboard" className="ds-hover"><Logo /></Link> : <Logo />}
          </div>
          {isOwner && (!published || leaving) ? (
            <div className={`vp__actions${leaving ? ' is-leaving' : ''}`}>
              <button className="ds-action ds-action--ghost" onClick={remove} onMouseLeave={() => setConfirmDelete(false)}>
                {confirmDelete ? 'Confirmer' : 'Supprimer'}
              </button>
              <button className="ds-action ds-action--green" onClick={publish} disabled={leaving}>Publier</button>
            </div>
          ) : (
            <div className="vp__actions is-entering">
              <button className="ds-action ds-action--green" onClick={isOwner ? () => setPanel(true) : clientShare}>Partager</button>
              <div className={`vp__copy${copied ? ' is-copied' : ''}`}>
                <button
                  className={`ds-link-dot vp__link${ready ? '' : ' is-muted'}`}
                  onClick={copyLink}
                  aria-label={ready ? 'Copier le lien' : 'Prévoir les personnes avant de copier le lien'}
                >
                  {copied ? <IconCheck size={12} /> : <IconLink size={12} />}
                </button>
                <span className="vp__tip" role="status">
                  {copied ? <><IconCheck size={10} />Lien copié</> : ready ? 'Copier le lien' : 'Ajoutez les personnes'}
                </span>
              </div>
            </div>
          )}
        </header>

        <section className="vp__card">
          <div className="vp__head">
            <div className="vp__title-row">
              <h1 className="vp__title">
                <InlineEdit value={video.title} readOnly={!isOwner} onSave={(title) => update({ title })} />
                {isOwner ? (
                  <button className="ds-accent-link vp__client" onClick={chooseClient}>
                    {clientLabel(client, clients) ?? 'Choisir un client'}
                  </button>
                ) : (
                  client && <span className="ds-accent-link vp__client">{clientLabel(client, clients)}</span>
                )}
              </h1>
              <ViewsChip video={video} />
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
              aspect={video.width && video.height ? video.width / video.height : undefined}
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
        author={isOwner ? owner.fullName : me?.name ?? (video.people?.length ? null : viewer)}
        profiles={isOwner || me ? undefined : video.people?.map((p) => p.name)}
        profile={isOwner || me ? null : video.people?.length ? viewer : null}
        onAuthorChange={(name) => {
          setViewer(name)
          if (video.people?.length) saveProfile(video.id, name)
          else saveViewerName(name)
          repo.setViewerName(viewerId(), name)
        }}
        nowLabel={now}
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

      {panel && isOwner && (
        <SharePanel
          video={video}
          onChange={update}
          onClose={() => setPanel(false)}
          onDelete={async () => {
            await repo.deleteVideo(video.id)
            navigate('/')
          }}
        />
      )}
    </div>
  )
}

/** Page client verrouillée : code d'accès, ou invitation nécessaire (vidéo privée). */
function AccessGate({ lock, onUnlock, onDone }: { lock: Lock; onUnlock: (code: string) => Promise<boolean>; onDone: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const isPrivate = lock.locked === 'private'
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true)
    const ok = await onUnlock(code)
    setBusy(false)
    if (ok) onDone()
    else setError(true)
  }
  return (
    <div className="gate">
      <div className="gate__logo"><Logo /></div>
      <div className="gate__card">
        <span className="gate__icon"><IconLock size={20} /></span>
        <h1 className="gate__title">{isPrivate ? 'Vidéo privée' : 'Vidéo protégée'}</h1>
        <p className="gate__text">
          {isPrivate && !lock.codeAllowed
            ? 'Cette vidéo est réservée aux personnes invitées. Ouvrez le lien personnel reçu par e-mail.'
            : isPrivate
              ? 'Ouvrez le lien personnel reçu par e-mail, ou entrez le code d’accès.'
              : 'Entrez le code d’accès pour regarder la vidéo.'}
        </p>
        {lock.codeAllowed && (
          <form className="gate__form" onSubmit={submit}>
            <input
              className={`gate__input${error ? ' is-error' : ''}`}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().replace(/\s/g, ''))
                setError(false)
              }}
              placeholder="Code"
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={32}
              aria-label="Code d’accès"
            />
            <button className="gate__submit" disabled={!code.trim() || busy}>{busy ? '...' : 'Valider'}</button>
          </form>
        )}
        {error && <p className="gate__error" role="alert">Code incorrect, vérifiez et réessayez.</p>}
      </div>
    </div>
  )
}
