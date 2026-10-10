// Implémentation « en ligne » de la couche de stockage : serveur Cloudflare (D1 + R2).
// Même interface que le stockage local : les écrans ne changent pas.
//
// Pendant l'enregistrement, chaque morceau de 8 Mo est d'abord gardé dans le navigateur
// (sécurité si la connexion coupe), puis envoyé en arrière-plan, avec nouvelles tentatives.
// À l'arrêt, il ne reste que les derniers morceaux à envoyer : la vidéo est en ligne en quelques secondes.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { api, ApiError, mediaHref } from '../../lib/api'
import type { Repository, SharedResult, VideoPatch, VideoQuery } from '../repository'
import { blobToBase64 } from '../../recorder/speech'
import type { AppNotification, Client, Comment, ID, Page, PersonInput, Quality, Transcript, Video, View } from '../types'

interface CacheDB extends DBSchema {
  parts: { key: [ID, number]; value: { videoId: ID; index: number; data: Blob; savedAt: number }; indexes: { byVideo: ID } }
}

const KEEP_LOCAL_MS = 3 * 24 * 3600_000
const grantKey = (token: string) => `visions:grant:${token}`
const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* navigation privée : non mémorisé */
    }
  },
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type VideoWithUrl = Video & { playbackUrl?: string; qualities?: Quality[] }
const absolute = (list: Quality[] | undefined) => (list ?? []).map((q) => ({ ...q, url: mediaHref(q.url) }))

export class RemoteRepository implements Repository {
  private cache: Promise<IDBPDatabase<CacheDB>>
  private uploads = new Map<ID, Promise<void>>()
  private audioUploads = new Map<ID, Promise<void>>()
  private failures = new Map<ID, unknown>()
  private playback = new Map<ID, string>()
  private qualities = new Map<ID, Quality[]>()
  private tokens = new Map<ID, string>()
  /** Lien personnel (?p=) utilisé pour ouvrir chaque page client. */
  private keys = new Map<string, string>()

  constructor() {
    this.cache = openDB<CacheDB>('visions-cache', 1, {
      upgrade(db) {
        db.createObjectStore('parts', { keyPath: ['videoId', 'index'] }).createIndex('byVideo', 'videoId')
      },
    }).then(async (db) => {
      // Copies locales des morceaux : gardées 3 jours (secours), puis supprimées.
      const tx = db.transaction('parts', 'readwrite')
      let c = await tx.store.openCursor()
      while (c) {
        if (Date.now() - c.value.savedAt > KEEP_LOCAL_MS) await c.delete()
        c = await c.continue()
      }
      await tx.done
      return db
    })
  }

  /** Page client (lien de partage) : les appels passent par le jeton de la vidéo. */
  private clientToken(videoId: ID) {
    return location.pathname.startsWith('/v/') ? this.tokens.get(videoId) ?? null : null
  }

  /** Preuves d'accès d'une page client : lien personnel et/ou code déjà saisi. */
  private shareHeaders(token: string) {
    const h: Record<string, string> = {}
    const key = this.keys.get(token)
    const grant = store.get(grantKey(token))
    if (key) h['x-share-key'] = key
    if (grant) h['x-share-grant'] = grant
    return h
  }

  private share<T>(token: string, path: string, init: RequestInit & { json?: unknown } = {}) {
    return api<T>(`share/${token}${path}`, { ...init, headers: { ...this.shareHeaders(token), ...(init.headers as Record<string, string>) } })
  }

  private lastToken() {
    return [...this.tokens.values()].pop()
  }

  // --- Dossiers ------------------------------------------------------------------------------
  listClients() {
    return api<Client[]>('clients')
  }
  createClient(name: string, parentId: ID | null = null) {
    return api<Client>('clients', { method: 'POST', json: { name, parentId } })
  }
  renameClient(id: ID, name: string) {
    return api<Client>(`clients/${id}`, { method: 'PATCH', json: { name } })
  }
  setClientPeople(id: ID, people: PersonInput[]) {
    return api<Client>(`clients/${id}`, { method: 'PATCH', json: { people } })
  }
  async uploadAvatar(personId: ID, image: Blob) {
    const { url } = await api<{ url: string }>(`avatars/${personId}`, { method: 'PUT', body: image, headers: { 'content-type': image.type || 'image/jpeg' } })
    return url
  }
  async deleteClient(id: ID) {
    await api(`clients/${id}`, { method: 'DELETE' })
  }

  // --- Vidéos --------------------------------------------------------------------------------
  listVideos({ clientId, search, cursor, limit = 24 }: VideoQuery) {
    const q = new URLSearchParams({ limit: String(limit) })
    if (clientId) q.set('clientId', clientId)
    if (search?.trim()) q.set('search', search.trim())
    if (cursor) q.set('cursor', cursor)
    return api<Page<Video>>(`videos?${q}`)
  }

  async getVideo(id: ID) {
    try {
      const v = await api<VideoWithUrl>(`videos/${id}`)
      if (v.playbackUrl) this.playback.set(id, mediaHref(v.playbackUrl))
      this.qualities.set(id, absolute(v.qualities))
      return v
    } catch {
      return null
    }
  }

  async getShared(token: string, key?: string | null): Promise<SharedResult | null> {
    if (key) this.keys.set(token, key)
    try {
      const r = await this.share<{ video: Video; clients: Client[]; playbackUrl: string; qualities?: Quality[]; me: { id: ID; name: string } | null }>(token, '')
      this.tokens.set(r.video.id, token)
      this.playback.set(r.video.id, mediaHref(r.playbackUrl))
      this.qualities.set(r.video.id, absolute(r.qualities))
      return { video: r.video, clients: r.clients, me: r.me }
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && (e.data.locked === 'code' || e.data.locked === 'private'))
        return { locked: e.data.locked, codeAllowed: !!e.data.codeAllowed }
      return null
    }
  }

  async unlockShare(token: string, code: string) {
    try {
      const { grant } = await api<{ grant: string }>(`share/${token}/unlock`, { method: 'POST', json: { code } })
      store.set(grantKey(token), grant)
      return true
    } catch {
      return false
    }
  }

  updateVideo(id: ID, patch: VideoPatch) {
    return api<Video>(`videos/${id}`, { method: 'PATCH', json: patch })
  }

  async deleteVideo(id: ID) {
    await api(`videos/${id}`, { method: 'DELETE' })
    await this.clearLocal(id)
  }

  // --- Enregistrement ------------------------------------------------------------------------
  startRecording(init: { title: string; clientId: ID | null; mimeType: string }) {
    return api<Video>('videos', { method: 'POST', json: init })
  }

  async appendChunk(videoId: ID, index: number, data: Blob) {
    const db = await this.cache
    await db.put('parts', { videoId, index, data, savedAt: Date.now() })
    // Envoi en arrière-plan, l'un après l'autre ; l'encodeur n'attend pas le réseau.
    const previous = this.uploads.get(videoId) ?? Promise.resolve()
    const next = previous.then(() => this.uploadPart(videoId, index, data))
    this.uploads.set(videoId, next.catch((e) => void this.failures.set(videoId, e)))
  }

  private async uploadPart(videoId: ID, index: number, data: Blob) {
    for (let attempt = 0; ; attempt++) {
      try {
        await api(`videos/${videoId}/parts/${index}`, { method: 'PUT', body: data })
        return
      } catch (e) {
        // Vidéo supprimée (« Recommencer ») ou refusée : inutile d'insister.
        if (e instanceof ApiError && [400, 401, 403, 404, 409].includes(e.status)) throw e
        if (attempt >= 9) throw e // ~ 8 minutes de tentatives au total
        await sleep(Math.min(60_000, 1000 * 2 ** attempt))
      }
    }
  }

  async getChunk(videoId: ID, index: number) {
    return (await (await this.cache).get('parts', [videoId, index]))?.data ?? null
  }

  async finishRecording(
    videoId: ID,
    info: { duration: number; thumbnail: Blob | null; width?: number; height?: number; audioChunks?: number },
  ) {
    await this.uploads.get(videoId)
    const failure = this.failures.get(videoId)
    if (failure) throw new Error('La mise en ligne a échoué. La vidéo est gardée dans ce navigateur, réessaie plus tard.')
    if (info.thumbnail) await api(`videos/${videoId}/thumbnail`, { method: 'PUT', body: info.thumbnail }).catch(() => {})
    const { thumbnail: _, ...rest } = info
    void _
    return api<Video>(`videos/${videoId}/complete`, { method: 'POST', json: rest })
  }

  // --- Transcription -------------------------------------------------------------------------
  appendAudio(videoId: ID, index: number, start: number, wav: Blob, voices?: string) {
    // L'une après l'autre, en arrière-plan, avec nouvelles tentatives ; n'attend jamais l'enregistrement.
    const previous = this.audioUploads.get(videoId) ?? Promise.resolve()
    const next = previous.then(async () => {
      const audio = await blobToBase64(wav)
      for (let attempt = 0; ; attempt++) {
        try {
          await api(`videos/${videoId}/audio/${index}?start=${start.toFixed(3)}`, { method: 'PUT', body: audio, headers: { 'content-type': 'text/plain', ...(voices ? { 'x-voices': voices } : {}) } })
          return
        } catch (e) {
          if (e instanceof ApiError && [400, 401, 403, 404, 413].includes(e.status)) return
          if (attempt >= 6) return
          await sleep(Math.min(30_000, 1000 * 2 ** attempt))
        }
      }
    })
    this.audioUploads.set(videoId, next)
  }

  getTranscript(videoId: ID, lang?: string | null) {
    const token = this.clientToken(videoId)
    const q = lang ? `?lang=${encodeURIComponent(lang)}` : ''
    return token ? this.share<Transcript>(token, `/transcript${q}`) : api<Transcript>(`videos/${videoId}/transcript${q}`)
  }

  retryTranscript(videoId: ID) {
    return api<Transcript>(`videos/${videoId}/transcript/retry`, { method: 'POST' })
  }

  // --- Qualités et archivage -----------------------------------------------------------------
  async getQualities(videoId: ID) {
    if (!this.qualities.has(videoId)) await this.getVideo(videoId)
    return this.qualities.get(videoId) ?? []
  }

  async getLocalFile(videoId: ID) {
    const parts = await (await this.cache).getAllFromIndex('parts', 'byVideo', videoId)
    if (!parts.length) return null
    parts.sort((a, b) => a.index - b.index)
    // Seulement si tous les morceaux sont là (sinon on lira l'original en ligne).
    if (parts.some((p, i) => p.index !== i)) return null
    const video = await this.getVideo(videoId)
    if (!video || video.chunkCount !== parts.length) return null
    return new Blob(parts.map((p) => p.data), { type: 'video/mp4' })
  }

  async startRendition(videoId: ID, quality: number) {
    await api(`videos/${videoId}/renditions/${quality}`, { method: 'POST' })
  }

  async appendRenditionPart(videoId: ID, quality: number, index: number, data: Blob) {
    for (let attempt = 0; ; attempt++) {
      try {
        await api(`videos/${videoId}/renditions/${quality}/parts/${index}`, { method: 'PUT', body: data })
        return
      } catch (e) {
        if ((e instanceof ApiError && [400, 401, 403, 404, 409].includes(e.status)) || attempt >= 6) throw e
        await sleep(Math.min(30_000, 1000 * 2 ** attempt))
      }
    }
  }

  async completeRendition(videoId: ID, quality: number) {
    const { qualities } = await api<{ qualities: Quality[] }>(`videos/${videoId}/renditions/${quality}/complete`, { method: 'POST' })
    const list = absolute(qualities)
    this.qualities.set(videoId, list)
    return list
  }

  async setArchived(videoId: ID, archived: boolean) {
    const v = await api<Video>(`videos/${videoId}/${archived ? 'archive' : 'unarchive'}`, { method: 'POST' })
    this.qualities.delete(videoId)
    this.playback.delete(videoId)
    return v
  }

  // --- Lecture -------------------------------------------------------------------------------
  async getThumbnail(key: string) {
    const res = await fetch(mediaHref(key))
    return res.ok ? res.blob() : null
  }

  async getPlaybackUrl(videoId: ID) {
    if (!this.playback.has(videoId)) await this.getVideo(videoId)
    return this.playback.get(videoId) ?? ''
  }

  async getDownloadUrl(videoId: ID) {
    // Juste après l'enregistrement, le fichier est encore dans le navigateur : pas besoin de le retélécharger.
    const parts = await (await this.cache).getAllFromIndex('parts', 'byVideo', videoId)
    if (parts.length) {
      parts.sort((a, b) => a.index - b.index)
      return URL.createObjectURL(new Blob(parts.map((p) => p.data), { type: 'video/mp4' }))
    }
    const { url } = await api<{ url: string }>(`videos/${videoId}/download`)
    return mediaHref(url)
  }

  private async clearLocal(videoId: ID) {
    const db = await this.cache
    const tx = db.transaction('parts', 'readwrite')
    let c = await tx.store.index('byVideo').openCursor(videoId)
    while (c) {
      await c.delete()
      c = await c.continue()
    }
    await tx.done
  }

  // --- Commentaires --------------------------------------------------------------------------
  listComments(videoId: ID) {
    const token = this.clientToken(videoId)
    return token ? this.share<Comment[]>(token, '/comments') : api<Comment[]>(`videos/${videoId}/comments`)
  }

  addComment(input: Omit<Comment, 'id' | 'createdAt'>) {
    const token = this.clientToken(input.videoId)
    return token
      ? this.share<Comment>(token, '/comments', { method: 'POST', json: input })
      : api<Comment>(`videos/${input.videoId}/comments`, { method: 'POST', json: input })
  }

  async deleteComment(id: ID) {
    await api(`comments/${id}`, { method: 'DELETE' })
  }

  // --- Vues ----------------------------------------------------------------------------------
  recordView(view: Omit<View, 'id'>) {
    const token = this.tokens.get(view.videoId)
    if (!token) return Promise.resolve({ ...view, id: '' })
    return this.share<View>(token, '/views', { method: 'POST', json: view })
  }

  async updateView(id: ID, watchedRatio: number) {
    const token = this.lastToken()
    if (token && id) await this.share(token, `/views/${id}`, { method: 'PATCH', json: { watchedRatio } })
  }

  listViews(videoId: ID) {
    const token = this.clientToken(videoId)
    return token ? this.share<View[]>(token, '/views') : api<View[]>(`videos/${videoId}/views`)
  }

  async setViewerName(viewerId: string, name: string) {
    const token = this.lastToken()
    if (token) await this.share(token, '/viewer', { method: 'POST', json: { viewerId, name } })
  }

  // --- Notifications -------------------------------------------------------------------------
  listNotifications() {
    return api<{ items: AppNotification[]; unread: number }>('notifications')
  }

  async markNotificationsRead(ids?: ID[]) {
    await api('notifications/read', { method: 'POST', json: { ids } })
  }
}
