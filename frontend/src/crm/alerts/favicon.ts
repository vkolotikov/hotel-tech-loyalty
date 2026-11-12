/**
 * The tab's icon with a dot while the alerts' badge is on (round 5), drawn on a canvas over the page's own icon (no
 * second image is shipped); the icon the page had comes back when the count is back to 0. Never throws.
 */
let original: string | null = null
let drawn = false

function iconLink(): HTMLLinkElement | null {
  try { return document.querySelector<HTMLLinkElement>("link[rel~='icon']") } catch { return null }
}

/** The danger colour of the frame (`--a-danger`, an "r g b" triplet), else a red. */
function dotColour(): string {
  try {
    const host = document.querySelector('[data-crm]') ?? document.documentElement
    const raw = getComputedStyle(host).getPropertyValue('--a-danger').trim()
    if (/^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/.test(raw)) return `rgb(${raw.split(/\s+/).join(',')})`
  } catch { /* the fallback */ }
  return '#e5484d'
}

export function setFaviconDot(on: boolean): void {
  const link = iconLink()
  if (!link) return
  if (original === null) original = link.href
  if (!on) {
    if (drawn) { link.href = original; drawn = false }
    return
  }
  if (drawn) return
  drawn = true
  const source = original
  const img = new Image()
  img.onload = () => {
    try {
      if (!drawn) return
      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 32
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0, 32, 32)
      ctx.beginPath()
      ctx.arc(24, 8, 7, 0, Math.PI * 2)
      ctx.fillStyle = dotColour()
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()
      link.href = canvas.toDataURL('image/png')
    } catch { /* a tainted canvas: the title still says it */ }
  }
  img.onerror = () => { /* no icon to draw on */ }
  img.src = source
}
