// Planche du design system : affiche chaque jeton et chaque composant
// extraits des captures, pour validation avant de construire les écrans.
import type { ReactNode } from 'react'
import { Logo } from '../components/Logo'
import {
  IconCalendar, IconCamera, IconClock, IconEye, IconFilter, IconFolder, IconGrip, IconInfo, IconLink,
  IconMic, IconPause, IconPlay, IconProjects, IconReply, IconRestart, IconSearch, IconSend, IconWindow,
} from '../components/icons'
import './design-system-board.css'

const colors: [string, string, string][] = [
  ['--c-bg', '#F1F1F1', 'Fond de page'],
  ['--c-surface', '#E8E8E8', 'Barre latérale, panneaux, pastille stats, bloc vidéo'],
  ['--c-surface-strong', '#DDDDDD', 'Carte vidéo, recherche, champ commentaire'],
  ['--c-surface-button', '#DFDFDF', '« Supprimer », fond du logo, séparateurs'],
  ['--c-tab-active', '#E3E3E3', 'Onglet actif'],
  ['--c-line', '#E1E1E1', 'Filet sous les onglets'],
  ['--c-placeholder', '#C4C4C4', 'Vignette / lecteur vide'],
  ['--c-chip', '#C2C1C1', 'Pastille « 8 vues »'],
  ['--c-ink', '#000000', 'Texte dashboard et panneau'],
  ['--c-ink-soft', '#323232', 'Titres, pages vidéo, boutons sombres'],
  ['--c-avatar', '#4D4D4D', 'Pastille d’initiales'],
  ['--c-on-dark', '#DFDFDF', 'Texte sur vert ou sur #323232'],
  ['--c-white', '#FFFFFF', 'Boutons du panneau et de la barre'],
  ['--c-green', '#007500', 'Action principale, temps des commentaires'],
  ['--c-orange', '#F24822', 'Prénom / client souligné'],
  ['--c-muted-1', '#6F6F6F', 'Date relative des cartes (« 11 Day »)'],
  ['--c-muted-2', '#878787', 'Placeholder commentaire'],
  ['--c-muted-3', '#929292', 'Placeholder recherche'],
  ['--c-muted-4', '#A3A3A3', 'Ancienneté, « Répondre », « Description »'],
  ['--c-muted-5', '#B1B1B1', '« Publier par … - 1 day ago »'],
]

const type: [string, string, string, number?][] = [
  ['--fs-display', '20 px', 'Bienvenue dans Visions,'],
  ['--fs-title', '18 px', 'Avancée sur le patterns'],
  ['--fs-body', '14 px', 'Tous les projets · Sans titre 1 · Window · Nom du client'],
  ['--fs-tab', '13 px', 'Récents  Client 1  8 Vidéos'],
  ['--fs-meta', '12 px', '26/03/2026 · Publier par Izenn Kra · 8 vues'],
  ['--fs-timer', '11 px', '0:00', 600],
  ['--fs-micro', '10 px', 'Clients'],
]

const radii: [string, string, string][] = [
  ['--r-none', '0', 'Panneaux, cartes, « Supprimer »'],
  ['--r-thumb', '6 px', 'Vignette'],
  ['--r-pill', 'pilule', 'Boutons, pastilles, onglet actif'],
  ['--r-round', 'cercle', 'Avatars, bulle, GO, envoyer'],
]

const spacing: [string, string][] = [
  ['Barre latérale', 'x 32 px, largeur 246 px ; bouton vert à y 107, hauteur 40 ; 12 px puis recherche 40 px ; lignes 46 px ; filet actif 4 px'],
  ['Zone centrale', 'débute à x 420 px ; marge droite 34 px ; titre à y 112 ; onglets y 153–176 ; filet y 198 ; grille y 221'],
  ['Carte vidéo', '275 × 210 px, marge intérieure 7 px, vignette 145 px (rayon 6) ; 15 px entre colonnes ; pastille stats 40 px à 10 px dessous ; 22 px entre rangées'],
  ['Panneau enregistreur', '217 px de large, marge 18 px ; options 181 × 48 px espacées de 16 px ; GO 85 px'],
  ['Barre de contrôle', '72 px de large, marge 8 px ; On / Off 56 × 38 px ; chrono 42 × 25 ; boutons ronds 56 px ; 15 px entre éléments'],
  ['Bulle caméra', '160 px, collée au coin bas gauche (0 px)'],
  ['Pages vidéo', 'zone gauche 1000 px + panneau 410 px ; bloc vidéo à 29 px des bords, marge intérieure 27 px ; lecteur 16:9 ; panneau : marge 18 px, champ 233 × 128, bouton envoyer 128 px'],
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="dsb-section">
      <h2 className="dsb-h2">{title}</h2>
      {children}
    </section>
  )
}

export default function DesignSystem() {
  return (
    <div className="dsb">
      <header className="dsb-header">
        <Logo />
        <h1 className="dsb-h1">Visions — design system</h1>
        <p className="dsb-note">Valeurs mesurées au pixel sur les 4 captures. Police : PP Neue Montreal. Aucune ombre, aucun dégradé, aucune animation.</p>
      </header>

      <Section title="Couleurs">
        <div className="dsb-swatches">
          {colors.map(([v, hex, use]) => (
            <div key={v} className="dsb-swatch">
              <div className="dsb-swatch__chip" style={{ background: `var(${v})` }} />
              <div className="dsb-swatch__hex">{hex}</div>
              <div className="dsb-meta">{v}</div>
              <div className="dsb-meta">{use}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typographie — PP Neue Montreal Regular (400)">
        {type.map(([v, size, sample, weight]) => (
          <div key={v} className="dsb-type">
            <div className="dsb-meta dsb-type__label">{size}{weight ? ' · Semibold 600' : ''}<br />{v}</div>
            <div style={{ fontSize: `var(${v})`, fontWeight: weight ?? 400 }}>{sample}</div>
          </div>
        ))}
      </Section>

      <Section title="Rayons">
        <div className="dsb-row">
          {radii.map(([v, label, use]) => (
            <div key={v} className="dsb-radius">
              <div className="dsb-radius__box" style={{ borderRadius: v === '--r-pill' ? 999 : `var(${v})`, width: v === '--r-pill' ? 96 : 56 }} />
              <div>{label}</div>
              <div className="dsb-meta">{use}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Espacements et dimensions">
        <table className="dsb-table">
          <tbody>
            {spacing.map(([k, v]) => (
              <tr key={k}><td>{k}</td><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Icônes — Phosphor « regular » (+ 3 dessinées : Filtre caméra, INFO, pause)">
        <div className="dsb-row dsb-icons">
          {[
            [<IconProjects size={14} />, 'Tous les projets'], [<IconFolder size={14} />, 'Dossier client'],
            [<IconSearch size={14} />, 'Recherche'], [<IconLink size={14} />, 'Lien'], [<IconEye size={14} />, 'Vues'],
            [<IconClock size={14} />, 'Durée'], [<IconCalendar size={14} />, 'Date'], [<IconWindow size={16} />, 'Window'],
            [<IconCamera size={16} />, 'Caméra'], [<IconMic size={16} />, 'Micro'], [<IconFilter />, 'Filtre caméra'],
            [<IconPause />, 'Pause'], [<IconRestart size={16} />, 'Recommencer'], [<IconReply size={14} />, 'Répondre'],
            [<IconSend size={24} />, 'Envoyer'], [<IconPlay size={12} weight="fill" />, 'Lecture'], [<IconInfo />, 'Info'],
          ].map(([icon, label]) => (
            <div key={label as string} className="dsb-icon"><div>{icon}</div><div className="dsb-meta">{label}</div></div>
          ))}
        </div>
      </Section>

      <Section title="Composants — Dashboard">
        <div className="dsb-row dsb-top">
          <div className="dsb-sidebar">
            <button className="ds-btn-primary" style={{ width: '100%' }}>Nouveau fichier</button>
            <div className="dsb-sidebar__panel">
              <label className="ds-search"><IconSearch size={14} /><input placeholder="Recherche..." /></label>
              <div className="ds-nav-item is-active"><IconProjects size={14} />Tous les projets</div>
              <div className="dsb-sidebar__line" />
              <div className="dsb-folder">▾ Clients</div>
              <div className="ds-nav-item"><IconFolder size={14} />Client 1</div>
              <div className="ds-nav-item"><IconFolder size={14} />Client 2</div>
            </div>
          </div>
          <div>
            <div className="dsb-display">Bienvenue dans Visions, <span className="ds-accent-link">Izenn</span></div>
            <div className="dsb-tabs">
              <span className="ds-tab is-active">Récents</span><span className="ds-tab">Client 1</span>
              <span className="ds-tab">Client 2</span><span className="ds-tab">Client 3</span>
            </div>
            <div className="ds-card">
              <div className="ds-card__thumb">
                <span className="ds-link-dot dsb-thumb-link"><IconLink size={14} /></span>
              </div>
              <div className="ds-card__title">Sans titre 1</div>
              <div className="ds-card__age">11 Day</div>
            </div>
            <div className="ds-stats" style={{ marginTop: 'var(--dash-stats-gap)' }}>
              <span className="ds-stats__item"><IconEye size={12} />0</span>
              <span className="ds-stats__item" style={{ marginLeft: 16 }}><IconClock size={12} />0min</span>
              <span className="ds-stats__item" style={{ marginLeft: 'auto' }}><IconCalendar size={12} />26/03/2026</span>
            </div>
          </div>
          <div className="dsb-center">
            <img className="dsb-avatar" src="/avatar.png" alt="" />
            <div style={{ fontSize: 'var(--fs-tab)' }}>8 Vidéos</div>
          </div>
        </div>
      </Section>

      <Section title="Composants — Enregistreur">
        <div className="dsb-row dsb-top">
          <div className="dsb-bar">
            <IconGrip />
            <div className="ds-toggle"><button>On</button><button className="is-on">Off</button></div>
            <span className="ds-timer">0:00</span>
            <button className="ds-round-white"><IconPause /></button>
            <button className="ds-round-white"><IconRestart size={16} /></button>
          </div>
          <div className="dsb-panel">
            <button className="ds-option"><IconWindow size={16} />Window</button>
            <button className="ds-option"><IconCamera size={16} />Caméra</button>
            <button className="ds-option"><IconMic size={16} />Micro</button>
            <button className="ds-option"><IconFilter />Filtre caméra</button>
            <button className="ds-round-primary dsb-go">GO</button>
          </div>
          <div className="dsb-bubble"><img src="/avatar.png" alt="" /></div>
        </div>
      </Section>

      <Section title="Composants — Pages vidéo">
        <div className="dsb-row dsb-top">
          <div className="dsb-stack">
            <div className="dsb-actions">
              <span className="ds-action ds-action--ghost">Supprimer</span>
              <span className="ds-action ds-action--dark">Publier</span>
              <span className="ds-link-dot" style={{ color: 'var(--c-bg)' }}><IconLink size={13} /></span>
            </div>
            <div className="dsb-actions">
              <span className="ds-action ds-action--dark">Partager</span>
              <span className="ds-link-dot" style={{ color: 'var(--c-bg)' }}><IconLink size={13} /></span>
            </div>
            <div className="dsb-title">
              Avancée sur le patterns <span className="ds-accent-link">Izenn x Elias Studio</span>
              <span className="ds-chip"><IconEye size={11} />8 vues</span>
            </div>
            <div className="dsb-author">
              <img src="/avatar.png" alt="" />Publier par Izenn Kra&nbsp;&nbsp;-&nbsp;&nbsp;1 day ago
            </div>
            <div className="dsb-player"><span><IconPlay size={12} weight="fill" /></span></div>
            <div className="dsb-desc-label"><IconInfo />Descirption</div>
            <div className="dsb-desc">Kunsthalle Basel’s solution lay in a paradox: an institutional brand with an anti-institutional spirit.</div>
          </div>
          <div className="dsb-side">
            <div className="ds-comment__head">
              <span className="ds-initials">AS</span>Nom du client <span className="ds-comment__time">1:32</span>
              <span className="ds-comment__age">Il y a 2h</span>
            </div>
            <div className="ds-comment__text">Kunsthalle Basel’s solution lay in a paradox: an institutional brand with an anti-institutional spirit.</div>
            <div className="ds-comment__reply"><IconReply size={14} />Répondre</div>
            <div className="dsb-count">2 Commentaires</div>
            <div className="dsb-compose">
              <div className="ds-comment-input">
                <div className="ds-comment__head" style={{ color: 'var(--c-muted-2)' }}><span className="ds-initials">AS</span>Try karkow...</div>
                <span className="dsb-mic"><IconMic size={18} color="var(--c-ink-soft)" /></span>
              </div>
              <button className="ds-round-primary dsb-send"><IconSend size={24} /></button>
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}
