// Identité de la personne qui regarde la page client : un identifiant anonyme propre au navigateur
// (pour regrouper ses vues) et le nom qu'elle a donné.
const ID_KEY = 'visions:viewer-id'
const NAME_KEY = 'visions:viewer-name'

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* navigation privée : non mémorisé */
  }
}

export function viewerId() {
  let id = read(ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    write(ID_KEY, id)
  }
  return id
}

export const viewerName = () => read(NAME_KEY)
export const saveViewerName = (name: string) => write(NAME_KEY, name)

/** Profil choisi sur une vidéo (parmi les personnes prévues, ou « Anonyme »). */
export const profileFor = (videoId: string) => read(`visions:profile:${videoId}`)
export const saveProfile = (videoId: string, name: string) => write(`visions:profile:${videoId}`, name)

/** Lien personnel (?p=) déjà ouvert dans ce navigateur : on reste reconnu sans le garder dans l'adresse. */
export const shareKeyFor = (token: string) => read(`visions:key:${token}`)
export const saveShareKey = (token: string, key: string) => write(`visions:key:${token}`, key)
