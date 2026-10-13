import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FALLBACK_ACCENT, SURFACES, accentTokens } from './accent'

const DIR_APPOINTMENTS = fileURLToPath(new URL('..', import.meta.url))

/**
 * Every text-on-background pair the workspace draws, at 4.5:1 or better,
 * in the light set ([data-appointments]) and the dark set
 * ([data-appointments][data-theme="dark"]). Status tones are drawn as text
 * in the tone over a 12 % tint of the same tone (cards, StatusMark, Notice).
 */
const css = readFileSync(new URL('./appointments.css', import.meta.url), 'utf8')

function block(selector: string): Record<string, number[]> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no block ${selector}`)
  const body = css.slice(start, css.indexOf('}', start))
  const vars: Record<string, number[]> = {}
  for (const m of body.matchAll(/--a-([a-z0-9-]+):\s*(\d+) (\d+) (\d+);/g)) vars[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  return vars
}

const lum = (c: number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const tint = (tone: number[], under: number[], k = 0.12) => tone.map((v, i) => v * k + under[i] * (1 - k))
const hex = (c: number[]) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')

const TOKENS = ['canvas', 'surface', 'surface-2', 'text', 'text-2', 'border', 'side', 'side-2', 'side-text', 'side-text-2',
  'accent', 'accent-ink', 'accent-deep', 'accent-text', 'accent-rail', 'danger', 'danger-ink', 'now', 'now-ink', 'hatch', 'scrim',
  'st-pending', 'st-confirmed', 'st-progress', 'st-completed', 'st-cancelled', 'st-noshow']

const PAIRS: [string, string][] = [
  ['text', 'canvas'], ['text', 'surface'], ['text', 'surface-2'],
  ['text-2', 'canvas'], ['text-2', 'surface'], ['text-2', 'surface-2'],
  ['side-text', 'side'], ['side-text', 'side-2'], ['side-text-2', 'side'], ['side-text-2', 'side-2'],
  ['accent-text', 'canvas'], ['accent-text', 'surface'], ['accent-text', 'surface-2'],
  ['danger-ink', 'danger'], ['now-ink', 'now'],
]
const TONES = ['st-pending', 'st-confirmed', 'st-progress', 'st-completed', 'st-cancelled', 'st-noshow', 'danger']

for (const [theme, selector] of [['light', '[data-appointments]'], ['dark', '[data-appointments][data-theme="dark"]']] as const) {
  describe(`appointments tokens — ${theme}`, () => {
    const vars = theme === 'light' ? block(selector) : { ...block('[data-appointments]'), ...block(selector) }

    it('defines every token the Tailwind aliases read', () => {
      for (const name of TOKENS) expect(vars[name], `--a-${name} is missing`).toBeDefined()
    })

    for (const [fg, bg] of PAIRS) {
      it(`--a-${fg} on --a-${bg} is at least 4.5:1`, () => {
        expect(ratio(vars[fg], vars[bg])).toBeGreaterThanOrEqual(4.5)
      })
    }

    for (const tone of TONES) {
      for (const under of ['canvas', 'surface', 'surface-2']) {
        it(`${tone} on its tint over ${under} is at least 4.5:1`, () => {
          expect(ratio(vars[tone], tint(vars[tone], vars[under]))).toBeGreaterThanOrEqual(4.5)
        })
      }
    }

    it('the accent defaults are the derivation of the fallback brand colour', () => {
      const t = accentTokens(FALLBACK_ACCENT, theme)
      expect(hex(vars.accent)).toBe(t.accent)
      expect(hex(vars['accent-ink'])).toBe(t.ink)
      expect(hex(vars['accent-deep'])).toBe(t.deep)
      expect(hex(vars['accent-text'])).toBe(t.text)
      expect(hex(vars['accent-rail'])).toBe(t.rail)
    })

    it('the surfaces accent.ts derives against are the CSS tokens', () => {
      const s = SURFACES[theme]
      expect(hex(vars.canvas)).toBe(s.canvas)
      expect(hex(vars.surface)).toBe(s.surface)
      expect(hex(vars['surface-2'])).toBe(s.surface2)
      expect(hex(vars.side)).toBe(s.side)
    })

    it('the focus ring (accent) stands out from a surface, and the rail\'s ring (side text) from the rail', () => {
      expect(ratio(vars.accent, vars.surface)).toBeGreaterThanOrEqual(3)
      expect(ratio(vars['side-text'], vars.side)).toBeGreaterThanOrEqual(3)
    })

    // A card draws the client (text) and the service (text-2) over its tone's tint on a column surface.
    for (const tone of ['st-pending', 'st-confirmed', 'st-progress', 'st-completed', 'st-cancelled', 'st-noshow']) {
      for (const fg of ['text', 'text-2']) {
        it(`--a-${fg} on the 12% tint of --a-${tone} is at least 4.5:1`, () => {
          expect(ratio(vars[fg], tint(vars[tone], vars.surface))).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
  })
}

describe('appointments stylesheet structure', () => {
  it('a narrow card drops the status word from view without removing it from the page', () => {
    const tail = css.slice(css.indexOf('@container'))
    expect(css).toContain('container-type: inline-size')
    expect(tail).toMatch(/@container \(max-width: \d+px\)\s*\{\s*\[data-appointments\] \[data-density\] \[data-status-word\]/)
    expect(tail).not.toMatch(/display:\s*none/) // hidden from sight only: the word stays in the card's name
  })

  // The tests above merge the light block under the dark one, so a token the dark
  // block forgot would be borrowed from the light set and pass. This one does not merge.
  it('the dark block alone defines every colour token', () => {
    const dark = block('[data-appointments][data-theme="dark"]')
    for (const name of TOKENS) expect(dark[name], `--a-${name} is missing from the dark block`).toBeDefined()
  })

  it('reduced motion covers the root as well as its children and stops animations from looping', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const at = rules.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(at, 'no reduced-motion block').toBeGreaterThanOrEqual(0)
    const open = rules.indexOf('{', at)
    let depth = 0
    let close = rules.length
    for (let i = open; i < rules.length; i++) {
      if (rules[i] === '{') depth++
      else if (rules[i] === '}' && --depth === 0) { close = i; break }
    }
    const body = rules.slice(open + 1, close)
    const selectors = body.slice(0, body.indexOf('{')).split(',').map(s => s.trim())
    expect(selectors).toContain('[data-appointments]')
    expect(selectors).toContain('[data-appointments] *')
    // !important: the animate-a-* and transition utilities have the same specificity and would otherwise win by order.
    expect(body).toContain('animation-iteration-count: 1 !important')
    expect(body).toContain('animation-duration: 0.01ms !important')
    // A stagger (the Today strip's tiles) is an animation-delay: under reduced motion nothing may wait before it appears.
    expect(body).toContain('animation-delay: 0s !important')
    expect(body).toContain('transition-duration: 0.01ms !important')
  })

  it('the rail\'s pale ring is drawn on the rail only — the panel and the month are white and keep the accent', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const light = block('[data-appointments]')
    expect(rules).toContain('[data-appointments] [data-rail] :focus-visible')
    expect(rules).not.toMatch(/\baside\s+:focus-visible/)
    expect(ratio(light['side-text'], light.surface)).toBeLessThan(3) // why it must never reach a white surface
  })

  it('accent fills with an edge, the slim panel tooltips and the form-control rules are scoped and in place', () => {
    expect(css).toContain('[data-appointments][data-accent-edge] .bg-a-accent')
    expect(css).toContain('[data-appointments] [data-rail-size="slim"] [data-tip]:hover::after')
    expect(css).toContain('accent-color: rgb(var(--a-accent))')
  })

  it('draws every accent LINE and every accent TEXT in accent-text; only fills keep the raw brand', () => {
    // Fills (bg-a-accent, the mark, the pill, the selected day) keep the brand. A line needs 3:1 against the page and the
    // brand alone gives that on few colours (medical #4a9fd8 is 2.58:1 on surface-2 in Light), so every ring, outline,
    // border and text colour is `-a-accent-text`, which accent.ts derives to read on every surface (accent.test.ts).
    const sources = readdirSync(DIR_APPOINTMENTS, { recursive: true, encoding: 'utf8' })
      .filter(f => f.endsWith('.tsx') && !f.includes('.test.'))
      .map(f => readFileSync(join(DIR_APPOINTMENTS, f), 'utf8')).join('\n')
    // Whole class tokens, so a variant-prefixed one (focus-visible:ring-a-accent) is seen as itself, not as its tail.
    const tokens = sources.split(/[\s"'`{}()]+/)
    const utilities = tokens.map(tok => (tok.split(':').pop() ?? '').replace(/^-/, ''))
    // Whatever the utility part is (ring, outline, border, divide, decoration, shadow, text...), unless it paints a fill.
    const FILLS = new Set(['bg', 'from', 'via', 'to'])
    const onRawBrand = tokens.filter((_, i) => {
      const m = utilities[i].match(/^([a-z]+(?:-[a-z]+)*)-a-accent(?:\/\d+)?$/)
      return m !== null && !FILLS.has(m[1])
    })
    expect(onRawBrand, 'lines and text must use -a-accent-text, not the raw brand').toEqual([])
    // The three the review named, by name, so the sweep above cannot pass by finding nothing.
    expect(utilities.filter(u => /^(ring|outline|border)-a-accent(\/\d+)?$/.test(u))).toEqual([])
    const lines = new Set(utilities.filter(u => /^(ring|outline|border)-a-accent-text$/.test(u)))
    for (const cls of ['ring-a-accent-text', 'outline-a-accent-text', 'border-a-accent-text']) expect(lines.has(cls), `${cls} is used`).toBe(true)
    expect(tokens.includes('focus-visible:ring-a-accent-text'), 'the drop confirm\'s focus ring').toBe(true)
    // The brand fills are still brand fills.
    expect(utilities.includes('bg-a-accent')).toBe(true)
  })

  it('keeps the old per-line edge rules out of the stylesheet: the lines are accent-text on every brand now', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const cls of ['.ring-a-accent', '.outline-a-accent', '.border-a-accent', '.focus-visible\\:ring-a-accent'])
      expect(rules, `${cls} has no rule any more`).not.toContain(cls)
    expect(rules).not.toContain('[data-accent-edge] :focus-visible')
    // Fills keep the edge: the inset line on every accent fill, and the 45 % current-step bar (a fill) in accent-text.
    const fill = rules.indexOf('[data-appointments][data-accent-edge] .bg-a-accent {')
    expect(fill, 'the fill edge').toBeGreaterThanOrEqual(0)
    expect(rules.slice(fill, rules.indexOf('}', fill))).toContain('inset 0 0 0 1px rgb(var(--a-accent-text))')
    const step = rules.indexOf('[data-appointments][data-accent-edge] .bg-a-accent\\/45 {')
    expect(step, 'the current visit step').toBeGreaterThanOrEqual(0)
    expect(rules.slice(step, rules.indexOf('}', step))).toContain('var(--a-accent-text)')
  })

  it('draws the keyboard focus ring in accent-text on every brand, and leaves the side panel its own ring colour', () => {
    // WCAG 2.4.7 / 1.4.11: the raw brand under 3:1 on most colours made the ring faint (final review, 2026-10-12).
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const base = rules.indexOf('[data-appointments] :focus-visible {')
    expect(base, 'no base focus rule').toBeGreaterThanOrEqual(0)
    const body = rules.slice(base, rules.indexOf('}', base))
    expect(body).toContain('outline: 2px solid rgb(var(--a-accent-text))')
    expect(body).not.toMatch(/var\(--a-accent\)/)
    // No rule anywhere draws an outline, border or ring in the raw brand.
    expect(rules).not.toMatch(/(?:outline|border|--tw-ring)[a-z-]*:[^;{}]*var\(--a-accent\)/)
    // The rail's rule is more specific (0,3,0 against 0,2,0), so the dark panel keeps its pale ring either way.
    const rail = rules.indexOf('[data-appointments] [data-rail] :focus-visible {')
    expect(rail).toBeGreaterThan(base)
    expect(rules.slice(rail, rules.indexOf('}', rail))).toContain('outline-color: rgb(var(--a-side-text))')
  })

  it('draws a team member\'s colour through --a-m: the dot and the ring rules exist, are scoped, and read the variable', () => {
    // The colour arrives as data from the server's palette and is set as --a-m on the element; no hex lives in the stylesheet.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const cls of ['a-member-dot', 'a-member-ring']) {
      const at = rules.indexOf(`.${cls} {`)
      expect(at, `no .${cls} rule`).toBeGreaterThanOrEqual(0)
      const selector = rules.slice(rules.lastIndexOf('}', at) + 1, at + cls.length + 1).trim()
      expect(selector.startsWith('[data-appointments]'), `unscoped: ${selector}`).toBe(true)
      const body = rules.slice(at, rules.indexOf('}', at))
      expect(body, cls).toContain('var(--a-m)')
      expect(body, cls).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    }
    expect(rules.slice(rules.indexOf('.a-member-dot {'), rules.indexOf('}', rules.indexOf('.a-member-dot {')))).toContain('background-color: var(--a-m)')
    expect(rules.slice(rules.indexOf('.a-member-ring {'), rules.indexOf('}', rules.indexOf('.a-member-ring {')))).toContain('box-shadow: 0 0 0 2px var(--a-m)')
  })

  it('shows the slim panel\'s hover labels only on a device that hovers, so a tap does not leave one stuck', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const at = rules.indexOf('@media (hover: hover)')
    expect(at, 'a hover media block').toBeGreaterThanOrEqual(0)
    const open = rules.indexOf('{', at)
    let depth = 0
    let close = rules.length
    for (let i = open; i < rules.length; i++) {
      if (rules[i] === '{') depth++
      else if (rules[i] === '}' && --depth === 0) { close = i; break }
    }
    const inside = rules.slice(open + 1, close)
    const outside = rules.slice(0, at) + rules.slice(close + 1)
    // The hover label is inside; every rule inside is scoped like the rest of the file.
    expect(inside).toContain('[data-appointments] [data-rail-size="slim"] [data-tip]:hover::after')
    expect(inside).toContain('content: attr(data-tip)')
    const selectors = [...inside.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map(m => m[2].trim())
    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors)
      for (const part of selector.split(',')) expect(part.trim().startsWith('[data-appointments]'), `unscoped: ${part.trim()}`).toBe(true)
    // Keyboard focus is not a hover: its labels, with and without :has(), stay outside, and nothing outside hovers.
    expect(inside).not.toContain(':focus-visible')
    expect(outside).toContain('[data-appointments] [data-rail-size="slim"] [data-tip]:focus-visible::after')
    expect(outside).toContain('[data-appointments] [data-rail-size="slim"] [data-tip]:has(:focus-visible)::after')
    expect(outside).not.toContain(':hover')
    // Both outside rules still show the label.
    for (const sel of ['[data-tip]:focus-visible::after', '[data-tip]:has(:focus-visible)::after']) {
      const rule = outside.indexOf(sel)
      expect(outside.slice(rule, outside.indexOf('}', rule)), sel).toContain('content: attr(data-tip)')
    }
  })
})
