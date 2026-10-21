// Test du micro : on parle quelques secondes (vumètre), puis on se réécoute, exactement comme dans la vidéo
// (même micro, mêmes réglages). Pas de retour en direct dans les haut-parleurs : l'anti-écho de Chrome
// effaçait la voix (il l'entendait revenir et la prenait pour un écho), et sans lui il y aurait du larsen.
import { useCallback, useEffect, useRef, useState } from 'react'

/** Durée maximale de la prise d'essai (secondes). */
export const MIC_TEST_SECONDS = 5

type Phase = 'idle' | 'listening' | 'playing'

export function useMicTest(stream: MediaStream | null) {
  const [phase, setPhase] = useState<Phase>('idle')
  /** Niveau capté, de 0 à 1 (échelle en décibels, lissée). */
  const [level, setLevel] = useState(0)
  const [left, setLeft] = useState(MIC_TEST_SECONDS)
  const live = useRef<{ stop: () => void } | null>(null)

  const stop = useCallback(() => {
    live.current?.stop()
    live.current = null
    setPhase('idle')
    setLevel(0)
  }, [])

  const start = useCallback(() => {
    if (!stream || live.current) return
    const track = stream.getAudioTracks()[0]
    if (!track || track.readyState !== 'live') return
    const copy = new MediaStream([track.clone()])
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(copy).connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    let shown = 0
    const began = performance.now()
    const meter = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf)
      let e = 0
      for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i]
      const db = 20 * Math.log10(Math.sqrt(e / buf.length) + 1e-8)
      shown = Math.max(Math.min(1, Math.max(0, (db + 50) / 42)), shown * 0.8) // −50 dB : rien ; −8 dB : fort
      setLevel(shown)
      setLeft(Math.max(0, Math.ceil(MIC_TEST_SECONDS - (performance.now() - began) / 1000)))
    }, 50)

    const recorder = new MediaRecorder(copy)
    const parts: Blob[] = []
    let audio: HTMLAudioElement | null = null
    let url = ''
    let cancelled = false
    const cut = window.setTimeout(() => recorder.state === 'recording' && recorder.stop(), MIC_TEST_SECONDS * 1000)
    let released = false
    const release = () => {
      if (released) return
      released = true
      window.clearInterval(meter)
      window.clearTimeout(cut)
      copy.getTracks().forEach((t) => t.stop())
      void ctx.close()
    }
    recorder.ondataavailable = (e) => e.data.size && parts.push(e.data)
    recorder.onstop = () => {
      release()
      setLevel(0)
      if (cancelled || !parts.length) return
      url = URL.createObjectURL(new Blob(parts, { type: recorder.mimeType }))
      audio = new Audio(url)
      audio.onended = () => {
        URL.revokeObjectURL(url)
        if (live.current === handle) stop()
      }
      setPhase('playing')
      void audio.play().catch(() => stop())
    }
    const handle = {
      stop: () => {
        cancelled = true
        if (recorder.state === 'recording') recorder.stop()
        else release()
        audio?.pause()
        if (url) URL.revokeObjectURL(url)
      },
      /** Fin de la prise avant les 5 s : on passe tout de suite à l'écoute. */
      finish: () => recorder.state === 'recording' && recorder.stop(),
    }
    live.current = handle
    recorder.start()
    setLeft(MIC_TEST_SECONDS)
    setPhase('listening')
  }, [stream, stop])

  // Changement de micro, micro coupé ou page quittée : le test s'arrête.
  useEffect(() => stop, [stream, stop])

  /** Un clic : démarre ; pendant la prise : passe à l'écoute ; pendant l'écoute : arrête. */
  const toggle = () => {
    if (phase === 'idle') return start()
    if (phase === 'listening') return (live.current as { finish?: () => void } | null)?.finish?.()
    stop()
  }

  return { phase, testing: phase !== 'idle', level, left, start, stop, toggle }
}
