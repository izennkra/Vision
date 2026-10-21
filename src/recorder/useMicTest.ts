// Test du micro (comme sur Discord) : pendant le test, le son du micro est renvoyé dans les écouteurs
// ou les haut-parleurs, et un vumètre montre ce que le micro capte. Le micro de l'enregistrement
// annule déjà l'écho : pas de larsen avec des haut-parleurs à volume normal.
import { useCallback, useEffect, useRef, useState } from 'react'

export function useMicTest(stream: MediaStream | null) {
  const [testing, setTesting] = useState(false)
  /** Niveau capté, de 0 à 1 (échelle en décibels, lissée). */
  const [level, setLevel] = useState(0)
  const live = useRef<{ ctx: AudioContext; timer: number } | null>(null)

  const stop = useCallback(() => {
    const l = live.current
    if (!l) return
    live.current = null
    window.clearInterval(l.timer)
    void l.ctx.close()
    setTesting(false)
    setLevel(0)
  }, [])

  const start = useCallback(() => {
    if (!stream || live.current) return
    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    analyser.connect(ctx.destination)
    const buf = new Float32Array(analyser.fftSize)
    let shown = 0
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf)
      let e = 0
      for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i]
      const db = 20 * Math.log10(Math.sqrt(e / buf.length) + 1e-8)
      const now = Math.min(1, Math.max(0, (db + 50) / 42)) // −50 dB : rien ; −8 dB : fort
      shown = Math.max(now, shown * 0.8) // retombée douce
      setLevel(shown)
    }, 50)
    live.current = { ctx, timer }
    setTesting(true)
  }, [stream])

  // Changement de micro, micro coupé ou page quittée : le test s'arrête.
  useEffect(() => stop, [stream, stop])

  return { testing, level, start, stop, toggle: () => (live.current ? stop() : start()) }
}
