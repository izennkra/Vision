# Visions

Outil d'enregistrement vidéo (écran + caméra + micro) pour présenter l'avancée des projets aux clients, avec commentaires liés à un moment de la vidéo.

## Stack

- **Vite + React + TypeScript** : une application web simple, rapide à lancer, sans serveur pour l'étape 1.
- **IndexedDB** (stockage du navigateur) derrière une couche unique `src/data/repository.ts`, remplaçable par Cloudflare à l'étape 2.

## Lancer le projet

```bash
npm install
npm run dev
```

Puis ouvrir http://localhost:5173.

## Organisation

- `src/styles/design-system.css` — design system (source unique : couleurs, typographie, rayons, dimensions, composants), mesuré sur les captures.
- `src/pages/DesignSystem.tsx` — planche visuelle du design system (`/design-system`).
- `src/data/types.ts` — modèle de données (vidéo, morceaux, commentaires, vues).
- `src/data/repository.ts` — interface de la couche de stockage.
- `public/fonts/` — PP Neue Montreal.
