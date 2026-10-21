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
    // Une seule fenêtre flottante à la fois : une fenêtre déjà ouverte (clic précédent) est refaite à la bonne taille.
    api.window?.close()
    const w = await api.requestWindow({ width, height })
    // Mêmes styles (police, couleurs, notes) que la page : les feuilles de style sont recopiées.
    for (const el of document.querySelectorAll('link[rel="stylesheet"], style')) {
      const copy = el.cloneNode(true) as HTMLLinkElement | HTMLStyleElement
      // Adresse complète : la fenêtre flottante n'a pas d'adresse propre, un chemin relatif ne se chargerait pas.
      if (copy instanceof HTMLLinkElement) copy.href = (el as HTMLLinkElement).href
      w.document.head.appendChild(copy)
    }
    w.document.body.style.cssText = 'margin:0;background:#f1f1f1;overflow:hidden'
    w.addEventListener('pagehide', () => setWin(null))
    setWin(w)
    return w
  }, [])

  /** Redimensionne la fenêtre flottante (seulement depuis un clic dans cette fenêtre). */
  const resize = useCallback((width: number, height: number) => {
    try {
      api?.window?.resizeTo(width, height)
    } catch {
      /* sans geste de l'utilisateur dans la fenêtre, le navigateur refuse */
    }
  }, [])

  const close = useCallback(() => {
    api?.window?.close()
    setWin(null)
  }, [])

  useEffect(() => () => api?.window?.close(), [])
  return { win, open, close, resize }
}
