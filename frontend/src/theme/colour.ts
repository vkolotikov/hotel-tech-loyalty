/**
 * Colour maths for the admin styles: hex and RGB, WCAG luminance and
 * contrast, alpha blending, HSL shifts and the ten-step shade scale the
 * palette has always used. Pure functions, no DOM, so the theme code, the
 * Tailwind config and the contrast tests all share one implementation.
 */

export type RGB = [number, number, number]
export type HSL = [number, number, number]

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
export type Shade = (typeof SHADES)[number]

/** True for `#rgb` / `#rrggbb` (the `#` optional). */
export function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
}

/** Parse `#rgb` or `#rrggbb` (with or without `#`). Anything else is black. */
export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) return [0, 0, 0]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function rgbToHex([r, g, b]: RGB): string {
  const byte = (c: number) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')
  return `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase()
}

/** `R G B`, the form every theme variable uses: rgb(var(--x) / <alpha>). */
export function toTriplet([r, g, b]: RGB): string {
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`
}

/** WCAG 2 relative luminance. */
export function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** `top` painted at `alpha` over the opaque `under`. */
export function blend(top: RGB, alpha: number, under: RGB): RGB {
  return [
    top[0] * alpha + under[0] * (1 - alpha),
    top[1] * alpha + under[1] * (1 - alpha),
    top[2] * alpha + under[2] * (1 - alpha),
  ]
}

/** Hue in degrees, saturation and lightness 0 to 1. */
export function rgbToHsl([r, g, b]: RGB): HSL {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0)
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  return [h * 60, s, l]
}

export function hslToRgb([h, s, l]: HSL): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const hue = (((h % 360) + 360) % 360) / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (u < 1 / 6) return p + (q - p) * 6 * u
    if (u < 1 / 2) return q
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
    return p
  }
  return [channel(hue + 1 / 3) * 255, channel(hue) * 255, channel(hue - 1 / 3) * 255]
}

/** Same saturation and lightness, hue turned by `degrees`. */
export function rotateHue(rgb: RGB, degrees: number): RGB {
  const [h, s, l] = rgbToHsl(rgb)
  const [r, g, b] = hslToRgb([h + degrees, s, l])
  return [Math.round(r), Math.round(g), Math.round(b)]
}

/** Darken in 1 % steps until the relative luminance is at most `max`. */
export function capLuminance(rgb: RGB, max: number): RGB {
  let out = rgb
  for (let k = 100; k >= 0 && luminance(out) > max; k--) {
    out = [Math.round((rgb[0] * k) / 100), Math.round((rgb[1] * k) / 100), Math.round((rgb[2] * k) / 100)]
  }
  return out
}

/**
 * The ten shades every palette colour gets: 50 to 400 mix towards white,
 * 600 to 900 towards black. The arithmetic is the one useTheme has always
 * used, so Classic renders the same shades as before.
 */
export function shadeScale(hex: string): Record<Shade, string> {
  const [r, g, b] = hexToRgb(hex)
  const lighten = (pct: number) => (c: number) => Math.min(255, Math.round(c + (255 - c) * pct))
  const darken = (pct: number) => (c: number) => Math.max(0, Math.round(c * (1 - pct)))
  const at = (f: (c: number) => number) => `${f(r)} ${f(g)} ${f(b)}`
  return {
    50: at(lighten(0.9)),
    100: at(lighten(0.8)),
    200: at(lighten(0.6)),
    300: at(lighten(0.35)),
    400: at(lighten(0.15)),
    500: `${r} ${g} ${b}`,
    600: at(darken(0.12)),
    700: at(darken(0.25)),
    800: at(darken(0.35)),
    900: at(darken(0.45)),
  }
}
