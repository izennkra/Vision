// Couche de stockage unique.
// Tous les écrans passent par cette interface et uniquement par elle.
// Étape 1 : implémentation locale (IndexedDB du navigateur).
// Étape 2 : implémentation Cloudflare (R2 pour les vidéos, base de données pour le reste)
// qui respecte la même interface — les écrans ne changent pas.

import type { Client, Comment, ID, Page, Video, View } from './types'

export interface VideoQuery {
  clientId?: ID | null
  search?: string
  /** Curseur renvoyé par la page précédente. */
  cursor?: string | null
  limit?: number
}

export interface Repository {
  // Clients
  listClients(): Promise<Client[]>

  // Vidéos (métadonnées seulement, jamais le fichier vidéo)
  listVideos(query: VideoQuery): Promise<Page<Video>>
  getVideo(id: ID): Promise<Video | null>
  getVideoByShareToken(token: string): Promise<Video | null>
  updateVideo(id: ID, patch: Partial<Pick<Video, 'title' | 'description' | 'clientId' | 'status'>>): Promise<Video>
  deleteVideo(id: ID): Promise<void>

  // Enregistrement par morceaux : pensé pour 1 h 30 sans saturer la mémoire
  // et pour un envoi en ligne au fil de l'eau à l'étape 2.
  startRecording(init: { title: string; clientId: ID | null; mimeType: string }): Promise<Video>
  appendChunk(videoId: ID, index: number, data: Blob): Promise<void>
  finishRecording(videoId: ID, info: { duration: number; thumbnail: Blob | null }): Promise<Video>

  // Lecture
  getThumbnail(key: string): Promise<Blob | null>
  /** URL lisible par une balise <video>. */
  getPlaybackUrl(videoId: ID): Promise<string>

  // Commentaires
  listComments(videoId: ID): Promise<Comment[]>
  addComment(comment: Omit<Comment, 'id' | 'createdAt'>): Promise<Comment>

  // Vues
  recordView(view: Omit<View, 'id'>): Promise<View>
  updateView(id: ID, watchedRatio: number): Promise<void>
}
