// Accès au serveur Visions (mode « en ligne »).
// Le jeton de session du propriétaire est gardé dans le navigateur après connexion.

/** Vrai quand l'application est construite pour Cloudflare (npm run build:cloud). */
export const cloud = import.meta.env.VITE_STORAGE === 'cloud'
/** Adresse du serveur ; vide = même adresse que l'application. */
export const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

const SESSION_KEY = 'visions:session'

export function sessionToken() {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

export function saveSession(token: string | null) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token)
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* stockage indisponible */
  }
}

/** Vrai si une session propriétaire est enregistrée et pas expirée. */
export function hasSession() {
  const t = sessionToken()
  return !!t && Number(t.split('.')[0]) > Date.now()
}

export class ApiError extends Error {
  status: number
  /** Réponse complète du serveur (par exemple le type de verrou d'une page client). */
  data: Record<string, unknown>
  constructor(status: number, message: string, data: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.data = data
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = sessionToken()
  if (token) headers.set('authorization', `Bearer ${token}`)
  let bodyInit = init.body
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json')
    bodyInit = JSON.stringify(init.json)
  }
  const res = await fetch(`${apiBase}/api/${path}`, { ...init, headers, body: bodyInit })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const message = typeof data.error === 'string' ? data.error : null
    if (res.status === 401 && path !== 'login' && !path.startsWith('share/')) {
      saveSession(null)
      if (!location.pathname.startsWith('/v/')) location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
    }
    throw new ApiError(res.status, message ?? `Erreur ${res.status}`, data)
  }
  return res.json() as Promise<T>
}

/** Adresse absolue d'un fichier servi par le serveur (/media/…). */
export const mediaHref = (path: string) => (path.startsWith('/') ? apiBase + path : path)
