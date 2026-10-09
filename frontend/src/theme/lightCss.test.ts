import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LIGHT_SCOPE } from './lightTokens'

const lightCss = readFileSync(new URL('./light.css', import.meta.url), 'utf8')
const legacyCss = readFileSync(new URL('./legacySurfaces.css', import.meta.url), 'utf8')
const indexCss = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../components/Layout.tsx', import.meta.url), 'utf8')

const clean = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
function splitTopLevel(list: string): string[] {
  const parts: string[] = []; let depth = 0; let cur = ''
  for (const ch of list) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
  }
  parts.push(cur)
  return parts.map(s => s.trim()).filter(Boolean)
}
function selectors(css: string): string[] {
  const out: string[] = []
  for (const m of clean(css).matchAll(/([^{};]+)\{/g)) {
    const prelude = m[1].trim()
    if (prelude && !prelude.startsWith('@')) out.push(...splitTopLevel(prelude))
  }
  return out
}
function rulesWith(css: string, declaration: string): string[] {
  const out: string[] = []
  for (const m of clean(css).matchAll(/([^{};]+)\{([^{}]*)\}/g)) if (m[2].includes(declaration)) out.push(...splitTopLevel(m[1].trim()))
  return out
}

describe('light.css', () => {
  it('scopes every rule to the signed-in admin in Clean light', () => {
    const all = selectors(lightCss)
    expect(all.length).toBeGreaterThan(15)
    for (const s of all) expect(s.startsWith(LIGHT_SCOPE), s).toBe(true)
  })

  it('self-hosts Geist and Geist Mono from files that ship with the app', () => {
    for (const file of ['geist-var.woff2', 'geist-mono-var.woff2']) {
      expect(lightCss).toContain(`url('./fonts/${file}')`)
      expect(existsSync(new URL(`./fonts/${file}`, import.meta.url)), file).toBe(true)
    }
    expect(lightCss).not.toContain('googleapis')
  })

  it('owns the page colour over the palette the theme code paints on <body>', () => {
    expect(rulesWith(lightCss, 'background-color: #F4F6F8 !important').some(s => s.endsWith(' body'))).toBe(true)
  })

  it('turns native controls light', () => {
    expect(rulesWith(lightCss, 'color-scheme: light').some(s => s.includes('select'))).toBe(true)
  })

  it('draws every overlay surface opaque with a shadow', () => {
    const overlay = rulesWith(lightCss, '0 12px 32px rgb(14 26 36 / 0.14)').join(' ')
    for (const cls of ['bg-dark-bg', 'bg-dark-surface', 'bg-dark-surface2', 'bg-dark-card', 'bg-panel', 'bg-panel-dim', 'bg-well']) {
      expect(new RegExp(`\\.${cls}(?![\\w-])`).test(overlay), cls).toBe(true)
    }
  })

  it('gives every old inline surface variable a light value', () => {
    const names = [...legacyCss.matchAll(/(--legacy-[\w-]+):/g)].map(m => m[1])
    expect(names.length).toBeGreaterThan(10)
    const lightBlock = clean(lightCss)
    for (const name of names) expect(lightBlock.includes(`${name}:`), name).toBe(true)
  })

  it('draws the sidebar labels and the active item in the deep accent', () => {
    expect(rulesWith(lightCss, '--nav-label-text: var(--nav-accent-light)').some(s => s.endsWith('.hx-sidebar [data-nav-group]'))).toBe(true)
    expect(rulesWith(lightCss, '--nav-active-text: var(--nav-accent-light)').some(s => s.endsWith('.hx-sidebar [data-nav-active]'))).toBe(true)
    expect(layout).toContain("'--nav-accent-light': LIGHT_NAV_ACCENT_TEXT[accent] ?? accent")
    expect(layout).toContain('var(--nav-label-text, ')
  })

  it('wins over the global JetBrains Mono rule for mono figures', () => {
    expect(rulesWith(lightCss, "'HX Geist Mono'").some(s => s.includes('.font-mono'))).toBe(true)
    const body = [...clean(lightCss).matchAll(/([^{};]+)\{([^{}]*'HX Geist Mono'[^{}]*)\}/g)].filter(m => !m[1].includes('@font-face')).map(m => m[2])
    expect(body.length).toBeGreaterThan(0)
    for (const b of body) expect(b).toContain('!important')
  })

  it('is imported after glass.css', () => {
    expect(indexCss.indexOf("@import './theme/light.css';")).toBeGreaterThan(indexCss.indexOf("@import './theme/glass.css';"))
  })
})

describe('index.css mood rules', () => {
  it('reach neither the Glass nor the Clean light admin', () => {
    const mood = selectors(indexCss).filter(s => s.includes('[data-mood'))
    expect(mood.length).toBeGreaterThan(60)
    for (const s of mood) {
      expect(s.startsWith(':root:where(:not([data-style="glass"][data-shell="admin"], [data-style="light"][data-shell="admin"]))[data-mood'), s).toBe(true)
    }
  })
})
