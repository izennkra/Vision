// Coins arrondis d'une fenêtre enregistrée (Mac) : ils arrivent transparents, ou noirs selon la version
// de macOS, et deviendraient noirs dans la vidéo. On mesure leur profondeur en lisant la diagonale du coin
// haut gauche. Seuls ces 96 × 96 pixels sont copiés depuis l'image, sans la dessiner ni la convertir en entier :
// la lecture est quasi gratuite et ne bloque jamais la composition (l'ancienne méthode convertissait toute
// l'image sur le processeur, soit 20 à 60 ms de blocage sur un écran Retina, toutes les 2 secondes).

const SIZE = 96

/** Nombre de pixels vides (transparents ou noirs) sur la diagonale du coin haut gauche ; 0 si rien à combler. */
export async function cornerDepth(frame: VideoFrame): Promise<number> {
  const format = frame.format
  const visible = frame.visibleRect ?? frame.codedRect
  if (!format || !visible) return 0
  // Zone paire (les formats 4:2:0 l'exigent), jamais plus grande que l'image.
  const w = Math.min(SIZE, visible.width) & ~1
  const h = Math.min(SIZE, visible.height) & ~1
  if (w < 8 || h < 8) return 0
  const rect = { x: visible.x & ~1, y: visible.y & ~1, width: w, height: h }
  const bytes = new Uint8Array(frame.allocationSize({ rect }))
  const layout = await frame.copyTo(bytes, { rect })
  const n = Math.min(w, h)
  const y = layout[0]
  let d = 0
  if (format === 'RGBA' || format === 'RGBX' || format === 'BGRA' || format === 'BGRX') {
    const alpha = format === 'RGBA' || format === 'BGRA'
    const empty = (i: number) => (alpha && bytes[i + 3] < 250) || (bytes[i] < 6 && bytes[i + 1] < 6 && bytes[i + 2] < 6)
    while (d < n && empty(y.offset + d * y.stride + d * 4)) d++
    return d
  }
  // Formats YUV : le plan de luminance suffit (noir = 16 en plage vidéo, 0 en plage complète) ;
  // avec un plan alpha (I420A), un pixel transparent compte aussi comme vide.
  const black = frame.colorSpace?.fullRange ? 6 : 22
  const a = format === 'I420A' ? layout[3] : null
  while (d < n && (bytes[y.offset + d * y.stride + d] < black || (a !== null && bytes[a.offset + d * a.stride + d] < 250))) d++
  return d
}
