// Enregistreur : panneau d'options (source, caméra, micro, filtre, GO), barre de contrôle flottante
// et déplaçable (On/Off, chrono, pause, recommencer), bulle caméra en bas à gauche.
// Pendant l'enregistrement, la bulle passe dans une fenêtre Picture-in-Picture qui reste
// au premier plan même dans une autre application.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { repo } from '../data'
import { useContextMenu, type MenuItem } from '../components/ContextMenu'
import { IconCamera, IconFilter, IconGrip, IconMic, IconPause, IconPlay, IconRestart, IconWindow } from '../components/icons'
import { clock } from '../lib/format'
import { downloadVideo } from '../lib/share'
import { cameraFilters, filterCss } from '../recorder/filters'
import { RecordingSession, type Surface } from '../recorder/session'
import { OFF, useDevices } from '../recorder/useDevices'
import { pipSupported, usePip } from '../recorder/usePip'
import './recorder.css'

type State = 'idle' | 'picking' | 'recording' | 'paused' | 'saving'

const surfaces: { id: Surface; label: string }[] = [
  { id: 'monitor', label: 'Écran entier' },
  { id: 'window', label: 'Une fenêtre' },
  { id: 'browser', label: 'Un onglet du navigateur' },
]

const BAR_KEY = 'visions:bar-position'

export default function Recorder() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const openMenu = useContextMenu()
  const devices = useDevices()
  const pip = usePip()
  const [surface, setSurface] = useState<Surface>('window')
  const [filter, setFilter] = useState(() => localStorage.getItem('visions:filter') ?? 'none')
  const [state, setState] = useState<State>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const session = useRef<RecordingSession | null>(null)

  const active = state === 'recording' || state === 'paused'

  // Chrono.
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setElapsed(session.current?.duration ?? 0), 250)
    return () => window.clearInterval(t)
  }, [active])

  // Quitter la page pendant un enregistrement : avertissement, puis abandon propre.
  useEffect(() => {
    if (!active) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [active])
  useEffect(() => () => void session.current?.cancel(), [])

  const stop = useCallback(async () => {
    const s = session.current
    if (!s || state === 'saving') return
    setState('saving')
    pip.close()
    const video = await s.finish()
    session.current = null
    if (!video) return setState('idle')
    await downloadVideo(video) // copie sur le Mac (dossier Téléchargements)
    navigate(`/video/${video.id}`)
  }, [state, pip, navigate])

  const go = async () => {
    if (state !== 'idle') return
    setError(null)
    // La fenêtre flottante doit s'ouvrir pendant le clic (exigence du navigateur).
    if (pipSupported) await pip.open(220, 220).catch(() => null)
    const { total } = await repo.listVideos({ search: 'Sans titre', limit: 1 })
    const s = new RecordingSession({
      surface,
      camera: devices.camera,
      mic: devices.mic,
      filter,
      title: `Sans titre ${total + 1}`,
      clientId: params.get('client'),
    })
    setState('picking')
    try {
      await s.pickSource()
    } catch (e) {
      setState('idle')
      // Annulé par l'utilisateur : on referme tout. Sinon (clic « consommé » par la fenêtre flottante),
      // un second clic sur GO ouvre directement le sélecteur.
      if (e instanceof DOMException && e.name === 'NotAllowedError') pip.close()
      else setError('Clique de nouveau sur GO pour choisir ce que tu enregistres.')
      return
    }
    s.onEnded = () => stopRef.current()
    session.current = s
    try {
      await s.start()
      setElapsed(0)
      setState('recording')
    } catch (e) {
      s.dispose()
      pip.close()
      session.current = null
      setError(e instanceof Error ? e.message : 'Enregistrement impossible')
      setState('idle')
    }
  }

  const stopRef = useRef(stop)
  useEffect(() => {
    stopRef.current = stop
  }, [stop])

  const togglePause = () => {
    const s = session.current
    if (!s) return
    if (s.paused) {
      s.resume()
      setState('recording')
    } else {
      s.pause()
      setState('paused')
    }
  }

  const restart = async () => {
    const s = session.current
    if (!s) return
    await s.restart()
    setElapsed(0)
    setState('recording')
  }

  // Menus des options, ouverts sous le bouton.
  const menuAt = (e: React.MouseEvent, items: MenuItem[]) => {
    const r = e.currentTarget.getBoundingClientRect()
    openMenu({ clientX: r.left, clientY: r.bottom + 6 }, items)
  }
  const label = (d: MediaDeviceInfo, i: number, kind: string) => d.label || `${kind} ${i + 1}`

  const camOn = devices.cameraId !== OFF && !!devices.camera
  const micOn = devices.micId !== OFF && !!devices.mic

  return (
    <div className="rec">
      <ControlBar
        state={state}
        elapsed={elapsed}
        onOn={go}
        onOff={stop}
        onPause={togglePause}
        onRestart={restart}
      />

      <div className={`rec__panel${state === 'idle' ? '' : ' is-hidden'}`}>
        <button
          className="ds-option"
          onClick={(e) => menuAt(e, surfaces.map((s) => ({ label: s.label, checked: surface === s.id, onSelect: () => setSurface(s.id) })))}
        >
          <IconWindow size={17} weight="regular" />Window
        </button>
        <button
          className={`ds-option${camOn ? '' : ' is-off'}`}
          onClick={(e) =>
            menuAt(e, [
              ...devices.cameras.map((d, i) => ({
                label: label(d, i, 'Caméra'),
                checked: devices.cameraId === d.deviceId || (devices.cameraId === 'default' && i === 0),
                onSelect: () => devices.setCameraId(d.deviceId),
              })),
              'separator' as const,
              { label: 'Sans caméra', checked: devices.cameraId === OFF, onSelect: () => devices.setCameraId(OFF) },
            ])
          }
        >
          <IconCamera size={17} weight="regular" />Caméra
        </button>
        <button
          className={`ds-option${micOn ? '' : ' is-off'}`}
          onClick={(e) =>
            menuAt(e, [
              ...devices.mics.map((d, i) => ({
                label: label(d, i, 'Micro'),
                checked: devices.micId === d.deviceId || (devices.micId === 'default' && i === 0),
                onSelect: () => devices.setMicId(d.deviceId),
              })),
              'separator' as const,
              { label: 'Sans micro', checked: devices.micId === OFF, onSelect: () => devices.setMicId(OFF) },
            ])
          }
        >
          <IconMic size={17} weight="regular" />Micro
        </button>
        <button
          className="ds-option"
          onClick={(e) =>
            menuAt(
              e,
              cameraFilters.map((f) => ({
                label: f.label,
                checked: filter === f.id,
                onSelect: () => {
                  setFilter(f.id)
                  localStorage.setItem('visions:filter', f.id)
                },
              })),
            )
          }
        >
          <IconFilter size={17} />Filtre caméra
        </button>
        <button className="ds-round-primary rec__go" onClick={go}>GO</button>
        {(error || devices.denied) && (
          <p className="rec__note">{error ?? 'Autorise la caméra et le micro dans le navigateur pour les utiliser.'}</p>
        )}
      </div>

      {devices.camera && !pip.win && (
        <div className="rec__bubble">
          <CameraVideo stream={devices.camera} filter={filter} />
        </div>
      )}

      {pip.win &&
        createPortal(
          <PipBubble stream={devices.camera} filter={filter} state={state} elapsed={elapsed} onPause={togglePause} onStop={stop} />,
          pip.win.document.body,
        )}
    </div>
  )
}

function CameraVideo({ stream, filter }: { stream: MediaStream; filter: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', filter: filterCss(filter), display: 'block' }}
    />
  )
}

interface BarProps {
  state: State
  elapsed: number
  onOn: () => void
  onOff: () => void
  onPause: () => void
  onRestart: () => void
}

/** Barre de contrôle flottante, déplaçable par sa poignée ; position mémorisée. */
function ControlBar({ state, elapsed, onOn, onOff, onPause, onRestart }: BarProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(BAR_KEY) ?? 'null')
    } catch {
      return null
    }
  })
  const bar = useRef<HTMLDivElement>(null)
  const recording = state === 'recording' || state === 'paused'

  const onPointerDown = (e: React.PointerEvent) => {
    const el = bar.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = e.clientX - r.left
    const dy = e.clientY - r.top
    e.currentTarget.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const x = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - r.width)
      const y = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - r.height)
      setPos({ x, y })
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const x = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - r.width)
      const y = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - r.height)
      try {
        localStorage.setItem(BAR_KEY, JSON.stringify({ x, y }))
      } catch {
        /* position non mémorisée */
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div ref={bar} className="rec__bar" style={pos ? { left: pos.x, top: pos.y, transform: 'none' } : undefined}>
      <div className="rec__handle" onPointerDown={onPointerDown} title="Déplacer">
        <IconGrip />
      </div>
      <div className="ds-toggle">
        <button className={recording ? 'is-on' : ''} onClick={() => state === 'idle' && onOn()}>On</button>
        <button className={recording ? '' : 'is-on'} onClick={() => recording && onOff()}>Off</button>
      </div>
      <span className="ds-timer">{clock(elapsed)}</span>
      <button className="ds-round-white" onClick={() => recording && onPause()} aria-label={state === 'paused' ? 'Reprendre' : 'Pause'}>
        {state === 'paused' ? <IconPlay size={14} weight="fill" /> : <IconPause />}
      </button>
      <button className="ds-round-white" onClick={() => recording && onRestart()} aria-label="Recommencer">
        <IconRestart size={19} weight="regular" />
      </button>
    </div>
  )
}

interface PipProps {
  stream: MediaStream | null
  filter: string
  state: State
  elapsed: number
  onPause: () => void
  onStop: () => void
}

/** Contenu de la fenêtre flottante : la bulle et, au survol, pause / arrêt. Styles en ligne (autre document). */
function PipBubble({ stream, filter, state, elapsed, onPause, onStop }: PipProps) {
  const [hover, setHover] = useState(false)
  const btn: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: 0,
    background: '#ffffff',
    color: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
  }
  return (
    <div
      style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {stream && (
        <div style={{ width: '100vmin', height: '100vmin', borderRadius: '50%', overflow: 'hidden' }}>
          <CameraVideo stream={stream} filter={filter} />
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 10,
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: hover || !stream ? 1 : 0,
          transition: 'opacity 150ms ease',
        }}
      >
        <button style={btn} onClick={onPause} title={state === 'paused' ? 'Reprendre' : 'Pause'}>
          {state === 'paused' ? <IconPlay size={12} weight="fill" /> : <IconPause />}
        </button>
        <span style={{ ...btn, width: 'auto', padding: '0 10px', height: 24, borderRadius: 999, fontSize: 11, fontWeight: 600, color: '#323232', cursor: 'default' }}>
          {clock(elapsed)}
        </span>
        <button style={{ ...btn, background: '#007500', color: '#dfdfdf' }} onClick={onStop} title="Arrêter et enregistrer">
          <span style={{ width: 10, height: 10, background: '#dfdfdf', borderRadius: 2 }} />
        </button>
      </div>
    </div>
  )
}
