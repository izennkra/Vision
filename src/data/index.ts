// Point d'accès unique au stockage pour toute l'application.
// - Local (développement, démonstration) : tout reste dans le navigateur.
// - En ligne (npm run build:cloud) : serveur Cloudflare, vidéos dans R2.
import { cloud } from '../lib/api'
import { LocalRepository } from './local/LocalRepository'
import { RemoteRepository } from './remote/RemoteRepository'
import type { Repository } from './repository'

export const repo: Repository = cloud ? new RemoteRepository() : new LocalRepository()
export type { Repository } from './repository'
export * from './types'
