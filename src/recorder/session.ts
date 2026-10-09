// Moteur d'enregistrement.
// - Capture l'écran (entier, une fenêtre ou un onglet), la caméra et le micro.
// - Dessine toujours la bulle caméra en bas à gauche de la vidéo finale, quelle que soit la source.
//   En écran entier, la page ferme la bulle flottante pour qu'elle ne soit pas filmée en double.
// - Enregistre par morceaux de 2 s directement dans le stockage : la mémoire reste stable,
//   même sur 1 h 30, et chaque morceau pourra être envoyé en ligne au fil de l'eau (étape 2).
// - La composition est pilotée par les images reçues (MediaStreamTrackProcessor), pas par
//   requestAnimationFrame : elle continue quand on change de fenêtre ou d'application.

import { repo, type ID, type Video } from '../data'
import { filterCss } from './filters'

export type Surface = 'monitor' | 'window' | 'browser'

export interface SessionOptions {
  surface: Surface
  camera: MediaStream | null
  mic: MediaStream | null
  filter: string
  title: string
  clientId: ID | null
}

// --- Types des API Chrome non décrites dans lib.dom -----------------------------------------
type Processor = { readable: ReadableStream<VideoFrame> }
type Generator = MediaStreamTrack & { writable: WritableStream<VideoFrame> }
const W = window as unknown as {
  MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => Processor
  MediaStreamTrackGenerator?: new (init: { kind: 'video' }) => Generator
  ImageCapture?: new (track: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> }
}

const CHUNK_MS = 2000
const FPS = 30
/** Taille de la bulle dans la vidéo : même proportion que sur l'écran (164 px sur 874 px de haut). */
const BUBBLE_RATIO = 164 / 874

export function pickMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

export class RecordingSession {
  video: Video | null = null
  private display: MediaStream | null = null
  private output: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private audioCtx: AudioContext | null = null
  private stopCompose: (() => void) | null = null
  /** Canvas de composition (quand la bulle est dessinée dans la vidéo) : sert aussi à la vignette. */
  private canvas: HTMLCanvasElement | null = null
  private writeQueue: Promise<void> = Promise.resolve()
  private chunkIndex = 0
  private elapsed = 0
  private resumedAt = 0
  private discard = false
  private thumbnail: Promise<Blob | null> = Promise.resolve(null)
  private opts: SessionOptions
  /** Appelé si l'utilisateur arrête le partage depuis la barre du navigateur. */
  onEnded: (() => void) | null = null

  constructor(opts: SessionOptions) {
    this.opts = opts
  }

  get paused() {
    return this.recorder?.state === 'paused'
  }

  /** Durée enregistrée (pauses exclues), en secondes. */
  get duration() {
    const running = this.recorder?.state === 'recording' ? performance.now() - this.resumedAt : 0
    return (this.elapsed + running) / 1000
  }

  /** Ouvre le sélecteur du navigateur (écran, fenêtre ou onglet). */
  async pickSource() {
    this.display = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: this.opts.surface, frameRate: FPS },
      audio: true,
      // Options Chrome : proposer en premier le type choisi, exclure l'onglet de Visions.
      ...({ selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'include', monitorTypeSurfaces: 'include' } as object),
    } as DisplayMediaStreamOptions)
    const track = this.display.getVideoTracks()[0]
    track.addEventListener('ended', () => this.onEnded?.())
    return (track.getSettings() as { displaySurface?: Surface }).displaySurface ?? this.opts.surface
  }

  /** Démarre (ou redémarre) l'enregistrement sur la source déjà choisie. */
  async start() {
    if (!this.display) throw new Error('Aucune source choisie')
    if (!this.output) this.output = this.buildOutput()
    const mimeType = pickMimeType()
    this.video = await repo.startRecording({ title: this.opts.title, clientId: this.opts.clientId, mimeType: mimeType || 'video/webm' })
    this.chunkIndex = 0
    this.elapsed = 0
    this.discard = false
    this.writeQueue = Promise.resolve()

    const recorder = new MediaRecorder(this.output, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 1_800_000,
      audioBitsPerSecond: 128_000,
    })
    const videoId = this.video.id
    recorder.ondataavailable = (e) => {
      if (this.discard || !e.data.size) return
      const index = this.chunkIndex++
      this.writeQueue = this.writeQueue.then(() => repo.appendChunk(videoId, index, e.data))
    }
    this.recorder = recorder
    recorder.start(CHUNK_MS)
    this.resumedAt = performance.now()
    this.thumbnail = this.grabThumbnail()
  }

  pause() {
    if (this.recorder?.state !== 'recording') return
    this.recorder.pause()
    this.elapsed += performance.now() - this.resumedAt
  }

  resume() {
    if (this.recorder?.state !== 'paused') return
    this.recorder.resume()
    this.resumedAt = performance.now()
  }

  /** Recommencer : jette l'enregistrement en cours et repart de zéro, sans redemander la source. */
  async restart() {
    await this.stopRecorder(true)
    if (this.video) await repo.deleteVideo(this.video.id)
    await this.start()
  }

  /** Arrête et enregistre. Renvoie la vidéo finalisée. */
  async finish(): Promise<Video | null> {
    if (!this.video) return null
    const duration = this.duration
    await this.stopRecorder(false)
    const thumbnail = await this.thumbnail
    const size = this.frameSize()
    const video = await repo.finishRecording(this.video.id, { duration, thumbnail, ...size })
    this.dispose()
    return video
  }

  /** Dimensions de l'image enregistrée. */
  private frameSize() {
    if (this.canvas?.width) return { width: this.canvas.width, height: this.canvas.height }
    const s = this.display?.getVideoTracks()[0]?.getSettings()
    return s?.width && s?.height ? { width: s.width, height: s.height } : {}
  }

  /** Abandon complet (quitter la page pendant l'enregistrement, par exemple). */
  async cancel() {
    await this.stopRecorder(true)
    if (this.video) await repo.deleteVideo(this.video.id)
    this.dispose()
  }

  dispose() {
    this.stopCompose?.()
    this.display?.getTracks().forEach((t) => t.stop())
    this.audioCtx?.close()
    this.display = null
    this.output = null
    this.canvas = null
  }

  private stopRecorder(discard: boolean) {
    const r = this.recorder
    if (!r || r.state === 'inactive') return this.writeQueue
    if (r.state === 'recording') this.elapsed += performance.now() - this.resumedAt
    this.discard = discard
    return new Promise<void>((resolve) => {
      r.addEventListener('stop', () => this.writeQueue.then(resolve), { once: true })
      r.stop()
    })
  }

  // --- Flux final : vidéo (avec ou sans bulle) + audio mélangé -----------------------------
  private buildOutput() {
    const display = this.display!
    const screenTrack = display.getVideoTracks()[0]
    const camTrack = this.opts.camera?.getVideoTracks()[0] ?? null
    const videoTrack = camTrack ? this.compose(screenTrack, camTrack) : screenTrack

    const audio = [...display.getAudioTracks(), ...(this.opts.mic?.getAudioTracks() ?? [])]
    let audioTracks = audio
    if (audio.length > 1) {
      const ctx = new AudioContext()
      const dest = ctx.createMediaStreamDestination()
      for (const t of audio) ctx.createMediaStreamSource(new MediaStream([t])).connect(dest)
      this.audioCtx = ctx
      audioTracks = dest.stream.getAudioTracks()
    }
    return new MediaStream([videoTrack, ...audioTracks])
  }

  private compose(screenTrack: MediaStreamTrack, camTrack: MediaStreamTrack): MediaStreamTrack {
    const filter = filterCss(this.opts.filter)
    const canvas = document.createElement('canvas')
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: false })!
    let screen: CanvasImageSource | null = null
    let cam: CanvasImageSource | null = null
    let screenSize = { w: 1280, h: 720 }
    let camSize = { w: 640, h: 480 }
    let last = 0

    const draw = () => {
      if (!screen) return
      if (canvas.width !== screenSize.w || canvas.height !== screenSize.h) {
        canvas.width = screenSize.w
        canvas.height = screenSize.h
      }
      ctx.drawImage(screen, 0, 0, canvas.width, canvas.height)
      if (cam) {
        const d = Math.round(Math.min(canvas.height * BUBBLE_RATIO, canvas.width * 0.35))
        const side = Math.min(camSize.w, camSize.h)
        const sx = (camSize.w - side) / 2
        const sy = (camSize.h - side) / 2
        const y = canvas.height - d
        ctx.save()
        ctx.beginPath()
        ctx.arc(d / 2, y + d / 2, d / 2, 0, Math.PI * 2)
        ctx.clip()
        ctx.filter = filter
        // Image miroir, comme l'aperçu.
        ctx.translate(d, y)
        ctx.scale(-1, 1)
        ctx.drawImage(cam, sx, sy, side, side, 0, 0, d, d)
        ctx.restore()
      }
    }

    const { MediaStreamTrackProcessor: Proc, MediaStreamTrackGenerator: Gen } = W
    if (Proc && Gen) {
      // Chemin principal (Chrome) : piloté par les images, non ralenti en arrière-plan.
      const generator = new Gen({ kind: 'video' })
      const writer = generator.writable.getWriter()
      let stopped = false
      const emit = () => {
        // Rien n'est émis avant la première image de l'écran (sinon la vidéo démarrerait en 300 × 150).
        if (!screen) return
        const now = performance.now()
        if (now - last < 1000 / FPS - 2) return
        last = now
        draw()
        if (!canvas.width) return
        writer.write(new VideoFrame(canvas, { timestamp: Math.round(now * 1000) })).catch(() => {})
      }
      const pump = async (track: MediaStreamTrack, onFrame: (f: VideoFrame) => void) => {
        const reader = new Proc({ track }).readable.getReader()
        while (!stopped) {
          const { value, done } = await reader.read()
          if (done || !value) break
          if (stopped) {
            value.close()
            break
          }
          onFrame(value)
          try {
            emit()
          } catch {
            /* image libérée pendant l'arrêt */
          }
        }
        reader.cancel().catch(() => {})
      }
      pump(screenTrack, (f) => {
        ;(screen as VideoFrame | null)?.close()
        screen = f
        screenSize = { w: f.displayWidth, h: f.displayHeight }
      })
      pump(camTrack.clone(), (f) => {
        ;(cam as VideoFrame | null)?.close()
        cam = f
        camSize = { w: f.displayWidth, h: f.displayHeight }
      })
      this.stopCompose = () => {
        stopped = true
        ;(screen as VideoFrame | null)?.close()
        ;(cam as VideoFrame | null)?.close()
        screen = null
        cam = null
        writer.close().catch(() => {})
      }
      return generator
    }

    // Repli (autres navigateurs) : éléments vidéo + minuterie.
    const sv = Object.assign(document.createElement('video'), { muted: true, playsInline: true, srcObject: new MediaStream([screenTrack]) })
    const cv = Object.assign(document.createElement('video'), { muted: true, playsInline: true, srcObject: new MediaStream([camTrack]) })
    sv.play()
    cv.play()
    screen = sv
    cam = cv
    const timer = window.setInterval(() => {
      if (sv.videoWidth) screenSize = { w: sv.videoWidth, h: sv.videoHeight }
      if (cv.videoWidth) camSize = { w: cv.videoWidth, h: cv.videoHeight }
      draw()
    }, 1000 / FPS)
    this.stopCompose = () => window.clearInterval(timer)
    return canvas.captureStream(FPS).getVideoTracks()[0]
  }

  /** Vignette prise 1,5 s après le début. */
  private async grabThumbnail(): Promise<Blob | null> {
    await new Promise((r) => setTimeout(r, 1500))
    try {
      let source: CanvasImageSource
      let w: number
      let h: number
      if (this.canvas?.width) {
        source = this.canvas
        w = this.canvas.width
        h = this.canvas.height
      } else {
        const track = this.display?.getVideoTracks()[0]
        if (!track || !W.ImageCapture) return null
        const b = await new W.ImageCapture(track).grabFrame()
        source = b
        w = b.width
        h = b.height
      }
      const scale = Math.min(1, 640 / w)
      const c = Object.assign(document.createElement('canvas'), { width: Math.round(w * scale), height: Math.round(h * scale) })
      c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height)
      return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8))
    } catch {
      return null
    }
  }
}
