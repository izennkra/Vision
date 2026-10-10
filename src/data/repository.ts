// Couche de stockage unique.
// Tous les écrans passent par cette interface et uniquement par elle.
// Étape 1 : implémentation locale (IndexedDB du navigateur).
// Étape 2 : implémentation Cloudflare (R2 pour les vidéos, base de données pour le reste)
// qui respecte la même interface — les écrans ne changent pas.

import type { AppNotification, Client, Comment, ID, Page, Video, View } from './types'

export interface VideoQuery {
  /** Dossier : inclut les vidéos de ses sous-dossiers. */
  clientId?: ID | null
  search?: string
  /** Curseur renvoyé par la page précédente. */
  cursor?: string | null
  limit?: number
}

export interface Repository {
  // Clients (dossiers)
  listClients(): Promise<Client[]>
  createClient(name: string, parentId?: ID | null): Promise<Client>
  renameClient(id: ID, name: string): Promise<Client>
  /** Supprime le dossier et ses sous-dossiers ; leurs vidéos sont conservées et deviennent « sans client ». */
  deleteClient(id: ID): Promise<void>

  // Vidéos (métadonnées seulement, jamais le fichier vidéo)
  listVideos(query: VideoQuery): Promise<Page<Video>>
  getVideo(id: ID): Promise<Video | null>
  /** Page client : la vidéo publiée et son dossier (avec l'agence éventuelle). */
  getShared(token: string): Promise<{ video: Video; clients: Client[] } | null>
  updateVideo(id: ID, patch: Partial<Pick<Video, 'title' | 'description' | 'clientId' | 'status'>>): Promise<Video>
  deleteVideo(id: ID): Promise<void>

  // Enregistrement par morceaux de taille fixe : pensé pour 1 h 30 sans saturer la mémoire
  // et pour un envoi en ligne au fil de l'eau.
  startRecording(init: { title: string; clientId: ID | null; mimeType: string }): Promise<Video>
  /** Enregistre (ou remplace) le morceau n° `index` du fichier. */
  appendChunk(videoId: ID, index: number, data: Blob): Promise<void>
  /** Relit un morceau déjà enregistré. */
  getChunk(videoId: ID, index: number): Promise<Blob | null>
  /** Adresse de téléchargement du fichier complet (copie sur le Mac). */
  getDownloadUrl(videoId: ID): Promise<string | null>
  finishRecording(videoId: ID, info: { duration: number; thumbnail: Blob | null; width?: number; height?: number }): Promise<Video>

  // Lecture
  getThumbnail(key: string): Promise<Blob | null>
  /** URL lisible par une balise <video>. */
  getPlaybackUrl(videoId: ID): Promise<string>

  // Commentaires
  listComments(videoId: ID): Promise<Comment[]>
  addComment(comment: Omit<Comment, 'id' | 'createdAt'>): Promise<Comment>
  /** Supprime le commentaire et ses réponses. */
  deleteComment(id: ID): Promise<void>

  // Vues
  recordView(view: Omit<View, 'id'>): Promise<View>
  updateView(id: ID, watchedRatio: number): Promise<void>
  listViews(videoId: ID): Promise<View[]>
  /** Donne un nom à toutes les vues d'un même navigateur (quand la personne se présente). */
  setViewerName(viewerId: string, name: string): Promise<void>

  // Notifications (propriétaire)
  listNotifications(): Promise<{ items: AppNotification[]; unread: number }>
  /** Marque comme lues (toutes si `ids` est absent). */
  markNotificationsRead(ids?: ID[]): Promise<void>
}
