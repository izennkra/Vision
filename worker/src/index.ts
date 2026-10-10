// Serveur Visions (Cloudflare Worker).
// - Sert l'application (fichiers statiques) et l'API (/api) sur la même adresse.
// - Vidéos et vignettes dans R2 (stockage peu coûteux, bande passante gratuite).
// - Informations (vidéos, dossiers, commentaires, vues, notifications) dans D1.
// - Accès propriétaire protégé par mot de passe ; pages client publiques via leur lien.
// - Lecture des vidéos par requêtes partielles (Range) : on ne télécharge que ce qu'on regarde.

export interface Env {
  DB: D1Database
  VIDEOS: R2Bucket
  ASSETS: Fetcher
  /** Mot de passe du propriétaire (secret). */
  OWNER_PASSWORD: string
  /** Clé de signature des sessions et des liens vidéo (secret, longue et aléatoire). */
  SESSION_SECRET: string
  /** Workers AI (transcription et traduction). */
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> }
  /** Tests locaux : « 1 » remplace Workers AI par une transcription factice. */
  AI_MOCK?: string
  /** Prénom et nom affichés comme auteur des commentaires du propriétaire. */
  OWNER_NAME?: string
  /** Origine autorisée si l'application est servie ailleurs (ex. Vercel). */
  ALLOWED_ORIGIN?: string
}

import { SCHEMA } from './schema'
import { deleteTranscript, getTranscript, maybeSummarize, receiveAudio, retryFailed } from './transcribe'
import { completeRendition, deleteRenditions, qualityLabel, QUALITIES, readyRenditions, setArchived, startRendition, uploadRenditionPart } from './renditions'

type Row = Record<string, unknown>

/** Colonnes ajoutées après la première version (sans effet si elles existent déjà). */
const UPGRADES = [
  "ALTER TABLE videos ADD COLUMN access TEXT NOT NULL DEFAULT 'public'",
  'ALTER TABLE videos ADD COLUMN access_code TEXT',
  "ALTER TABLE videos ADD COLUMN people TEXT NOT NULL DEFAULT '[]'",
  'ALTER TABLE videos ADD COLUMN audio_chunks INTEGER',
  "ALTER TABLE clients ADD COLUMN people TEXT NOT NULL DEFAULT '[]'",
  'ALTER TABLE transcript_chunks ADD COLUMN voices TEXT',
  'ALTER TABLE videos ADD COLUMN archived INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE clients ADD COLUMN position REAL',
  'ALTER TABLE videos ADD COLUMN summary TEXT',
  'ALTER TABLE videos ADD COLUMN summary_state TEXT',
]

/** Crée les tables au premier démarrage (une fois par instance du serveur). */
let schemaReady: Promise<unknown> | null = null
function ensureSchema(env: Env) {
  schemaReady ??= (async () => {
    try {
      await env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql)))
    } catch (e) {
      // Une instruction refusée ne doit jamais bloquer toute l'application : on les reprend une par une.
      console.error('schéma (lot)', e)
      for (const sql of SCHEMA) await env.DB.prepare(sql).run().catch((err) => console.error('schéma', sql.slice(0, 60), err))
    }
    for (const sql of UPGRADES) await env.DB.prepare(sql).run().catch(() => {}) // « duplicate column » : déjà fait
  })()
  return schemaReady
}

const SESSION_DAYS = 30
const MEDIA_HOURS = 12

// --- Utilitaires -------------------------------------------------------------------------------

const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID()
const token12 = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12)
const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

class HttpError extends Error {
  status: number
  data: Record<string, unknown>
  constructor(status: number, message: string, data: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.data = data
  }
}

function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } })
}

async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new HttpError(400, 'Requête invalide')
  }
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function sign(env: Env, payload: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
}

/** Comparaison en temps constant. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

async function isOwner(req: Request, env: Env) {
  const auth = req.headers.get('authorization') ?? ''
  const [exp, sig] = auth.replace(/^Bearer /, '').split('.')
  if (!exp || !sig || Number(exp) < Date.now()) return false
  return same(sig, await sign(env, `owner:${exp}`))
}

async function requireOwner(req: Request, env: Env) {
  if (!(await isOwner(req, env))) throw new HttpError(401, 'Connexion requise')
}

/** Lien de lecture signé (la balise <video> ne peut pas envoyer d'en-tête d'autorisation). */
/** kind : video (original), thumb (vignette), r720 / r480 (versions allégées). */
type MediaKind = 'video' | 'thumb' | `r${number}`

async function mediaUrl(env: Env, id: string, kind: MediaKind) {
  const exp = Date.now() + MEDIA_HOURS * 3600_000
  return `/media/${kind}/${id}?e=${exp}&s=${await sign(env, `${kind}:${id}:${exp}`)}`
}

// --- Conversion lignes SQL → objets de l'application -------------------------------------------

/** Personne autorisée à regarder et commenter : nom affiché, e-mail (invitation), jeton de son lien personnel,
 *  couleur de sa photo de profil (DA) et photo importée éventuelle. */
type Person = { id: string; name: string; email: string | null; token: string; color?: string | null; avatar?: string | null }

/** Couleurs de photo de profil proposées (DA). */
const AVATAR_COLORS = ['#007500', '#b400b4', '#f24822', '#4d4d4d', '#000000', '#daa520']

/** Ce que la page client voit d'une personne : jamais l'e-mail ni le lien personnel. */
const publicPerson = (p: Person): Person => ({ id: p.id, name: p.name, email: null, token: '', color: p.color ?? null, avatar: p.avatar ?? null })

/** Liste envoyée par l'application → personnes enregistrées (on garde l'identifiant et le lien de chacune). */
function normalizePeople(input: unknown, before: Person[]): Person[] {
  if (!Array.isArray(input)) return before
  return (input as Partial<Person>[])
    .map((x) => {
      const old = x.id ? before.find((o) => o.id === x.id) : undefined
      const avatar = typeof x.avatar === 'string' && /^\/media\/avatar\/[\w-]+(\?v=\d+)?$/.test(x.avatar) ? x.avatar : null
      return {
        id: old?.id ?? uid(),
        name: String(x.name ?? '').trim().slice(0, 60),
        email: String(x.email ?? '').trim().slice(0, 200) || null,
        token: old?.token ?? token12() + token12(),
        color: AVATAR_COLORS.includes(String(x.color)) ? String(x.color) : null,
        avatar,
      }
    })
    .filter((x) => x.name && x.name.toLowerCase() !== 'anonyme')
    .slice(0, 50)
}

const toClient = (r: Row, forOwner = true) => ({
  id: r.id,
  name: r.name,
  parentId: r.parent_id ?? null,
  createdAt: r.created_at,
  people: forOwner ? peopleOf(r) : peopleOf(r).map(publicPerson),
})

function peopleOf(r: Row): Person[] {
  try {
    const list = JSON.parse((r.people as string) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/**
 * `forOwner` : réglages complets (people = personnes ajoutées pour cette vidéo seulement) ;
 * sinon (page client) : people = toutes les personnes prévues (vidéo + équipes du dossier), sans e-mails ni liens.
 */
async function toVideo(env: Env, r: Row, forOwner = true, audience: Person[] = []) {
  return {
    access: (r.access as string) || 'public',
    accessCode: forOwner ? ((r.access_code as string) ?? null) : null,
    hasCode: !!r.access_code,
    people: forOwner ? peopleOf(r) : audience.map(publicPerson),
    id: r.id,
    title: r.title,
    description: r.description,
    clientId: r.client_id ?? null,
    duration: r.duration,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    status: r.status,
    shareToken: r.share_token,
    mimeType: r.mime_type,
    size: r.size,
    chunkCount: r.chunk_count,
    thumbnailKey: r.thumbnail_key ? await mediaUrl(env, r.id as string, 'thumb') : null,
    viewCount: r.view_count,
    commentCount: r.comment_count,
    width: r.width ?? undefined,
    height: r.height ?? undefined,
    archived: !!r.archived,
    /** Résumé automatique : null (pas encore), running, done, skipped (trop court), error. */
    summaryState: r.summary_state ? String(r.summary_state).split(':')[0] : null,
  }
}

/** Qualités de lecture : l'original et les versions allégées prêtes, chacune avec son adresse signée. */
async function qualitiesOf(env: Env, r: Row) {
  const id = r.id as string
  const original = { label: qualityLabel(r.width as number, r.height as number), height: Math.min(Number(r.width) || 1920, Number(r.height) || 1080), url: await mediaUrl(env, id, 'video') }
  const list = [original]
  for (const x of await readyRenditions(env, id)) {
    const q = Number(x.quality)
    if (q < original.height - 40) list.push({ label: `${q}p`, height: q, url: await mediaUrl(env, id, `r${q}`) })
  }
  return list
}

const toComment = (r: Row) => ({
  id: r.id,
  videoId: r.video_id,
  parentId: r.parent_id ?? null,
  authorName: r.author_name,
  authorInitials: r.author_initials,
  text: r.text,
  timestamp: r.timestamp ?? null,
  createdAt: r.created_at,
})

const toView = (r: Row) => ({
  id: r.id,
  videoId: r.video_id,
  viewerId: r.viewer_id,
  viewer: r.viewer,
  startedAt: r.started_at,
  watchedRatio: r.watched_ratio,
})

const toNotification = (r: Row) => ({
  id: r.id,
  type: r.type,
  videoId: r.video_id,
  videoTitle: r.video_title,
  actor: r.actor,
  text: r.text ?? null,
  createdAt: r.created_at,
  read: !!r.read,
})

// --- Accès aux données ------------------------------------------------------------------------

async function getVideoRow(env: Env, id: string) {
  const r = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first<Row>()
  if (!r) throw new HttpError(404, 'Vidéo introuvable')
  return r
}

async function getSharedRow(env: Env, token: string) {
  const r = await env.DB.prepare("SELECT * FROM videos WHERE share_token = ? AND status = 'published'").bind(token).first<Row>()
  if (!r) throw new HttpError(404, 'Vidéo indisponible')
  return r
}

/** Toutes les personnes prévues pour une vidéo : ajoutées à la vidéo, équipe de son dossier, équipe de l'agence. */
async function audienceOf(env: Env, video: Row): Promise<Person[]> {
  const list = [...peopleOf(video)]
  let folderId = (video.client_id as string) ?? null
  for (let depth = 0; folderId && depth < 2; depth++) {
    const c = await env.DB.prepare('SELECT parent_id, people FROM clients WHERE id = ?').bind(folderId).first<Row>()
    if (!c) break
    list.push(...peopleOf(c))
    folderId = (c.parent_id as string) ?? null
  }
  const seen = new Set<string>()
  return list.filter((p) => !seen.has(p.id) && seen.add(p.id))
}

/** Le dossier et ses sous-dossiers. */
async function folderIds(env: Env, id: string) {
  const { results } = await env.DB.prepare('SELECT id FROM clients WHERE id = ? OR parent_id = ?').bind(id, id).all<Row>()
  return results.map((r) => r.id as string)
}

async function notify(env: Env, type: 'view' | 'comment', video: Row, actor: string, text: string | null = null) {
  await env.DB.prepare('INSERT INTO notifications (id, type, video_id, video_title, actor, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(uid(), type, video.id, video.title, actor, text, now())
    .run()
}

async function addComment(env: Env, video: Row, input: Row, byOwner: boolean, ownerName: string, me: Person | null = null) {
  const text = String(input.text ?? '').trim().slice(0, 5000)
  let author = byOwner ? ownerName : me ? me.name : String(input.authorName ?? '').trim().slice(0, 80)
  // Page client : on commente sous l'un des profils prévus par le propriétaire, ou en « Anonyme ».
  const people = byOwner || me ? [] : await audienceOf(env, video)
  if (!byOwner && !me && people.length && !people.some((p) => p.name === author)) author = 'Anonyme'
  if (!text || !author) throw new HttpError(400, 'Nom et commentaire requis')
  const parentId = (input.parentId as string) || null
  const timestamp = typeof input.timestamp === 'number' ? input.timestamp : null
  const c = { id: uid(), video_id: video.id, parent_id: parentId, author_name: author, author_initials: initialsOf(author), text, timestamp, created_at: now() }
  await env.DB.batch([
    env.DB.prepare('INSERT INTO comments (id, video_id, parent_id, author_name, author_initials, text, timestamp, created_at, by_owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.id, c.video_id, c.parent_id, c.author_name, c.author_initials, c.text, c.timestamp, c.created_at, byOwner ? 1 : 0),
    env.DB.prepare('UPDATE videos SET comment_count = comment_count + 1 WHERE id = ?').bind(video.id),
  ])
  if (!byOwner) await notify(env, 'comment', video, author, text.slice(0, 140))
  return toComment(c)
}

async function deleteVideo(env: Env, id: string) {
  const v = await env.DB.prepare('SELECT object_key, upload_id FROM videos WHERE id = ?').bind(id).first<Row>()
  if (!v) return
  if (v.upload_id) await env.VIDEOS.resumeMultipartUpload(v.object_key as string, v.upload_id as string).abort().catch(() => {})
  // Fichiers d'abord (vidéo, vignette, versions allégées, son de la transcription), la fiche de la vidéo en dernier :
  // si quelque chose échoue en route, la vidéo reste visible et on peut relancer la suppression.
  await env.VIDEOS.delete([v.object_key as string, `thumbs/${id}.jpg`])
  await deleteRenditions(env, id)
  await deleteTranscript(env, id)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM parts WHERE video_id = ?').bind(id),
    env.DB.prepare('DELETE FROM comments WHERE video_id = ?').bind(id),
    env.DB.prepare('DELETE FROM views WHERE video_id = ?').bind(id),
    env.DB.prepare('DELETE FROM notifications WHERE video_id = ?').bind(id),
    env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(id),
  ])
}

// --- Accès aux pages client ------------------------------------------------------------------
// Public : le lien suffit. Privé : il faut le lien personnel d'une personne invitée.
// Code (optionnel) : sans lien personnel, il faut saisir le code ; on reçoit alors un « laissez-passer » signé.

const GRANT_DAYS = 30

async function grantFor(env: Env, token: string) {
  const exp = Date.now() + GRANT_DAYS * 86400_000
  return `${exp}.${await sign(env, `grant:${token}:${exp}`)}`
}

async function checkShareAccess(req: Request, env: Env, video: Row): Promise<Person | null> {
  const people = await audienceOf(env, video)
  const key = req.headers.get('x-share-key')
  const me = key ? people.find((p) => p.token && same(p.token, key)) : undefined
  if (me) return me
  const [exp, sig] = (req.headers.get('x-share-grant') ?? '').split('.')
  if (exp && sig && Number(exp) > Date.now() && same(sig, await sign(env, `grant:${video.share_token}:${exp}`))) return null
  const access = (video.access as string) || 'public'
  const code = video.access_code as string | null
  if (access === 'public' && !code) return null
  throw new HttpError(403, access === 'private' ? 'Vidéo privée' : 'Code requis', { locked: access === 'private' ? 'private' : 'code', codeAllowed: !!code })
}

// --- Lecture des fichiers (vidéo, vignette) ---------------------------------------------------

async function serveMedia(req: Request, env: Env, kind: MediaKind, id: string) {
  const url = new URL(req.url)
  const exp = url.searchParams.get('e') ?? ''
  const sig = url.searchParams.get('s') ?? ''
  if (Number(exp) < Date.now() || !same(sig, await sign(env, `${kind}:${id}:${exp}`))) return new Response('Lien expiré', { status: 403 })
  let key: string
  if (kind === 'thumb') key = `thumbs/${id}.jpg`
  else if (kind === 'video') key = (await getVideoRow(env, id)).object_key as string
  else {
    const r = await env.DB.prepare("SELECT object_key FROM renditions WHERE video_id = ? AND quality = ? AND status = 'ready'").bind(id, Number(kind.slice(1))).first<Row>()
    if (!r) return new Response('Introuvable', { status: 404 })
    key = r.object_key as string
  }
  const object = await env.VIDEOS.get(key, { range: req.headers, onlyIf: req.headers })
  if (!object) return new Response('Introuvable', { status: 404 })
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('accept-ranges', 'bytes')
  headers.set('cache-control', 'private, max-age=3600')
  if (url.searchParams.has('download')) {
    const name = (url.searchParams.get('download') || 'video').replace(/[^\p{L}\p{N} ._-]/gu, '-')
    headers.set('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}.mp4`)
  }
  if (!('body' in object)) return new Response(null, { status: 304, headers })
  const range = object.range as { offset?: number; length?: number; suffix?: number } | undefined
  if (range && req.headers.has('range')) {
    const offset = range.offset ?? (range.suffix !== undefined ? object.size - range.suffix : 0)
    const length = range.length ?? object.size - offset
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`)
    headers.set('content-length', String(length))
    return new Response(object.body, { status: 206, headers })
  }
  headers.set('content-length', String(object.size))
  return new Response(object.body, { headers })
}

// --- API --------------------------------------------------------------------------------------

async function api(req: Request, env: Env, path: string[], ctx: ExecutionContext): Promise<Response> {
  const method = req.method
  const ownerName = env.OWNER_NAME || 'Izenn Kra'
  const [a, b, c, d] = path // path[4], path[5] : pour les versions allégées

  // Connexion du propriétaire.
  if (a === 'login' && method === 'POST') {
    const { password } = await body<{ password: string }>(req)
    if (!env.OWNER_PASSWORD || !same(String(password ?? ''), env.OWNER_PASSWORD)) {
      await new Promise((r) => setTimeout(r, 600)) // ralentit les essais au hasard
      throw new HttpError(401, 'Mot de passe incorrect')
    }
    const exp = Date.now() + SESSION_DAYS * 86400_000
    return json({ token: `${exp}.${await sign(env, `owner:${exp}`)}` })
  }
  if (a === 'session' && method === 'GET') return json({ owner: await isOwner(req, env) })

  // Profil du propriétaire (photo affichée sur le dashboard, les pages vidéo et ses commentaires) : visible par tous.
  if (a === 'profile' && method === 'GET') {
    const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'owner_avatar'").first<Row>()
    return json({ name: ownerName, avatar: (r?.value as string) ?? null })
  }

  // --- Pages client (publiques, via le lien de partage) ---------------------------------------
  if (a === 'share' && b) {
    const video = await getSharedRow(env, b)
    // Déverrouillage par code (avant la vérification d'accès).
    if (c === 'unlock' && method === 'POST') {
      const { code } = await body<{ code: string }>(req)
      const expected = String(video.access_code ?? '')
      if (!expected || !same(String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''), expected.toUpperCase())) {
        await new Promise((r) => setTimeout(r, 600))
        throw new HttpError(403, 'Code incorrect')
      }
      return json({ grant: await grantFor(env, b) })
    }
    const me = await checkShareAccess(req, env, video)
    if (!c && method === 'GET') {
      const clients: Row[] = []
      if (video.client_id) {
        const own = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(video.client_id).first<Row>()
        if (own) {
          clients.push(own)
          if (own.parent_id) {
            const parent = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(own.parent_id).first<Row>()
            if (parent) clients.push(parent)
          }
        }
      }
      return json({
        video: await toVideo(env, video, false, await audienceOf(env, video)),
        clients: clients.map((r) => toClient(r, false)),
        playbackUrl: await mediaUrl(env, video.id as string, 'video'),
        qualities: await qualitiesOf(env, video),
        me: me ? { id: me.id, name: me.name } : null,
      })
    }
    if (c === 'comments' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM comments WHERE video_id = ? ORDER BY created_at').bind(video.id).all<Row>()
      return json(results.map(toComment))
    }
    if (c === 'comments' && method === 'POST') return json(await addComment(env, video, await body<Row>(req), false, ownerName, me), 201)
    if (c === 'transcript' && method === 'GET') return json(await getTranscript(env, video, new URL(req.url).searchParams.get('lang')))
    if (c === 'views' && !d && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM views WHERE video_id = ? ORDER BY started_at DESC').bind(video.id).all<Row>()
      return json(results.map(toView))
    }
    if (c === 'views' && !d && method === 'POST') {
      const input = await body<Row>(req)
      const view = { id: uid(), video_id: video.id, viewer_id: String(input.viewerId ?? uid()).slice(0, 64), viewer: me ? me.name : String(input.viewer ?? 'Anonyme').slice(0, 80), started_at: now(), watched_ratio: 0 }
      await env.DB.batch([
        env.DB.prepare('INSERT INTO views (id, video_id, viewer_id, viewer, started_at, watched_ratio) VALUES (?, ?, ?, ?, ?, 0)').bind(view.id, view.video_id, view.viewer_id, view.viewer, view.started_at),
        env.DB.prepare('UPDATE videos SET view_count = view_count + 1 WHERE id = ?').bind(video.id),
      ])
      await notify(env, 'view', video, view.viewer)
      return json(toView(view), 201)
    }
    if (c === 'views' && d && method === 'PATCH') {
      const { watchedRatio } = await body<{ watchedRatio: number }>(req)
      await env.DB.prepare('UPDATE views SET watched_ratio = MAX(watched_ratio, ?) WHERE id = ? AND video_id = ?').bind(Math.min(1, Math.max(0, Number(watchedRatio) || 0)), d, video.id).run()
      return json({ ok: true })
    }
    if (c === 'viewer' && method === 'POST') {
      const { viewerId, name } = await body<{ viewerId: string; name: string }>(req)
      const clean = String(name ?? '').trim().slice(0, 80)
      if (clean) {
        await env.DB.prepare('UPDATE views SET viewer = ? WHERE viewer_id = ?').bind(clean, viewerId).run()
        await env.DB.prepare("UPDATE notifications SET actor = ? WHERE type = 'view' AND actor = 'Anonyme' AND video_id = ? AND created_at > ?")
          .bind(clean, video.id, new Date(Date.now() - 6 * 3600_000).toISOString()).run()
      }
      return json({ ok: true })
    }
    throw new HttpError(404, 'Introuvable')
  }

  // --- Tout le reste : propriétaire uniquement ------------------------------------------------
  await requireOwner(req, env)

  // Photo de profil importée (déjà recadrée et réduite par l'application).
  if (a === 'avatars' && b && method === 'PUT') {
    if (!/^[\w-]{1,64}$/.test(b)) throw new HttpError(400, 'Identifiant invalide')
    const image = await req.arrayBuffer()
    if (!image.byteLength || image.byteLength > 1_500_000) throw new HttpError(413, 'Image trop grande')
    await env.VIDEOS.put(`avatars/${b}.jpg`, image, { httpMetadata: { contentType: req.headers.get('content-type') || 'image/jpeg' } })
    return json({ url: `/media/avatar/${b}?v=${Date.now()}` })
  }

  // Photo du propriétaire : une photo importée (/media/avatar/…), un œil de couleur (eye:#007500) ou null (photo d'origine).
  if (a === 'profile' && method === 'PUT') {
    const { avatar } = await body<{ avatar: string | null }>(req)
    const ok = avatar === null || /^\/media\/avatar\/[\w-]+(\?v=\d+)?$/.test(avatar) || /^eye:#[0-9a-f]{6}$/i.test(avatar)
    if (!ok) throw new HttpError(400, 'Photo invalide')
    if (avatar === null) await env.DB.prepare("DELETE FROM settings WHERE key = 'owner_avatar'").run()
    else await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('owner_avatar', ?)").bind(avatar).run()
    return json({ name: ownerName, avatar })
  }

  if (a === 'clients') {
    // Ordre des dossiers choisi par glisser-déposer dans la barre latérale.
    if (b === 'order' && method === 'POST') {
      const { ids } = await body<{ ids: string[] }>(req)
      if (!Array.isArray(ids) || ids.length > 500) throw new HttpError(400, 'Ordre invalide')
      if (ids.length) await env.DB.batch(ids.map((id, i) => env.DB.prepare('UPDATE clients SET position = ? WHERE id = ?').bind(i, String(id))))
      return json({ ok: true })
    }
    if (!b && method === 'GET') {
      // Ordre choisi par glisser-déposer ; à défaut (colonne absente), ordre de création.
      const { results } = await env.DB.prepare('SELECT * FROM clients ORDER BY position IS NULL, position, created_at')
        .all<Row>()
        .catch(() => env.DB.prepare('SELECT * FROM clients ORDER BY created_at').all<Row>())
      return json(results.map((r) => toClient(r)))
    }
    if (!b && method === 'POST') {
      const { name, parentId } = await body<{ name: string; parentId?: string | null }>(req)
      const r = { id: uid(), name: String(name || 'Nouveau dossier').slice(0, 80), parent_id: parentId ?? null, created_at: now() }
      // Nouveau dossier : en dernier.
      await env.DB.prepare('INSERT INTO clients (id, name, parent_id, created_at, position) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM clients))')
        .bind(r.id, r.name, r.parent_id, r.created_at)
        .run()
      return json(toClient({ ...r, people: '[]' }), 201)
    }
    if (b && method === 'PATCH') {
      const p = await body<{ name?: string; people?: unknown }>(req)
      const row = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(b).first<Row>()
      if (!row) throw new HttpError(404, 'Dossier introuvable')
      if (typeof p.name === 'string') await env.DB.prepare('UPDATE clients SET name = ? WHERE id = ?').bind(p.name.slice(0, 80), b).run()
      // Équipe du dossier : chaque personne garde son lien personnel.
      if (Array.isArray(p.people))
        await env.DB.prepare('UPDATE clients SET people = ? WHERE id = ?').bind(JSON.stringify(normalizePeople(p.people, peopleOf(row))), b).run()
      return json(toClient((await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(b).first<Row>())!))
    }
    if (b && method === 'DELETE') {
      const ids = await folderIds(env, b)
      const marks = ids.map(() => '?').join(',')
      await env.DB.batch([
        env.DB.prepare(`UPDATE videos SET client_id = NULL WHERE client_id IN (${marks})`).bind(...ids),
        env.DB.prepare(`DELETE FROM clients WHERE id IN (${marks})`).bind(...ids),
      ])
      return json({ ok: true })
    }
  }

  if (a === 'videos') {
    // Liste paginée (jamais tout d'un coup).
    if (!b && method === 'GET') {
      const q = new URL(req.url).searchParams
      const limit = Math.min(100, Number(q.get('limit')) || 24)
      const where = ["status != 'recording'"]
      const args: unknown[] = []
      const clientId = q.get('clientId')
      if (clientId) {
        const ids = await folderIds(env, clientId)
        where.push(`client_id IN (${ids.map(() => '?').join(',')})`)
        args.push(...ids)
      }
      const search = q.get('search')?.trim()
      if (search) {
        where.push('title LIKE ?')
        args.push(`%${search}%`)
      }
      const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM videos WHERE ${where.join(' AND ')}`).bind(...args).first<{ n: number }>())?.n ?? 0
      const cursor = q.get('cursor')
      if (cursor) {
        where.push('created_at < ?')
        args.push(cursor)
      }
      const { results } = await env.DB.prepare(`SELECT * FROM videos WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`).bind(...args, limit + 1).all<Row>()
      const items = await Promise.all(results.slice(0, limit).map((r) => toVideo(env, r)))
      return json({ items, total, next: results.length > limit ? (items[items.length - 1].createdAt as string) : null })
    }

    // Début d'un enregistrement : crée la vidéo et l'envoi multipart R2.
    if (!b && method === 'POST') {
      const { title, clientId } = await body<{ title: string; clientId: string | null }>(req)
      const id = uid()
      const key = `videos/${id}.mp4`
      const upload = await env.VIDEOS.createMultipartUpload(key, { httpMetadata: { contentType: 'video/mp4' } })
      const t = now()
      await env.DB.prepare(
        "INSERT INTO videos (id, title, client_id, created_at, updated_at, status, share_token, mime_type, object_key, upload_id) VALUES (?, ?, ?, ?, ?, 'recording', ?, 'video/mp4', ?, ?)",
      ).bind(id, String(title).slice(0, 200), clientId ?? null, t, t, token12(), key, upload.uploadId).run()
      return json(await toVideo(env, await getVideoRow(env, id)), 201)
    }

    if (b) {
      const video = await getVideoRow(env, b)
      if (!c && method === 'GET')
        return json({ ...(await toVideo(env, video)), playbackUrl: await mediaUrl(env, b, 'video'), qualities: await qualitiesOf(env, video) })
      // Versions allégées (720p, 480p) préparées par l'application du propriétaire.
      if (c === 'renditions' && d) {
        const q = Number(d)
        if (!QUALITIES.includes(q)) throw new HttpError(400, 'Qualité inconnue')
        const e = path[4]
        if (!e && method === 'POST') {
          await startRendition(env, video, q)
          return json({ ok: true })
        }
        if (e === 'parts' && path[5] !== undefined && method === 'PUT') {
          await uploadRenditionPart(env, b, q, Number(path[5]), await req.arrayBuffer())
          return json({ ok: true })
        }
        if (e === 'complete' && method === 'POST') {
          await completeRendition(env, b, q)
          return json({ qualities: await qualitiesOf(env, video) })
        }
      }
      // Archivage : stockage moins cher pour les vidéos qu'on ne regarde plus, toujours lisibles.
      if ((c === 'archive' || c === 'unarchive') && method === 'POST') {
        await setArchived(env, video, c === 'archive')
        return json(await toVideo(env, await getVideoRow(env, b)))
      }
      if (!c && method === 'PATCH') {
        const p = await body<Row>(req)
        const sets: string[] = []
        const args: unknown[] = []
        for (const [field, column] of [['title', 'title'], ['description', 'description'], ['clientId', 'client_id'], ['status', 'status']] as const) {
          if (field in p) {
            if (field === 'status' && !['draft', 'published'].includes(p.status as string)) continue
            sets.push(`${column} = ?`)
            args.push(p[field] ?? null)
          }
        }
        if (p.access === 'public' || p.access === 'private') {
          sets.push('access = ?')
          args.push(p.access)
        }
        if ('accessCode' in p) {
          const code = String(p.accessCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
          if (code && code.length !== 6) throw new HttpError(400, 'Le code doit faire 6 caractères')
          sets.push('access_code = ?')
          args.push(code || null)
        }
        if (Array.isArray(p.people)) {
          // On garde le lien personnel de chaque personne existante ; les nouvelles en reçoivent un.
          sets.push('people = ?')
          args.push(JSON.stringify(normalizePeople(p.people, peopleOf(video))))
        }
        if (sets.length) await env.DB.prepare(`UPDATE videos SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...args, now(), b).run()
        return json(await toVideo(env, await getVideoRow(env, b)))
      }
      if (!c && method === 'DELETE') {
        await deleteVideo(env, b)
        return json({ ok: true })
      }

      // Un morceau du fichier (8 Mo) pendant l'enregistrement. Le même numéro peut être renvoyé.
      if (c === 'parts' && d !== undefined && method === 'PUT') {
        if (!video.upload_id) throw new HttpError(409, 'Envoi déjà terminé')
        const index = Number(d)
        const data = await req.arrayBuffer()
        const part = await env.VIDEOS.resumeMultipartUpload(video.object_key as string, video.upload_id as string).uploadPart(index + 1, data)
        await env.DB.prepare('INSERT OR REPLACE INTO parts (video_id, idx, etag, size) VALUES (?, ?, ?, ?)').bind(b, index, part.etag, data.byteLength).run()
        return json({ ok: true })
      }
      // Son pour la transcription : une tranche d'environ 20 s (WAV en base64), transcrite aussitôt.
      if (c === 'audio' && d !== undefined && method === 'PUT') {
        const idx = Number(d)
        if (!Number.isInteger(idx) || idx < 0 || idx > 100_000) throw new HttpError(400, 'Tranche invalide')
        const audio = await req.text()
        if (!audio || audio.length > 4_000_000) throw new HttpError(413, 'Tranche trop grande')
        const start = Number(new URL(req.url).searchParams.get('start')) || 0
        await receiveAudio(env, b, idx, start, audio, req.headers.get('x-voices'))
        // Dernière tranche transcrite : le résumé s'écrit en arrière-plan.
        ctx.waitUntil(maybeSummarize(env, b))
        return json({ ok: true })
      }
      if (c === 'transcript' && !d && method === 'GET') {
        ctx.waitUntil(maybeSummarize(env, b)) // relance si un résumé a été interrompu
        return json(await getTranscript(env, video, new URL(req.url).searchParams.get('lang')))
      }
      if (c === 'transcript' && d === 'retry' && method === 'POST') {
        await retryFailed(env, b)
        ctx.waitUntil(maybeSummarize(env, b))
        return json(await getTranscript(env, await getVideoRow(env, b), null))
      }
      if (c === 'thumbnail' && method === 'PUT') {
        await env.VIDEOS.put(`thumbs/${b}.jpg`, await req.arrayBuffer(), { httpMetadata: { contentType: 'image/jpeg' } })
        await env.DB.prepare('UPDATE videos SET thumbnail_key = ? WHERE id = ?').bind(`thumbs/${b}.jpg`, b).run()
        return json({ ok: true })
      }
      // Fin d'enregistrement : assemble les morceaux en un seul fichier dans R2.
      if (c === 'complete' && method === 'POST') {
        const { duration, width, height, audioChunks } = await body<{ duration: number; width?: number; height?: number; audioChunks?: number }>(req)
        const { results } = await env.DB.prepare('SELECT idx, etag, size FROM parts WHERE video_id = ? ORDER BY idx').bind(b).all<Row>()
        if (!results.length) throw new HttpError(400, 'Aucun morceau reçu')
        if (video.upload_id) {
          await env.VIDEOS.resumeMultipartUpload(video.object_key as string, video.upload_id as string).complete(
            results.map((r) => ({ partNumber: (r.idx as number) + 1, etag: r.etag as string })),
          )
        }
        const size = results.reduce((n, r) => n + (r.size as number), 0)
        await env.DB.batch([
          env.DB.prepare("UPDATE videos SET status = 'draft', upload_id = NULL, duration = ?, width = ?, height = ?, size = ?, chunk_count = ?, audio_chunks = ?, updated_at = ? WHERE id = ?")
            .bind(Number(duration) || 0, width ?? null, height ?? null, size, results.length, Number.isInteger(audioChunks) ? audioChunks : null, now(), b),
          env.DB.prepare('DELETE FROM parts WHERE video_id = ?').bind(b),
        ])
        ctx.waitUntil(maybeSummarize(env, b)) // si toute la transcription est déjà là
        return json(await toVideo(env, await getVideoRow(env, b)))
      }
      if (c === 'comments' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM comments WHERE video_id = ? ORDER BY created_at').bind(b).all<Row>()
        return json(results.map(toComment))
      }
      if (c === 'comments' && method === 'POST') return json(await addComment(env, video, await body<Row>(req), true, ownerName), 201)
      if (c === 'views' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM views WHERE video_id = ? ORDER BY started_at DESC').bind(b).all<Row>()
        return json(results.map(toView))
      }
      if (c === 'download' && method === 'GET') {
        const url = await mediaUrl(env, b, 'video')
        return json({ url: `${url}&download=${encodeURIComponent(video.title as string)}` })
      }
    }
  }

  if (a === 'comments' && b && method === 'DELETE') {
    const comment = await env.DB.prepare('SELECT video_id FROM comments WHERE id = ?').bind(b).first<Row>()
    if (comment) {
      const removed = await env.DB.prepare('DELETE FROM comments WHERE id = ? OR parent_id = ?').bind(b, b).run()
      await env.DB.prepare('UPDATE videos SET comment_count = MAX(0, comment_count - ?) WHERE id = ?').bind(removed.meta.changes ?? 1, comment.video_id).run()
    }
    return json({ ok: true })
  }

  if (a === 'notifications') {
    if (method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50').all<Row>()
      const unread = (await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE read = 0').first<{ n: number }>())?.n ?? 0
      return json({ items: results.map(toNotification), unread })
    }
    if (b === 'read' && method === 'POST') {
      const { ids } = await body<{ ids?: string[] }>(req)
      if (ids?.length) await env.DB.prepare(`UPDATE notifications SET read = 1 WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).run()
      else await env.DB.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run()
      return json({ ok: true })
    }
  }

  throw new HttpError(404, 'Introuvable')
}

/** Outil privé : demande aux moteurs de recherche de ne rien indexer (pages, vidéos, vignettes). */
function noIndex(res: Response) {
  const r = new Response(res.body, res)
  r.headers.set('x-robots-tag', 'noindex, nofollow, noarchive')
  return r
}

function cors(req: Request, env: Env, res: Response) {
  const origin = req.headers.get('origin')
  if (!origin || !env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return res
  const r = new Response(res.body, res)
  r.headers.set('access-control-allow-origin', origin)
  r.headers.set('access-control-allow-headers', 'authorization, content-type, range')
  r.headers.set('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  r.headers.set('access-control-expose-headers', 'content-range, content-length, accept-ranges')
  r.headers.set('vary', 'origin')
  return r
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (req.method === 'OPTIONS') return cors(req, env, new Response(null, { status: 204 }))
    try {
      if (path[0] === 'api' || path[0] === 'media') await ensureSchema(env)
      if (path[0] === 'api') return cors(req, env, await api(req, env, path.slice(1), ctx))
      // Photos de profil : publiques (adresse impossible à deviner), gardées en cache par le navigateur.
      if (path[0] === 'media' && path[1] === 'avatar' && path[2]) {
        const obj = await env.VIDEOS.get(`avatars/${path[2].replace(/[^\w-]/g, '')}.jpg`)
        if (!obj) return new Response('Introuvable', { status: 404 })
        return noIndex(
          new Response(obj.body, {
            headers: { 'content-type': obj.httpMetadata?.contentType ?? 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' },
          }),
        )
      }
      if (path[0] === 'media' && (path[1] === 'video' || path[1] === 'thumb' || /^r\d+$/.test(path[1])) && path[2])
        return noIndex(cors(req, env, await serveMedia(req, env, path[1] as MediaKind, path[2])))
      return noIndex(await env.ASSETS.fetch(req))
    } catch (e) {
      if (e instanceof HttpError) return cors(req, env, json({ error: e.message, ...e.data }, e.status))
      console.error(e)
      // Le détail aide à comprendre une panne depuis l'application (jamais de secret dans ces messages).
      return cors(req, env, json({ error: 'Erreur serveur', detail: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) }, 500))
    }
  },
} satisfies ExportedHandler<Env>
