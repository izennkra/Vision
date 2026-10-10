// Icône de l'onglet (favicon) : l'œil noir de la DA. Comme le logo, il regarde à gauche et à droite
// et cligne de temps en temps (l'image de l'onglet est simplement remplacée, sans aucun coût).
const eye = (dx = 0, dy = 0, open = 1) => {
  const top = 50 - 34 * open
  const bottom = 50 + 34 * open
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"/>` +
    `<path d="M16 50Q50 ${top} 84 50Q50 ${bottom} 16 50Z" fill="#fff"/>` +
    (open > 0.3 ? `<circle cx="${50 + dx}" cy="${50 + dy}" r="15"/>` : '') +
    `</svg>`
}

const href = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`

export function animateFavicon() {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  let gaze = { x: 0, y: 0 }
  const show = (open = 1) => (link.href = href(eye(gaze.x, gaze.y, open)))
  const rand = (a: number, b: number) => a + Math.random() * (b - a)
  const look = () => {
    gaze = Math.random() < 0.3 ? { x: 0, y: 0 } : { x: rand(-13, 13), y: rand(-5, 4) }
    show()
    window.setTimeout(look, rand(1500, 4500))
  }
  const blink = () => {
    show(0.08)
    window.setTimeout(() => show(), 140)
    window.setTimeout(blink, Math.random() < 0.2 ? rand(300, 420) : rand(3000, 8000))
  }
  window.setTimeout(look, 1200)
  window.setTimeout(blink, 2500)
}

