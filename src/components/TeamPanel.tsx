// Équipe d'un dossier client (depuis le dashboard) : les personnes qui regardent et commentent ses vidéos.
// Pour un sous-dossier (« Elias Studio x Co-labs »), son équipe s'ajoute à celle de l'agence.
import { useEffect } from 'react'
import { repo, type Client } from '../data'
import { teamLabel } from '../lib/clients'
import { Initials } from './Initials'
import { PeopleEditor } from './PeopleEditor'
import { IconClose } from './icons'
import './share-panel.css'

interface Props {
  client: Client
  clients: Client[]
  onChange: (client: Client) => void
  onClose: () => void
}

export function TeamPanel({ client, clients, onChange, onClose }: Props) {
  const parent = client.parentId ? clients.find((c) => c.id === client.parentId) : null
  const subs = clients.filter((c) => c.parentId === client.id)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.pe__picker') && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div className="sp-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sp" role="dialog" aria-modal="true" aria-labelledby="team-title">
        <header className="sp__head">
          <h2 id="team-title" className="sp__title">Équipe {teamLabel(client, clients)}</h2>
          <button className="ds-hover sp__close" onClick={onClose} aria-label="Fermer"><IconClose size={16} /></button>
        </header>
        <section className="sp__section">
          <p className="sp__hint sp__hint--first">
            Ces personnes pourront choisir leur nom en commentant les vidéos de ce dossier
            {subs.length ? ` et de ses sous-dossiers (${subs.map((s) => s.name).join(', ')})` : ''}. Cliquez sur une photo de profil pour changer sa couleur ou importer une photo.
          </p>
          <PeopleEditor
            key={client.id}
            people={client.people ?? []}
            onSave={async (people) => {
              const updated = await repo.setClientPeople(client.id, people)
              onChange(updated)
              return updated.people ?? []
            }}
            startWithEmptyRow
          />
          {parent && (
            <div className="sp__inherited">
              <div className="sp__group-title">Aussi présents : l’équipe {parent.name}</div>
              {(parent.people ?? []).length ? (
                <div className="sp__chips">
                  {(parent.people ?? []).map((p) => (
                    <span key={p.id} className="sp__chip"><Initials name={p.name} person={p} />{p.name}</span>
                  ))}
                </div>
              ) : (
                <p className="sp__hint">Pas encore d’équipe pour {parent.name}.</p>
              )}
            </div>
          )}
        </section>
        <footer className="sp__foot sp__foot--simple">
          <button className="sp__primary" onClick={onClose}>Terminé</button>
        </footer>
      </div>
    </div>
  )
}
