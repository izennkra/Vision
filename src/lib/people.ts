// Personnes qui regardent et commentent : équipes des dossiers clients et personnes ajoutées à une vidéo.
import type { Client, ID, Person, PersonInput, Video } from '../data/types'

/** Couleurs de photo de profil (DA) : vert, magenta, orange, gris, noir, moutarde. */
export const AVATAR_COLORS = ['#007500', '#b400b4', '#f24822', '#4d4d4d', '#000000', '#daa520']

/** Couleur d'une personne : celle choisie, sinon toujours la même pour un même nom. */
export function colorFor(name: string, chosen?: string | null) {
  if (chosen && AVATAR_COLORS.includes(chosen)) return chosen
  let h = 0
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/** Toutes les personnes prévues pour une vidéo : ajoutées à la vidéo, équipe de son dossier, équipe de l'agence. */
export function audienceOf(video: Video, clients: Client[]): Person[] {
  const list = [...(video.people ?? [])]
  let folder = clients.find((c) => c.id === video.clientId)
  for (let depth = 0; folder && depth < 2; depth++) {
    list.push(...(folder.people ?? []))
    folder = folder.parentId ? clients.find((c) => c.id === folder!.parentId) : undefined
  }
  const seen = new Set<ID>()
  return list.filter((p) => !seen.has(p.id) && seen.add(p.id))
}

/** Ce que la page client voit d'une personne : jamais l'e-mail ni le lien personnel. */
export const publicPerson = (p: Person): Person => ({ id: p.id, name: p.name, email: null, token: '', color: p.color ?? null, avatar: p.avatar ?? null })

/** Version locale de l'enregistrement d'une liste de personnes (mêmes règles que le serveur). */
export function normalizePeople(input: PersonInput[], before: Person[], newId: () => string): Person[] {
  return input
    .map((x): Person => {
      const old = x.id ? before.find((o) => o.id === x.id) : undefined
      return {
        id: old?.id ?? newId(),
        name: x.name.trim().slice(0, 60),
        email: x.email?.trim() || null,
        token: old?.token ?? newId().replace(/-/g, ''),
        color: x.color && AVATAR_COLORS.includes(x.color) ? x.color : null,
        avatar: x.avatar ?? null,
      }
    })
    .filter((x) => x.name && x.name.toLowerCase() !== 'anonyme')
    .slice(0, 50)
}
