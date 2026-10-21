// Éditeur de notes (page d'enregistrement) : une ligne par bloc. Entrée ajoute une ligne, Retour arrière sur
// une ligne vide la retire, les flèches passent d'une ligne à l'autre, la poignée permet de réordonner.
// Pour la ligne en cours : niveau (titre, sous-titre, texte), taille, soulignage, couleur, séparateur.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NOTE_COLORS, newNote, type Note, type NoteKind, type NoteSize, type NotesDoc } from '../lib/notes'
import { IconCheck, IconClose, IconGrip, IconPlus } from './icons'

interface Props {
  doc: NotesDoc
  onChange: (patch: Partial<NotesDoc> | ((d: NotesDoc) => NotesDoc)) => void
  onClose: () => void
  /** Écran entier choisi : la fenêtre flottante serait filmée. */
  fullScreen: boolean
}

const KINDS: { id: NoteKind; label: string }[] = [
  { id: 'h1', label: 'Titre' },
  { id: 'h2', label: 'Sous-titre' },
  { id: 'p', label: 'Texte' },
]
const SIZES: NoteSize[] = ['s', 'm', 'l']

const grow = (el: HTMLTextAreaElement) => {
  el.style.height = '0'
  el.style.height = `${el.scrollHeight}px`
}

export function NotesEditor({ doc, onChange, onClose, fullScreen }: Props) {
  const [active, setActive] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; over: string | null; before: boolean } | null>(null)
  const focusId = useRef<{ id: string; end?: boolean } | null>(null)
  const [focusTick, setFocusTick] = useState(0) // flèches : le focus change sans que les notes changent
  const list = useRef<HTMLDivElement>(null)
  const blocks = doc.blocks

  const setBlocks = (next: Note[]) => onChange({ blocks: next })
  const patch = (id: string, p: Partial<Note>) => setBlocks(blocks.map((b) => (b.id === id ? { ...b, ...p } : b)))
  const indexOf = (id: string | null) => (id ? blocks.findIndex((b) => b.id === id) : blocks.length - 1)

  const insertAfter = (id: string | null, kind: NoteKind = 'p') => {
    const n = newNote(kind)
    const next = [...blocks]
    next.splice(indexOf(id) + 1, 0, n)
    if (kind !== 'hr') {
      focusId.current = { id: n.id }
      setActive(n.id)
    }
    setBlocks(next)
  }

  const remove = (id: string) => {
    const i = indexOf(id)
    const next = blocks.filter((b) => b.id !== id)
    const target = [...next.slice(0, i)].reverse().find((b) => b.kind !== 'hr') ?? next.find((b) => b.kind !== 'hr')
    if (target) {
      focusId.current = { id: target.id, end: true }
      setActive(target.id)
    } else setActive(null)
    setBlocks(next)
  }

  const moveFocus = (from: string, dir: -1 | 1) => {
    const i = indexOf(from)
    for (let j = i + dir; j >= 0 && j < blocks.length; j += dir) {
      if (blocks[j].kind === 'hr') continue
      focusId.current = { id: blocks[j].id, end: dir < 0 }
      setActive(blocks[j].id)
      setFocusTick((t) => t + 1)
      return true
    }
    return false
  }

  // Hauteur des champs ajustée au texte ; focus demandé après un ajout, une suppression ou une flèche.
  useLayoutEffect(() => {
    list.current?.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(grow)
  }, [doc])
  useEffect(() => {
    const f = focusId.current
    if (!f) return
    focusId.current = null
    const el = list.current?.querySelector<HTMLTextAreaElement>(`[data-id="${f.id}"] textarea`)
    if (!el) return
    el.focus()
    const at = f.end ? el.value.length : 0
    el.setSelectionRange(at, at)
  }, [doc, focusTick])

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, b: Note) => {
    const el = e.currentTarget
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      insertAfter(b.id)
    } else if (e.key === 'Backspace' && !el.value) {
      e.preventDefault()
      remove(b.id)
    } else if (e.key === 'ArrowUp' && el.selectionStart === 0 && !el.value.slice(0, el.selectionStart).includes('\n')) {
      if (moveFocus(b.id, -1)) e.preventDefault()
    } else if (e.key === 'ArrowDown' && el.selectionEnd === el.value.length) {
      if (moveFocus(b.id, 1)) e.preventDefault()
    } else if (e.key === 'Escape') onClose()
  }

  const drop = () => {
    if (!drag?.over || drag.over === drag.id) return setDrag(null)
    const moving = blocks.find((b) => b.id === drag.id)!
    const rest = blocks.filter((b) => b.id !== drag.id)
    const at = rest.findIndex((b) => b.id === drag.over) + (drag.before ? 0 : 1)
    rest.splice(at, 0, moving)
    setBlocks(rest)
    setDrag(null)
  }

  const count = blocks.filter((b) => b.kind !== 'hr' && b.text.trim()).length

  return (
    <div className="ne" role="dialog" aria-label="Notes">
      <div className="ne__head">
        <h2 className="ne__title">Notes</h2>
        <button className="ds-hover ne__close" onClick={onClose} aria-label="Fermer"><IconClose size={14} /></button>
      </div>
      <p className="ne__hint">
        À lire pendant l’enregistrement, dans la fenêtre flottante qui reste au premier plan.
        {fullScreen ? (
          <strong className="ne__warn"> En écran entier, cette fenêtre est filmée : choisis « Une fenêtre » pour qu’elle reste invisible.</strong>
        ) : (
          ' Elle n’apparaît jamais dans la vidéo.'
        )}
      </p>
      <label className="ne__switch-row">
        <button
          type="button"
          role="switch"
          aria-checked={doc.shown}
          className={`sp__switch${doc.shown ? ' is-on' : ''}`}
          onClick={() => onChange({ shown: !doc.shown })}
        >
          <span />
        </button>
        Afficher pendant l’enregistrement
      </label>

      <div ref={list} className="ne__list" onDragOver={(e) => e.preventDefault()} onDrop={drop}>
        {blocks.length === 0 && <p className="ne__empty">Écris ce que tu veux garder sous les yeux : plan de l’appel, points à ne pas oublier, chiffres…</p>}
        {blocks.map((b) => (
          <div
            key={b.id}
            data-id={b.id}
            className={`ne__row${active === b.id ? ' is-active' : ''}${drag?.over === b.id ? (drag.before ? ' is-over-before' : ' is-over-after') : ''}${drag?.id === b.id ? ' is-dragging' : ''}`}
            onDragOver={(e) => {
              if (!drag) return
              const r = e.currentTarget.getBoundingClientRect()
              const before = e.clientY < r.top + r.height / 2
              if (drag.over !== b.id || drag.before !== before) setDrag({ ...drag, over: b.id, before })
            }}
          >
            <span
              className="ne__grip"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', b.id)
                setDrag({ id: b.id, over: null, before: false })
              }}
              onDragEnd={() => setDrag(null)}
              title="Déplacer"
            >
              <IconGrip />
            </span>
            {b.kind === 'hr' ? (
              <hr className="notes__hr ne__hr" onClick={() => setActive(b.id)} />
            ) : (
              <textarea
                className={`ds-edit ne__text notes__block notes__block--${b.kind} is-${b.size}${b.underline ? ' is-underline' : ''}`}
                style={b.color ? { color: b.color } : undefined}
                value={b.text}
                rows={1}
                placeholder={b.kind === 'h1' ? 'Titre' : b.kind === 'h2' ? 'Sous-titre' : 'Texte'}
                onFocus={() => setActive(b.id)}
                onChange={(e) => {
                  grow(e.currentTarget)
                  patch(b.id, { text: e.target.value })
                }}
                onKeyDown={(e) => onKey(e, b)}
              />
            )}
            <button className="ds-hover ne__remove" onClick={() => remove(b.id)} aria-label="Retirer" title="Retirer"><IconClose size={11} /></button>
            {active === b.id && b.kind !== 'hr' && (
              <div className="ne__tools" onMouseDown={(e) => e.preventDefault() /* le champ garde le focus */}>
                <span className="ne__group">
                  {KINDS.map((k) => (
                    <button key={k.id} className={`ne__tool${b.kind === k.id ? ' is-on' : ''}`} onClick={() => patch(b.id, { kind: k.id })}>{k.label}</button>
                  ))}
                </span>
                <span className="ne__group">
                  {SIZES.map((sz) => (
                    <button key={sz} className={`ne__tool ne__tool--${sz}${b.size === sz ? ' is-on' : ''}`} onClick={() => patch(b.id, { size: sz })} title={{ s: 'Petit', m: 'Normal', l: 'Grand' }[sz]}>A</button>
                  ))}
                  <button className={`ne__tool ne__tool--u${b.underline ? ' is-on' : ''}`} onClick={() => patch(b.id, { underline: !b.underline })} title="Souligner">U</button>
                </span>
                <span className="ne__group ne__colors">
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c.label}
                      className={`ne__dot${(b.color ?? null) === c.id ? ' is-on' : ''}`}
                      style={{ background: c.id ?? 'var(--c-ink-soft)' }}
                      onClick={() => patch(b.id, { color: c.id })}
                      aria-label={c.label}
                      title={c.label}
                    >
                      {(b.color ?? null) === c.id && <IconCheck size={9} />}
                    </button>
                  ))}
                </span>
                <button className="ne__tool" onClick={() => insertAfter(b.id, 'hr')} title="Ajouter un séparateur sous cette ligne">— Séparateur</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="ne__foot">
        <button className="ds-hover ne__add" onClick={() => insertAfter(null)}><IconPlus size={13} />Ajouter une ligne</button>
        <span className="ne__count">{count ? `${count} ligne${count > 1 ? 's' : ''}` : ''}</span>
      </div>
    </div>
  )
}
