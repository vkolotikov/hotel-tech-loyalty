import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { hexToRgb, luminance } from './colour'
import { GLASS_FONTS, GLASS_INK, GLASS_SCOPE } from './glassTokens'

const glassCss = readFileSync(new URL('./glass.css', import.meta.url), 'utf8')
const indexCss = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

/** Split on commas that are not inside parentheses (`:is(.a, .b)` stays whole). */
function splitTopLevel(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of list) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts.map(s => s.trim()).filter(Boolean)
}

/** Every rule's selectors, at-rule preludes (@media, @supports, @import) left out. */
function selectors(css: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: string[] = []
  for (const match of clean.matchAll(/([^{};]+)\{/g)) {
    const prelude = match[1].trim()
    if (prelude && !prelude.startsWith('@')) out.push(...splitTopLevel(prelude))
  }
  return out
}

/** The declarations of the first rule whose selector list contains `needle`. */
function ruleBody(css: string, needle: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const at = clean.indexOf(needle)
  const open = clean.indexOf('{', at)
  return clean.slice(open + 1, clean.indexOf('}', open))
}

/** The selectors of every rule whose declarations contain `declaration`. */
function selectorsOfRulesWith(css: string, declaration: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: string[] = []
  for (const match of clean.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    if (match[2].includes(declaration)) out.push(...splitTopLevel(match[1].trim()))
  }
  return out
}

// Every surface class a menu, popover, sticky header or modal panel is drawn with.
const OVERLAY_SURFACES = ['bg-dark-bg', 'bg-dark-surface', 'bg-dark-surface2', 'bg-dark-card', 'bg-panel', 'bg-panel-dim', 'bg-well']

describe('glass.css', () => {
  it('has rules, and every one of them is scoped to the signed-in admin in Glass', () => {
    const all = selectors(glassCss)
    expect(all.length).toBeGreaterThan(20)
    for (const selector of all) expect(selector.startsWith(GLASS_SCOPE), selector).toBe(true)
  })

  it('gives every overlay surface the darker, blurred glass, so menus and modals stay readable', () => {
    const overlay = selectorsOfRulesWith(glassCss, 'rgb(14 20 34 / 0.78)').join(' ')
    for (const cls of OVERLAY_SURFACES) {
      expect(new RegExp(`\\.${cls}(?![\\w-])`).test(overlay), cls).toBe(true)
    }
    // A popover placed with an inline `position: fixed` (ColumnTogglePopover) counts too.
    for (const position of ['.absolute', '.fixed', '.sticky', '.fixed.inset-0 >', '[style*="position: fixed"]']) {
      expect(overlay.includes(position), position).toBe(true)
    }
  })

  it('makes an overlay nested in another blurred surface near-opaque, since it cannot blur', () => {
    const nested = selectorsOfRulesWith(glassCss, 'rgb(14 20 34 / 0.96)').join(' ')
    // A blurred modal scrim is a backdrop root too: the panel inside it, and any
    // menu inside that panel, cannot blur the page.
    for (const ancestor of ['.hx-sidebar', '.hx-header', '.mobile-bottom-nav', '.fixed.inset-0 >', '.fixed.inset-0[class*="backdrop-blur"]']) {
      expect(nested.includes(ancestor), ancestor).toBe(true)
    }
    expect(nested.includes('.fixed.inset-0[class*="backdrop-blur"] > :is('), 'panel directly inside a blurred scrim').toBe(true)
    for (const cls of OVERLAY_SURFACES) {
      expect(new RegExp(`\\.${cls}(?![\\w-])`).test(nested), cls).toBe(true)
    }
    const clean = glassCss.replace(/\/\*[\s\S]*?\*\//g, '')
    const at = clean.indexOf('rgb(14 20 34 / 0.96)')
    const body = clean.slice(clean.lastIndexOf('{', at) + 1, clean.indexOf('}', at))
    expect(body).toContain('backdrop-filter: none')
  })

  it('gives an old inline surface used as an overlay the overlay ink, not a card tint', () => {
    // Modal panels and day drawers inside a scrim (Services, ServiceBookings, BookingRooms …).
    const inScrim = ruleBody(glassCss, '.fixed.inset-0 > [style*="--legacy-"]')
    for (const name of ['--legacy-hero-gradient', '--legacy-card-gradient-deep', '--legacy-card-gradient', '--legacy-card']) {
      expect(inScrim, name).toMatch(new RegExp(`${name}:[^;]*rgb\\(14 20 34 / 0\\.96\\)`))
    }
    // Floating bulk-action bars.
    const floating = ruleBody(glassCss, '.fixed[style*="--legacy-"]')
    expect(floating).toMatch(/--legacy-card:\s*rgb\(14 20 34 \/ 0\.78\)/)
    expect(floating).toContain('backdrop-filter: blur(22px)')
    // …and the bars turn solid with the other panels when transparency is reduced.
    const reduced = glassCss.slice(glassCss.indexOf('@media (prefers-reduced-transparency: reduce)'))
    expect(ruleBody(reduced, '.fixed[style*="--legacy-"]')).toMatch(/--legacy-card:\s*#1A2233;[\s\S]*backdrop-filter: none/)
  })

  it('keeps text drawn in the page ink solid (text-dark-bg on brand fills)', () => {
    expect(ruleBody(glassCss, '.text-dark-bg {')).toMatch(/--alpha-dark-bg:\s*1;/)
  })

  it('keeps the header above the page so its own popovers stay on top', () => {
    const lifted = selectorsOfRulesWith(glassCss, 'z-index: 35')
    expect(lifted.some(s => s.endsWith('.hx-header')), lifted.join('\n')).toBe(true)
  })

  it('paints no backdrop ink lighter than the ink the contrast tests measure over', () => {
    const backdrop = ruleBody(glassCss, '.hx-shell {')
    const inks = [...backdrop.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(m => m[0])
    expect(inks.length).toBeGreaterThanOrEqual(3)
    for (const ink of inks) {
      expect(luminance(hexToRgb(ink)), ink).toBeLessThanOrEqual(luminance(hexToRgb(GLASS_INK)) + 1e-9)
    }
  })
})

/** index.css up to its first @tailwind directive: the only imports the build keeps. */
function leadingIndexCss(): string {
  const clean = indexCss.replace(/\/\*[\s\S]*?\*\//g, '')
  const at = clean.indexOf('@tailwind')
  expect(at, 'index.css has a @tailwind directive').toBeGreaterThan(0)
  return clean.slice(0, at)
}

describe('index.css imports', () => {
  it('loads no Google Fonts stylesheet app-wide (a leading import would reach login, the portal and Appointments)', () => {
    expect(leadingIndexCss()).not.toContain('fonts.googleapis.com')
  })

  it('imports the Glass stylesheets where the build keeps them', () => {
    const leading = leadingIndexCss()
    expect(leading).toContain("@import './theme/glass.css';")
    expect(leading).toContain("@import './theme/legacySurfaces.css';")
  })
})

describe('Glass fonts', () => {
  const faces = [...glassCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => m[1])
  const facesOf = (family: string) => faces.filter(body => body.includes(`font-family: '${family}';`))

  it('are self-hosted under Glass-only names, from files that ship with the app', () => {
    for (const [family, count] of [['HX Inter', 3], ['HX Space Grotesk', 2]] as const) {
      const declared = facesOf(family)
      expect(declared.length, family).toBe(count)
      for (const body of declared) {
        expect(body, family).toContain('font-display: swap;')
        const urls = [...body.matchAll(/url\('([^']+)'\)/g)].map(m => m[1])
        expect(urls.length, family).toBe(1)
        for (const url of urls) {
          expect(url, family).toMatch(/^\.\/fonts\/[a-z0-9-]+\.woff2$/)
          expect(existsSync(new URL(url, new URL('./glass.css', import.meta.url))), url).toBe(true)
        }
      }
    }
    expect(faces.length).toBe(5)
  })

  it('are the faces the Glass tokens ask for first', () => {
    expect(GLASS_FONTS.body.startsWith("'HX Inter',")).toBe(true)
    expect(GLASS_FONTS.display.startsWith("'HX Space Grotesk',")).toBe(true)
  })
})

describe('index.css mood rules', () => {
  it('never reach the Glass admin (Glass has its own type and corners)', () => {
    const moodRules = selectors(indexCss).filter(s => s.includes('[data-mood'))
    expect(moodRules.length).toBeGreaterThan(60)
    for (const selector of moodRules) {
      expect(selector.startsWith(':root:where(:not([data-style="glass"][data-shell="admin"]))[data-mood'), selector).toBe(true)
    }
  })
})
