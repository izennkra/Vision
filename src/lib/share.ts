// Lien de partage client (étape 1 : simulé en local, étape 2 : vrai lien public).
export const shareUrl = (token: string) => `${window.location.origin}/v/${token}`

export async function copyShareLink(token: string) {
  await navigator.clipboard.writeText(shareUrl(token))
}
