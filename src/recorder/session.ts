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
// - Aucun à-coup au démarrage : tout est préparé pendant le décompte 3-2-1 (vidéo créée, fichier ouvert,
//   encodeur configuré puis « échauffé » avec une image jetée). L'encodeur est piloté directement
//   (WebCodecs) avec une file d'attente : une image n'est jamais jetée parce que l'encodeur est occupé.

import {
  AudioSample,
  AudioSampleSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  getFirstEncodableAudioCodec,
  Mp4OutputFormat,
  Output,
  StreamTarget,
} from 'mediabunny'
import { repo, type ID, type Video } from '../data'
import { filterCss } from './filters'
import { PartWriter } from './parts'
import { SpeechChunker } from './speech'

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
/** Côté le plus long de la vidéo (1920 px : net et léger). */
const MAX_SIDE = 1920
const VIDEO_BITRATE = 2_500_000
/** Images en attente d'encodage au-delà desquelles on en saute (ordinateur vraiment saturé) : 2 s. */
const MAX_QUEUE = FPS * 2
const KEYFRAME_EVERY = 2
const AUDIO_BITRATE = 128_000
/** Taille de la bulle dans la vidéo : même proportion que sur l'écran (164 px sur 874 px de haut). */
const BUBBLE_RATIO = 164 / 874

type VideoCodecName = 'avc' | 'vp9'

/** Niveau H.264 suffisant pour la taille d'image (High profile). */
function avcCodec(w: number, h: number) {
  const mbs = Math.ceil(w / 16) * Math.ceil(h / 16)
  const level = mbs <= 8192 ? 0x28 : mbs <= 8704 ? 0x2a : mbs <= 22080 ? 0x32 : 0x33
  return `avc1.6400${level.toString(16)}`
}

const vp9Codec = (w: number, h: number) => (w * h <= 2_228_224 ? 'vp09.00.40.08' : 'vp09.00.50.08')

/** Premier encodeur disponible : H.264 (MP4 lisible partout, matériel sur Mac), sinon VP9. */
async function pickVideoConfig(width: number, height: number): Promise<{ name: VideoCodecName; config: VideoEncoderConfig } | null> {
  const base = { width, height, bitrate: VIDEO_BITRATE, framerate: FPS, latencyMode: 'realtime' as const }
  const candidates: { name: VideoCodecName; config: VideoEncoderConfig }[] = [
    { name: 'avc', config: { ...base, codec: avcCodec(width, height), avc: { format: 'avc' } } as VideoEncoderConfig },
    { name: 'vp9', config: { ...base, codec: vp9Codec(width, height) } },
  ]
  for (const c of candidates) {
    try {
      if ((await VideoEncoder.isConfigSupported(c.config)).supported) return c
    } catch {
      /* essai suivant */
    }
  }
  return null
}

/** Minuterie dans un worker : contrairement à setInterval, elle n'est pas ralentie quand l'onglet est en arrière-plan. */
function ticker(ms: number, onTick: () => void) {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms})`], { type: 'text/javascript' }))
    const worker = new Worker(url)
    worker.onmessage = onTick
    return () => {
      worker.terminate()
      URL.revokeObjectURL(url)
    }
  } catch {
    const t = window.setInterval(onTick, ms)
    return () => window.clearInterval(t)
  }
}

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
  private videoSource: EncodedVideoPacketSource | null = null
  private encoder: VideoEncoder | null = null
  private encoderConfig: VideoEncoderConfig | null = null
  /** Description du flux reçue pendant l'échauffement, transmise avec la première vraie image. */
  private pendingDecoderConfig: VideoDecoderConfig | null = null
  private packets: Promise<void> = Promise.resolve()
  private lastKeyFrame = -Infinity
  private forceKeyFrame = true
  private failure: unknown = null
  /** Images sautées parce que l'ordinateur ne suivait plus (diagnostic). */
  dropped = 0
  /** Diagnostic : images reçues de l'écran et de la caméra, images encodées. */
  stats = { screen: 0, cam: 0, encoded: 0 }
  private audioSource: AudioSampleSource | null = null
  /** Son découpé pour la transcription. */
  private speech: SpeechChunker | null = null
  private writer: PartWriter | null = null
  private running = false
  private stopPumps: (() => void)[] = []

  // Chronologie : temps de la vidéo = temps écoulé depuis le début, pauses retirées.
  private startedAt = 0
  private pausedAt: number | null = null
  private pausedTotal = 0
  private lastEmit = 0
  private prepared = false
  private audioOrigin: { data: number; at: number } | null = null
  private thumbnail: Promise<Blob | null> = Promise.resolve(null)

  constructor(opts: SessionOptions) {
    this.opts = opts
    if (import.meta.env.DEV) (window as unknown as { __session?: RecordingSession }).__session = this
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

  /**
   * Prépare tout pendant le décompte : taille de l'image, vidéo créée, fichier ouvert, encodeurs configurés
   * et échauffés. Au « GO », il ne reste qu'à démarrer l'horloge.
   */
  async prepare() {
    if (!this.display) throw new Error('Aucune source choisie')
    await this.waitFirstFrame()
    const screen = this.screen!
    const scale = Math.min(1, MAX_SIDE / Math.max(screen.displayWidth, screen.displayHeight))
    // Taille fixée pour tout l'enregistrement (une fenêtre redimensionnée est ajustée dedans).
    this.canvas.width = Math.round((screen.displayWidth * scale) / 2) * 2
    this.canvas.height = Math.round((screen.displayHeight * scale) / 2) * 2
    this.draw()
    const { width, height } = this.canvas
    const picked = await pickVideoConfig(width, height)
    if (!picked) throw new Error('Ce navigateur ne sait pas encoder la vidéo. Utilise Google Chrome.')
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
    this.videoSource = new EncodedVideoPacketSource(picked.name)
    output.addVideoTrack(this.videoSource, { frameRate: FPS })
    if (audioCodec) {
      this.audioSource = new AudioSampleSource({ codec: audioCodec, bitrate: AUDIO_BITRATE })
      output.addAudioTrack(this.audioSource)
    } else this.audioSource = null
    await output.start()
    this.output = output
    this.packets = Promise.resolve()
    this.failure = null
    this.encoderConfig = picked.config
    this.openEncoder()
    // Échauffement : une image encodée puis jetée (horodatage négatif). Le premier encodage, le plus lent,
    // a lieu pendant le décompte et pas au début de la vidéo.
    const warm = new VideoFrame(this.canvas, { timestamp: -1_000_000 })
    this.encoder!.encode(warm, { keyFrame: true })
    warm.close()
    await this.encoder!.flush().catch(() => {})
    this.prepared = true
  }

  /** Démarre l'horloge : la vidéo commence maintenant. */
  begin() {
    if (!this.prepared) throw new Error('Enregistrement non préparé')
    this.startedAt = performance.now()
    this.pausedAt = null
    this.pausedTotal = 0
    this.lastEmit = 0
    this.lastKeyFrame = -Infinity
    this.forceKeyFrame = true
    this.audioOrigin = null
    this.dropped = 0
    const videoId = this.video!.id
    this.speech = this.audioTrack ? new SpeechChunker((index, start, wav) => repo.appendAudio(videoId, index, start, wav)) : null
    this.running = true
    this.emit(true) // première image tout de suite
    this.thumbnail = this.grabThumbnail()
  }

  /** Prépare et démarre d'un coup (Recommencer). */
  async start() {
    await this.prepare()
    this.begin()
  }

  private openEncoder() {
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (chunk.timestamp < 0) {
          // Image d'échauffement : on garde seulement la description du flux.
          if (meta?.decoderConfig) this.pendingDecoderConfig = meta.decoderConfig
          return
        }
        const packet = EncodedPacket.fromEncodedChunk(chunk)
        let info = meta
        if (!info?.decoderConfig && this.pendingDecoderConfig) info = { ...info, decoderConfig: this.pendingDecoderConfig }
        this.pendingDecoderConfig = null
        const source = this.videoSource!
        this.packets = this.packets.then(() => source.add(packet, info)).catch((e) => void (this.failure ??= e))
      },
      error: (e) => {
        // Chrome peut récupérer un encodeur inutilisé (onglet en arrière-plan) : on en rouvre un à la prochaine image.
        if (e.name !== 'QuotaExceededError') this.failure ??= e
      },
    })
    encoder.configure(this.encoderConfig!)
    this.encoder = encoder
    this.forceKeyFrame = true
  }

  private closeEncoder() {
    if (this.encoder && this.encoder.state !== 'closed') this.encoder.close()
    this.encoder = null
    this.prepared = false
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
    this.closeEncoder()
    await this.output?.cancel()
    if (this.video) await repo.deleteVideo(this.video.id)
    await this.start()
  }

  /** Arrête et enregistre. Renvoie la vidéo finalisée. */
  async finish(): Promise<Video | null> {
    if (!this.video || !this.output) return null
    const duration = this.duration
    this.running = false
    // On attend que toutes les images en file soient encodées et écrites.
    if (this.encoder?.state === 'configured') await this.encoder.flush().catch((e) => void (this.failure ??= e))
    await this.packets
    this.closeEncoder()
    if (this.failure) throw this.failure instanceof Error ? this.failure : new Error('L’encodage de la vidéo a échoué')
    this.speech?.flush()
    await this.output.finalize()
    await this.writer!.close()
    const thumbnail = await this.thumbnail
    const video = await repo.finishRecording(this.video.id, {
      duration,
      thumbnail,
      width: this.canvas.width,
      height: this.canvas.height,
      audioChunks: this.speech?.sent ?? 0,
    })
    this.dispose()
    return video
  }

  /** Abandon complet (quitter la page pendant l'enregistrement, par exemple). */
  async cancel() {
    this.running = false
    this.closeEncoder()
    await this.output?.cancel().catch(() => {})
    if (this.video) await repo.deleteVideo(this.video.id).catch(() => {})
    this.dispose()
  }

  dispose() {
    this.running = false
    this.closeEncoder()
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
      this.stats.screen++
      this.emit()
    })
    if (camTrack) {
      this.pump<VideoFrame>(Proc, camTrack, (f) => {
        this.cam?.close()
        this.cam = f
        this.stats.cam++
        this.emit()
      })
      this.stopPumps.push(() => camTrack.stop())
    }
    const audio = this.audioTrack
    if (audio) {
      this.pump<AudioData>(Proc, audio, (a) => this.onAudio(a))
      this.stopPumps.push(() => audio.stop())
    }

    // Écran immobile et pas de caméra : on répète la dernière image deux fois par seconde,
    // même quand Visions est en arrière-plan.
    this.stopPumps.push(
      ticker(500, () => {
        if (performance.now() - this.lastEmit > 450) this.emit(true)
      }),
    )
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
      const check = () => (this.screen ? resolve() : setTimeout(check, 30))
      check()
    })
  }

  // --- Composition et encodage ----------------------------------------------------------------

  /** Dessine l'écran (ajusté à la taille de la vidéo) et la bulle caméra en bas à gauche. */
  private draw() {
    const screen = this.screen
    if (!screen || !this.canvas.width) return
    const ctx = this.ctx
    const { width: w, height: h } = this.canvas
    // Écran ou fenêtre aux mêmes proportions : plein cadre ; sinon ajusté sur fond noir (fenêtre redimensionnée).
    const fit = Math.min(w / screen.displayWidth, h / screen.displayHeight)
    const dw = Math.round(screen.displayWidth * fit)
    const dh = Math.round(screen.displayHeight * fit)
    if (dw < w - 1 || dh < h - 1) {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(screen, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh)
    } else ctx.drawImage(screen, 0, 0, w, h)
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
  }

  /** Compose l'image et l'envoie à l'encodeur (30 images par seconde au plus). */
  private emit(force = false) {
    if (!this.screen || !this.canvas.width) return
    const now = performance.now()
    if (!force && now - this.lastEmit < 1000 / FPS - 2) return
    this.lastEmit = now
    this.draw()

    if (!this.running || this.pausedAt !== null || !this.prepared) return
    if (!this.encoder || this.encoder.state === 'closed') this.openEncoder()
    const encoder = this.encoder!
    // La file absorbe les à-coups passagers ; on ne saute une image que si l'ordinateur est saturé depuis 2 s.
    if (encoder.encodeQueueSize > MAX_QUEUE) {
      this.dropped++
      return
    }
    const t = this.timeAt(now)
    const keyFrame = this.forceKeyFrame || t - this.lastKeyFrame >= KEYFRAME_EVERY
    if (keyFrame) {
      this.lastKeyFrame = t
      this.forceKeyFrame = false
    }
    const frame = new VideoFrame(this.canvas, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / FPS) })
    try {
      encoder.encode(frame, { keyFrame })
      this.stats.encoded++
    } catch (e) {
      this.failure ??= e
    } finally {
      frame.close()
    }
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
    try {
      this.speech?.push(data, t)
    } catch {
      this.speech = null // la transcription ne doit jamais gêner l'enregistrement
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
