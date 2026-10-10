// Planche du design system : affiche chaque jeton et chaque composant
// extraits des captures, pour validation avant de construire les écrans.
import type { ReactNode } from 'react'
import { Logo } from '../components/Logo'
import {
  IconCaret, IconCalendar, IconCamera, IconClock, IconEye, IconFilter, IconFolder, IconGrip, IconInfo, IconLink,
  IconMic, IconPause, IconPlay, IconProjects, IconReply, IconRestart, IconSearch, IconSend, IconWindow,
} from '../components/icons'
import './design-system-board.css'
import './recorder.css'
import './video-page.css'
import './dashboard.css'

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
  ['--c-muted-1', '#6F6F6F', 'Date relative des cartes'],
  ['--c-muted-2', '#878787', 'Placeholder commentaire'],
  ['--c-muted-3', '#929292', 'Placeholder recherche'],
  ['--c-muted-4', '#A3A3A3', 'Ancienneté, « Répondre », « Description »'],
  ['--c-muted-5', '#B1B1B1', '« Publié par … - Il y a 1 jour »'],
]

const type: [string, string, string, number?][] = [
  ['--fs-title', '18 px', 'Bienvenue dans Visions, · Avancée sur le patterns'],
  ['--fs-body', '14 px', 'Fenêtre · Nom du client · Répondre · Supprimer'],
  ['--fs-ui', '13 px', 'Nouveau fichier · Tous les projets · Sans titre 1'],
  ['--fs-meta', '12 px', 'Publié par Izenn Kra · 8 vues · Il y a 2h'],
  ['--fs-tab', '11,5 px', 'Récents  Client 1  8 Vidéos'],
  ['--fs-small', '11 px', '26/03/2026 · 0min · Il y a 11 jours'],
  ['--fs-small', '11 px', '0:00', 600],
  ['--fs-micro', '9 px', 'Clients'],
]

const radii: [string, string, string][] = [
  ['--r-none', '0', 'Panneaux, cartes, « Supprimer »'],
  ['--r-thumb', '6 px', 'Vignette'],
  ['--r-pill', 'pilule', 'Boutons, pastilles, onglet actif'],
  ['--r-round', 'cercle', 'Avatars, bulle, GO, envoyer'],
]

const spacing: [string, string][] = [
  ['Référence', 'toutes les mesures sont ramenées à une frame de 1440 px (le logo 58 × 22 sert d’étalon)'],
  ['Barre latérale', 'x 29 px, largeur 222 px ; bouton vert à y 96, hauteur 37 ; 10 px puis recherche 37 px ; « Tous les projets » 37 px ; clients 42 px ; filet actif 4 px'],
  ['Zone centrale', 'débute à x 378 px ; marge droite 30 px ; onglets 20 px de haut ; filet sous les onglets ; grille 20 px plus bas'],
  ['Carte vidéo', '247 px minimum (4 colonnes à 1440 px, davantage sur écran plus large) × 189 px ; marge intérieure 6 px ; vignette 130 px (rayon 4) ; 13,5 px entre colonnes ; pastille stats 36 px à 9 px dessous ; 19 px entre rangées'],
  ['Panneau enregistreur', '221 px de large, marge 18 px ; options 49 px de haut espacées de 16 px ; GO 87 px'],
  ['Barre de contrôle', '73 px de large, marge 8 px ; On / Off 57 × 39 px ; chrono 43 × 25 ; boutons ronds 57 px ; 15 px entre éléments'],
  ['Bulle caméra', '163 px, collée au coin bas gauche (0 px)'],
  ['Pages vidéo', 'panneau commentaires 419 px, zone gauche le reste ; bloc vidéo à 30 px des bords, marge intérieure 28 px ; lecteur 16:9 ; panneau : marge 18 px, champ 131 px de haut, bouton envoyer 131 px'],
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
          <div key={sample} className="dsb-type">
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

      <Section title="Icônes — Phosphor « bold » (+ 3 dessinées : Filtre caméra, INFO, pause)">
        <div className="dsb-row dsb-icons">
          {[
            [<IconProjects size={14} />, 'Tous les projets'], [<IconFolder size={14} />, 'Dossier client'],
            [<IconSearch size={14} />, 'Recherche'], [<IconLink size={14} />, 'Lien'], [<IconEye size={14} />, 'Vues'],
            [<IconClock size={14} />, 'Durée'], [<IconCalendar size={14} />, 'Date'], [<IconWindow size={16} />, 'Fenêtre'],
            [<IconCamera size={16} />, 'Caméra'], [<IconMic size={16} />, 'Micro'], [<IconFilter />, 'Filtre caméra'],
            [<IconPause />, 'Pause'], [<IconRestart size={16} />, 'Recommencer'], [<IconReply />, 'Répondre'],
            [<IconSend size={24} />, 'Envoyer'], [<IconPlay size={12} weight="fill" />, 'Lecture'], [<IconInfo />, 'Info'],
          ].map(([icon, label]) => (
            <div key={label as string} className="dsb-icon"><div>{icon}</div><div className="dsb-meta">{label}</div></div>
          ))}
        </div>
      </Section>

      <Section title="Composants — Dashboard">
        <div className="dsb-row dsb-top">
          <div className="dsb-sidebar">
            <button className="ds-btn-primary">Nouveau fichier</button>
            <div className="dsb-sidebar__panel">
              <label className="ds-search"><IconSearch size={13} /><input placeholder="Recherche..." /></label>
              <div className="ds-nav-item ds-nav-item--main is-active" style={{ marginTop: 5 }}><IconProjects size={14} />Tous les projets</div>
              <div className="dsb-sidebar__line" />
              <div className="ds-folder"><IconCaret />Clients</div>
              <div className="ds-nav-item"><IconFolder size={14} className="ds-nav-item__folder" />Client 1</div>
              <div className="ds-nav-item"><IconFolder size={14} className="ds-nav-item__folder" />Client 2</div>
            </div>
          </div>
          <div className="dsb-card">
            <div className="dsb-display">Bienvenue dans Visions, <span className="ds-accent-link">Izenn</span></div>
            <div className="dsb-tabs">
              <span className="ds-tab is-active">Récents</span><span className="ds-tab">Client 1</span>
              <span className="ds-tab">Client 2</span><span className="ds-tab">Client 3</span>
            </div>
            <div className="ds-card">
              <div className="ds-card__thumb">
                <span className="ds-link-dot"><IconLink size={12} /></span>
              </div>
              <div className="ds-card__meta">
                <div className="ds-card__title">Sans titre 1</div>
                <div className="ds-card__age">Il y a 11 jours</div>
              </div>
            </div>
            <div className="ds-stats">
              <span className="ds-stats__item"><IconEye size={12} />0</span>
              <span className="ds-stats__item"><IconClock size={13} />0min</span>
              <span className="ds-stats__item ds-stats__item--end"><IconCalendar size={12} />26/03/2026</span>
            </div>
          </div>
          <div className="dsb-center">
            <img className="ds-avatar dsb-avatar" src="/avatar.png" alt="" />
            <div style={{ fontSize: 'var(--fs-tab)' }}>8 Vidéos</div>
          </div>
        </div>
      </Section>

      <Section title="Composants — Enregistreur">
        <div className="dsb-row dsb-top">
          <div className="dsb-bar">
            <IconGrip />
            <button className="rec__stop" aria-label="Arrêter"><span /></button>
            <span className="ds-timer">0:00</span>
            <button className="ds-round-white"><IconPause /></button>
            <button className="ds-round-white"><IconRestart size={16} /></button>
          </div>
          <div className="dsb-panel">
            <button className="ds-option"><IconWindow size={16} />Fenêtre</button>
            <button className="ds-option"><IconCamera size={16} />Caméra</button>
            <button className="ds-option"><IconMic size={16} />Micro</button>
            <button className="ds-option"><IconFilter />Filtre caméra</button>
            <button className="ds-round-primary dsb-go">GO</button>
          </div>
          <div className="dsb-bubble"><img src="/avatar.png" alt="" /></div>
        </div>
      </Section>

      <Section title="Interactions (ajoutées)">
        <div className="dsb-row dsb-top">
          <div className="ds-menu" style={{ position: 'static' }}>
            <button className="ds-menu__item">Ouvrir</button>
            <button className="ds-menu__item">Copier le lien</button>
            <button className="ds-menu__item">Déplacer vers<span style={{ marginLeft: 'auto' }}>›</span></button>
            <div className="ds-menu__sep" />
            <button className="ds-menu__item is-danger">Supprimer</button>
          </div>
          <div className="ds-toast" style={{ position: 'static', transform: 'none' }}>Lien copié</div>
          <span className="dash__draft" style={{ position: 'static' }}>Brouillon</span>
          <div className="viewers__panel" style={{ position: 'static' }}>
            <div className="viewers__head">8 vues<span> · 2 personnes</span></div>
            <ul className="viewers__list">
              <li className="viewers__row">
                <span className="ds-initials">AS</span>
                <div className="viewers__text"><div className="viewers__name">Anna Simon</div><div className="viewers__meta">Il y a 2h · 3 fois</div></div>
                <div className="viewers__watch"><div className="viewers__time">4:12</div><div className="viewers__bar"><span style={{ width: '100%' }} /></div></div>
              </li>
              <li className="viewers__row">
                <span className="ds-initials">LM</span>
                <div className="viewers__text"><div className="viewers__name">Léa Martin</div><div className="viewers__meta">Il y a 17h</div></div>
                <div className="viewers__watch"><div className="viewers__time">2:16</div><div className="viewers__bar"><span style={{ width: '54%' }} /></div></div>
              </li>
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Composants — Pages vidéo">
        <div className="dsb-row dsb-top">
          <div className="dsb-stack">
            <div className="dsb-actions">
              <span className="ds-action ds-action--ghost">Supprimer</span>
              <span className="ds-action ds-action--green">Publier</span>
            </div>
            <div className="dsb-actions">
              <span className="ds-action ds-action--green">Partager</span>
              <span className="ds-link-dot" style={{ background: 'var(--c-green)', color: 'var(--c-white)' }}><IconLink size={13} /></span>
            </div>
            <div className="dsb-title">
              Avancée sur le patterns <span className="ds-accent-link">Izenn x Elias Studio</span>
              <span className="ds-chip"><IconEye size={11} />8 vues</span>
            </div>
            <div className="dsb-author">
              <img src="/avatar.png" alt="" />Publié par Izenn Kra&nbsp;&nbsp;-&nbsp;&nbsp;Il y a 1 jour
            </div>
            <div className="dsb-player"><span><IconPlay size={12} weight="fill" /></span></div>
            <div className="dsb-desc-label"><IconInfo />Description</div>
            <div className="dsb-desc">Kunsthalle Basel’s solution lay in a paradox: an institutional brand with an anti-institutional spirit.</div>
          </div>
          <div className="dsb-side">
            <div className="ds-comment__head">
              <span className="ds-initials">AS</span>Nom du client <span className="ds-comment__time">1:32</span>
              <span className="ds-comment__age">Il y a 2h</span>
            </div>
            <div className="ds-comment__text">Kunsthalle Basel’s solution lay in a paradox: an institutional brand with an anti-institutional spirit.</div>
            <div className="ds-comment__reply"><IconReply />Répondre</div>
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
