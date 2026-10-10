# Mettre Visions en ligne (Cloudflare)

Une fois en ligne, les vidéos sont stockées sur Cloudflare : tu les regardes depuis n'importe quel ordinateur, ton client ouvre le lien de partage où qu'il soit, et vous voyez tous les deux les commentaires et les vues.

## Ce que ça coûte

| Service | Rôle | Prix |
| --- | --- | --- |
| **R2** | les fichiers vidéo et les vignettes | 10 Go gratuits, puis **0,015 $ par Go et par mois** ; la bande passante (les visionnages) est **gratuite** |
| **D1** | titres, dossiers, commentaires, vues, notifications | gratuit (5 Go) |
| **Workers** | le serveur et l'application | gratuit jusqu'à 100 000 requêtes par jour |
| **Workers AI** | transcription (Whisper) et traduction | allocation gratuite chaque jour (environ 3 h 30 de son transcrit) ; Whisper coûte ensuite 0,0005 $ par minute. Avec l'offre gratuite de Workers, rien n'est facturé : au-delà de l'allocation du jour, la transcription échoue et peut être relancée le lendemain depuis l'onglet « Transcription » |

Ordre de grandeur : une vidéo de 1 h 30 pèse entre 0,6 et 1,7 Go. **100 vidéos de 20 minutes ≈ 30 Go ≈ 0,30 $ par mois.** Il n'y a pas besoin d'archiver ou de supprimer les vieilles vidéos pour faire des économies (voir « Archivage » plus bas si tu veux aller plus loin).

R2 demande d'enregistrer un moyen de paiement, même pour rester dans la partie gratuite.

## Mise en ligne (une seule fois, sans terminal)

1. **Compte** : crée un compte sur [dash.cloudflare.com](https://dash.cloudflare.com) (gratuit).
2. **Stockage des vidéos** : menu **R2 Object Storage** → **Create bucket** → nom : `visions-videos` → Create.
3. **Base de données** : menu **Storage & databases → D1 SQLite Database** → **Create Database** → nom : `visions` → région *Western Europe* → Create. ✅ Fait (identifiant déjà ajouté au projet). Les tables sont créées automatiquement par le serveur au premier démarrage : rien à coller dans la console.
4. **Application** : menu **Compute → Workers & Pages** → **Create** → **Import a repository** → choisis `izennkra/Vision`.
   - Nom du projet : `visions` (exactement, c'est le nom attendu par la configuration).
   - Branche : celle où se trouve le travail (ou `main` une fois fusionné).
   - **Build command** : `npm run build:cloud`
   - **Deploy command** : `npx wrangler deploy`
   - Valide. Cloudflare construit et met en ligne ; chaque nouveau push sur la branche remet le site à jour tout seul.
5. **Mot de passe** : dans le Worker `visions` → **Settings → Variables and Secrets** → **Add** :
   - `OWNER_PASSWORD` (type *Secret*) : ton mot de passe pour entrer dans Visions.
   - `SESSION_SECRET` (type *Secret*) : une longue phrase au hasard (40 caractères ou plus), qui sert à signer les connexions et les liens vidéo. Tu n'auras jamais à la retaper.
   - Clique **Deploy** pour appliquer.
6. **C'est en ligne** : l'adresse est affichée sur la page du Worker (du type `visions.ton-nom.workers.dev`). Ouvre-la dans Chrome, entre ton mot de passe, et enregistre.

Tu peux ensuite brancher ton propre nom de domaine (Worker → Settings → Domains & Routes), par exemple `videos.izenn.fr`.

## Variante en ligne de commande

```bash
npm install
npx wrangler login
npx wrangler r2 bucket create visions-videos
npx wrangler d1 create visions            # copier l'ID affiché dans wrangler.jsonc
npx wrangler d1 migrations apply visions --remote
npx wrangler secret put OWNER_PASSWORD
npx wrangler secret put SESSION_SECRET    # par exemple : openssl rand -base64 48
npm run deploy
```

## Transcription

Rien à configurer : le lien vers Workers AI est déclaré dans `wrangler.jsonc` (`"ai": { "binding": "AI" }`) et créé au déploiement. Les tranches de son sont gardées dans R2 (`audio/…`) pour pouvoir relancer une transcription ; elles sont supprimées avec la vidéo.

## Tester en local avant de déployer

```bash
cp .dev.vars.example .dev.vars            # mot de passe local : change-moi
npx wrangler d1 migrations apply visions --local
npm run dev:cloud                         # http://localhost:8787 (transcription factice : Workers AI n'existe pas hors ligne)
```

## Archivage (facultatif)

Les vidéos ne coûtent presque rien à garder, donc rien n'est supprimé. Si tu veux réduire encore le coût des vidéos de plus de 30 jours, tu peux leur appliquer la classe de stockage « accès peu fréquent » de R2 (0,01 $ par Go et par mois au lieu de 0,015 $, mais 0,01 $ par Go à chaque visionnage) :
R2 → `visions-videos` → **Settings → Object lifecycle rules** → **Add rule** → préfixe `videos/` → *Transition to Infrequent Access after 30 days*.
Les vidéos archivées restent visibles normalement par leur lien.

## Et Vercel ?

Le site Vercel actuel reste une démonstration où tout est stocké dans le navigateur. La vraie version est celle de Cloudflare, qui sert à la fois l'application et les vidéos : tu peux supprimer le projet Vercel une fois Cloudflare en place.
