// Liste de personnes modifiable : nom, e-mail facultatif, photo de profil (couleur de la DA ou photo importée).
// Utilisée pour l'équipe d'un dossier (dashboard) et pour les personnes d'une vidéo (panneau Partager).
// Chaque changement est enregistré tout de suite (sortie d'un champ, ajout, suppression, couleur, photo).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { repo, type ID, type Person, type PersonInput } from '../data'
import { AVATAR_COLORS } from '../lib/people'
import { Eye, Initials } from './Initials'
import { IconCheck, IconClose, IconPlus } from './icons'
import { useToast } from './Toast'

type Row = { key: string; id?: ID; name: string; email: string; color: string | null; avatar: string | null }

const toRows = (people: Person[]): Row[] =>
  people.map((p) => ({ key: p.id, id: p.id, name: p.name, email: p.email ?? '', color: p.color ?? null, avatar: p.avatar ?? null }))
const valid = (r: Row) => !!r.name.trim() && r.name.trim().toLowerCase() !== 'anonyme'
const toInput = (r: Row): PersonInput => ({ id: r.id, name: r.name.trim(), email: r.email.trim() || null, color: r.color, avatar: r.avatar })
let nextKey = 0

/** Photo importée : recadrée au carré et réduite à 256 px (légère, nette). */
export async function squareImage(file: File) {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 256 })
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256)
  bitmap.close()
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image illisible'))), 'image/jpeg', 0.86))
}

interface Props {
  people: Person[]
  /** Enregistre la liste ; renvoie la liste enregistrée (même ordre). */
  onSave: (people: PersonInput[]) => Promise<Person[]>
  /** Boutons en plus pour une personne enregistrée (inviter, lien personnel…). */
  actions?: (person: Person) => ReactNode
  /** Une ligne vide prête à remplir si la liste est vide. */
  startWithEmptyRow?: boolean
  addLabel?: string
}

export function PeopleEditor({ people, onSave, actions, startWithEmptyRow = false, addLabel = 'Ajouter une personne' }: Props) {
  const toast = useToast()
  const [rows, setRows] = useState<Row[]>(() =>
    people.length || !startWithEmptyRow ? toRows(people) : [{ key: `n${nextKey++}`, name: '', email: '', color: null, avatar: null }],
  )
  const [picker, setPicker] = useState<string | null>(null)
  const focusKey = useRef<string | null>(!people.length && startWithEmptyRow ? rows[0]?.key ?? null : null)
  const saving = useRef<Promise<unknown>>(Promise.resolve())
  const savedRef = useRef(people)
  savedRef.current = people

  useEffect(() => {
    if (!picker) return
    const close = (e: PointerEvent) => !(e.target as Element).closest?.('.pe__picker, .pe__avatar') && setPicker(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [picker])

  /** Enregistre si quelque chose a changé ; renvoie la liste enregistrée. */
  const save = (list: Row[]) => {
    const payload = list.filter(valid).map(toInput)
    const before = savedRef.current.map((p) => toInput({ key: p.id, id: p.id, name: p.name, email: p.email ?? '', color: p.color ?? null, avatar: p.avatar ?? null }))
    const run = saving.current.then(async () => {
      if (JSON.stringify(payload) === JSON.stringify(before)) return savedRef.current
      const savedList = await onSave(payload)
      savedRef.current = savedList
      // L'ordre est gardé : chaque nouvelle ligne reçoit son identifiant, sans toucher à la saisie en cours.
      const ids = new Map(list.filter(valid).map((r, i) => [r.key, savedList[i]?.id]))
      setRows((cur) => cur.map((r) => (ids.get(r.key) ? { ...r, id: ids.get(r.key) } : r)))
      return savedList
    })
    saving.current = run.catch(() => {})
    return run
  }

  const edit = (key: string, patch: Partial<Row>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const add = () => {
    const key = `n${nextKey++}`
    focusKey.current = key
    setRows((cur) => [...cur, { key, name: '', email: '', color: null, avatar: null }])
  }

  const remove = (key: string) => {
    const list = rows.filter((r) => r.key !== key)
    setRows(list)
    void save(list)
  }

  const setLook = (key: string, patch: Partial<Row>) => {
    const list = rows.map((r) => (r.key === key ? { ...r, ...patch } : r))
    setRows(list)
    void save(list)
  }

  const importPhoto = async (key: string, file: File | undefined) => {
    if (!file) return
    const row = rows.find((r) => r.key === key)
    if (!row || !valid(row)) return toast('Écrivez d’abord le nom de la personne')
    try {
      const image = await squareImage(file)
      // Une personne pas encore enregistrée l'est d'abord (il faut son identifiant).
      let id = row.id
      if (!id) {
        const savedList = await save(rows)
        id = savedList[rows.filter(valid).findIndex((r) => r.key === key)]?.id
      }
      if (!id) return
      const url = await repo.uploadAvatar(id, image)
      setPicker(null)
      setRows((cur) => {
        const list = cur.map((r) => (r.key === key ? { ...r, id, avatar: url } : r))
        void save(list)
        return list
      })
    } catch {
      toast('Cette image n’a pas pu être importée')
    }
  }

  return (
    <>
      <ul className="sp__people">
        {rows.map((r) => {
          const person = savedRef.current.find((p) => p.id === r.id)
          return (
            <li key={r.key} className="sp__person">
              <div className="pe__look">
                <button
                  className="pe__avatar"
                  onClick={() => setPicker((k) => (k === r.key ? null : r.key))}
                  aria-label="Choisir la photo de profil"
                  title="Couleur ou photo de profil"
                >
                  <Initials name={r.name || 'Nouvelle personne'} person={{ color: r.color, avatar: r.avatar }} className="sp__initials" />
                </button>
                {picker === r.key && (
                  <div className="pe__picker" role="dialog" aria-label="Photo de profil">
                    <div className="pe__picker-title">Photo de profil</div>
                    <div className="pe__colors">
                      {AVATAR_COLORS.map((c) => (
                        <button
                          key={c}
                          className={`pe__color${!r.avatar && r.color === c ? ' is-on' : ''}`}
                          onClick={() => setLook(r.key, { color: c, avatar: null })}
                          aria-label={`Couleur ${c}`}
                        >
                          <Eye color={c} />
                          {!r.avatar && r.color === c && <span className="pe__check"><IconCheck size={10} /></span>}
                        </button>
                      ))}
                    </div>
                    <label className="pe__upload">
                      Importer une photo
                      <input type="file" accept="image/*" onChange={(e) => importPhoto(r.key, e.target.files?.[0])} hidden />
                    </label>
                    {r.avatar && (
                      <button className="pe__remove" onClick={() => setLook(r.key, { avatar: null })}>Retirer la photo</button>
                    )}
                  </div>
                )}
              </div>
              <div className="sp__fields">
                <input
                  ref={(el) => {
                    if (el && focusKey.current === r.key) {
                      focusKey.current = null
                      el.focus()
                    }
                  }}
                  className="sp__input sp__name"
                  value={r.name}
                  placeholder="Nom, par ex. Amandine"
                  onChange={(e) => edit(r.key, { name: e.target.value })}
                  onBlur={() => void save(rows)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.nextElementSibling as HTMLInputElement | null)?.focus()}
                  maxLength={60}
                  aria-label="Nom"
                />
                <input
                  className="sp__input sp__email"
                  type="email"
                  value={r.email}
                  placeholder="E-mail (facultatif)"
                  onChange={(e) => edit(r.key, { email: e.target.value })}
                  onBlur={() => void save(rows)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), add())}
                  aria-label="E-mail"
                />
              </div>
              <div className="sp__row-actions">
                {actions && person ? actions(person) : null}
                <button className="ds-hover sp__icon" onClick={() => remove(r.key)} title="Retirer" aria-label="Retirer">
                  <IconClose size={14} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <button className="ds-hover sp__add" onClick={add}><IconPlus size={14} />{addLabel}</button>
    </>
  )
}
