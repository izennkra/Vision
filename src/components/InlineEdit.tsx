// Texte modifiable sur place : un clic (ou `editing` piloté de l'extérieur) le transforme en champ,
// Entrée valide, Échap annule, quitter le champ valide.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface Props {
  value: string
  onSave: (value: string) => void
  placeholder?: string
  multiline?: boolean
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  /** Désactive la modification (page client). */
  readOnly?: boolean
  className?: string
  allowEmpty?: boolean
  /** Faux : on n'entre en modification que via `editing` (double-clic, menu). */
  clickToEdit?: boolean
}

export function InlineEdit({ value, onSave, placeholder, multiline, editing: ext, onEditingChange, readOnly, className, allowEmpty, clickToEdit = true }: Props) {
  const [inner, setInner] = useState(false)
  const editing = ext ?? inner
  const setEditing = (v: boolean) => (onEditingChange ? onEditingChange(v) : setInner(v))
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(value)
      requestAnimationFrame(() => {
        ref.current?.focus()
        ref.current?.select()
      })
    }
  }, [editing, value])

  // Hauteur automatique du champ multiligne.
  useLayoutEffect(() => {
    const el = ref.current
    if (multiline && el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [draft, editing, multiline])

  const commit = () => {
    const v = draft.trim()
    setEditing(false)
    if ((v || allowEmpty) && v !== value) onSave(v)
  }

  if (readOnly) return <span className={className}>{value}</span>

  if (!editing && !clickToEdit) return <span className={className}>{value}</span>
  if (!editing)
    return (
      <span className={`${className ?? ''} ds-editable`} onClick={() => setEditing(true)} title="Cliquer pour modifier">
        {value || <span className="ds-edit-placeholder">{placeholder}</span>}
      </span>
    )

  const common = {
    ref,
    className: `ds-edit ${className ?? ''}`,
    value: draft,
    placeholder,
    onBlur: commit,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraft(value)
        setEditing(false)
      } else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        commit()
      }
    },
  }
  return multiline ? <textarea rows={1} {...common} /> : <input {...common} size={Math.max(4, draft.length)} />
}
