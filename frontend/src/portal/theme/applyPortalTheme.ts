/**
 * Writes the venue's accent and display face onto a root element as CSS
 * variables. The values come from the server already contrast-checked
 * (PortalTheme → App\Support\Accent); nothing is derived here, so what the
 * server measured is what paints.
 */
export interface PortalAccent {
  hex: string
  ink: string
  deep: string
  dark_hex: string
  dark_ink: string
  dark_deep: string
}

export interface PortalThemeInput {
  accent: PortalAccent
  display_face: string
}

export const DISPLAY_FACE_STACKS: Record<string, string> = {
  playfair:   "'PortalDisplay-Playfair', 'Playfair Display', Georgia, serif",
  cormorant:  "'PortalDisplay-Cormorant', 'Cormorant Garamond', Georgia, serif",
  fraunces:   "'PortalDisplay-Fraunces', 'Fraunces', Georgia, serif",
  newsreader: "'PortalDisplay-Newsreader', 'Newsreader', Georgia, serif",
  space:      "'PortalDisplay-Space', 'Space Grotesk', 'Inter', system-ui, sans-serif",
  manrope:    "'PortalDisplay-Manrope', 'Manrope', 'Inter', system-ui, sans-serif",
}

const WRITTEN = [
  '--p-accent-l', '--p-accent-l-ink', '--p-accent-l-deep',
  '--p-accent-d', '--p-accent-d-ink', '--p-accent-d-deep',
  '--p-font-venue',
] as const

/** "#b04a6e" → "176 74 110"; null for anything that is not six hex digits. */
export function hexToTriplet(hex: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

export function applyPortalTheme(root: HTMLElement, theme: PortalThemeInput): void {
  const pairs: Array<[string, string | null | undefined]> = [
    ['--p-accent-l',      theme.accent?.hex],
    ['--p-accent-l-ink',  theme.accent?.ink],
    ['--p-accent-l-deep', theme.accent?.deep],
    ['--p-accent-d',      theme.accent?.dark_hex],
    ['--p-accent-d-ink',  theme.accent?.dark_ink],
    ['--p-accent-d-deep', theme.accent?.dark_deep],
  ]
  for (const [name, hex] of pairs) {
    const triplet = hexToTriplet(hex)
    if (triplet) root.style.setProperty(name, triplet)
    else root.style.removeProperty(name)
  }
  const face = DISPLAY_FACE_STACKS[theme.display_face] ?? DISPLAY_FACE_STACKS.manrope
  // Not --p-font-display itself: the [data-portal] scope declares that one,
  // which would shadow a value inherited from the root. The scope reads this.
  root.style.setProperty('--p-font-venue', face)
}

export function clearPortalTheme(root: HTMLElement): void {
  for (const name of WRITTEN) root.style.removeProperty(name)
}
