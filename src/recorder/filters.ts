// Filtres caméra : la même chaîne CSS sert à l'aperçu (bulle) et à la vidéo finale (canvas).
export const cameraFilters = [
  { id: 'none', label: 'Aucun', css: 'none' },
  { id: 'bw', label: 'Noir et blanc', css: 'grayscale(1) contrast(1.05)' },
  { id: 'bright', label: 'Lumineux', css: 'brightness(1.12) contrast(1.04)' },
  { id: 'soft', label: 'Doux', css: 'brightness(1.05) contrast(0.92) saturate(0.9)' },
  { id: 'warm', label: 'Chaud', css: 'sepia(0.22) saturate(1.15)' },
] as const

export type CameraFilterId = (typeof cameraFilters)[number]['id']

export const filterCss = (id: string) => cameraFilters.find((f) => f.id === id)?.css ?? 'none'
