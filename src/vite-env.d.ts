/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** « cloud » pour utiliser le serveur Cloudflare. */
  readonly VITE_STORAGE?: string
  /** Adresse du serveur si l'application est servie ailleurs (ex. Vercel). */
  readonly VITE_API_URL?: string
}
