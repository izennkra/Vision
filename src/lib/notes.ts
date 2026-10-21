// Notes à lire pendant l'enregistrement : des blocs (titre, sous-titre, texte, séparateur) avec couleur,
// taille et soulignage. Gardées dans ce navigateur. Affichées dans la fenêtre flottante, qui reste au
// premier plan et n'apparaît pas dans la vidéo (enregistrement d'une fenêtre ou d'un onglet).
import { useCallback, useEffect, useRef, useState } from 'react'

export type NoteKind = 'h1' | 'h2' | 'p' | 'hr'
export type NoteSize = 's' | 'm' | 'l'

export interface Note {
  id: string
  kind: NoteKind
  text: string
  /** Couleur du texte (null : couleur par défaut). */
  color: string | null
  size: NoteSize
  underline: boolean
}

export interface NotesDoc {
  blocks: Note[]
  /** Taille de base du texte dans la fenêtre flottante (px). */
  scale: number
  /** Affichées dans la fenêtre flottante pendant l'enregistrement. */
  shown: boolean
}

export const NOTE_COLORS: { id: string | null; label: string }[] = [
  { id: null, label: 'Noir' },
  { id: '#007500', label: 'Vert' },
  { id: '#f24822', label: 'Orange' },
  { id: '#b400b4', label: 'Violet' },
  { id: '#daa520', label: 'Doré' },
  { id: '#8c8c8c', label: 'Gris' },
]
export const SCALE_MIN = 13
export const SCALE_MAX = 26
export const SCALE_DEFAULT = 16

const KEY = 'visions:notes'

export const newNote = (kind: NoteKind = 'p'): Note => ({ id: Math.random().toString(36).slice(2, 10), kind, text: '', color: null, size: 'm', underline: false })

const EMPTY: NotesDoc = { blocks: [], scale: SCALE_DEFAULT, shown: true }

export function loadNotes(): NotesDoc {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const d = JSON.parse(raw) as Partial<NotesDoc>
    return {
      blocks: Array.isArray(d.blocks) ? d.blocks.filter((b) => b && typeof b.id === 'string').map((b) => ({ ...newNote(), ...b })) : [],
      scale: Math.min(SCALE_MAX, Math.max(SCALE_MIN, Number(d.scale) || SCALE_DEFAULT)),
      shown: d.shown !== false,
    }
  } catch {
    return EMPTY
  }
}

export function saveNotes(doc: NotesDoc) {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc))
  } catch {
    /* stockage indisponible */
  }
}

/** Vrai s'il y a quelque chose à lire. */
export const hasNotes = (doc: NotesDoc) => doc.blocks.some((b) => b.kind === 'hr' || b.text.trim())

/** Notes de ce navigateur, enregistrées à chaque changement. */
export function useNotes() {
  const [doc, setDoc] = useState<NotesDoc>(loadNotes)
  const current = useRef(doc)
  current.current = doc
  // Modifiées dans un autre onglet : on recharge.
  useEffect(() => {
    const sync = (e: StorageEvent) => e.key === KEY && setDoc(loadNotes())
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  const update = useCallback((patch: Partial<NotesDoc> | ((d: NotesDoc) => NotesDoc)) => {
    const next = typeof patch === 'function' ? patch(current.current) : { ...current.current, ...patch }
    current.current = next
    setDoc(next)
    saveNotes(next)
  }, [])
  return [doc, update] as const
}
