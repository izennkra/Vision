// Données de test : 3 clients, 3 vidéos, quelques commentaires.
import type { Client, Comment, Video } from '../types'

const ago = (days: number, hours = 0) => new Date(Date.now() - (days * 24 + hours) * 3600_000).toISOString()

export function seed() {
  const clients: Client[] = [
    { id: 'client-1', name: 'Elias Studio', createdAt: ago(60) },
    { id: 'client-2', name: 'Maison Lune', createdAt: ago(59) },
    { id: 'client-3', name: 'Atelier Nord', createdAt: ago(58) },
  ]

  const base = {
    status: 'published' as const,
    mimeType: 'video/webm',
    size: 0,
    chunkCount: 0,
    thumbnailKey: null,
    sampleUrl: '/samples/exemple.webm',
  }

  const videos: Video[] = [
    {
      ...base,
      id: 'video-1',
      title: 'Avancée sur le patterns',
      description:
        'Kunsthalle Basel’s solution lay in a paradox: an institutional brand with an anti-institutional spirit. Anchored with a timeless yet flexible monogram and serif type, the identity is free to break convention elsewhere — allowing them to respond to culture in real time.',
      clientId: 'client-1',
      duration: 252,
      createdAt: ago(1),
      updatedAt: ago(1),
      shareToken: 'patterns01',
      viewCount: 8,
      commentCount: 3,
    },
    {
      ...base,
      id: 'video-2',
      title: 'Première direction du logo',
      description: 'Trois pistes de monogramme et une proposition de typographie pour les titres.',
      clientId: 'client-2',
      duration: 252,
      createdAt: ago(4, 3),
      updatedAt: ago(4, 3),
      shareToken: 'logo00002',
      viewCount: 3,
      commentCount: 1,
    },
    {
      ...base,
      id: 'video-3',
      title: 'Maquettes du site — accueil',
      description: 'Parcours de la page d’accueil en version bureau puis mobile.',
      clientId: 'client-3',
      duration: 252,
      createdAt: ago(11, 5),
      updatedAt: ago(11, 5),
      shareToken: 'site000003',
      viewCount: 0,
      commentCount: 0,
    },
  ]

  const text = 'Kunsthalle Basel’s solution lay in a paradox: an institutional brand with an anti-institutional spirit.'
  const comments: Comment[] = [
    { id: 'c1', videoId: 'video-1', parentId: null, authorName: 'Anna Simon', authorInitials: 'AS', text, timestamp: 92, createdAt: ago(0, 2) },
    { id: 'c2', videoId: 'video-1', parentId: null, authorName: 'Anna Simon', authorInitials: 'AS', text, timestamp: 225, createdAt: ago(0, 1.1) },
    {
      id: 'c3', videoId: 'video-1', parentId: null, authorName: 'Anna Simon', authorInitials: 'AS',
      text: `${text} Anchored with a timeless yet flexible monogram and serif type, the identity is free to break convention elsewhere — allowing them to respond to culture in real time.`,
      timestamp: 34, createdAt: ago(0, 1),
    },
    { id: 'c4', videoId: 'video-2', parentId: null, authorName: 'Louis Martin', authorInitials: 'LM', text: 'La deuxième piste me plaît beaucoup, on peut la pousser ?', timestamp: 48, createdAt: ago(3) },
  ]

  return { clients, videos, comments }
}
