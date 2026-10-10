// Couche de stockage unique.
// Tous les écrans passent par cette interface et uniquement par elle.
// Étape 1 : implémentation locale (IndexedDB du navigateur).
// Étape 2 : implémentation Cloudflare (R2 pour les vidéos, base de données pour le reste)
// qui respecte la même interface — les écrans ne changent pas.

import type { Access, AppNotification, Client, Comment, ID, Page, PersonInput, Transcript, Video, View } from './types'

export interface VideoQuery {
  /** Dossier : inclut les vidéos de ses sous-dossiers. */
  clientId?: ID | null
  search?: string
  /** Curseur renvoyé par la page précédente. */
  cursor?: string | null
  limit?: number
}

/** Page client : soit la vidéo, soit l'accès est verrouillé (code ou invitation nécessaire). */
export type SharedResult =
  | { video: Video; clients: Client[]; me: { id: ID; name: string } | null }
  | { locked: 'code' | 'private'; codeAllowed: boolean }

/** Modifications possibles d'une vidéo par le propriétaire. */
export type VideoPatch = Partial<Pick<Video, 'title' | 'description' | 'clientId' | 'status'>> & {
  access?: Access
  accessCode?: string | null
  people?: PersonInput[]
}

export interface Repository {
  // Clients (dossiers)
  listClients(): Promise<Client[]>
  createClient(name: string, parentId?: ID | null): Promise<Client>
  renameClient(id: ID, name: string): Promise<Client>
  /** Équipe d'un dossier client. */
  setClientPeople(id: ID, people: PersonInput[]): Promise<Client>
  /** Photo de profil importée (carrée, déjà réduite) : renvoie son adresse. */
  uploadAvatar(personId: ID, image: Blob): Promise<string>
  /** Supprime le dossier et ses sous-dossiers ; leurs vidéos sont conservées et deviennent « sans client ». */
  deleteClient(id: ID): Promise<void>

  // Vidéos (métadonnées seulement, jamais le fichier vidéo)
  listVideos(query: VideoQuery): Promise<Page<Video>>
  getVideo(id: ID): Promise<Video | null>
  /**
   * Page client : la vidéo publiée et son dossier (avec l'agence éventuelle), ou le verrou à lever.
   * `key` : jeton du lien personnel d'une personne invitée (paramètre ?p= de l'adresse).
   */
  getShared(token: string, key?: string | null): Promise<SharedResult | null>
  /** Saisie du code d'accès : vrai si le code est bon (l'accès est alors mémorisé dans ce navigateur). */
  unlockShare(token: string, code: string): Promise<boolean>
  updateVideo(id: ID, patch: VideoPatch): Promise<Video>
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
  finishRecording(
    videoId: ID,
    info: { duration: number; thumbnail: Blob | null; width?: number; height?: number; audioChunks?: number },
  ): Promise<Video>

  // Transcription : tranches de son envoyées pendant l'enregistrement, puis lecture (éventuellement traduite).
  appendAudio(videoId: ID, index: number, start: number, wav: Blob): void
  getTranscript(videoId: ID, lang?: string | null): Promise<Transcript>
  retryTranscript(videoId: ID): Promise<Transcript>

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
