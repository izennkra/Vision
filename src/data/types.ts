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
  /** Équipe du client : les personnes qui regardent et commentent ses vidéos (et celles de ses sous-dossiers). */
  people?: Person[]
  /** Ordre dans la barre latérale (glisser-déposer). */
  position?: number | null
}

/** Profil du propriétaire : photo importée, œil de couleur (« eye:#007500 ») ou null (photo d'origine). */
export interface OwnerProfile {
  name: string
  avatar: string | null
}

/** Personne prévue pour regarder et commenter (profil choisi dans les commentaires). */
export interface Person {
  id: ID
  /** Nom affiché, par exemple « Victor C. ». */
  name: string
  /** E-mail pour l'invitation (partage privé). */
  email: string | null
  /** Jeton de son lien personnel (vide sur la page client). */
  token: string
  /** Couleur de sa photo de profil (une couleur de la DA) ; null : choisie d'après le nom. */
  color?: string | null
  /** Photo importée (adresse de l'image) ; null : l'œil animé. */
  avatar?: string | null
}

/** Modification d'une personne (sans jeton : le serveur le crée). */
export type PersonInput = Pick<Person, 'name' | 'email'> & { id?: ID; color?: string | null; avatar?: string | null }

/** Public : toute personne ayant le lien. Privé : seulement les personnes invitées. */
export type Access = 'public' | 'private'

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
  /** Réglages de partage. */
  access?: Access
  /** Code demandé aux personnes sans lien personnel (null : pas de code). Visible seulement par le propriétaire. */
  accessCode?: string | null
  /** Vrai si un code est demandé (seule information visible côté client). */
  hasCode?: boolean
  /** Personnes prévues (« Anonyme » est toujours proposé en plus). */
  people?: Person[]
  /** Archivée : stockage moins cher, toujours lisible. */
  archived?: boolean
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

/** Notification pour le propriétaire : quelqu'un a regardé ou commenté une vidéo. */
export interface AppNotification {
  id: ID
  type: 'view' | 'comment'
  videoId: ID
  videoTitle: string
  /** Nom de la personne (« Anonyme » si elle ne l'a pas donné). */
  actor: string
  /** Début du commentaire. */
  text: string | null
  createdAt: ISODate
  read: boolean
}

/** Page de résultats, pour ne jamais charger toutes les vidéos d'un coup. */
export interface Page<T> {
  items: T[]
  /** Curseur à repasser pour la page suivante, null s'il n'y en a plus. */
  next: string | null
  total: number
}

/** Une phrase de la transcription, avec son moment dans la vidéo (secondes). */
export interface Cue {
  start: number
  end: number
  text: string
  /** Qui parle : « me » (le propriétaire, au micro) ou « other » (le son de l'appel). Absent : pas de séparation. */
  speaker?: 'me' | 'other'
}

/** Transcription d'une vidéo (dans sa langue d'origine ou traduite). */
export interface Transcript {
  /** none : pas de son enregistré · pending : en cours · ready : terminée · unavailable : non proposée (version locale). */
  status: 'none' | 'pending' | 'ready' | 'unavailable'
  /** Langue d'origine détectée (code ISO, ex. « fr »). */
  language: string | null
  /** Langue des phrases renvoyées. */
  lang: string | null
  cues: Cue[]
  /** Traduction pas encore terminée : redemander un peu plus tard. */
  partial?: boolean
  /** Tranches qui n'ont pas pu être transcrites (le propriétaire peut relancer). */
  failed?: number
}

/** Une qualité de lecture : l'original ou une version allégée (720p, 480p). */
export interface Quality {
  label: string
  /** Petit côté de l'image, en pixels. */
  height: number
  url: string
}
