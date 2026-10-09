// Point d'accès unique au stockage pour toute l'application.
// Étape 2 : remplacer LocalRepository par l'implémentation Cloudflare ici, et nulle part ailleurs.
import { LocalRepository } from './local/LocalRepository'
import type { Repository } from './repository'

export const repo: Repository & Pick<LocalRepository, 'getVideoFile'> = new LocalRepository()
export type { Repository } from './repository'
export * from './types'
