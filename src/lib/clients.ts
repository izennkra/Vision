// Dossiers clients : libellés et ordre d'affichage (dossier puis ses sous-dossiers).
import { owner } from '../config'
import type { Client, ID } from '../data'

/** « Izenn x Elias Studio » ou, pour un sous-dossier, « Elias Studio x Co-labs ». */
export function clientLabel(client: Client | null | undefined, clients: Client[]) {
  if (!client) return null
  const parent = client.parentId ? clients.find((c) => c.id === client.parentId) : null
  return `${parent ? parent.name : owner.firstName} x ${client.name}`
}

/** Nom d'équipe : « Elias Studio », ou pour un sous-dossier « Elias Studio x Co-labs ». */
export function teamLabel(client: Client, clients: Client[]) {
  const parent = client.parentId ? clients.find((c) => c.id === client.parentId) : null
  return parent ? `${parent.name} x ${client.name}` : client.name
}

/** Arborescence aplatie : chaque dossier suivi de ses sous-dossiers, avec leur profondeur. */
export function folderTree(clients: Client[]): { client: Client; depth: number }[] {
  const out: { client: Client; depth: number }[] = []
  const walk = (parentId: ID | null, depth: number) => {
    for (const c of clients.filter((x) => (x.parentId ?? null) === parentId)) {
      out.push({ client: c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

export const rootOf = (id: ID | null, clients: Client[]): ID | null => {
  let c = clients.find((x) => x.id === id)
  while (c?.parentId) c = clients.find((x) => x.id === c!.parentId)
  return c?.id ?? null
}
