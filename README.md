# Visions

Outil d'enregistrement vidéo (écran + caméra + micro) pour présenter l'avancée des projets aux clients, avec des commentaires liés à un moment précis de la vidéo.

## Stack

- **Vite + React + TypeScript** : une application web simple, rapide à lancer, sans serveur pour l'étape 1.
- **IndexedDB** (stockage du navigateur) derrière une couche unique (`src/data`), remplaçable par Cloudflare et une base de données à l'étape 2 sans toucher aux écrans.

## Lancer le projet

```bash
npm install
npm run dev
```

Puis ouvrir http://localhost:5173 dans **Google Chrome** (recommandé : la bulle flottante et l'enregistrement en MP4 en dépendent).

## Écrans

| Adresse | Écran |
| --- | --- |
| `/` | Dashboard : dossiers clients, recherche, onglets, cartes vidéo |
| `/record` | Enregistreur : source, caméra, micro, filtre, GO ; barre de contrôle ; bulle caméra |
| `/video/:id` | Page vidéo personnelle (modifiable) |
| `/v/:jeton` | Page de partage client (regarder et commenter) |
| `/design-system` | Planche du design system |

## Fonctionnement

- **Dashboard** : clic sur une carte → page personnelle ; icône lien → copie du lien client (la vidéo est publiée au passage) ; clic droit sur une carte → ouvrir, copier le lien, renommer, déplacer vers un dossier, télécharger, supprimer ; glisser une carte sur un dossier pour l'y ranger.
- **Dossiers clients** : « + » au survol de « Clients » (ou clic droit) pour en créer un ; double-clic ou clic droit pour renommer ; clic droit → supprimer (les vidéos sont conservées).
- **Enregistrement** : GO ouvre le sélecteur du navigateur (écran entier, fenêtre ou onglet). La bulle caméra passe dans une fenêtre flottante (Picture-in-Picture de Chrome) qui reste au premier plan au-dessus de toutes les applications ; on peut la placer en bas à gauche de l'écran, Chrome retient sa position. Pause et arrêt sont aussi disponibles au survol de cette fenêtre.
- **Bulle dans la vidéo** : quand on enregistre une fenêtre ou un onglet, la bulle est dessinée en bas à gauche de la vidéo finale. Pour un écran entier, la bulle flottante est déjà filmée telle qu'elle est à l'écran.
- **Fin d'enregistrement** : la vidéo est téléchargée sur le Mac (MP4 avec Chrome), une carte apparaît dans le dashboard et la page personnelle s'ouvre.
- **Vidéos longues** : l'enregistrement est écrit par morceaux de 2 secondes dans le stockage, pas en mémoire.

Sur Mac, Chrome doit avoir l'autorisation « Enregistrement de l'écran » (Réglages Système → Confidentialité et sécurité).

## Organisation du code

- `src/styles/design-system.css` — design system, source unique (couleurs, typographie, rayons, dimensions, composants, interactions), mesuré sur les captures (frame de référence 1440 px).
- `src/data/types.ts` — modèle de données (vidéo, morceaux, commentaires, vues).
- `src/data/repository.ts` — interface de la couche de stockage ; `src/data/local/` — implémentation locale (IndexedDB) et données de test.
- `src/recorder/` — moteur d'enregistrement (capture, composition de la bulle, morceaux), appareils, fenêtre flottante, filtres.
- `src/pages/` — écrans ; `src/components/` — composants partagés.
- `public/fonts/` — PP Neue Montreal ; `public/samples/` — vidéo d'exemple des données de test.

## Étape 2 (à venir)

Hébergement des vidéos sur Cloudflare (les morceaux pourront être envoyés pendant l'enregistrement), vrai lecteur en ligne, vrais liens de partage, écran de mot de passe. Il suffira d'écrire une nouvelle implémentation de `Repository` et de la brancher dans `src/data/index.ts`.
