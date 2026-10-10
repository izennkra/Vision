// Qualités de lecture et archivage.
// - Qualités : en plus du fichier d'origine (jusqu'à 1080p), l'application du propriétaire prépare
//   des versions 720p et 480p, plus légères (lecture rapide sur téléphone ou petite connexion).
//   Elles sont envoyées en morceaux comme l'original et gardées à côté (videos/<id>/720p.mp4…).
// - Archivage : le fichier d'origine passe dans la classe de stockage « accès peu fréquent » de R2
//   (un tiers moins cher), les versions allégées sont supprimées. La vidéo reste lisible tout de suite,
//   dans la même qualité. Désarchiver la remet en stockage standard.

type Row = Record<string, unknown>

export interface RenditionEnv {
  DB: D1Database
  VIDEOS: R2Bucket
}

/** Hauteurs proposées en plus de l'original. */
export const QUALITIES = [720, 480]

export const renditionKey = (videoId: string, q: number) => `videos/${videoId}/${q}p.mp4`

/** Libellé de l'original d'après le petit côté de l'image (une vidéo 1920 × 1247 est une « 1080p »). */
export function qualityLabel(width: number | null, height: number | null) {
  const side = Math.min(width || 1920, height || 1080)
  if (side >= 1000) return '1080p'
  // Taille inhabituelle (fenêtre enregistrée) : on l'indique telle quelle, sans confusion avec 720p ou 480p.
  return `${side}p`
}

export async function readyRenditions(env: RenditionEnv, videoId: string) {
  const { results } = await env.DB.prepare("SELECT quality, object_key, size FROM renditions WHERE video_id = ? AND status = 'ready' ORDER BY quality DESC")
    .bind(videoId)
    .all<Row>()
  return results
}

export async function startRendition(env: RenditionEnv, video: Row, q: number) {
  if (!QUALITIES.includes(q)) throw new Error('Qualité inconnue')
  const old = await env.DB.prepare('SELECT upload_id FROM renditions WHERE video_id = ? AND quality = ?').bind(video.id, q).first<Row>()
  if (old?.upload_id) await env.VIDEOS.resumeMultipartUpload(renditionKey(video.id as string, q), old.upload_id as string).abort().catch(() => {})
  const upload = await env.VIDEOS.createMultipartUpload(renditionKey(video.id as string, q), { httpMetadata: { contentType: 'video/mp4' } })
  await env.DB.batch([
    env.DB.prepare("INSERT OR REPLACE INTO renditions (video_id, quality, object_key, upload_id, status, size) VALUES (?, ?, ?, ?, 'uploading', 0)")
      .bind(video.id, q, renditionKey(video.id as string, q), upload.uploadId),
    env.DB.prepare('DELETE FROM rendition_parts WHERE video_id = ? AND quality = ?').bind(video.id, q),
  ])
}

export async function uploadRenditionPart(env: RenditionEnv, videoId: string, q: number, index: number, data: ArrayBuffer) {
  const r = await env.DB.prepare('SELECT object_key, upload_id FROM renditions WHERE video_id = ? AND quality = ?').bind(videoId, q).first<Row>()
  if (!r?.upload_id) throw new Error('Pas d’envoi en cours')
  const part = await env.VIDEOS.resumeMultipartUpload(r.object_key as string, r.upload_id as string).uploadPart(index + 1, data)
  await env.DB.prepare('INSERT OR REPLACE INTO rendition_parts (video_id, quality, idx, etag, size) VALUES (?, ?, ?, ?, ?)')
    .bind(videoId, q, index, part.etag, data.byteLength)
    .run()
}

export async function completeRendition(env: RenditionEnv, videoId: string, q: number) {
  const r = await env.DB.prepare('SELECT object_key, upload_id FROM renditions WHERE video_id = ? AND quality = ?').bind(videoId, q).first<Row>()
  if (!r?.upload_id) throw new Error('Pas d’envoi en cours')
  const { results } = await env.DB.prepare('SELECT idx, etag, size FROM rendition_parts WHERE video_id = ? AND quality = ? ORDER BY idx').bind(videoId, q).all<Row>()
  if (!results.length) throw new Error('Aucun morceau reçu')
  await env.VIDEOS.resumeMultipartUpload(r.object_key as string, r.upload_id as string).complete(
    results.map((p) => ({ partNumber: Number(p.idx) + 1, etag: p.etag as string })),
  )
  const size = results.reduce((n, p) => n + Number(p.size), 0)
  await env.DB.batch([
    env.DB.prepare("UPDATE renditions SET status = 'ready', upload_id = NULL, size = ? WHERE video_id = ? AND quality = ?").bind(size, videoId, q),
    env.DB.prepare('DELETE FROM rendition_parts WHERE video_id = ? AND quality = ?').bind(videoId, q),
  ])
}

export async function deleteRenditions(env: RenditionEnv, videoId: string) {
  const { results } = await env.DB.prepare('SELECT quality, object_key, upload_id FROM renditions WHERE video_id = ?').bind(videoId).all<Row>()
  for (const r of results) {
    if (r.upload_id) await env.VIDEOS.resumeMultipartUpload(r.object_key as string, r.upload_id as string).abort().catch(() => {})
  }
  if (results.length) await env.VIDEOS.delete(results.map((r) => r.object_key as string))
  await env.DB.batch([
    env.DB.prepare('DELETE FROM renditions WHERE video_id = ?').bind(videoId),
    env.DB.prepare('DELETE FROM rendition_parts WHERE video_id = ?').bind(videoId),
  ])
}

/** Copie un fichier R2 dans une autre classe de stockage, en flux (rien n'est gardé en mémoire). */
async function copyObject(env: RenditionEnv, from: string, to: string, storageClass: 'Standard' | 'InfrequentAccess') {
  const obj = await env.VIDEOS.get(from)
  if (!obj) throw new Error('Fichier introuvable')
  const { readable, writable } = new FixedLengthStream(obj.size)
  const put = env.VIDEOS.put(to, readable, { httpMetadata: obj.httpMetadata, storageClass })
  await obj.body.pipeTo(writable)
  await put
}

/** Archive (ou désarchive) le fichier d'origine d'une vidéo. */
export async function setArchived(env: RenditionEnv, video: Row, archived: boolean) {
  if (!!video.archived === archived) return
  if (video.upload_id) throw new Error('Enregistrement en cours')
  const id = video.id as string
  const from = video.object_key as string
  const to = archived ? `videos/${id}-archive.mp4` : `videos/${id}.mp4`
  await copyObject(env, from, to, archived ? 'InfrequentAccess' : 'Standard')
  await env.DB.prepare('UPDATE videos SET object_key = ?, archived = ? WHERE id = ?').bind(to, archived ? 1 : 0, id).run()
  await env.VIDEOS.delete(from)
  // Les versions allégées prennent de la place : on les retire de l'archive (elles se refont ensuite).
  if (archived) await deleteRenditions(env, id)
}
