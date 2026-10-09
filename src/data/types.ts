// Modèle de données de Visions.
// Pensé dès l'étape 1 pour une vraie base de données (étape 2) :
// identifiants en chaîne, dates en ISO 8601, aucune donnée binaire dans les métadonnées.

export type ID = string
export type ISODate = string

/**
 * Dossier client. Un dossier peut contenir des sous-dossiers : une agence (Elias Studio)
 * et ses propres clients (Co-labs). Le libellé d'une vidéo devient alors « Elias Studio x Co-labs ».
 */
export interface Client {
  id: ID
  name: string
  /** Dossier parent (agence), null pour un dossier de premier niveau. */
  parentId: ID | null
  createdAt: ISODate
}

export type VideoStatus =
  | 'recording' // enregistrement en cours (morceaux en train d'arriver)
  | 'processing' // enregistrement terminé, finalisation
  | 'draft' // visible seulement par moi
  | 'published' // lien de partage actif
  | 'failed'

export interface Video {
  id: ID
  title: string
  description: string
  clientId: ID | null
  /** Durée en secondes. */
  duration: number
  createdAt: ISODate
  updatedAt: ISODate
  status: VideoStatus
  /** Jeton du lien de partage (étape 2 : vrai lien public). */
  shareToken: string
  mimeType: string
  /** Taille totale en octets (somme des morceaux). */
  size: number
  /** Nombre de morceaux enregistrés. */
  chunkCount: number
  /** Vignette : clé de stockage (blob séparé, chargé à la demande). */
  thumbnailKey: string | null
  /** Compteurs dénormalisés pour afficher le dashboard sans charger les vues. */
  viewCount: number
  commentCount: number
  /** Dimensions de l'image enregistrée (pour adapter le lecteur au format). */
  width?: number
  height?: number
  /** Données de test uniquement : vidéo d'exemple servie depuis /public. */
  sampleUrl?: string
}

/** Un morceau de vidéo enregistré pendant la capture (quelques secondes). */
export interface VideoChunk {
  videoId: ID
  index: number
  size: number
  /** Étape 1 : Blob en local. Étape 2 : envoyé en ligne au fil de l'eau. */
  data: Blob
}

export interface Comment {
  id: ID
  videoId: ID
  /** Commentaire parent pour les réponses, null sinon. */
  parentId: ID | null
  authorName: string
  /** Initiales affichées dans la pastille. */
  authorInitials: string
  text: string
  /** Moment de la vidéo visé, en secondes (null pour une réponse sans temps). */
  timestamp: number | null
  createdAt: ISODate
}

export interface View {
  id: ID
  videoId: ID
  /** Identifiant anonyme du navigateur qui regarde (regroupe les vues d'une même personne). */
  viewerId: string
  /** Nom saisi par la personne (« Anonyme » tant qu'elle ne l'a pas donné). */
  viewer: string
  startedAt: ISODate
  /** Proportion regardée, de 0 à 1. */
  watchedRatio: number
}

/** Page de résultats, pour ne jamais charger toutes les vidéos d'un coup. */
export interface Page<T> {
  items: T[]
  /** Curseur à repasser pour la page suivante, null s'il n'y en a plus. */
  next: string | null
  total: number
}
