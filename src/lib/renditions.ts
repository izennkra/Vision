// Versions allégées (720p, 480p) préparées dans le navigateur du propriétaire, en arrière-plan.
// Le fichier d'origine est relu (depuis la copie locale juste après l'enregistrement, sinon en ligne),
// réencodé plus petit par le Mac (encodeur matériel) et envoyé en morceaux comme l'original.
// Rien ne se prépare pendant un enregistrement : la priorité reste à la fluidité de la capture.
import { useEffect, useState } from 'react'
import {
  ALL_FORMATS, BlobSource, Conversion, getFirstEncodableVideoCodec, Input, Mp4OutputFormat, Output, StreamTarget, UrlSource,
} from 'mediabunny'
import { repo, type ID, type Quality } from '../data'
import { PartWriter } from '../recorder/parts'

export const TARGETS = [
  { height: 720, bitrate: 1_200_000 },
  { height: 480, bitrate: 600_000 },
]

export type JobState = { status: 'running' | 'done' | 'error'; progress: number; current: number | null; qualities?: Quality[] }

const jobs = new Map<ID, JobState>()
const cancels = new Map<ID, () => Promise<void>>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const set = (id: ID, state: JobState) => {
  jobs.set(id, state)
  emit()
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

/** Prépare les versions 720p et 480p manquantes d'une vidéo. */
export async function prepareQualities(videoId: ID, originalUrl: string) {
  if (jobs.get(videoId)?.status === 'running') return
  set(videoId, { status: 'running', progress: 0, current: null })
  let canceled = false
  let conversion: Conversion | null = null
  cancels.set(videoId, async () => {
    canceled = true
    await conversion?.cancel().catch(() => {})
  })
  try {
    const local = await repo.getLocalFile(videoId)
    const open = () => new Input({ source: local ? new BlobSource(local) : new UrlSource(originalUrl), formats: ALL_FORMATS })
    const probe = open()
    const track = await probe.getPrimaryVideoTrack()
    if (!track) throw new Error('Pas d’image dans la vidéo')
    const w = track.displayWidth
    const h = track.displayHeight
    const short = Math.min(w, h)
    const have = new Set((await repo.getQualities(videoId)).map((q) => q.height))
    const todo = TARGETS.filter((t) => t.height < short - 40 && !have.has(t.height))
    let qualities: Quality[] | undefined
    for (const [k, t] of todo.entries()) {
      if (canceled) throw new Error('annulé')
      const scale = t.height / short
      const width = even(w * scale)
      const height = even(h * scale)
      const codec = await getFirstEncodableVideoCodec(['avc', 'vp9'], { width, height, bitrate: t.bitrate })
      if (!codec) throw new Error('Encodeur indisponible')
      await repo.startRendition(videoId, t.height)
      const writer = new PartWriter(
        (index, data) => repo.appendRenditionPart(videoId, t.height, index, data),
        async () => null,
      )
      const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: new StreamTarget(writer.writable) })
      conversion = await Conversion.init({
        input: open(),
        output,
        video: { width, height, fit: 'fill', codec, bitrate: t.bitrate, keyFrameInterval: 2, forceTranscode: true },
      })
      conversion.onProgress = (p) => set(videoId, { status: 'running', progress: (k + p) / todo.length, current: t.height })
      await conversion.execute()
      await writer.close()
      qualities = await repo.completeRendition(videoId, t.height)
    }
    set(videoId, { status: 'done', progress: 1, current: null, qualities })
  } catch (e) {
    console.warn('Versions allégées', e)
    set(videoId, { status: canceled ? 'done' : 'error', progress: 0, current: null })
    if (canceled) jobs.delete(videoId)
  } finally {
    cancels.delete(videoId)
  }
}

/** Arrête toute préparation en cours (début d'un enregistrement). Elle sera reproposée plus tard. */
export async function cancelAllQualities() {
  await Promise.all([...cancels.values()].map((c) => c()))
}

/** État de la préparation d'une vidéo (pour l'afficher dans le lecteur). */
export function useQualityJob(videoId: ID | undefined) {
  const [state, setState] = useState<JobState | undefined>(() => (videoId ? jobs.get(videoId) : undefined))
  useEffect(() => {
    if (!videoId) return
    const update = () => setState(jobs.get(videoId))
    update()
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [videoId])
  return state
}
