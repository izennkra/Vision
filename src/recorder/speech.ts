// Son pour la transcription : pendant l'enregistrement, le son (micro + son de l'écran) est copié,
// ramené en mono 16 kHz (le format de Whisper) et découpé en tranches d'environ 20 secondes,
// coupées dans un silence pour ne pas couper un mot. Chaque tranche part en WAV dès qu'elle est prête :
// à l'arrêt, la transcription est presque terminée.

const RATE = 16_000
const MIN_CUT = 14 * RATE // on cherche un silence entre 14 et 24 s
const MAX_CUT = 24 * RATE
const WINDOW = RATE / 20 // fenêtres de 50 ms pour mesurer le volume
/** En dessous (≈ -50 dB), la tranche est un silence : inutile de l'envoyer. */
const SILENCE_RMS = 0.003

export type SendChunk = (index: number, start: number, wav: Blob, length: number) => void

export class SpeechChunker {
  private parts: Float32Array[] = []
  private length = 0
  private start: number | null = null
  private index = 0
  private carry: number[] = []
  /** Tranches envoyées (le serveur attend ce nombre avant d'annoncer la transcription terminée). */
  sent = 0
  private send: SendChunk

  constructor(send: SendChunk) {
    this.send = send
  }

  /** `t` : moment de ce morceau de son dans la vidéo (secondes). */
  push(data: AudioData, t: number) {
    const n = data.numberOfFrames
    const channels = data.numberOfChannels
    if (!n || !channels) return
    const mono = new Float32Array(n)
    const plane = new Float32Array(n)
    for (let c = 0; c < channels; c++) {
      data.copyTo(plane, { planeIndex: c, format: 'f32-planar' })
      for (let i = 0; i < n; i++) mono[i] += plane[i] / channels
    }
    // Réduction à 16 kHz : moyenne des échantillons de chaque intervalle (filtre simple, suffisant pour la voix).
    const step = data.sampleRate / RATE
    const input = this.carry.length ? Float32Array.from([...this.carry, ...mono]) : mono
    const count = Math.floor(input.length / step)
    const out = new Float32Array(count)
    for (let k = 0; k < count; k++) {
      const a = Math.floor(k * step)
      const b = Math.max(a + 1, Math.floor((k + 1) * step))
      let sum = 0
      for (let i = a; i < b; i++) sum += input[i]
      out[k] = sum / (b - a)
    }
    this.carry = Array.from(input.subarray(Math.floor(count * step)))
    if (this.start === null) this.start = t
    this.parts.push(out)
    this.length += out.length
    if (this.length >= MAX_CUT) this.cut(false)
  }

  /** Envoie ce qui reste (arrêt de l'enregistrement). */
  flush() {
    if (this.length >= RATE) this.cut(true)
    this.parts = []
    this.length = 0
    this.start = null
  }

  private cut(all: boolean) {
    const samples = new Float32Array(this.length)
    let o = 0
    for (const p of this.parts) {
      samples.set(p, o)
      o += p.length
    }
    let at = samples.length
    if (!all) {
      // Coupure au moment le plus calme entre 14 et 24 s.
      let best = Infinity
      for (let w = MIN_CUT; w + WINDOW <= Math.min(MAX_CUT, samples.length); w += WINDOW) {
        let e = 0
        for (let i = w; i < w + WINDOW; i++) e += samples[i] * samples[i]
        if (e < best) {
          best = e
          at = w + WINDOW / 2
        }
      }
    }
    const chunk = samples.subarray(0, at)
    const start = this.start ?? 0
    const index = this.index++
    let energy = 0
    for (let i = 0; i < chunk.length; i++) energy += chunk[i] * chunk[i]
    if (Math.sqrt(energy / Math.max(1, chunk.length)) >= SILENCE_RMS) {
      this.sent++
      this.send(index, start, toWav(chunk), chunk.length / RATE)
    }
    const rest = samples.slice(at)
    this.parts = rest.length ? [rest] : []
    this.length = rest.length
    this.start = start + at / RATE
  }
}

/** WAV PCM 16 bits mono 16 kHz. */
function toWav(samples: Float32Array) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buffer)
  const text = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)))
  text(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, RATE, true)
  v.setUint32(28, RATE * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  text(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/** Base64 sans bloquer la page (lecture par le navigateur). */
export function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}
