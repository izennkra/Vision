// Langues proposées pour la transcription et les sous-titres.
export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'Anglais' },
  { code: 'es', label: 'Espagnol' },
  { code: 'de', label: 'Allemand' },
  { code: 'it', label: 'Italien' },
  { code: 'pt', label: 'Portugais' },
  { code: 'nl', label: 'Néerlandais' },
  { code: 'ar', label: 'Arabe' },
  { code: 'zh', label: 'Chinois' },
  { code: 'ja', label: 'Japonais' },
]

export const languageLabel = (code: string | null | undefined) =>
  LANGUAGES.find((l) => l.code === code)?.label ?? (code ? code.toUpperCase() : 'Langue')
