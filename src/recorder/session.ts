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
// - Aucune saccade en cours de route : rien ne bloque le fil principal (pas de lecture de pixels, morceaux
//   de fichier dans des tampons réutilisés), chaque image d'écran est encodée (la caméra ne complète qu'entre
//   deux images d'écran), et les images sont datées à leur capture, pas à leur traitement.

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
import { cornerDepth } from './corner'
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

const liveTracks = (tracks: MediaStreamTrack[] | undefined) => (tracks ?? []).filter((t) => t.readyState === 'live')

export const recordingSupported = () =>
  typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && !!W.MediaStreamTrackProcessor

export class RecordingSession {
  video: Video | null = null
  /** Appelé si l'utilisateur arrête le partage depuis la barre du navigateur. */
  onEnded: (() => void) | null = null

  private opts: SessionOptions
  /**
   * Copies de la caméra et du micro, faites dès le clic sur GO : l'enregistrement en est indépendant.
   * (La page peut relancer ses propres flux, par exemple pendant le choix de l'écran : l'enregistrement
   * gardait alors des flux arrêtés, d'où des vidéos sans son ni caméra.)
   */
  private camTrack: MediaStreamTrack | null = null
  private micTracks: MediaStreamTrack[] = []
  private display: MediaStream | null = null
  /** Ce qui est réellement partagé (écran, fenêtre ou onglet), d'après le navigateur. */
  surface: Surface = 'window'
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
  /** Diagnostic (développement) : images encodées — source, horodatage retenu et heure de traitement (secondes). */
  times: number[] = []
  diag: { src: string; t: number; wall: number }[] = []
  private audioSource: AudioSampleSource | null = null
  /** Son découpé pour la transcription. */
  private speech: SpeechChunker | null = null
  private meters: { mic: AnalyserNode; sys: AnalyserNode; buf: Float32Array<ArrayBuffer> } | null = null
  private voices: { t: number; label: string }[] = []
  private writer: PartWriter | null = null
  private running = false
  private stopPumps: (() => void)[] = []

  // Chronologie : temps de la vidéo = temps écoulé depuis le début, pauses retirées.
  private startedAt = 0
  private pausedAt: number | null = null
  private pausedTotal = 0
  private lastEmit = 0
  private lastScreenAt = 0
  private lastTime = -1
  private prepared = false
  private audioOrigin: { data: number; at: number } | null = null
  /** Horloge de capture de chaque source, recalée sur la chronologie de la vidéo (comme le son). */
  private frameOrigin: Record<'screen' | 'cam', { ts: number; at: number } | null> = { screen: null, cam: null }
  private thumbnail: Promise<Blob | null> = Promise.resolve(null)

  constructor(opts: SessionOptions) {
    this.opts = opts
    this.camTrack = liveTracks(opts.camera?.getVideoTracks())[0]?.clone() ?? null
    this.micTracks = liveTracks(opts.mic?.getAudioTracks()).map((t) => t.clone())
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
    this.surface = (track.getSettings() as { displaySurface?: Surface }).displaySurface ?? this.opts.surface
    this.prepareAudio()
    this.startPumps()
    return this.surface
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
    this.lastTime = -1
    this.lastKeyFrame = -Infinity
    this.forceKeyFrame = true
    this.audioOrigin = null
    this.frameOrigin = { screen: null, cam: null }
    this.dropped = 0
    const videoId = this.video!.id
    this.voices = []
    this.speech = this.audioTrack
      ? new SpeechChunker((index, start, wav, length) => repo.appendAudio(videoId, index, start, wav, this.voicesFor(start, length)))
      : null
    this.running = true
    this.emit('tick') // première image tout de suite
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
    this.camTrack?.stop()
    this.micTracks.forEach((t) => t.stop())
    this.audioCtx?.close()
    this.display = null
  }

  /**
   * Ce qui manque pendant l'enregistrement : rien reçu du micro ou de la caméra depuis 3 s
   * (appareil débranché, coupé par le système…). Affiché à l'écran pour ne pas finir avec une vidéo muette.
   */
  get missing() {
    if (!this.running || this.pausedAt !== null || performance.now() - this.startedAt < 3000) return { mic: false, cam: false }
    const now = performance.now()
    return {
      mic: this.micTracks.length > 0 && now - this.lastAudioAt > 3000,
      cam: !!this.camTrack && now - this.lastCamAt > 3000,
    }
  }
  private lastAudioAt = 0
  private lastCamAt = 0

  // --- Flux d'entrée ------------------------------------------------------------------------

  /** Son : micro + son de l'écran (si partagé), mélangés en une seule piste. */
  private prepareAudio() {
    const screenTracks = this.display?.getAudioTracks() ?? []
    const micTracks = this.micTracks
    const tracks = [...screenTracks, ...micTracks]
    if (tracks.length === 0) return
    if (tracks.length === 1) {
      this.audioTrack = tracks[0].clone()
      return
    }
    const ctx = new AudioContext()
    void ctx.resume() // sans cela, un mélange créé hors d'un clic pourrait rester muet
    const dest = ctx.createMediaStreamDestination()
    // Qui parle ? Le micro, c'est toi ; le son de l'écran ou de l'onglet (Google Meet…), ce sont les autres.
    // On mesure le volume de chacun séparément pour séparer les voix dans la transcription.
    const meter = (list: MediaStreamTrack[]) => {
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      for (const t of list) {
        const src = ctx.createMediaStreamSource(new MediaStream([t]))
        src.connect(dest)
        src.connect(analyser)
      }
      return analyser
    }
    const sys = meter(screenTracks)
    const mic = meter(micTracks)
    if (screenTracks.length && micTracks.length) this.meters = { mic, sys, buf: new Float32Array(2048) }
    this.audioCtx = ctx
    this.audioTrack = dest.stream.getAudioTracks()[0]
  }

  /** Toutes les 100 ms : qui parle (m : toi, s : les autres, - : silence). */
  private sampleVoices() {
    const m = this.meters
    if (!m || !this.running || this.pausedAt !== null) return
    const rms = (a: AnalyserNode) => {
      a.getFloatTimeDomainData(m.buf)
      let e = 0
      for (let i = 0; i < m.buf.length; i++) e += m.buf[i] * m.buf[i]
      return Math.sqrt(e / m.buf.length)
    }
    const mic = rms(m.mic)
    const sys = rms(m.sys)
    const SPEECH = 0.012
    const label = Math.max(mic, sys) < SPEECH ? '-' : mic >= sys ? 'm' : 's'
    this.voices.push({ t: this.duration, label })
  }

  /** Voix d'une tranche de son : un caractère par 100 ms. */
  private voicesFor(start: number, length: number) {
    if (!this.meters) return undefined
    const out: string[] = []
    let i = 0
    for (let k = 0; k < Math.round(length * 10); k++) {
      const t = start + k / 10
      while (i < this.voices.length - 1 && this.voices[i + 1].t <= t) i++
      out.push(this.voices[i]?.label ?? '-')
    }
    // Ce qui précède la tranche ne servira plus.
    const keepFrom = this.voices.findIndex((v) => v.t >= start + length - 1)
    if (keepFrom > 0) this.voices.splice(0, keepFrom)
    return out.join('')
  }

  private startPumps() {
    const Proc = W.MediaStreamTrackProcessor
    if (!Proc) throw new Error('Enregistrement non pris en charge par ce navigateur. Utilise Google Chrome.')
    const screenTrack = this.display!.getVideoTracks()[0]
    const camTrack = this.camTrack

    this.pump<VideoFrame>(Proc, screenTrack, (f) => {
      this.screen?.close()
      this.screen = f
      this.stats.screen++
      this.emit('screen')
    })
    if (camTrack) {
      this.pump<VideoFrame>(Proc, camTrack, (f) => {
        this.cam?.close()
        this.cam = f
        this.lastCamAt = performance.now()
        this.stats.cam++
        this.emit('cam')
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
        if (performance.now() - this.lastEmit > 450) this.emit('tick')
      }),
    )
    if (this.meters) this.stopPumps.push(ticker(100, () => this.sampleVoices()))
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

  /**
   * Fenêtre enregistrée sur Mac : ses coins arrondis arrivent transparents (noirs dans la vidéo). On mesure
   * l'arrondi au plus toutes les 2 s, en lisant seulement 96 × 96 pixels de l'image, hors du fil de la composition.
   */
  private corner = { at: 0, w: 0, h: 0, r: 0, busy: false }
  private probeCorner(screen: VideoFrame) {
    const c = this.corner
    const now = performance.now()
    if (c.busy || (now - c.at < 2000 && c.w === screen.displayWidth && c.h === screen.displayHeight)) return
    Object.assign(c, { at: now, w: screen.displayWidth, h: screen.displayHeight, busy: true })
    cornerDepth(screen)
      // Au-delà de ~40 px sur la diagonale, ce n'est pas un coin de fenêtre mais du contenu sombre : on n'y touche pas.
      // Rayon du coin ≈ distance sur la diagonale / (1 − 1/√2).
      .then((d) => (c.r = d && d <= 40 ? Math.ceil(d / 0.29) + 1 : 0), () => (c.r = 0))
      .finally(() => (c.busy = false))
  }

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
    const x = Math.round((w - dw) / 2)
    const y = Math.round((h - dh) / 2)
    if (dw < w - 1 || dh < h - 1) {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.drawImage(screen, x, y, dw, dh)
    // Coins arrondis de la fenêtre : on les remplit avec la même image très légèrement agrandie (les couleurs
    // du bord), seulement dans les quatre coins. La vidéo garde des angles droits ; seul le lecteur est arrondi.
    if (this.surface === 'window') this.probeCorner(screen)
    const r = this.surface === 'window' ? this.corner.r : 0
    if (r) {
      const s = 1 + (2.4 * r) / Math.min(screen.displayWidth, screen.displayHeight)
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, dw, dh)
      ctx.roundRect(x, y, dw, dh, r * fit)
      ctx.clip('evenodd')
      ctx.drawImage(screen, x - (dw * (s - 1)) / 2, y - (dh * (s - 1)) / 2, dw * s, dh * s)
      ctx.restore()
    }
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

  /**
   * Compose l'image et l'envoie à l'encodeur. L'écran donne la cadence (30 images par seconde au plus, réglé à la
   * capture) : chacune de ses images est encodée. La caméra ne complète qu'entre deux images d'écran (écran immobile),
   * et un tic répète la dernière image quand plus rien ne bouge.
   */
  private emit(source: 'screen' | 'cam' | 'tick') {
    if (!this.screen || !this.canvas.width) return
    const now = performance.now()
    if (source === 'screen') this.lastScreenAt = now
    // La caméra ne complète que si l'écran est immobile depuis plus d'une image et demie (sinon deux images
    // quasi simultanées seraient encodées), à 30 par seconde au plus.
    if (source === 'cam' && (now - this.lastScreenAt < 1500 / FPS || now - this.lastEmit < 1000 / FPS - 2)) return
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
    const t = this.videoTime(source, now)
    const keyFrame = this.forceKeyFrame || t - this.lastKeyFrame >= KEYFRAME_EVERY
    if (keyFrame) {
      this.lastKeyFrame = t
      this.forceKeyFrame = false
    }
    const frame = new VideoFrame(this.canvas, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / FPS) })
    try {
      encoder.encode(frame, { keyFrame })
      this.stats.encoded++
      if (import.meta.env.DEV) {
        this.times.push(t)
        this.diag.push({ src: source, t, wall: this.timeAt(now) })
      }
    } catch (e) {
      this.failure ??= e
    } finally {
      frame.close()
    }
  }

  /**
   * Moment de l'image dans la vidéo : l'horloge de capture de la source (régulière, même si la page a eu un
   * instant de retard pour traiter l'image), recalée sur la chronologie de la vidéo ; toujours croissant.
   */
  private videoTime(source: 'screen' | 'cam' | 'tick', now: number) {
    const wall = this.timeAt(now)
    let t = wall
    const frame = source === 'screen' ? this.screen : source === 'cam' ? this.cam : null
    if (source !== 'tick' && frame) {
      const o = this.frameOrigin[source]
      t = o ? o.at + (frame.timestamp - o.ts) / 1e6 : wall
      // Écart trop grand (reprise après une pause, horloge qui saute) : on se recale.
      if (!o || Math.abs(t - wall) > 0.25) {
        this.frameOrigin[source] = { ts: frame.timestamp, at: wall }
        t = wall
      }
    }
    t = Math.max(t, this.lastTime + 0.001)
    this.lastTime = t
    return t
  }

  /** Son : horodaté sur l'horloge de capture, recalé sur la chronologie de la vidéo. */
  private onAudio(data: AudioData) {
    if (!this.running || this.pausedAt !== null || !this.audioSource) return data.close()
    const now = performance.now()
    this.lastAudioAt = now
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
