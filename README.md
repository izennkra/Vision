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

Version en ligne en local (serveur Cloudflare simulé) : `npm run dev:cloud`, puis http://localhost:8787 (mot de passe : celui de `.dev.vars`). Elle utilise `wrangler.local.jsonc` : Workers AI n'existe pas hors ligne, la transcription y est remplacée par des phrases de test.

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

- **Dashboard** : clic sur une carte → page personnelle ; icône lien → copie du lien (grisée tant que la vidéo n'est pas publiée avec ses personnes prévues : le clic ouvre alors le panneau « Partager ») ; clic droit sur une carte → ouvrir, copier le lien, renommer, déplacer vers un dossier, télécharger, supprimer ; glisser une carte sur un dossier pour l'y ranger.
- **Ordre des dossiers** : glisser un dossier au-dessus ou en dessous d'un autre du même niveau (un trait vert montre où il va) ; les onglets suivent le même ordre.
- **Ma photo de profil** : clic sur la photo en haut à droite du dashboard → un œil de couleur, une photo importée, ou la photo d'origine ; elle apparaît aussi sur les pages vidéo et dans les commentaires.
- **Dossiers clients** : « + » au survol de « Clients » (ou clic droit) pour en créer un ; double-clic ou clic droit pour renommer ; clic droit → supprimer (les vidéos sont conservées).
- **Enregistrement** : GO ouvre le sélecteur du navigateur (écran entier, fenêtre ou onglet). La bulle caméra passe dans une fenêtre flottante (Picture-in-Picture de Chrome) qui reste au premier plan au-dessus de toutes les applications ; on peut la placer en bas à gauche de l'écran, Chrome retient sa position. Pause et arrêt sont aussi disponibles au survol de cette fenêtre.
- **Bulle dans la vidéo** : toujours dessinée en bas à gauche de la vidéo finale. En écran entier, la fenêtre flottante se ferme au départ pour ne pas être filmée en double.
- **Fin d'enregistrement** : rien n'est téléchargé sur le Mac (clic droit sur la carte → « Télécharger » si besoin) ; une carte apparaît dans le dashboard et la page personnelle s'ouvre.
- **Format vidéo** : l'application encode elle-même un MP4 standard (H.264 + AAC dans Chrome sur Mac). Il s'ouvre en une fraction de seconde et se parcourt sans tout télécharger, même pour 1 h 30.
- **Vidéos longues** : le fichier est écrit en morceaux de 8 Mo, gardés dans le navigateur puis envoyés en ligne pendant l'enregistrement. À l'arrêt, la vidéo est en ligne en quelques secondes.
- **Décompte et fin** : 3, 2, 1 avec un son discret avant le départ ; animation de confirmation à l'arrêt.
- **Page personnelle** : flèche de retour vers le dashboard ; « Supprimer » et « Publier » ; une fois publiée, « Partager » et l'icône lien (copie en un clic, confirmée par une petite pastille).
- **Partager** : on prévoit les personnes qui vont regarder (nom, e-mail facultatif) ; « Anonyme » est toujours proposé en plus. Accès **public** (toute personne ayant le lien) ou **privé** (seulement les personnes invitées, avec leur lien personnel). **Code d'accès** facultatif : sans lien personnel, il faut le saisir. Invitation par e-mail : ouvre Mail avec le message et le lien personnel déjà écrits.
- **Page client** : regarder ne demande rien. Au moment de commenter, une petite fenêtre accrochée au champ propose de choisir son nom parmi les personnes prévues (ou « Anonyme ») ; le choix est retenu. Avec un lien personnel, la personne est reconnue directement.
- **Lecteur** : vitesse de x1 à x3, volume, sous-titres (issus de la transcription, traduisibles), durée « 0:00 / 3:00 », plein écran ; barre de progression qu'on peut faire glisser, repères orange des commentaires. Raccourcis : espace (lecture), ← → (5 s), ↑ ↓ (volume), M (son), F (plein écran), C (sous-titres).
- **Logo** : le logo Visions (`public/logo-visions.svg`) est dessiné dans `src/components/Logo.tsx` pour animer ses deux yeux (regard aléatoire, clignements).
- **Qualité de lecture** : Réglages du lecteur → Auto, 1080p (original), 720p, 480p. Les versions 720p et 480p sont préparées en arrière-plan par le navigateur du propriétaire juste après l'enregistrement (à partir de la copie locale, rien n'est retéléchargé) ; pour une vidéo plus ancienne : Réglages → « Préparer 720p et 480p ». Jamais pendant un enregistrement. En « Auto », un ordinateur lit l'original, un téléphone la version qui suffit à son écran, une connexion lente la plus légère.
- **Archivage** : clic droit sur une carte → « Archiver ». Le fichier passe en stockage « accès peu fréquent » de R2 (un tiers moins cher), les versions allégées sont retirées ; la vidéo reste lisible tout de suite, en qualité d'origine. « Désarchiver » la remet en stockage standard.
- **Transcription** (version en ligne) : pendant l'enregistrement, le son part par tranches de 20 s et est transcrit par Cloudflare Workers AI (Whisper). Onglet « Transcription » à côté des commentaires : les paroles en bulles (une bulle par prise de parole, fermée à la fin de la phrase), comme une conversation : toi à droite, l'autre personne à gauche (pendant un appel, ta voix arrive par le micro et la sienne par le son de l'onglet ou de l'écran : Visions compare les deux toutes les 100 ms), la bulle en cours mise en avant, clic sur une phrase pour aller à ce moment, bouton « Copier », choix de la langue (traduction automatique).
- **Équipes** : chaque dossier client a son équipe (dashboard : bouton « Équipe » à côté du nombre de vidéos, ou clic droit sur le dossier → « Équipe… »). Un sous-dossier (« Elias Studio x Co-labs ») a sa propre équipe, qui s'ajoute à celle de l'agence. Ces personnes sont proposées au moment de commenter et reçoivent chacune un lien personnel.
- **Photos de profil** : œil animé de la DA (il regarde au hasard et cligne), dans une couleur choisie parmi six (vert, magenta, orange, gris, noir, moutarde) ou propre à chaque nom ; ou une photo importée (clic sur la photo de profil dans l'équipe ou le panneau Partager).
- **Code d'accès et mot de passe** : neutres pendant la saisie ; vert si c'est bon, rouge puis effacé si c'est faux.
- **Enregistrement sans à-coup** : tout se prépare pendant le décompte 3-2-1 (vidéo créée, encodeur prêt et « échauffé ») ; l'encodeur a une file d'attente, aucune image n'est jetée parce qu'il est occupé.
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
