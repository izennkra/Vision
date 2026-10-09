// Lecteur vidéo : état initial identique à la capture (fond #c4c4c4 + bouton lecture blanc),
// puis une barre de contrôle discrète au survol (lecture/pause, temps, progression avec repères
// des commentaires, plein écran).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { clock } from '../lib/format'
import { IconFullscreen, IconPause, IconPlay } from './icons'

export interface PlayerHandle {
  seek: (seconds: number, play?: boolean) => void
  currentTime: () => number
}

interface Props {
  src: string
  poster?: string | null
  /** Durée connue (secondes) : utile tant que le fichier n'a pas annoncé la sienne. */
  knownDuration?: number
  /** Format de la vidéo (largeur / hauteur), connu avant le chargement si possible. */
  aspect?: number
  markers?: number[]
  onFirstPlay?: () => void
  onProgress?: (ratio: number, seconds: number) => void
}

export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { src, poster, knownDuration = 0, aspect: knownAspect, markers = [], onFirstPlay, onProgress },
  ref,
) {
  const box = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(knownDuration)
  const [idle, setIdle] = useState(false)
  const [aspect, setAspect] = useState(knownAspect ?? 16 / 9)
  const idleTimer = useRef<number>(undefined)
  const firstPlay = useRef(false)

  const start = () => {
    setStarted(true)
    if (!firstPlay.current) {
      firstPlay.current = true
      onFirstPlay?.()
    }
  }

  useImperativeHandle(ref, () => ({
    seek(seconds, play = true) {
      const v = video.current
      if (!v) return
      v.currentTime = seconds
      setTime(seconds)
      if (play) {
        start()
        v.play()
      }
    },
    currentTime: () => video.current?.currentTime ?? 0,
  }))

  // Les enregistrements WebM n'annoncent pas leur durée : on la force à se calculer.
  const onMeta = () => {
    const v = video.current
    if (!v) return
    if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight)
    if (Number.isFinite(v.duration)) return setDuration(v.duration)
    const restore = v.currentTime
    const onUpdate = () => {
      v.removeEventListener('timeupdate', onUpdate)
      if (Number.isFinite(v.duration)) setDuration(v.duration)
      v.currentTime = restore
    }
    v.addEventListener('timeupdate', onUpdate)
    v.currentTime = 1e101
  }

  const toggle = () => {
    const v = video.current
    if (!v) return
    if (v.paused) {
      start()
      v.play()
    } else v.pause()
  }

  const wake = () => {
    setIdle(false)
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setIdle(true), 2200)
  }
  useEffect(() => () => window.clearTimeout(idleTimer.current), [])

  const seekFromBar = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    if (video.current && duration) video.current.currentTime = ratio * duration
  }

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else box.current?.requestFullscreen()
  }

  return (
    <div
      ref={box}
      className={`player${started ? ' is-started' : ''}${playing && idle ? ' is-idle' : ''}${poster ? ' has-poster' : ''}`}
      style={{ aspectRatio: String(aspect) }}
      onMouseMove={wake}
      onMouseLeave={() => setIdle(true)}
    >
      <video
        ref={video}
        src={src || undefined}
        preload="metadata"
        playsInline
        onClick={toggle}
        onDoubleClick={fullscreen}
        onLoadedMetadata={onMeta}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime
          if (t > 1e100) return
          setTime(t)
          if (duration) onProgress?.(t / duration, t)
        }}
        onEnded={() => onProgress?.(1, duration)}
      />
      {!started && poster && <img className="player__poster" src={poster} alt="" />}
      {!started && (
        <button className="player__play" onClick={toggle} aria-label="Lire la vidéo">
          <IconPlay size={12} weight="fill" />
        </button>
      )}
      {started && (
        <div className="player__bar">
          <button className="ds-hover player__btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Lecture'}>
            {playing ? <IconPause /> : <IconPlay size={11} weight="fill" />}
          </button>
          <span className="player__time">{clock(time)} / {clock(duration)}</span>
          <div className="player__track" onClick={seekFromBar}>
            <div className="player__fill" style={{ width: `${duration ? (time / duration) * 100 : 0}%` }} />
            {duration > 0 &&
              markers.map((m, i) => <span key={i} className="player__marker" style={{ left: `${(m / duration) * 100}%` }} />)}
          </div>
          <button className="ds-hover player__btn" onClick={fullscreen} aria-label="Plein écran">
            <IconFullscreen size={13} />
          </button>
        </div>
      )}
    </div>
  )
})
