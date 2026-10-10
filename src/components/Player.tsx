// Lecteur vidéo. Avant la lecture : fond #c4c4c4 et bouton lecture blanc (capture de référence).
// Pendant la lecture, au survol : dégradé en bas, barre de progression verte (glisser pour avancer,
// repères des commentaires), lecture/pause, volume, durée « 0:00 / 3:00 », réglages, sous-titres,
// vitesse (x1 à x3) et plein écran. Raccourcis : espace, ← →, ↑ ↓, M, F, C.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Cue } from '../data'
import { clock } from '../lib/format'
import { LANGUAGES } from '../lib/languages'
import {
  IconCaptions, IconCheck, IconFullscreen, IconFullscreenExit, IconMuted, IconPause, IconPlay, IconSettings, IconVolume, IconVolumeLow,
} from './icons'

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
  /** Sous-titres (phrases de la transcription) ; null : pas de transcription. */
  captions?: Cue[] | null
  /** Langue des sous-titres et de la transcription. */
  captionLang?: string | null
  onCaptionLang?: (code: string) => void
  onFirstPlay?: () => void
  onProgress?: (ratio: number, seconds: number) => void
}

const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3]
const speedLabel = (s: number) => `x${String(s).replace('.', ',')}`

const stored = (k: string, fallback: number) => {
  try {
    const v = Number(localStorage.getItem(k))
    return localStorage.getItem(k) !== null && Number.isFinite(v) ? v : fallback
  } catch {
    return fallback
  }
}
const store = (k: string, v: number | string) => {
  try {
    localStorage.setItem(k, String(v))
  } catch {
    /* navigation privée */
  }
}

type Menu = null | 'speed' | 'settings'

export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { src, poster, knownDuration = 0, aspect: knownAspect, markers = [], captions = null, captionLang, onCaptionLang, onFirstPlay, onProgress },
  ref,
) {
  const box = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(knownDuration)
  const [idle, setIdle] = useState(false)
  const [aspect, setAspect] = useState(knownAspect ?? 16 / 9)
  const [volume, setVolume] = useState(() => Math.min(1, Math.max(0, stored('visions:volume', 1))))
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(() => (SPEEDS.includes(stored('visions:speed', 1)) ? stored('visions:speed', 1) : 1))
  const [cc, setCc] = useState(() => stored('visions:cc', 0) === 1)
  const [menu, setMenu] = useState<Menu>(null)
  const [isFull, setIsFull] = useState(false)
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  const dragging = useRef(false)
  const idleTimer = useRef<number>(undefined)
  const firstPlay = useRef(false)

  useEffect(() => setDuration((d) => d || knownDuration), [knownDuration])

  const start = useCallback(() => {
    setStarted(true)
    if (!firstPlay.current) {
      firstPlay.current = true
      onFirstPlay?.()
    }
  }, [onFirstPlay])

  useImperativeHandle(ref, () => ({
    seek(seconds, play = true) {
      const v = video.current
      if (!v) return
      v.currentTime = seconds
      setTime(seconds)
      if (play) {
        start()
        void v.play().catch(() => {})
      }
    },
    currentTime: () => video.current?.currentTime ?? 0,
  }))

  // Volume et vitesse appliqués à la vidéo (et retenus pour les prochaines).
  useEffect(() => {
    const v = video.current
    if (!v) return
    v.volume = volume
    v.muted = muted
  }, [volume, muted])
  useEffect(() => {
    if (video.current) video.current.playbackRate = speed
  }, [speed, src])

  useEffect(() => {
    const onFs = () => setIsFull(document.fullscreenElement === box.current)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // Les enregistrements WebM n'annoncent pas leur durée : on la force à se calculer.
  const onMeta = () => {
    const v = video.current
    if (!v) return
    v.playbackRate = speed
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

  const toggle = useCallback(() => {
    const v = video.current
    if (!v) return
    setMenu(null)
    if (v.paused) {
      start()
      void v.play().catch(() => {})
    } else v.pause()
  }, [start])

  const wake = () => {
    setIdle(false)
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => !dragging.current && setIdle(true), 2400)
  }
  useEffect(() => () => window.clearTimeout(idleTimer.current), [])

  const ratioAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width))
  }
  const seekTo = (t: number) => {
    const v = video.current
    if (!v || !duration) return
    const clamped = Math.min(duration, Math.max(0, t))
    v.currentTime = clamped
    setTime(clamped)
  }

  // Barre de progression : clic ou glisser.
  const onTrackDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    seekTo(ratioAt(e.clientX) * duration)
  }
  const onTrackMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return
    const ratio = ratioAt(e.clientX)
    setHover({ x: ratio * 100, t: ratio * duration })
    if (dragging.current) seekTo(ratio * duration)
  }
  const onTrackUp = () => {
    dragging.current = false
  }

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void box.current?.requestFullscreen().catch(() => {})
  }, [])

  const changeVolume = (v: number) => {
    setVolume(v)
    setMuted(v === 0)
    store('visions:volume', v)
  }
  const toggleMute = () => {
    if (muted || volume === 0) {
      setMuted(false)
      if (volume === 0) changeVolume(0.6)
    } else setMuted(true)
  }
  const chooseSpeed = (s: number) => {
    setSpeed(s)
    store('visions:speed', s)
    setMenu(null)
  }
  const toggleCc = () => {
    setCc((on) => {
      store('visions:cc', on ? 0 : 1)
      return !on
    })
  }

  // Raccourcis clavier quand le lecteur est actif (ignorés pendant la saisie d'un commentaire).
  const onKey = (e: React.KeyboardEvent) => {
    const v = video.current
    if (!v || e.metaKey || e.ctrlKey || e.altKey) return
    const keys: Record<string, () => void> = {
      ' ': toggle,
      k: toggle,
      ArrowLeft: () => seekTo(v.currentTime - 5),
      ArrowRight: () => seekTo(v.currentTime + 5),
      ArrowUp: () => changeVolume(Math.min(1, Math.round((volume + 0.1) * 10) / 10)),
      ArrowDown: () => changeVolume(Math.max(0, Math.round((volume - 0.1) * 10) / 10)),
      m: toggleMute,
      f: fullscreen,
      c: () => captions && toggleCc(),
    }
    const run = keys[e.key] ?? keys[e.key.toLowerCase()]
    if (!run) return
    e.preventDefault()
    wake()
    run()
  }

  const cue = cc && captions ? captions.find((c) => time >= c.start && time < c.end) : undefined
  const progress = duration ? Math.min(100, (time / duration) * 100) : 0
  const VolumeIcon = muted || volume === 0 ? IconMuted : volume < 0.5 ? IconVolumeLow : IconVolume
  const showControls = started && !(playing && idle && !menu)

  return (
    <div
      ref={box}
      tabIndex={0}
      className={`player${started ? ' is-started' : ''}${showControls ? ' is-active' : ''}${playing && idle && !menu ? ' is-idle' : ''}${poster ? ' has-poster' : ''}`}
      style={{ aspectRatio: String(aspect) }}
      onMouseMove={wake}
      onMouseLeave={() => !menu && setIdle(true)}
      onKeyDown={onKey}
      aria-label="Lecteur vidéo"
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
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime
          if (t > 1e100) return
          if (!dragging.current) setTime(t)
          if (duration) onProgress?.(t / duration, t)
        }}
        onEnded={() => onProgress?.(1, duration)}
      />
      {!started && poster && <img className="player__poster" src={poster} alt="" />}

      {cue && <div className={`player__caption${showControls ? ' is-raised' : ''}`}><span>{cue.text}</span></div>}

      {(!started || showControls) && (
        <button className={`player__play${started ? ' is-overlay' : ''}`} onClick={toggle} aria-label={playing ? 'Pause' : 'Lire la vidéo'}>
          {playing ? <IconPause size={12} /> : <IconPlay size={12} weight="fill" />}
        </button>
      )}
      {started && waiting && playing && <span className="player__spinner" aria-hidden />}

      {started && (
        <div className="player__controls" onClick={(e) => e.stopPropagation()}>
          <div
            ref={track}
            className="player__track"
            onPointerDown={onTrackDown}
            onPointerMove={onTrackMove}
            onPointerUp={onTrackUp}
            onPointerLeave={() => setHover(null)}
            role="slider"
            aria-label="Progression"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
          >
            <div className="player__rail" />
            <div className="player__fill" style={{ width: `${progress}%` }} />
            {duration > 0 &&
              markers.map((m, i) => <span key={i} className="player__marker" style={{ left: `${(m / duration) * 100}%` }} />)}
            <span className="player__knob" style={{ left: `${progress}%` }} />
            {hover && <span className="player__hover-time" style={{ left: `${hover.x}%` }}>{clock(hover.t)}</span>}
          </div>

          <div className="player__row">
            <div className="player__group">
              <button className="player__btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Lecture'}>
                {playing ? <IconPause size={13} /> : <IconPlay size={15} weight="fill" />}
              </button>
              <div className="player__volume">
                <button className="player__btn" onClick={toggleMute} aria-label={muted ? 'Activer le son' : 'Couper le son'}>
                  <VolumeIcon size={17} weight="fill" />
                </button>
                <input
                  className="player__volume-range"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  style={{ '--v': `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
                  aria-label="Volume"
                />
              </div>
            </div>

            <span className="player__time">{clock(time)} / {clock(duration)}</span>

            <div className="player__group player__group--end">
              <button className={`player__btn${menu === 'settings' ? ' is-on' : ''}`} onClick={() => setMenu((m) => (m === 'settings' ? null : 'settings'))} aria-label="Réglages">
                <IconSettings size={17} />
              </button>
              <button
                className={`player__btn${cc && captions ? ' is-on' : ''}`}
                onClick={toggleCc}
                disabled={!captions?.length}
                aria-pressed={cc}
                aria-label="Sous-titres"
                title={captions?.length ? (cc ? 'Masquer les sous-titres' : 'Afficher les sous-titres') : 'Sous-titres indisponibles'}
              >
                <IconCaptions size={18} weight={cc && captions ? 'fill' : 'regular'} />
              </button>
              <button className={`player__btn player__speed${menu === 'speed' ? ' is-on' : ''}`} onClick={() => setMenu((m) => (m === 'speed' ? null : 'speed'))} aria-label="Vitesse de lecture">
                {speedLabel(speed)}
              </button>
              <button className="player__btn" onClick={fullscreen} aria-label={isFull ? 'Quitter le plein écran' : 'Plein écran'}>
                {isFull ? <IconFullscreenExit size={17} /> : <IconFullscreen size={17} />}
              </button>
            </div>
          </div>
        </div>
      )}
      {menu === 'speed' && (
        <div className="player__menu" role="menu">
          <div className="player__menu-title">Vitesse</div>
          {SPEEDS.map((s) => (
            <button key={s} className="player__menu-item" role="menuitemradio" aria-checked={s === speed} onClick={() => chooseSpeed(s)}>
              {speedLabel(s)}
              {s === speed && <IconCheck size={12} />}
            </button>
          ))}
        </div>
      )}
      {menu === 'settings' && (
        <div className="player__menu" role="menu">
          <div className="player__menu-title">Sous-titres</div>
          <button className="player__menu-item" onClick={() => (setCc(false), store('visions:cc', 0), setMenu(null))}>
            Désactivés{!cc && <IconCheck size={12} />}
          </button>
          {captions?.length
            ? LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  className="player__menu-item"
                  onClick={() => {
                    onCaptionLang?.(l.code)
                    setCc(true)
                    store('visions:cc', 1)
                    setMenu(null)
                  }}
                >
                  {l.label}
                  {cc && captionLang === l.code && <IconCheck size={12} />}
                </button>
              ))
            : <div className="player__menu-note">Pas encore de transcription</div>}
          <div className="player__menu-title">Vitesse</div>
          <div className="player__menu-speeds">
            {SPEEDS.map((s) => (
              <button key={s} className={s === speed ? 'is-on' : ''} onClick={() => chooseSpeed(s)}>{speedLabel(s)}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})
