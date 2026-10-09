// Caméras et micros disponibles, choix mémorisés, flux d'aperçu.
import { useCallback, useEffect, useState } from 'react'

export const OFF = 'off'

const load = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d
  } catch {
    return d
  }
}
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* stockage indisponible : choix non mémorisé */
  }
}

export function useDevices() {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [cameraId, setCameraIdState] = useState(() => load('visions:camera', 'default'))
  const [micId, setMicIdState] = useState(() => load('visions:mic', 'default'))
  const [camera, setCamera] = useState<MediaStream | null>(null)
  const [mic, setMic] = useState<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [denied, setDenied] = useState(false)

  const refresh = useCallback(async () => {
    const list = await navigator.mediaDevices.enumerateDevices()
    setCameras(list.filter((d) => d.kind === 'videoinput' && d.deviceId))
    setMics(list.filter((d) => d.kind === 'audioinput' && d.deviceId))
  }, [])

  // Autorisation une fois au chargement, puis liste des appareils.
  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((s) => s.getTracks().forEach((t) => t.stop()))
      .catch(() => !cancelled && setDenied(true))
      .finally(async () => {
        if (cancelled) return
        await refresh()
        setReady(true)
      })
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener('devicechange', refresh)
    }
  }, [refresh])

  // Flux caméra (aperçu de la bulle et source de la bulle enregistrée).
  useEffect(() => {
    if (!ready || cameraId === OFF) return setCamera(null)
    let stream: MediaStream | null = null
    let cancelled = false
    const id = cameras.some((c) => c.deviceId === cameraId) ? cameraId : undefined
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: id ? { exact: id } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } })
      .then((s) => (cancelled ? s.getTracks().forEach((t) => t.stop()) : setCamera((stream = s))))
      .catch(() => setCamera(null))
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [ready, cameraId, cameras])

  // Flux micro.
  useEffect(() => {
    if (!ready || micId === OFF) return setMic(null)
    let stream: MediaStream | null = null
    let cancelled = false
    const id = mics.some((m) => m.deviceId === micId) ? micId : undefined
    navigator.mediaDevices
      .getUserMedia({ audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: true, noiseSuppression: true } })
      .then((s) => (cancelled ? s.getTracks().forEach((t) => t.stop()) : setMic((stream = s))))
      .catch(() => setMic(null))
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [ready, micId, mics])

  const setCameraId = (id: string) => {
    save('visions:camera', id)
    setCameraIdState(id)
  }
  const setMicId = (id: string) => {
    save('visions:mic', id)
    setMicIdState(id)
  }

  return { cameras, mics, cameraId, micId, setCameraId, setMicId, camera, mic, denied }
}
