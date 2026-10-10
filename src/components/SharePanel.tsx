// Panneau « Partager » (page personnelle) : qui va regarder (équipes des dossiers + personnes de la vidéo),
// accès public ou privé, code d'accès. Chaque réglage est enregistré tout de suite ; le lien direct reste
// grisé tant qu'aucune personne n'est prévue.
import { useEffect, useRef, useState } from 'react'
import { repo, type Access, type Client, type Person, type Video } from '../data'
import type { VideoPatch } from '../data/repository'
import { teamLabel } from '../lib/clients'
import { audienceOf } from '../lib/people'
import { inviteMailto, newAccessCode, personalUrl, shareUrl } from '../lib/share'
import { Initials } from './Initials'
import { PeopleEditor } from './PeopleEditor'
import { IconCheck, IconClose, IconCopy, IconGlobe, IconLink, IconLock, IconMail, IconRefresh } from './icons'
import { useToast } from './Toast'
import './share-panel.css'

interface Props {
  video: Video
  clients: Client[]
  onChange: (patch: VideoPatch) => Promise<Video>
  onClientChange: (client: Client) => void
  onClose: () => void
  onDelete: () => void
}

export function SharePanel({ video, clients, onChange, onClientChange, onClose, onDelete }: Props) {
  const toast = useToast()
  const [code, setCode] = useState(video.accessCode ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const latest = useRef(video)
  latest.current = video
  const access: Access = video.access ?? 'public'
  const saved = audienceOf(video, clients).length
  const draft = video.status !== 'published'

  // Dossier de la vidéo, puis son agence : chacun a son équipe.
  const folders: Client[] = []
  for (let f = clients.find((c) => c.id === video.clientId); f && folders.length < 2; f = clients.find((c) => c.id === f!.parentId)) folders.push(f)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.pe__picker') && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  useEffect(() => setCode(video.accessCode ?? ''), [video.accessCode])

  const flash = (key: string) => {
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1400)
  }

  const publishIfDraft = async () => {
    if (latest.current.status !== 'published') await onChange({ status: 'published' })
  }

  const copyPersonal = async (p: Person) => {
    await navigator.clipboard.writeText(personalUrl(video, p))
    flash(p.id)
    toast(`Lien personnel de ${p.name} copié`)
    await publishIfDraft()
  }

  const invite = async (p: Person) => {
    await publishIfDraft()
    window.location.href = inviteMailto({ ...video, accessCode: code || null }, p)
  }

  /** Inviter et copier le lien personnel : pour les personnes déjà enregistrées. */
  const personActions = (p: Person) => (
    <>
      <button className="ds-hover sp__icon" onClick={() => invite(p)} disabled={!p.email} title={p.email ? `Inviter ${p.name} par e-mail` : 'Ajoutez un e-mail pour inviter'} aria-label="Inviter par e-mail">
        <IconMail size={16} />
      </button>
      <button className="ds-hover sp__icon" onClick={() => copyPersonal(p)} title="Copier son lien personnel" aria-label="Copier le lien personnel">
        {copiedKey === p.id ? <IconCheck size={16} /> : <IconLink size={16} />}
      </button>
    </>
  )

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl(video.shareToken))
    const wasDraft = latest.current.status !== 'published'
    await publishIfDraft()
    flash('link')
    toast(wasDraft ? 'Vidéo publiée — lien copié' : 'Lien copié')
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
          {folders.map((f) => (
            <div key={f.id} className="sp__group">
              <div className="sp__group-title">
                Équipe {teamLabel(f, clients)}
                <span>aussi modifiable depuis le dashboard</span>
              </div>
              <PeopleEditor
                key={f.id}
                people={f.people ?? []}
                onSave={async (people) => {
                  const updated = await repo.setClientPeople(f.id, people)
                  onClientChange(updated)
                  return updated.people ?? []
                }}
                actions={personActions}
                startWithEmptyRow={f.id === video.clientId && !saved}
                addLabel={`Ajouter à l’équipe ${f.name}`}
              />
            </div>
          ))}
          <div className="sp__group">
            {folders.length > 0 && <div className="sp__group-title">Pour cette vidéo seulement</div>}
            <PeopleEditor
              people={video.people ?? []}
              onSave={async (people) => (await onChange({ people })).people ?? []}
              actions={personActions}
              startWithEmptyRow={!folders.length && !saved}
            />
          </div>
          <ul className="sp__people">
            <li className="sp__person is-anon">
              <Initials name={null} className="sp__initials" />
              <div className="sp__fields"><span className="sp__anon">Anonyme</span></div>
              <span className="sp__anon-note">Toujours proposé</span>
            </li>
          </ul>
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
