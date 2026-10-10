# Visions

Outil d'enregistrement vidéo (écran + caméra + micro) pour présenter l'avancée des projets aux clients, avec des commentaires liés à un moment précis de la vidéo.

## Stack

- **Vite + React + TypeScript** pour l'application.
- **Cloudflare** pour la version en ligne : un Worker (serveur + application), **R2** pour les vidéos (bande passante gratuite), **D1** pour les données. Voir [DEPLOIEMENT.md](DEPLOIEMENT.md).
- Une couche de stockage unique (`src/data`) avec deux implémentations : locale (navigateur, pour la démonstration) et en ligne (Cloudflare). Les écrans ne savent pas laquelle est utilisée.

## Lancer le projet

```bash
npm install
npm run dev
```

Puis ouvrir http://localhost:5173 dans **Google Chrome** (la bulle flottante et l'encodage vidéo en dépendent). Dans ce mode, tout reste dans le navigateur.

Version en ligne en local (serveur Cloudflare simulé) : `npm run dev:cloud`, puis http://localhost:8787 (mot de passe : celui de `.dev.vars`).

## Écrans

| Adresse | Écran |
| --- | --- |
| `/` | Dashboard : dossiers clients, recherche, onglets, cartes vidéo |
| `/record` | Enregistreur : source, caméra, micro, filtre, GO ; barre de contrôle ; bulle caméra |
| `/video/:id` | Page vidéo personnelle (modifiable) |
| `/v/:jeton` | Page de partage client (regarder et commenter) |
| `/login` | Connexion (version en ligne) |
| `/design-system` | Planche du design system |

## Fonctionnement

- **Dashboard** : clic sur une carte → page personnelle ; icône lien → copie du lien client (la vidéo est publiée au passage) ; clic droit sur une carte → ouvrir, copier le lien, renommer, déplacer vers un dossier, télécharger, supprimer ; glisser une carte sur un dossier pour l'y ranger.
- **Dossiers clients** : « + » au survol de « Clients » (ou clic droit) pour en créer un ; double-clic ou clic droit pour renommer ; clic droit → supprimer (les vidéos sont conservées).
- **Enregistrement** : GO ouvre le sélecteur du navigateur (écran entier, fenêtre ou onglet). La bulle caméra passe dans une fenêtre flottante (Picture-in-Picture de Chrome) qui reste au premier plan au-dessus de toutes les applications ; on peut la placer en bas à gauche de l'écran, Chrome retient sa position. Pause et arrêt sont aussi disponibles au survol de cette fenêtre.
- **Bulle dans la vidéo** : toujours dessinée en bas à gauche de la vidéo finale. En écran entier, la fenêtre flottante se ferme au départ pour ne pas être filmée en double.
- **Fin d'enregistrement** : la vidéo est téléchargée sur le Mac (MP4 avec Chrome), une carte apparaît dans le dashboard et la page personnelle s'ouvre.
- **Format vidéo** : l'application encode elle-même un MP4 standard (H.264 + AAC dans Chrome sur Mac). Il s'ouvre en une fraction de seconde et se parcourt sans tout télécharger, même pour 1 h 30.
- **Vidéos longues** : le fichier est écrit en morceaux de 8 Mo, gardés dans le navigateur puis envoyés en ligne pendant l'enregistrement. À l'arrêt, la vidéo est en ligne en quelques secondes.
- **Décompte et fin** : 3, 2, 1 avec un son discret avant le départ ; animation de confirmation à l'arrêt.
- **Notifications** : la cloche du dashboard signale chaque vue et chaque commentaire d'un client (vérification toutes les 30 secondes, notifications du bureau si tu les autorises).
- **Commentaires et vues** (version en ligne) : enregistrés sur le serveur, visibles par toi et par le client, depuis n'importe quel ordinateur.

Sur Mac, Chrome doit avoir l'autorisation « Enregistrement de l'écran » (Réglages Système → Confidentialité et sécurité).

## Organisation du code

- `src/styles/design-system.css` — design system, source unique (couleurs, typographie, rayons, dimensions, composants, interactions), mesuré sur les captures (frame de référence 1440 px).
- `src/data/types.ts` — modèle de données (vidéo, morceaux, commentaires, vues).
- `src/data/repository.ts` — interface de la couche de stockage ; `src/data/local/` — implémentation locale (IndexedDB) et données de test.
- `src/recorder/` — moteur d'enregistrement (capture, composition de la bulle, morceaux), appareils, fenêtre flottante, filtres.
- `src/pages/` — écrans ; `src/components/` — composants partagés.
- `public/fonts/` — PP Neue Montreal ; `public/samples/` — vidéo d'exemple des données de test.
- `src/data/remote/` — implémentation en ligne (API Cloudflare) ; `worker/` — serveur (API, envoi des morceaux vers R2, lecture partielle, connexion, notifications) et schéma de la base.
