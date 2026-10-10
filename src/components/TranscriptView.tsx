// Onglet « Transcription » : toutes les phrases de la vidéo, la phrase en cours mise en avant,
// clic sur une phrase → la vidéo va à ce moment. En bas : copier tout le texte, changer la langue.
import { useEffect, useRef, useState } from 'react'
import type { Cue, Transcript } from '../data'
import { clock } from '../lib/format'
import { LANGUAGES, languageLabel } from '../lib/languages'
import { IconCaretDown, IconCheck, IconCopy, IconTranslate } from './icons'
import { useToast } from './Toast'

/** Une bulle = une prise de parole : les phrases d'une même personne, jusqu'à la fin d'une phrase suivie d'une pause. */
export interface Bubble {
  start: number
  end: number
  text: string
  speaker?: Cue['speaker']
}

const ENDS_SENTENCE = /[.!?…]["»”)]?$/

/** Majuscule au début et ponctuation à la fin de chaque bulle. */
const polish = (text: string) => {
  const t = text.replace(/\s+([,.!?;:…])/g, (_, p) => (p === ':' || p === ';' || p === '!' || p === '?' ? ` ${p}` : p)).trim()
  const capped = t.charAt(0).toUpperCase() + t.slice(1)
  return ENDS_SENTENCE.test(capped) ? capped : `${capped}.`
}

export function toBubbles(cues: Cue[]): Bubble[] {
  const out: Bubble[] = []
  for (const c of cues) {
    const prev = out[out.length - 1]
    const sameVoice = prev && (prev.speaker ?? null) === (c.speaker ?? null)
    const pause = prev ? c.start - prev.end : Infinity
    // On continue la bulle si la phrase n'est pas finie, ou si elle s'enchaîne sans pause (et pas trop longue).
    const keepGoing = sameVoice && (!ENDS_SENTENCE.test(prev.text) ? pause < 2.5 : pause < 0.6 && prev.text.length < 180)
    if (prev && keepGoing) {
      prev.text = `${prev.text} ${c.text}`
      prev.end = c.end
    } else out.push({ start: c.start, end: c.end, text: c.text, speaker: c.speaker })
  }
  return out.map((b) => ({ ...b, text: polish(b.text) }))
}

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
  const bubbles = toBubbles(cues)
  const twoVoices = cues.some((c) => c.speaker === 'other')
  // Bulle en cours : de son début jusqu'au début de la suivante.
  const current = bubbles.findIndex((b, i) => now >= b.start && now < (bubbles[i + 1]?.start ?? b.end + 1))
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
    const lines = bubbles.map((b) => (twoVoices ? `${b.speaker === 'other' ? 'Interlocuteur' : 'Moi'} : ${b.text}` : b.text))
    await navigator.clipboard.writeText(lines.join('\n\n'))
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
            bubbles.map((b, i) => (
              <button
                key={i}
                data-i={i}
                className={`tr__cue${b.speaker === 'other' ? ' is-other' : ''}${i === current ? ' is-now' : ''}${i > 0 && bubbles[i - 1].speaker !== b.speaker ? ' is-turn' : ''}`}
                onClick={() => onSeek(b.start)}
                title={`Aller à ${clock(b.start)}`}
              >
                {b.text}
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
