// Transcription des vidéos (Workers AI).
// - Pendant l'enregistrement, l'application envoie le son par tranches d'environ 20 s (WAV 16 kHz mono,
//   en base64). Chaque tranche est gardée dans R2 puis transcrite par Whisper ; les phrases sont
//   enregistrées avec leur moment dans la vidéo.
// - Les traductions sont faites à la demande (modèle m2m100), phrase par phrase, et gardées.
// Coût : Whisper ≈ 0,0005 $ par minute de son, compris dans l'allocation gratuite quotidienne de
// Workers AI pour un usage normal ; au-delà (offre gratuite), la transcription attend le lendemain.

type Row = Record<string, unknown>
export type Cue = { start: number; end: number; text: string }

interface AiLike {
  run(model: string, input: Record<string, unknown>): Promise<unknown>
}
export interface TranscribeEnv {
  DB: D1Database
  VIDEOS: R2Bucket
  AI?: AiLike
  /** Tests locaux sans Workers AI : « 1 » renvoie une transcription factice. */
  AI_MOCK?: string
}

const WHISPER = '@cf/openai/whisper-large-v3-turbo'
const TRANSLATE = '@cf/meta/m2m100-1.2b'
/** Tranches traduites par requête (chaque phrase est un appel au modèle). */
const TRANSLATE_CHUNKS_PER_CALL = 4

export const audioKey = (videoId: string, idx: number) => `audio/${videoId}/${idx}.b64`

// Phrases que Whisper invente parfois sur un silence.
const HALLUCINATIONS = [
  /sous-titr(es|age) (réalisés?|fait|par)/i,
  /amara\.org/i,
  /merci d'avoir regardé/i,
  /thanks? for watching/i,
  /abonnez-vous/i,
  /^\W*$/,
]

const cleanCues = (cues: Cue[]) =>
  cues
    .map((c) => ({ start: Math.max(0, c.start), end: Math.max(c.start, c.end), text: c.text.replace(/\s+/g, ' ').trim() }))
    .filter((c) => c.text && !HALLUCINATIONS.some((h) => h.test(c.text)))

function mockWhisper(seconds: number): unknown {
  const segments = []
  for (let t = 0; t < seconds; t += 5) segments.push({ start: t, end: Math.min(seconds, t + 5), text: `Phrase de test à ${Math.round(t)} secondes.` })
  return { text: segments.map((s) => s.text).join(' '), segments, transcription_info: { language: 'fr', duration: seconds } }
}

async function runWhisper(env: TranscribeEnv, audio: string, language: string | null) {
  if (env.AI_MOCK === '1') return mockWhisper(Math.max(1, ((audio.length * 3) / 4 - 44) / 32000))
  if (!env.AI) throw new Error('Workers AI non configuré')
  return env.AI.run(WHISPER, { audio, ...(language ? { language } : {}) })
}

/** Transcrit une tranche déjà gardée dans R2 et enregistre le résultat. */
export async function transcribeChunk(env: TranscribeEnv, videoId: string, idx: number) {
  const row = await env.DB.prepare('SELECT start FROM transcript_chunks WHERE video_id = ? AND idx = ?').bind(videoId, idx).first<Row>()
  if (!row) return
  const start = Number(row.start) || 0
  try {
    const obj = await env.VIDEOS.get(audioKey(videoId, idx))
    if (!obj) throw new Error('Son introuvable')
    const audio = await obj.text()
    // Même langue que les tranches précédentes : évite qu'une phrase courte soit prise pour une autre langue.
    const prev = await env.DB.prepare('SELECT language FROM transcript_chunks WHERE video_id = ? AND language IS NOT NULL AND idx < ? ORDER BY idx DESC LIMIT 1')
      .bind(videoId, idx)
      .first<Row>()
    const r = (await runWhisper(env, audio, (prev?.language as string) ?? null)) as {
      text?: string
      segments?: { start: number; end: number; text: string; no_speech_prob?: number }[]
      transcription_info?: { language?: string; duration?: number }
    }
    let cues: Cue[] = (r.segments ?? [])
      .filter((s) => (s.no_speech_prob ?? 0) < 0.6)
      .map((s) => ({ start: start + Number(s.start), end: start + Number(s.end), text: String(s.text ?? '') }))
    if (!r.segments && r.text) cues = [{ start, end: start + (r.transcription_info?.duration ?? 20), text: r.text }]
    const language = r.transcription_info?.language ?? (prev?.language as string) ?? null
    await env.DB.prepare("UPDATE transcript_chunks SET status = 'done', language = ?, cues = ? WHERE video_id = ? AND idx = ?")
      .bind(language, JSON.stringify(cleanCues(cues)), videoId, idx)
      .run()
  } catch (e) {
    console.error('transcription', videoId, idx, e)
    await env.DB.prepare("UPDATE transcript_chunks SET status = 'error' WHERE video_id = ? AND idx = ?").bind(videoId, idx).run()
  }
}

/** Reçoit une tranche de son (base64), la garde et la transcrit. */
export async function receiveAudio(env: TranscribeEnv, videoId: string, idx: number, start: number, audio: string) {
  await env.VIDEOS.put(audioKey(videoId, idx), audio, { httpMetadata: { contentType: 'text/plain' } })
  await env.DB.prepare("INSERT OR REPLACE INTO transcript_chunks (video_id, idx, start, status, cues) VALUES (?, ?, ?, 'pending', '[]')")
    .bind(videoId, idx, start)
    .run()
  await transcribeChunk(env, videoId, idx)
}

/** Relance les tranches en erreur (quelques-unes par appel). */
export async function retryFailed(env: TranscribeEnv, videoId: string) {
  const { results } = await env.DB.prepare("SELECT idx FROM transcript_chunks WHERE video_id = ? AND status = 'error' ORDER BY idx LIMIT 3").bind(videoId).all<Row>()
  for (const r of results) await transcribeChunk(env, videoId, Number(r.idx))
}

async function translateText(env: TranscribeEnv, text: string, from: string, to: string) {
  if (env.AI_MOCK === '1') return `[${to}] ${text}`
  if (!env.AI) throw new Error('Workers AI non configuré')
  const r = (await env.AI.run(TRANSLATE, { text, source_lang: from, target_lang: to })) as { translated_text?: string }
  return r.translated_text?.trim() || text
}

/**
 * Transcription d'une vidéo, dans sa langue d'origine ou traduite (`lang`).
 * Les traductions manquantes sont faites quelques tranches à la fois : `partial` indique qu'il faut redemander.
 */
export async function getTranscript(env: TranscribeEnv, video: Row, lang: string | null) {
  const videoId = video.id as string
  const { results } = await env.DB.prepare('SELECT idx, status, language, cues FROM transcript_chunks WHERE video_id = ? ORDER BY idx').bind(videoId).all<Row>()
  const expected = video.audio_chunks as number | null
  const recording = video.status === 'recording'
  const done = results.filter((r) => r.status === 'done')
  const failed = results.filter((r) => r.status === 'error').length
  const pending = recording || results.some((r) => r.status === 'pending') || (expected !== null && expected !== undefined && results.length < expected)
  const language = (done.find((r) => r.language)?.language as string) ?? null
  const status = pending ? 'pending' : done.length ? 'ready' : 'none'

  let partial = false
  const cues: Cue[] = []
  const target = lang && language && lang !== language ? lang : null
  if (target) {
    const { results: saved } = await env.DB.prepare('SELECT idx, cues FROM transcript_translations WHERE video_id = ? AND lang = ?').bind(videoId, target).all<Row>()
    const byIdx = new Map(saved.map((r) => [Number(r.idx), JSON.parse(r.cues as string) as Cue[]]))
    let budget = TRANSLATE_CHUNKS_PER_CALL
    for (const r of done) {
      const idx = Number(r.idx)
      let list = byIdx.get(idx)
      if (!list && budget > 0) {
        budget--
        const source = JSON.parse(r.cues as string) as Cue[]
        const from = (r.language as string) ?? language
        try {
          list = []
          for (const c of source) list.push({ ...c, text: await translateText(env, c.text, from, target) })
          await env.DB.prepare('INSERT OR REPLACE INTO transcript_translations (video_id, idx, lang, cues) VALUES (?, ?, ?, ?)')
            .bind(videoId, idx, target, JSON.stringify(list))
            .run()
        } catch (e) {
          console.error('traduction', videoId, idx, e)
          list = undefined
        }
      }
      if (list) cues.push(...list)
      else partial = true
    }
  } else for (const r of done) cues.push(...(JSON.parse(r.cues as string) as Cue[]))

  return { status, language, lang: target ?? language, cues, partial: partial || undefined, failed: failed || undefined }
}

export async function deleteTranscript(env: TranscribeEnv, videoId: string) {
  const { results } = await env.DB.prepare('SELECT idx FROM transcript_chunks WHERE video_id = ?').bind(videoId).all<Row>()
  if (results.length) await env.VIDEOS.delete(results.map((r) => audioKey(videoId, Number(r.idx))))
  await env.DB.batch([
    env.DB.prepare('DELETE FROM transcript_chunks WHERE video_id = ?').bind(videoId),
    env.DB.prepare('DELETE FROM transcript_translations WHERE video_id = ?').bind(videoId),
  ])
}
