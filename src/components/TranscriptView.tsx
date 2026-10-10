// Onglet « Transcription » : toutes les phrases de la vidéo, la phrase en cours mise en avant,
// clic sur une phrase → la vidéo va à ce moment. En bas : copier tout le texte, changer la langue.
import { useEffect, useRef, useState } from 'react'
import type { Transcript } from '../data'
import { clock } from '../lib/format'
import { LANGUAGES, languageLabel } from '../lib/languages'
import { IconCaretDown, IconCheck, IconCopy, IconTranslate } from './icons'
import { useToast } from './Toast'

interface Props {
  transcript: Transcript | null
  /** Langue choisie (null : langue d'origine). */
  lang: string | null
  onLang: (code: string) => void
  /** Moment actuel de la vidéo (secondes). */
  now: number
  onSeek: (seconds: number) => void
  canRetry?: boolean
  onRetry?: () => void
}

export function TranscriptView({ transcript, lang, onLang, now, onSeek, canRetry, onRetry }: Props) {
  const toast = useToast()
  const list = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const userScroll = useRef(0)
  const cues = transcript?.cues ?? []
  const current = cues.findIndex((c) => now >= c.start && now < c.end)
  const shownLang = lang ?? transcript?.language ?? null

  // La phrase en cours reste visible, sauf si la personne vient de faire défiler la liste elle-même.
  useEffect(() => {
    if (current < 0 || Date.now() - userScroll.current < 4000) return
    const el = list.current?.querySelector<HTMLElement>(`[data-i="${current}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [current])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  const copy = async () => {
    await navigator.clipboard.writeText(cues.map((c) => c.text).join('\n'))
    setCopied(true)
    toast('Transcription copiée')
    window.setTimeout(() => setCopied(false), 1400)
  }

  const empty = (() => {
    if (!transcript) return 'Chargement…'
    if (transcript.status === 'unavailable') return 'La transcription est disponible dans la version en ligne de Visions.'
    if (transcript.status === 'pending' && !cues.length) return 'Transcription en cours…'
    if (transcript.status === 'none') return 'Pas de transcription pour cette vidéo.'
    if (!cues.length) return 'Aucune parole détectée dans cette vidéo.'
    return null
  })()

  return (
    <div className="tr">
      <div
        ref={list}
        className="tr__list"
        onWheel={() => (userScroll.current = Date.now())}
        onTouchMove={() => (userScroll.current = Date.now())}
      >
        <div className="tr__inner">
          {empty ? (
            <p className={`tr__empty${transcript?.status === 'pending' ? ' is-pending' : ''}`}>{empty}</p>
          ) : (
            cues.map((c, i) => (
              <button key={i} data-i={i} className={`tr__cue${i === current ? ' is-now' : ''}`} onClick={() => onSeek(c.start)} title={`Aller à ${clock(c.start)}`}>
                {c.text}
              </button>
            ))
          )}
          {transcript?.status === 'pending' && cues.length > 0 && <p className="tr__empty is-pending">Transcription en cours…</p>}
          {transcript?.partial && <p className="tr__empty is-pending">Traduction en cours…</p>}
          {canRetry && transcript?.failed ? (
            <p className="tr__empty">
              Une partie n’a pas pu être transcrite. <button className="ds-accent-link" onClick={onRetry}>Réessayer</button>
            </p>
          ) : null}
        </div>
      </div>

      <div className="tr__bar">
        <button className="tr__pill" onClick={copy} disabled={!cues.length}>
          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          Copier
        </button>
        <div className="tr__lang" onPointerDown={(e) => e.stopPropagation()}>
          <button className="tr__pill" onClick={() => setMenu((m) => !m)} disabled={!cues.length && transcript?.status !== 'pending'} aria-expanded={menu}>
            <IconTranslate size={16} />
            {languageLabel(shownLang)}
            <IconCaretDown size={10} />
          </button>
          {menu && (
            <div className="tr__menu" role="menu">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  className="tr__menu-item"
                  role="menuitemradio"
                  aria-checked={l.code === shownLang}
                  onClick={() => {
                    onLang(l.code)
                    setMenu(false)
                  }}
                >
                  {l.label}
                  {l.code === transcript?.language && <span className="tr__orig">original</span>}
                  {l.code === shownLang && <IconCheck size={12} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
