import { useEffect, useState } from 'react'
import { repo } from '../data'
import { useInView } from '../hooks/useInView'

/** Vignette chargée seulement quand la carte approche de l'écran, libérée quand la carte disparaît. */
export function Thumbnail({ thumbKey }: { thumbKey: string | null }) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const [seen, setSeen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (inView) setSeen(true)
  }, [inView])

  useEffect(() => {
    if (!seen || !thumbKey) return
    let objectUrl: string | null = null
    let cancelled = false
    repo.getThumbnail(thumbKey).then((blob) => {
      if (cancelled || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [seen, thumbKey])

  return <div ref={ref} className="thumb-fill">{url && <img src={url} alt="" />}</div>
}
