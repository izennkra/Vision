// Moteur d'enregistrement.
// - Capture l'écran (entier, une fenêtre ou un onglet), la caméra et le micro.
// - Dessine toujours la bulle caméra en bas à gauche de la vidéo (la page ferme la bulle flottante
//   en écran entier pour qu'elle ne soit pas filmée en double).
// - Encode lui-même la vidéo (WebCodecs, via Mediabunny) en MP4 standard : le fichier s'ouvre
//   instantanément et se parcourt sans tout télécharger, même pour 1 h 30, sur tous les appareils.
// - Écrit le fichier en morceaux de 8 Mo au fil de l'eau (stockage local + envoi en ligne) :
//   la mémoire reste stable et la vidéo est en ligne quelques secondes après l'arrêt.
// - La composition est pilotée par les images reçues (MediaStreamTrackProcessor), pas par
//   requestAnimationFrame : elle continue quand on change de fenêtre ou d'application.
// - Pause : les images et le son sont ignorés, et le temps de la vidéo ne compte pas la pause.

import {
  AudioSample,
  AudioSampleSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  VideoSample,
  VideoSampleSource,
} from 'mediabunny'
import { repo, type ID, type Video } from '../data'
import { filterCss } from './filters'
import { PartWriter } from './parts'

export type Surface = 'monitor' | 'window' | 'browser'

export interface SessionOptions {
  surface: Surface
  camera: MediaStream | null
  mic: MediaStream | null
  filter: string
  title: string
  clientId: ID | null
}

// --- API Chrome non décrites dans lib.dom ----------------------------------------------------
type Processor<T> = { readable: ReadableStream<T> }
type ProcessorCtor = new <T>(init: { track: MediaStreamTrack }) => Processor<T>
const W = window as unknown as { MediaStreamTrackProcessor?: ProcessorCtor }

const FPS = 30
const MAX_WIDTH = 1920
const VIDEO_BITRATE = 2_500_000
const AUDIO_BITRATE = 128_000
/** Taille de la bulle dans la vidéo : même proportion que sur l'écran (164 px sur 874 px de haut). */
const BUBBLE_RATIO = 164 / 874

export const recordingSupported = () =>
  typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && !!W.MediaStreamTrackProcessor

export class RecordingSession {
  video: Video | null = null
  /** Appelé si l'utilisateur arrête le partage depuis la barre du navigateur. */
  onEnded: (() => void) | null = null

  private opts: SessionOptions
  private display: MediaStream | null = null
  private audioCtx: AudioContext | null = null
  private audioTrack: MediaStreamTrack | null = null
  private canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d', { alpha: false })!
  private screen: VideoFrame | null = null
  private cam: VideoFrame | null = null

  private output: Output | null = null
  private videoSource: VideoSampleSource | null = null
  private audioSource: AudioSampleSource | null = null
  private writer: PartWriter | null = null
  private running = false
  private stopPumps: (() => void)[] = []

  // Chronologie : temps de la vidéo = temps écoulé depuis le début, pauses retirées.
  private startedAt = 0
  private pausedAt: number | null = null
  private pausedTotal = 0
  private lastEmit = 0
  private videoBusy = false
  private audioOrigin: { data: number; at: number } | null = null
  private thumbnail: Promise<Blob | null> = Promise.resolve(null)

  constructor(opts: SessionOptions) {
    this.opts = opts
  }

  get paused() {
    return this.pausedAt !== null
  }

  /** Durée enregistrée (pauses exclues), en secondes. */
  get duration() {
    if (!this.startedAt) return 0
    return this.timeAt(this.pausedAt ?? performance.now())
  }

  private timeAt(now: number) {
    return Math.max(0, (now - this.startedAt - this.pausedTotal) / 1000)
  }

  /** Ouvre le sélecteur du navigateur (écran, fenêtre ou onglet) et prépare les flux. */
  async pickSource() {
    this.display = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: this.opts.surface, frameRate: FPS },
      audio: true,
      // Options Chrome : proposer en premier le type choisi, exclure l'onglet de Visions.
      ...({ selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'include', monitorTypeSurfaces: 'include' } as object),
    } as DisplayMediaStreamOptions)
    const track = this.display.getVideoTracks()[0]
    track.addEventListener('ended', () => this.onEnded?.())
    this.prepareAudio()
    this.startPumps()
    return (track.getSettings() as { displaySurface?: Surface }).displaySurface ?? this.opts.surface
  }

  /** Démarre (ou redémarre) l'enregistrement sur la source déjà choisie. */
  async start() {
    if (!this.display) throw new Error('Aucune source choisie')
    await this.waitFirstFrame()
    const { width, height } = this.canvas
    const videoCodec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width, height, bitrate: VIDEO_BITRATE })
    if (!videoCodec) throw new Error('Ce navigateur ne sait pas encoder la vidéo. Utilise Google Chrome.')
    const audioCodec = this.audioTrack ? await getFirstEncodableAudioCodec(['aac', 'opus'], { bitrate: AUDIO_BITRATE }) : null

    this.video = await repo.startRecording({ title: this.opts.title, clientId: this.opts.clientId, mimeType: 'video/mp4' })
    const videoId = this.video.id
    this.writer = new PartWriter(
      (index, data) => repo.appendChunk(videoId, index, data),
      (index) => repo.getChunk(videoId, index),
    )
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: false }),
      target: new StreamTarget(this.writer.writable),
    })
    this.videoSource = new VideoSampleSource({
      codec: videoCodec,
      bitrate: VIDEO_BITRATE,
      keyFrameInterval: 2,
      latencyMode: 'realtime',
      sizeChangeBehavior: 'contain',
    })
    output.addVideoTrack(this.videoSource, { frameRate: FPS })
    if (audioCodec) {
      this.audioSource = new AudioSampleSource({ codec: audioCodec, bitrate: AUDIO_BITRATE })
      output.addAudioTrack(this.audioSource)
    } else this.audioSource = null
    await output.start()
    this.output = output

    this.startedAt = performance.now()
    this.pausedAt = null
    this.pausedTotal = 0
    this.lastEmit = 0
    this.audioOrigin = null
    this.running = true
    this.thumbnail = this.grabThumbnail()
  }

  pause() {
    if (this.running && this.pausedAt === null) this.pausedAt = performance.now()
  }

  resume() {
    if (this.pausedAt === null) return
    this.pausedTotal += performance.now() - this.pausedAt
    this.pausedAt = null
  }

  /** Recommencer : jette l'enregistrement en cours et repart de zéro, sans redemander la source. */
  async restart() {
    this.running = false
    await this.output?.cancel()
    if (this.video) await repo.deleteVideo(this.video.id)
    await this.start()
  }

  /** Arrête et enregistre. Renvoie la vidéo finalisée. */
  async finish(): Promise<Video | null> {
    if (!this.video || !this.output) return null
    const duration = this.duration
    this.running = false
    await this.output.finalize()
    await this.writer!.close()
    const thumbnail = await this.thumbnail
    const video = await repo.finishRecording(this.video.id, {
      duration,
      thumbnail,
      width: this.canvas.width,
      height: this.canvas.height,
    })
    this.dispose()
    return video
  }

  /** Abandon complet (quitter la page pendant l'enregistrement, par exemple). */
  async cancel() {
    this.running = false
    await this.output?.cancel().catch(() => {})
    if (this.video) await repo.deleteVideo(this.video.id).catch(() => {})
    this.dispose()
  }

  dispose() {
    this.running = false
    this.stopPumps.forEach((stop) => stop())
    this.stopPumps = []
    this.screen?.close()
    this.cam?.close()
    this.screen = this.cam = null
    this.display?.getTracks().forEach((t) => t.stop())
    this.audioCtx?.close()
    this.display = null
  }

  // --- Flux d'entrée ------------------------------------------------------------------------

  /** Son : micro + son de l'écran (si partagé), mélangés en une seule piste. */
  private prepareAudio() {
    const tracks = [...(this.display?.getAudioTracks() ?? []), ...(this.opts.mic?.getAudioTracks() ?? [])]
    if (tracks.length === 0) return
    if (tracks.length === 1) {
      this.audioTrack = tracks[0].clone()
      return
    }
    const ctx = new AudioContext()
    const dest = ctx.createMediaStreamDestination()
    for (const t of tracks) ctx.createMediaStreamSource(new MediaStream([t])).connect(dest)
    this.audioCtx = ctx
    this.audioTrack = dest.stream.getAudioTracks()[0]
  }

  private startPumps() {
    const Proc = W.MediaStreamTrackProcessor
    if (!Proc) throw new Error('Enregistrement non pris en charge par ce navigateur. Utilise Google Chrome.')
    const screenTrack = this.display!.getVideoTracks()[0]
    const camTrack = this.opts.camera?.getVideoTracks()[0]?.clone() ?? null

    this.pump<VideoFrame>(Proc, screenTrack, (f) => {
      this.screen?.close()
      this.screen = f
      this.emit()
    })
    if (camTrack) {
      this.pump<VideoFrame>(Proc, camTrack, (f) => {
        this.cam?.close()
        this.cam = f
        this.emit()
      })
      this.stopPumps.push(() => camTrack.stop())
    }
    const audio = this.audioTrack
    if (audio) {
      this.pump<AudioData>(Proc, audio, (a) => this.onAudio(a))
      this.stopPumps.push(() => audio.stop())
    }

    // Écran immobile et pas de caméra : on répète la dernière image au moins une fois par seconde.
    const keepAlive = window.setInterval(() => {
      if (performance.now() - this.lastEmit > 900) this.emit(true)
    }, 1000)
    this.stopPumps.push(() => window.clearInterval(keepAlive))
  }

  private pump<T extends VideoFrame | AudioData>(Proc: ProcessorCtor, track: MediaStreamTrack, onData: (d: T) => void) {
    let stopped = false
    const reader = new Proc<T>({ track }).readable.getReader()
    ;(async () => {
      while (!stopped) {
        const { value, done } = await reader.read()
        if (done || !value) break
        if (stopped) {
          value.close()
          break
        }
        try {
          onData(value)
        } catch {
          value.close()
        }
      }
    })()
    this.stopPumps.push(() => {
      stopped = true
      reader.cancel().catch(() => {})
    })
  }

  private waitFirstFrame() {
    return new Promise<void>((resolve) => {
      const check = () => (this.canvas.width > 0 && this.screen ? resolve() : setTimeout(check, 30))
      check()
    })
  }

  // --- Composition et encodage ----------------------------------------------------------------

  /** Dessine l'écran (réduit à 1920 px de large au plus) et la bulle, puis envoie l'image à l'encodeur. */
  private emit(force = false) {
    const screen = this.screen
    if (!screen) return
    const now = performance.now()
    if (!force && now - this.lastEmit < 1000 / FPS - 2) return
    this.lastEmit = now

    const scale = Math.min(1, MAX_WIDTH / screen.displayWidth)
    const w = Math.round((screen.displayWidth * scale) / 2) * 2
    const h = Math.round((screen.displayHeight * scale) / 2) * 2
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    const ctx = this.ctx
    ctx.drawImage(screen, 0, 0, w, h)
    const cam = this.cam
    if (cam) {
      const d = Math.round(Math.min(h * BUBBLE_RATIO, w * 0.35))
      const side = Math.min(cam.displayWidth, cam.displayHeight)
      const sx = (cam.displayWidth - side) / 2
      const sy = (cam.displayHeight - side) / 2
      const y = h - d
      ctx.save()
      ctx.beginPath()
      ctx.arc(d / 2, y + d / 2, d / 2, 0, Math.PI * 2)
      ctx.clip()
      ctx.filter = filterCss(this.opts.filter)
      ctx.translate(d, y) // image miroir, comme l'aperçu
      ctx.scale(-1, 1)
      ctx.drawImage(cam, sx, sy, side, side, 0, 0, d, d)
      ctx.restore()
    }

    if (!this.running || this.pausedAt !== null || this.videoBusy || !this.videoSource) return
    const sample = new VideoSample(this.canvas, { timestamp: this.timeAt(now) })
    this.videoBusy = true
    this.videoSource
      .add(sample)
      .catch(() => {})
      .finally(() => {
        sample.close()
        this.videoBusy = false
      })
  }

  /** Son : horodaté sur l'horloge de capture, recalé sur la chronologie de la vidéo. */
  private onAudio(data: AudioData) {
    if (!this.running || this.pausedAt !== null || !this.audioSource) return data.close()
    const now = performance.now()
    const wall = this.timeAt(now)
    if (!this.audioOrigin) this.audioOrigin = { data: data.timestamp, at: wall }
    let t = this.audioOrigin.at + (data.timestamp - this.audioOrigin.data) / 1e6
    // Écart trop grand (reprise après une pause) : on se recale sur l'horloge de l'image.
    if (Math.abs(t - wall) > 0.25) {
      this.audioOrigin = { data: data.timestamp, at: wall }
      t = wall
    }
    const sample = new AudioSample(data) // l'échantillon prend possession de `data` (fermé avec lui)
    sample.setTimestamp(t)
    this.audioSource
      .add(sample)
      .catch(() => {})
      .finally(() => sample.close())
  }

  /** Vignette prise 1,5 s après le début. */
  private async grabThumbnail(): Promise<Blob | null> {
    await new Promise((r) => setTimeout(r, 1500))
    if (!this.canvas.width) return null
    const scale = Math.min(1, 640 / this.canvas.width)
    const c = Object.assign(document.createElement('canvas'), {
      width: Math.round(this.canvas.width * scale),
      height: Math.round(this.canvas.height * scale),
    })
    c.getContext('2d')!.drawImage(this.canvas, 0, 0, c.width, c.height)
    return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8))
  }
}
