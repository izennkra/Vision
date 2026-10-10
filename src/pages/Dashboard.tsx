import { useCallback, useEffect, useState, type DragEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { owner } from '../config'
import { repo, type Client, type ID, type Video } from '../data'
import { Logo } from '../components/Logo'
import { Thumbnail } from '../components/Thumbnail'
import { InlineEdit } from '../components/InlineEdit'
import { useContextMenu, type MenuItem } from '../components/ContextMenu'
import {
  IconCalendar, IconCaret, IconCheck, IconClock, IconEye, IconFolder, IconLink, IconPlus, IconProjects, IconSearch,
} from '../components/icons'
import { useInView } from '../hooks/useInView'
import { durationLabel, plural, shortDate, timeAgo } from '../lib/format'
import { downloadVideo, linkReady, shareUrl, useCopied } from '../lib/share'
import { folderTree, rootOf } from '../lib/clients'
import { useToast } from '../components/Toast'
import { NotificationBell } from '../components/NotificationBell'
import { TeamPanel } from '../components/TeamPanel'
import { Initials } from '../components/Initials'
import { OwnerAvatarButton } from '../components/OwnerAvatar'
import './dashboard.css'

const PAGE = 24
const DRAG_TYPE = 'application/x-visions-video'
/** Glisser un dossier pour changer son ordre (parmi les dossiers du même niveau). */
const FOLDER_TYPE = 'application/x-visions-folder'

export default function Dashboard() {
  const navigate = useNavigate()
  const openMenu = useContextMenu()
  const [params, setParams] = useSearchParams()
  const clientId = params.get('client')
  const [clients, setClients] = useState<Client[]>([])
  const [foldersOpen, setFoldersOpen] = useState(true)
  const [renamingClient, setRenamingClient] = useState<ID | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [videos, setVideos] = useState<Video[]>([])
  const [total, setTotal] = useState(0)
  const [next, setNext] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [reload, setReload] = useState(0)
  const [teamOf, setTeamOf] = useState<ID | null>(null)
  const [draggedFolder, setDraggedFolder] = useState<ID | null>(null)
  const [folderDrop, setFolderDrop] = useState<{ id: ID; after: boolean } | null>(null)
  const [sentinel, atEnd] = useInView<HTMLDivElement>('600px')

  const [loadError, setLoadError] = useState<string | null>(null)
  const refreshClients = useCallback(
    () => repo.listClients().then(setClients).catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Serveur injoignable')),
    [],
  )
  // L'enregistreur est chargé à part : on le prépare en avance pour que « Nouvelle vidéo » s'ouvre aussitôt.
  useEffect(() => {
    const t = window.setTimeout(() => void import('./Recorder'), 1200)
    return () => window.clearTimeout(t)
  }, [])
  useEffect(() => {
    refreshClients()
  }, [refreshClients])

  // Première page à chaque changement de filtre.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    repo.listVideos({ clientId, search, limit: PAGE }).then(
      (page) => {
        if (cancelled) return
        setVideos(page.items)
        setTotal(page.total)
        setNext(page.next)
        setLoading(false)
        setLoadError(null)
      },
      (e: unknown) => {
        if (cancelled) return
        // Plus jamais une page vide sans explication : on montre ce que répond le serveur.
        setLoading(false)
        setLoadError(e instanceof Error ? e.message : 'Serveur injoignable')
      },
    )
    return () => {
      cancelled = true
    }
  }, [clientId, search, reload])

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
  const selected = clients.find((c) => c.id === clientId) ?? null
  const team = clients.find((c) => c.id === teamOf) ?? null

  // --- Dossiers clients -------------------------------------------------------
  const createClient = async (parentId: ID | null = null) => {
    const c = await repo.createClient(parentId ? 'Nouveau client' : 'Nouveau dossier', parentId)
    setFoldersOpen(true)
    await refreshClients()
    setRenamingClient(c.id)
  }
  const renameClient = async (id: ID, name: string) => {
    await repo.renameClient(id, name)
    refreshClients()
  }
  const deleteClient = async (id: ID) => {
    await repo.deleteClient(id)
    if (clientId === id || rootOf(clientId, clients) === id) selectClient(null)
    await refreshClients()
    setReload((r) => r + 1)
  }
  const clientMenu = (e: React.MouseEvent, c: Client) =>
    openMenu(e, [
      { label: 'Ouvrir', onSelect: () => selectClient(c.id) },
      { label: 'Renommer', onSelect: () => setRenamingClient(c.id) },
      { label: 'Équipe…', onSelect: () => setTeamOf(c.id) },
      'separator',
      // Un seul niveau de sous-dossier : une agence et ses clients (« Elias Studio x Co-labs »).
      ...(c.parentId ? [] : [{ label: `Nouveau client de ${c.name}`, onSelect: () => createClient(c.id) }]),
      { label: 'Nouveau dossier', onSelect: () => createClient() },
      'separator',
      {
        label: c.parentId ? 'Supprimer' : 'Supprimer le dossier',
        confirm: 'Confirmer (les vidéos restent)',
        danger: true,
        onSelect: () => deleteClient(c.id),
      },
    ])

  // --- Vidéos -----------------------------------------------------------------
  const replaceVideo = (v: Video) => setVideos((list) => list.map((x) => (x.id === v.id ? v : x)))
  const moveVideo = async (videoId: ID, target: ID | null) => {
    await repo.updateVideo(videoId, { clientId: target })
    setReload((r) => r + 1)
  }
  const deleteVideo = async (v: Video) => {
    await repo.deleteVideo(v.id)
    setVideos((list) => list.filter((x) => x.id !== v.id))
    setTotal((t) => t - 1)
  }

  // Réordonner les dossiers : on dépose au-dessus ou en dessous d'un dossier du même niveau.
  const folderDragProps = (c: Client) => ({
    draggable: renamingClient !== c.id,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(FOLDER_TYPE, c.id)
      e.dataTransfer.effectAllowed = 'move'
      setDraggedFolder(c.id)
    },
    onDragEnd: () => {
      setDraggedFolder(null)
      setFolderDrop(null)
    },
  })
  const folderDropOver = (e: DragEvent, c: Client) => {
    const dragged = clients.find((x) => x.id === draggedFolder)
    if (!dragged || dragged.id === c.id || (dragged.parentId ?? null) !== (c.parentId ?? null)) return false
    e.preventDefault()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setFolderDrop({ id: c.id, after: e.clientY > r.top + r.height / 2 })
    return true
  }
  const dropFolder = async () => {
    const target = folderDrop
    const dragged = draggedFolder
    setFolderDrop(null)
    setDraggedFolder(null)
    if (!target || !dragged) return
    const rest = clients.filter((x) => x.id !== dragged)
    const at = rest.findIndex((x) => x.id === target.id) + (target.after ? 1 : 0)
    const next = [...rest.slice(0, at), clients.find((x) => x.id === dragged)!, ...rest.slice(at)]
    setClients(next.map((x, i) => ({ ...x, position: i })))
    await repo.reorderClients(next.map((x) => x.id))
  }

  // Glisser une carte sur un dossier pour l'y ranger.
  const dropProps = (key: string, target: ID | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
      e.preventDefault()
      setDropTarget(key)
    },
    onDragLeave: () => setDropTarget((k) => (k === key ? null : k)),
    onDrop: (e: DragEvent) => {
      const id = e.dataTransfer.getData(DRAG_TYPE)
      setDropTarget(null)
      if (id) moveVideo(id, target)
    },
  })

  return (
    <div className="dash">
      <div className="dash__logo"><Logo /></div>
      <div className="dash__top-right">
        <NotificationBell />
        <OwnerAvatarButton />
      </div>

      <aside className="dash__side">
        <button className="ds-btn-primary" onClick={() => navigate(clientId ? `/record?client=${clientId}` : '/record')}>
          Nouvelle vidéo
        </button>
        <nav className="dash__panel">
          <label className="ds-search">
            <IconSearch size={13} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Recherche..." />
          </label>
          <button
            className={`ds-nav-item ds-nav-item--main dash__all${clientId ? '' : ' is-active'}${dropTarget === 'all' ? ' is-drop-target' : ''}`}
            onClick={() => selectClient(null)}
            {...dropProps('all', null)}
          >
            <IconProjects size={14} />Tous les projets
          </button>
          <div className="dash__line" />
          <div className="dash__folder-row" onContextMenu={(e) => openMenu(e, [{ label: 'Nouveau dossier', onSelect: () => createClient() }])}>
            <button className="ds-folder" onClick={() => setFoldersOpen((o) => !o)}>
              <IconCaret open={foldersOpen} />Clients
            </button>
            <button className="dash__add ds-hover" onClick={() => createClient()} aria-label="Nouveau dossier" title="Nouveau dossier">
              <IconPlus size={10} />
            </button>
          </div>
          {foldersOpen &&
            folderTree(clients).map(({ client: c, depth }) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                title={depth ? 'Client de ' + clients.find((x) => x.id === c.parentId)?.name : 'Clic droit : ajouter un client, renommer, supprimer'}
                style={depth ? { paddingLeft: 9 + depth * 16 } : undefined}
                className={`ds-nav-item${depth ? ' ds-nav-item--sub' : ''}${clientId === c.id ? ' is-active' : ''}${dropTarget === c.id ? ' is-drop-target' : ''}${draggedFolder === c.id ? ' is-dragging' : ''}${folderDrop?.id === c.id ? (folderDrop.after ? ' is-drop-after' : ' is-drop-before') : ''}`}
                onClick={() => renamingClient !== c.id && selectClient(c.id)}
                onDoubleClick={() => setRenamingClient(c.id)}
                onContextMenu={(e) => clientMenu(e, c)}
                {...folderDragProps(c)}
                {...dropProps(c.id, c.id)}
                onDragOver={(e) => folderDropOver(e, c) || dropProps(c.id, c.id).onDragOver(e)}
                onDrop={(e) => (draggedFolder ? void dropFolder() : dropProps(c.id, c.id).onDrop(e))}
                onDragLeave={() => {
                  setFolderDrop((d) => (d?.id === c.id ? null : d))
                  setDropTarget((k) => (k === c.id ? null : k))
                }}
              >
                <IconFolder size={14} className="ds-nav-item__folder" />
                <InlineEdit
                  value={c.name}
                  editing={renamingClient === c.id}
                  onEditingChange={(v) => setRenamingClient(v ? c.id : null)}
                  onSave={(name) => renameClient(c.id, name)}
                  className="dash__client-name"
                  clickToEdit={false}
                />
              </div>
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
            {clients.filter((c) => !c.parentId).map((c) => (
              <button
                key={c.id}
                className={`ds-tab${clientId && rootOf(clientId, clients) === c.id ? ' is-active' : ''}`}
                onClick={() => selectClient(c.id)}
                onContextMenu={(e) => clientMenu(e, c)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="dash__bar-end">
            {selected && (
              <button className="dash__team ds-hover" onClick={() => setTeamOf(selected.id)} title={`Équipe ${selected.name} : qui regarde et commente`}>
                {(selected.people ?? []).length ? (
                  <span className="dash__team-faces">
                    {(selected.people ?? []).slice(0, 4).map((p) => <Initials key={p.id} name={p.name} person={p} />)}
                  </span>
                ) : null}
                {(selected.people ?? []).length ? 'Équipe' : 'Ajouter l’équipe'}
              </button>
            )}
            <span className="dash__count">{plural(total, 'Vidéo', 'Vidéos')}</span>
          </div>
        </div>

        {loadError && (
          <div className="dash__error" role="alert">
            <p>Impossible de charger tes vidéos pour le moment. Elles ne sont pas perdues : c’est la connexion au serveur qui échoue.</p>
            <p className="dash__error-detail">{loadError}</p>
            <button className="ds-hover dash__error-retry" onClick={() => (setLoadError(null), refreshClients(), setReload((r) => r + 1))}>Réessayer</button>
          </div>
        )}
        {!loading && !loadError && videos.length === 0 && (
          <p className="dash__empty">
            {search.trim()
              ? `Aucune vidéo ne correspond à « ${search.trim()} ».`
              : clientId
                ? 'Aucune vidéo dans ce dossier pour l’instant. Glisse une carte ici ou lance une nouvelle vidéo.'
                : 'Aucune vidéo pour l’instant. Clique sur « Nouvelle vidéo » pour enregistrer la première.'}
          </p>
        )}
        <div className="dash__grid">
          {videos.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              showClient={!clientId}
              clients={clients}
              onOpen={() => navigate(`/video/${v.id}`)}
              onChange={replaceVideo}
              onMove={(target) => moveVideo(v.id, target)}
              onDelete={() => deleteVideo(v)}
            />
          ))}
        </div>
        <div ref={sentinel} className="dash__sentinel" />
      </main>

      {team && (
        <TeamPanel
          client={team}
          clients={clients}
          onChange={(c) => setClients((list) => list.map((x) => (x.id === c.id ? c : x)))}
          onClose={() => setTeamOf(null)}
        />
      )}
    </div>
  )
}

interface CardProps {
  video: Video
  /** Affiche le dossier de la vidéo (onglet Récents). */
  showClient: boolean
  clients: Client[]
  onOpen: () => void
  onChange: (v: Video) => void
  onMove: (clientId: ID | null) => void
  onDelete: () => void
}

function VideoCard({ video, showClient, clients, onOpen, onChange, onMove, onDelete }: CardProps) {
  const openMenu = useContextMenu()
  const navigate = useNavigate()
  const toast = useToast()
  const [copied, flash] = useCopied()
  const client = clients.find((c) => c.id === video.clientId)
  const [renaming, setRenaming] = useState(false)
  const [dragging, setDragging] = useState(false)

  const ready = linkReady(video, clients)
  // Lien direct seulement si la vidéo est publiée et les personnes prévues ; sinon on ouvre le panneau « Partager ».
  const share = async () => {
    if (!ready) return navigate(`/video/${video.id}?partage=1`)
    await navigator.clipboard.writeText(shareUrl(video.shareToken))
    flash()
    toast('Lien copié')
  }
  const rename = async (title: string) => onChange(await repo.updateVideo(video.id, { title }))

  const menu: MenuItem[] = [
    { label: 'Ouvrir', onSelect: onOpen },
    { label: ready ? 'Copier le lien' : 'Partager...', onSelect: share },
    { label: 'Renommer', onSelect: () => setRenaming(true) },
    {
      label: 'Déplacer vers',
      children: [
        ...folderTree(clients).map(({ client: c, depth }) => ({
          label: `${depth ? '↳ ' : ''}${c.name}`,
          checked: c.id === video.clientId,
          onSelect: () => onMove(c.id),
        })),
        'separator' as const,
        { label: 'Aucun dossier', muted: video.clientId === null, onSelect: () => onMove(null) },
      ],
    },
    ...(video.chunkCount > 0 ? [{ label: 'Télécharger', onSelect: () => downloadVideo(video) }] : []),
    {
      label: video.archived ? 'Désarchiver' : 'Archiver',
      onSelect: async () => {
        toast(video.archived ? 'Désarchivage…' : 'Archivage…')
        try {
          onChange(await repo.setArchived(video.id, !video.archived))
          toast(video.archived ? 'Vidéo désarchivée' : 'Vidéo archivée : stockage moins cher, toujours lisible')
        } catch {
          toast('Impossible pour le moment, réessayez')
        }
      },
    },
    'separator',
    { label: 'Supprimer', confirm: 'Confirmer la suppression', danger: true, onSelect: onDelete },
  ]

  return (
    <article
      className={`dash__item${dragging ? ' is-dragging' : ''}`}
      draggable={!renaming}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, video.id)
        e.dataTransfer.effectAllowed = 'move'
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      onContextMenu={(e) => openMenu(e, menu)}
    >
      <div className="ds-card" onClick={() => !renaming && onOpen()}>
        <div className="ds-card__thumb">
          <Thumbnail thumbKey={video.thumbnailKey} />
          {video.archived && <span className="dash__draft dash__archived" title="Stockage moins cher ; la vidéo reste lisible">Archivée</span>}
          {!video.archived && video.status !== 'published' && (
            <span className="dash__draft" title="Pas encore partagée : le client ne peut pas la voir">Brouillon</span>
          )}
          <button
            className={`ds-link-dot${ready ? '' : ' is-muted'}`}
            aria-label={ready ? 'Copier le lien' : 'Partager'}
            title={copied ? 'Lien copié' : ready ? 'Copier le lien' : 'Partager : prévoir les personnes'}
            onClick={(e) => {
              e.stopPropagation()
              share()
            }}
          >
            {copied ? <IconCheck size={12} /> : <IconLink size={12} />}
          </button>
        </div>
        <div className="ds-card__meta">
          <div className="ds-card__title" onClick={(e) => renaming && e.stopPropagation()}>
            {renaming ? (
              <InlineEdit value={video.title} editing onEditingChange={setRenaming} onSave={rename} />
            ) : (
              video.title
            )}
          </div>
          <div className="ds-card__age">
            {timeAgo(video.createdAt)}
            {showClient && client && <span className="dash__card-client"> · {client.name}</span>}
          </div>
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
