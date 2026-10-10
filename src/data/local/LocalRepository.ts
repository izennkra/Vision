// Implémentation locale de la couche de stockage (étape 1) : IndexedDB du navigateur.
// Les métadonnées, les morceaux de vidéo et les vignettes sont dans des magasins séparés :
// lister le dashboard ne charge jamais de fichier vidéo.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Repository, VideoQuery } from '../repository'
import type { AppNotification, Client, Comment, ID, Page, Video, VideoChunk, View } from '../types'
import { owner } from '../../config'
import { seed } from './seed'

interface VisionsDB extends DBSchema {
  clients: { key: ID; value: Client }
  videos: { key: ID; value: Video; indexes: { byCreatedAt: string; byShareToken: string } }
  chunks: { key: [ID, number]; value: VideoChunk; indexes: { byVideo: ID } }
  thumbnails: { key: string; value: { key: string; data: Blob } }
  comments: { key: ID; value: Comment; indexes: { byVideo: ID } }
  views: { key: ID; value: View; indexes: { byVideo: ID; byViewer: string } }
  meta: { key: string; value: { key: string; value: unknown } }
  notifications: { key: ID; value: AppNotification; indexes: { byCreatedAt: string } }
}

const DB_NAME = 'visions'
const DEFAULT_LIMIT = 24

export const newId = () => crypto.randomUUID()
const now = () => new Date().toISOString()

function createStores(db: IDBPDatabase<VisionsDB>) {
  db.createObjectStore('clients', { keyPath: 'id' })
  const videos = db.createObjectStore('videos', { keyPath: 'id' })
  videos.createIndex('byCreatedAt', 'createdAt')
  videos.createIndex('byShareToken', 'shareToken', { unique: true })
  const chunks = db.createObjectStore('chunks', { keyPath: ['videoId', 'index'] })
  chunks.createIndex('byVideo', 'videoId')
  db.createObjectStore('thumbnails', { keyPath: 'key' })
  db.createObjectStore('comments', { keyPath: 'id' }).createIndex('byVideo', 'videoId')
  db.createObjectStore('views', { keyPath: 'id' }).createIndex('byVideo', 'videoId')
  db.createObjectStore('meta', { keyPath: 'key' })
}

/** Le dossier et tous ses sous-dossiers. */
export function withDescendants(id: ID, clients: Client[]): Set<ID> {
  const ids = new Set<ID>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const c of clients)
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id)
        grew = true
      }
  }
  return ids
}

export class LocalRepository implements Repository {
  private dbp: Promise<IDBPDatabase<VisionsDB>>
  private playbackUrls = new Map<ID, string>()

  constructor() {
    this.dbp = openDB<VisionsDB>(DB_NAME, 3, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) createStores(db)
        // v2 : sous-dossiers (parentId) et regroupement des vues par navigateur (viewerId).
        if (oldVersion < 2) {
          if (oldVersion >= 1) {
            let c = await tx.objectStore('clients').openCursor()
            while (c) {
              await c.update({ ...c.value, parentId: c.value.parentId ?? null })
              c = await c.continue()
            }
            let v = await tx.objectStore('views').openCursor()
            while (v) {
              await v.update({ ...v.value, viewerId: v.value.viewerId ?? v.value.id })
              v = await v.continue()
            }
          }
          tx.objectStore('views').createIndex('byViewer', 'viewerId')
        }
        // v3 : notifications (vues et commentaires des clients).
        if (oldVersion < 3) db.createObjectStore('notifications', { keyPath: 'id' }).createIndex('byCreatedAt', 'createdAt')
      },
    }).then(async (db) => {
      // Données de test, insérées une seule fois.
      if (!(await db.get('meta', 'seeded'))) {
        const data = seed()
        const tx = db.transaction(['clients', 'videos', 'comments', 'views', 'meta'], 'readwrite')
        for (const v of data.views) tx.objectStore('views').put(v)
        for (const c of data.clients) tx.objectStore('clients').put(c)
        for (const v of data.videos) tx.objectStore('videos').put(v)
        for (const c of data.comments) tx.objectStore('comments').put(c)
        tx.objectStore('meta').put({ key: 'seeded', value: true })
        await tx.done
      }
      return db
    })
  }

  // --- Clients --------------------------------------------------------------
  async listClients() {
    const clients = await (await this.dbp).getAll('clients')
    return clients.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async createClient(name: string, parentId: ID | null = null) {
    const client: Client = { id: newId(), name, parentId, createdAt: now() }
    await (await this.dbp).put('clients', client)
    return client
  }

  async renameClient(id: ID, name: string) {
    const db = await this.dbp
    const client = await db.get('clients', id)
    if (!client) throw new Error('Dossier introuvable')
    const updated = { ...client, name }
    await db.put('clients', updated)
    return updated
  }

  async deleteClient(id: ID) {
    const db = await this.dbp
    const ids = withDescendants(id, await db.getAll('clients'))
    const tx = db.transaction(['clients', 'videos'], 'readwrite')
    for (const x of ids) tx.objectStore('clients').delete(x)
    let c = await tx.objectStore('videos').openCursor()
    while (c) {
      if (c.value.clientId && ids.has(c.value.clientId)) await c.update({ ...c.value, clientId: null })
      c = await c.continue()
    }
    await tx.done
  }

  // --- Vidéos ---------------------------------------------------------------
  /** Parcourt l'index par date décroissante et s'arrête dès que la page est pleine. */
  async listVideos({ clientId, search, cursor, limit = DEFAULT_LIMIT }: VideoQuery): Promise<Page<Video>> {
    const db = await this.dbp
    const needle = search?.trim().toLowerCase() ?? ''
    const folder = clientId == null ? null : withDescendants(clientId, await db.getAll('clients'))
    const matches = (v: Video) =>
      v.status !== 'recording' &&
      (folder == null || (v.clientId != null && folder.has(v.clientId))) &&
      (!needle || v.title.toLowerCase().includes(needle))

    const items: Video[] = []
    let total = 0
    let next: string | null = null
    const range = cursor ? IDBKeyRange.upperBound(cursor, true) : undefined
    let c = await db.transaction('videos').store.index('byCreatedAt').openCursor(range, 'prev')
    while (c) {
      if (matches(c.value)) {
        if (items.length < limit) items.push(c.value)
        else if (!next) next = items[items.length - 1].createdAt
        total++
      }
      c = await c.continue()
    }
    if (cursor) total += await this.countBefore(cursor, matches)
    return { items, next, total }
  }

  private async countBefore(cursor: string, matches: (v: Video) => boolean) {
    const db = await this.dbp
    let n = 0
    let c = await db.transaction('videos').store.index('byCreatedAt').openCursor(IDBKeyRange.lowerBound(cursor))
    while (c) {
      if (matches(c.value)) n++
      c = await c.continue()
    }
    return n
  }

  async getVideo(id: ID) {
    return (await (await this.dbp).get('videos', id)) ?? null
  }

  async getShared(token: string) {
    const db = await this.dbp
    const video = await db.getFromIndex('videos', 'byShareToken', token)
    if (!video || video.status !== 'published') return null
    const clients: Client[] = []
    const own = video.clientId ? await db.get('clients', video.clientId) : undefined
    if (own) {
      clients.push(own)
      const parent = own.parentId ? await db.get('clients', own.parentId) : undefined
      if (parent) clients.push(parent)
    }
    return { video, clients }
  }

  async updateVideo(id: ID, patch: Partial<Pick<Video, 'title' | 'description' | 'clientId' | 'status'>>) {
    const db = await this.dbp
    const video = await db.get('videos', id)
    if (!video) throw new Error('Vidéo introuvable')
    const updated = { ...video, ...patch, updatedAt: now() }
    await db.put('videos', updated)
    return updated
  }

  async deleteVideo(id: ID) {
    const db = await this.dbp
    const video = await db.get('videos', id)
    const tx = db.transaction(['videos', 'chunks', 'thumbnails', 'comments', 'views'], 'readwrite')
    tx.objectStore('videos').delete(id)
    tx.objectStore('chunks').delete(IDBKeyRange.bound([id, 0], [id, Infinity]))
    if (video?.thumbnailKey) tx.objectStore('thumbnails').delete(video.thumbnailKey)
    for (const store of ['comments', 'views'] as const) {
      let c = await tx.objectStore(store).index('byVideo').openCursor(id)
      while (c) {
        await c.delete()
        c = await c.continue()
      }
    }
    await tx.done
    this.revokePlayback(id)
  }

  // --- Enregistrement par morceaux -------------------------------------------
  async startRecording({ title, clientId, mimeType }: { title: string; clientId: ID | null; mimeType: string }) {
    const video: Video = {
      id: newId(),
      title,
      description: '',
      clientId,
      duration: 0,
      createdAt: now(),
      updatedAt: now(),
      status: 'recording',
      shareToken: newId().replace(/-/g, '').slice(0, 12),
      mimeType,
      size: 0,
      chunkCount: 0,
      thumbnailKey: null,
      viewCount: 0,
      commentCount: 0,
    }
    await (await this.dbp).put('videos', video)
    return video
  }

  async appendChunk(videoId: ID, index: number, data: Blob) {
    const db = await this.dbp
    const tx = db.transaction(['chunks', 'videos'], 'readwrite')
    const previous = await tx.objectStore('chunks').get([videoId, index])
    tx.objectStore('chunks').put({ videoId, index, size: data.size, data })
    const video = await tx.objectStore('videos').get(videoId)
    if (video) {
      video.size += data.size - (previous?.size ?? 0)
      video.chunkCount = Math.max(video.chunkCount, index + 1)
      tx.objectStore('videos').put(video)
    }
    await tx.done
  }

  async finishRecording(
    videoId: ID,
    { duration, thumbnail, width, height }: { duration: number; thumbnail: Blob | null; width?: number; height?: number },
  ) {
    const db = await this.dbp
    const video = await db.get('videos', videoId)
    if (!video) throw new Error('Vidéo introuvable')
    if (thumbnail) {
      const key = `thumb-${videoId}`
      await db.put('thumbnails', { key, data: thumbnail })
      video.thumbnailKey = key
    }
    const done: Video = { ...video, duration, width, height, status: 'draft', updatedAt: now() }
    await db.put('videos', done)
    return done
  }

  async getChunk(videoId: ID, index: number) {
    return (await (await this.dbp).get('chunks', [videoId, index]))?.data ?? null
  }

  /** Assemble les morceaux en un seul fichier (pour le téléchargement local). */
  async getVideoFile(videoId: ID): Promise<Blob | null> {
    const db = await this.dbp
    const video = await db.get('videos', videoId)
    if (!video || video.chunkCount === 0) return null
    const chunks = await db.getAllFromIndex('chunks', 'byVideo', videoId)
    chunks.sort((a, b) => a.index - b.index)
    return new Blob(chunks.map((c) => c.data), { type: video.mimeType })
  }

  // --- Lecture --------------------------------------------------------------
  async getThumbnail(key: string) {
    return (await (await this.dbp).get('thumbnails', key))?.data ?? null
  }

  async getDownloadUrl(videoId: ID) {
    const file = await this.getVideoFile(videoId)
    if (file) return URL.createObjectURL(file)
    return (await this.getVideo(videoId))?.sampleUrl ?? null
  }

  async getPlaybackUrl(videoId: ID) {
    const cached = this.playbackUrls.get(videoId)
    if (cached) return cached
    const file = await this.getVideoFile(videoId)
    const video = await this.getVideo(videoId)
    const url = file ? URL.createObjectURL(file) : (video?.sampleUrl ?? '')
    this.playbackUrls.set(videoId, url)
    return url
  }

  private revokePlayback(videoId: ID) {
    const url = this.playbackUrls.get(videoId)
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    this.playbackUrls.delete(videoId)
  }

  // --- Commentaires ---------------------------------------------------------
  async listComments(videoId: ID) {
    const comments = await (await this.dbp).getAllFromIndex('comments', 'byVideo', videoId)
    return comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async addComment(input: Omit<Comment, 'id' | 'createdAt'>) {
    const db = await this.dbp
    const comment: Comment = { ...input, id: newId(), createdAt: now() }
    const tx = db.transaction(['comments', 'videos', 'notifications'], 'readwrite')
    tx.objectStore('comments').put(comment)
    const video = await tx.objectStore('videos').get(input.videoId)
    if (video) tx.objectStore('videos').put({ ...video, commentCount: video.commentCount + 1 })
    if (video && input.authorName !== owner.fullName)
      tx.objectStore('notifications').put(this.notification('comment', video, input.authorName, input.text.slice(0, 140)))
    await tx.done
    return comment
  }

  async deleteComment(id: ID) {
    const db = await this.dbp
    const comment = await db.get('comments', id)
    if (!comment) return
    const all = await db.getAllFromIndex('comments', 'byVideo', comment.videoId)
    const ids = [id, ...all.filter((c) => c.parentId === id).map((c) => c.id)]
    const tx = db.transaction(['comments', 'videos'], 'readwrite')
    for (const x of ids) tx.objectStore('comments').delete(x)
    const video = await tx.objectStore('videos').get(comment.videoId)
    if (video) tx.objectStore('videos').put({ ...video, commentCount: Math.max(0, video.commentCount - ids.length) })
    await tx.done
  }

  // --- Vues -----------------------------------------------------------------
  async recordView(input: Omit<View, 'id'>) {
    const db = await this.dbp
    const view: View = { ...input, id: newId() }
    const tx = db.transaction(['views', 'videos', 'notifications'], 'readwrite')
    tx.objectStore('views').put(view)
    const video = await tx.objectStore('videos').get(input.videoId)
    if (video) {
      tx.objectStore('videos').put({ ...video, viewCount: video.viewCount + 1 })
      tx.objectStore('notifications').put(this.notification('view', video, input.viewer))
    }
    await tx.done
    return view
  }

  async updateView(id: ID, watchedRatio: number) {
    const db = await this.dbp
    const view = await db.get('views', id)
    if (view && watchedRatio > view.watchedRatio) await db.put('views', { ...view, watchedRatio })
  }

  async listViews(videoId: ID) {
    const views = await (await this.dbp).getAllFromIndex('views', 'byVideo', videoId)
    return views.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  private notification(type: AppNotification['type'], video: Video, actor: string, text: string | null = null): AppNotification {
    return { id: newId(), type, videoId: video.id, videoTitle: video.title, actor, text, createdAt: now(), read: false }
  }

  async listNotifications() {
    const all = await (await this.dbp).getAllFromIndex('notifications', 'byCreatedAt')
    const items = all.reverse().slice(0, 50)
    return { items, unread: all.filter((n) => !n.read).length }
  }

  async markNotificationsRead(ids?: ID[]) {
    const db = await this.dbp
    const tx = db.transaction('notifications', 'readwrite')
    for (const n of await tx.store.getAll()) if (!n.read && (!ids || ids.includes(n.id))) await tx.store.put({ ...n, read: true })
    await tx.done
  }

  async setViewerName(viewerId: string, name: string) {
    const db = await this.dbp
    const tx = db.transaction('views', 'readwrite')
    let c = await tx.store.index('byViewer').openCursor(viewerId)
    while (c) {
      await c.update({ ...c.value, viewer: name })
      c = await c.continue()
    }
    await tx.done
  }
}
