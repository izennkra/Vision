// Fenêtre « Picture-in-Picture » de document (Chrome 116+) : reste au premier plan,
// au-dessus de toutes les applications, même quand on quitte le navigateur.
import { useCallback, useEffect, useState } from 'react'

type PipApi = { requestWindow(o: { width: number; height: number }): Promise<Window>; window: Window | null }
const api = (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture

export const pipSupported = !!api

export function usePip() {
  const [win, setWin] = useState<Window | null>(null)

  const open = useCallback(async (width: number, height: number) => {
    if (!api) return null
    if (api.window) return api.window
    const w = await api.requestWindow({ width, height })
    w.document.body.style.cssText = 'margin:0;background:#f1f1f1;overflow:hidden;font-family:system-ui,sans-serif'
    w.addEventListener('pagehide', () => setWin(null))
    setWin(w)
    return w
  }, [])

  const close = useCallback(() => {
    api?.window?.close()
    setWin(null)
  }, [])

  useEffect(() => () => api?.window?.close(), [])
  return { win, open, close }
}
