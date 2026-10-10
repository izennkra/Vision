// Panneau « Partager » (page personnelle) : qui va regarder, accès public ou privé, code d'accès.
// Chaque réglage est enregistré tout de suite ; le lien direct reste grisé tant qu'aucune personne n'est prévue.
import { useEffect, useRef, useState } from 'react'
import type { Access, ID, Video } from '../data'
import type { VideoPatch } from '../data/repository'
import { inviteMailto, newAccessCode, personalUrl, shareUrl } from '../lib/share'
import { Initials } from './Initials'
import { IconCheck, IconClose, IconCopy, IconGlobe, IconLink, IconLock, IconMail, IconPlus, IconRefresh } from './icons'
import { useToast } from './Toast'
import './share-panel.css'

interface Props {
  video: Video
  onChange: (patch: VideoPatch) => Promise<Video>
  onClose: () => void
  onDelete: () => void
}

type Row = { key: string; id?: ID; name: string; email: string }

const toRows = (v: Video): Row[] => (v.people ?? []).map((p) => ({ key: p.id, id: p.id, name: p.name, email: p.email ?? '' }))
const valid = (r: Row) => r.name.trim() && r.name.trim().toLowerCase() !== 'anonyme'
let nextKey = 0

export function SharePanel({ video, onChange, onClose, onDelete }: Props) {
  const toast = useToast()
  const [rows, setRows] = useState<Row[]>(() => (video.people?.length ? toRows(video) : [{ key: `n${nextKey++}`, name: '', email: '' }]))
  const [code, setCode] = useState(video.accessCode ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const focusKey = useRef<string | null>(video.people?.length ? null : rows[0]?.key ?? null)
  const saving = useRef<Promise<unknown>>(Promise.resolve())
  const access: Access = video.access ?? 'public'
  const saved = (video.people ?? []).length
  const draft = video.status !== 'published'

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  useEffect(() => setCode(video.accessCode ?? ''), [video.accessCode])

  // Personnes : enregistrées à la sortie d'un champ, à l'ajout et à la suppression.
  const savePeople = (list = rows) => {
    const payload = list.filter(valid).map((r) => ({ id: r.id, name: r.name.trim(), email: r.email.trim() || null }))
    const before = (video.people ?? []).map((p) => ({ id: p.id, name: p.name, email: p.email }))
    if (JSON.stringify(payload) === JSON.stringify(before)) return
    saving.current = saving.current.then(async () => {
      const v = await onChange({ people: payload })
      // Le serveur garde l'ordre : on récupère l'identifiant de chaque nouvelle personne sans toucher à la saisie en cours.
      const ids = new Map(list.filter(valid).map((r, i) => [r.key, v.people?.[i]?.id]))
      setRows((cur) => cur.map((r) => (ids.get(r.key) ? { ...r, id: ids.get(r.key) } : r)))
    })
  }

  const edit = (key: string, field: 'name' | 'email', value: string) =>
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, [field]: value } : r)))

  const add = () => {
    const key = `n${nextKey++}`
    focusKey.current = key
    setRows((cur) => [...cur, { key, name: '', email: '' }])
  }

  const remove = (key: string) => {
    const list = rows.filter((r) => r.key !== key)
    setRows(list)
    savePeople(list)
  }

  const flash = (key: string) => {
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1400)
  }

  const personOf = (r: Row) => video.people?.find((p) => p.id === r.id)

  const copyPersonal = async (r: Row) => {
    const p = personOf(r)
    if (!p) return
    await navigator.clipboard.writeText(personalUrl(video, p))
    flash(r.key)
    toast(`Lien personnel de ${p.name} copié`)
    if (draft) await onChange({ status: 'published' })
  }

  const invite = async (r: Row) => {
    const p = personOf(r)
    if (!p) return
    if (draft) await onChange({ status: 'published' })
    window.location.href = inviteMailto({ ...video, accessCode: code || null }, p)
  }

  const copyLink = async () => {
    await saving.current
    await navigator.clipboard.writeText(shareUrl(video.shareToken))
    if (draft) await onChange({ status: 'published' })
    flash('link')
    toast(draft ? 'Vidéo publiée — lien copié' : 'Lien copié')
  }

  const setAccess = (a: Access) => a !== access && onChange({ access: a })
  const toggleCode = () => onChange({ accessCode: video.accessCode ? null : newAccessCode() })
  // Code de 6 caractères exactement (une case par caractère sur la page client).
  const saveCode = () => {
    if (code.length !== 6) {
      if (code !== (video.accessCode ?? '')) toast('Le code doit faire 6 caractères')
      return setCode(video.accessCode ?? '')
    }
    if (code !== video.accessCode) onChange({ accessCode: code })
  }

  const linkHint = !saved
    ? 'Ajoutez au moins une personne pour activer le lien.'
    : access === 'private' && !video.accessCode
      ? 'Vidéo privée : le lien ne s’ouvre qu’avec un lien personnel.'
      : access === 'private'
        ? 'Vidéo privée : sans lien personnel, le code est demandé.'
        : video.accessCode
          ? 'Le code est demandé à l’ouverture du lien.'
          : 'Toute personne ayant le lien peut regarder et commenter.'

  return (
    <div className="sp-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sp" role="dialog" aria-modal="true" aria-labelledby="sp-title">
        <header className="sp__head">
          <h2 id="sp-title" className="sp__title">Partager</h2>
          <button className="ds-hover sp__close" onClick={onClose} aria-label="Fermer"><IconClose size={16} /></button>
        </header>

        <section className="sp__section">
          <div className="sp__label">Qui va regarder ?</div>
          <p className="sp__hint">Chacun choisit son nom au moment de commenter. Avec l’e-mail, vous pouvez envoyer à chacun son lien personnel.</p>
          <ul className="sp__people">
            {rows.map((r) => {
              const p = personOf(r)
              return (
                <li key={r.key} className="sp__person">
                  <Initials name={r.name} className="sp__initials" />
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
                      placeholder="Nom, par ex. Victor C."
                      onChange={(e) => edit(r.key, 'name', e.target.value)}
                      onBlur={() => savePeople()}
                      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.nextElementSibling as HTMLInputElement | null)?.focus()}
                      maxLength={60}
                      aria-label="Nom"
                    />
                    <input
                      className="sp__input sp__email"
                      type="email"
                      value={r.email}
                      placeholder="E-mail (facultatif)"
                      onChange={(e) => edit(r.key, 'email', e.target.value)}
                      onBlur={() => savePeople()}
                      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), add())}
                      aria-label="E-mail"
                    />
                  </div>
                  <div className="sp__row-actions">
                    <button className="ds-hover sp__icon" onClick={() => invite(r)} disabled={!p || !r.email.trim()} title={r.email.trim() ? `Inviter ${r.name} par e-mail` : 'Ajoutez un e-mail pour inviter'} aria-label="Inviter par e-mail">
                      <IconMail size={16} />
                    </button>
                    <button className="ds-hover sp__icon" onClick={() => copyPersonal(r)} disabled={!p} title="Copier son lien personnel" aria-label="Copier le lien personnel">
                      {copiedKey === r.key ? <IconCheck size={16} /> : <IconLink size={16} />}
                    </button>
                    <button className="ds-hover sp__icon" onClick={() => remove(r.key)} title="Retirer" aria-label="Retirer">
                      <IconClose size={14} />
                    </button>
                  </div>
                </li>
              )
            })}
            <li className="sp__person is-anon">
              <Initials name={null} className="sp__initials" />
              <div className="sp__fields"><span className="sp__anon">Anonyme</span></div>
              <span className="sp__anon-note">Toujours proposé</span>
            </li>
          </ul>
          <button className="ds-hover sp__add" onClick={add}><IconPlus size={14} />Ajouter une personne</button>
        </section>

        <section className="sp__section">
          <div className="sp__label">Accès</div>
          <div className="sp__segment" role="radiogroup">
            <button role="radio" aria-checked={access === 'public'} className={access === 'public' ? 'is-on' : ''} onClick={() => setAccess('public')}>
              <IconGlobe size={15} />Public
            </button>
            <button role="radio" aria-checked={access === 'private'} className={access === 'private' ? 'is-on' : ''} onClick={() => setAccess('private')}>
              <IconLock size={15} />Privé
            </button>
          </div>
          <p className="sp__hint">
            {access === 'public'
              ? 'Toute personne qui a le lien peut regarder.'
              : 'Seules les personnes invitées, avec leur lien personnel, peuvent ouvrir la vidéo.'}
          </p>

          <div className="sp__code-row">
            <button className={`sp__switch${video.accessCode ? ' is-on' : ''}`} role="switch" aria-checked={!!video.accessCode} onClick={toggleCode}>
              <span />
            </button>
            <div className="sp__code-text">
              <div className="sp__code-title">Code d’accès</div>
              <div className="sp__hint sp__hint--tight">
                {access === 'private' ? 'Permet d’entrer sans invitation, avec le code.' : 'Demandé à l’ouverture du lien.'}
              </div>
            </div>
          </div>
          {video.accessCode && (
            <div className="sp__code">
              <input
                className="sp__input sp__code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                onBlur={saveCode}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                maxLength={6}
                aria-label="Code d’accès"
              />
              <button className="ds-hover sp__icon" onClick={() => onChange({ accessCode: newAccessCode() })} title="Nouveau code" aria-label="Nouveau code">
                <IconRefresh size={16} />
              </button>
              <button
                className="ds-hover sp__icon"
                onClick={async () => {
                  await navigator.clipboard.writeText(video.accessCode!)
                  flash('code')
                  toast('Code copié')
                }}
                title="Copier le code"
                aria-label="Copier le code"
              >
                {copiedKey === 'code' ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </button>
            </div>
          )}
        </section>

        <footer className="sp__foot">
          <button className="sp__primary" onClick={copyLink} disabled={!saved}>
            {copiedKey === 'link' ? <IconCheck size={15} /> : <IconLink size={15} />}
            {draft ? 'Publier et copier le lien' : 'Copier le lien'}
          </button>
          <p className="sp__hint sp__hint--center">{linkHint}</p>
          <div className="sp__secondary">
            {!draft && (
              <button className="ds-hover" onClick={() => onChange({ status: 'draft' }).then(onClose)}>Dépublier</button>
            )}
            <button className="ds-hover sp__danger" onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))} onMouseLeave={() => setConfirmDelete(false)}>
              {confirmDelete ? 'Confirmer la suppression' : 'Supprimer la vidéo'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
