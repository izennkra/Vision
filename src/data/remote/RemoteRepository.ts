// Implémentation « en ligne » de la couche de stockage : serveur Cloudflare (D1 + R2).
// Même interface que le stockage local : les écrans ne changent pas.
//
// Pendant l'enregistrement, chaque morceau de 8 Mo est d'abord gardé dans le navigateur
// (sécurité si la connexion coupe), puis envoyé en arrière-plan, avec nouvelles tentatives.
// À l'arrêt, il ne reste que les derniers morceaux à envoyer : la vidéo est en ligne en quelques secondes.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { api, ApiError, mediaHref } from '../../lib/api'
import type { Repository, VideoQuery } from '../repository'
import type { AppNotification, Client, Comment, ID, Page, Video, View } from '../types'

interface CacheDB extends DBSchema {
  parts: { key: [ID, number]; value: { videoId: ID; index: number; data: Blob; savedAt: number }; indexes: { byVideo: ID } }
}

const KEEP_LOCAL_MS = 3 * 24 * 3600_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type VideoWithUrl = Video & { playbackUrl?: string }

export class RemoteRepository implements Repository {
  private cache: Promise<IDBPDatabase<CacheDB>>
  private uploads = new Map<ID, Promise<void>>()
  private failures = new Map<ID, unknown>()
  private playback = new Map<ID, string>()
  private tokens = new Map<ID, string>()

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
      return v
    } catch {
      return null
    }
  }

  async getShared(token: string) {
    try {
      const r = await api<{ video: Video; clients: Client[]; playbackUrl: string }>(`share/${token}`)
      this.tokens.set(r.video.id, token)
      this.playback.set(r.video.id, mediaHref(r.playbackUrl))
      return { video: r.video, clients: r.clients }
    } catch {
      return null
    }
  }

  updateVideo(id: ID, patch: Partial<Pick<Video, 'title' | 'description' | 'clientId' | 'status'>>) {
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
    info: { duration: number; thumbnail: Blob | null; width?: number; height?: number },
  ) {
    await this.uploads.get(videoId)
    const failure = this.failures.get(videoId)
    if (failure) throw new Error('La mise en ligne a échoué. La vidéo est gardée dans ce navigateur, réessaie plus tard.')
    if (info.thumbnail) await api(`videos/${videoId}/thumbnail`, { method: 'PUT', body: info.thumbnail }).catch(() => {})
    const { thumbnail: _, ...rest } = info
    void _
    return api<Video>(`videos/${videoId}/complete`, { method: 'POST', json: rest })
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
    return api<Comment[]>(token ? `share/${token}/comments` : `videos/${videoId}/comments`)
  }

  addComment(input: Omit<Comment, 'id' | 'createdAt'>) {
    const token = this.clientToken(input.videoId)
    return api<Comment>(token ? `share/${token}/comments` : `videos/${input.videoId}/comments`, { method: 'POST', json: input })
  }

  async deleteComment(id: ID) {
    await api(`comments/${id}`, { method: 'DELETE' })
  }

  // --- Vues ----------------------------------------------------------------------------------
  recordView(view: Omit<View, 'id'>) {
    const token = this.tokens.get(view.videoId)
    if (!token) return Promise.resolve({ ...view, id: '' })
    return api<View>(`share/${token}/views`, { method: 'POST', json: view })
  }

  async updateView(id: ID, watchedRatio: number) {
    const token = [...this.tokens.values()].pop()
    if (token && id) await api(`share/${token}/views/${id}`, { method: 'PATCH', json: { watchedRatio } })
  }

  listViews(videoId: ID) {
    const token = this.clientToken(videoId)
    return api<View[]>(token ? `share/${token}/views` : `videos/${videoId}/views`)
  }

  async setViewerName(viewerId: string, name: string) {
    const token = [...this.tokens.values()].pop()
    if (token) await api(`share/${token}/viewer`, { method: 'POST', json: { viewerId, name } })
  }

  // --- Notifications -------------------------------------------------------------------------
  listNotifications() {
    return api<{ items: AppNotification[]; unread: number }>('notifications')
  }

  async markNotificationsRead(ids?: ID[]) {
    await api('notifications/read', { method: 'POST', json: { ids } })
  }
}
