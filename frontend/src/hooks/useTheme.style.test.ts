import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyStyleOnly, applyThemeToDom, paintCachedTheme, paletteWithDefaults, persistThemeSnapshot,
  placeholderFromSnapshot, readCachedTheme, readThemeStyle, themeUpdateFor, type ThemeTarget,
} from './useTheme'

/** A stand-in for <html> and <body> that records what the theme code writes. */
function fakeTarget(initialStyle?: string) {
  const vars = new Map<string, string>()
  const attrs = new Map<string, string>(initialStyle ? [['data-style', initialStyle]] : [])
  const body = { style: { backgroundColor: '', color: '' } }
  const target: ThemeTarget = {
    root: {
      style: { setProperty: (name, value) => { vars.set(name, value) } },
      setAttribute: (name, value) => { attrs.set(name, value) },
      removeAttribute: name => { attrs.delete(name) },
      getAttribute: name => attrs.get(name) ?? null,
    },
    body,
  }
  return { target, vars, attrs, body }
}

/** localStorage for the node test environment. */
function fakeStorage() {
  const items = new Map<string, string>()
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => { items.set(k, v) },
    removeItem: (k: string) => { items.delete(k) },
    clear: () => items.clear(),
  }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = fakeStorage()
})
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage
})

describe('readThemeStyle', () => {
  it('is Classic only when Classic was chosen; anything else is Glass', () => {
    expect(readThemeStyle('classic')).toBe('classic')
    expect(readThemeStyle('glass')).toBe('glass')
    expect(readThemeStyle(undefined)).toBe('glass')
    expect(readThemeStyle('')).toBe('glass')
    expect(readThemeStyle('neon')).toBe('glass')
  })
})

describe('applyThemeToDom', () => {
  it('sets data-style to the style it is given', () => {
    const { target, attrs } = fakeTarget()
    applyThemeToDom({}, undefined, 'classic', target)
    expect(attrs.get('data-style')).toBe('classic')
  })

  it('keeps the current style when none is given, and starts on Glass', () => {
    const classic = fakeTarget('classic')
    applyThemeToDom({}, undefined, undefined, classic.target)
    expect(classic.attrs.get('data-style')).toBe('classic')

    const fresh = fakeTarget()
    applyThemeToDom({}, undefined, undefined, fresh.target)
    expect(fresh.attrs.get('data-style')).toBe('glass')
  })

  it('writes the palette the same way in both styles', () => {
    const glass = fakeTarget()
    const classic = fakeTarget()
    applyThemeToDom({ surface_color: '#1e293b' }, null, 'glass', glass.target)
    applyThemeToDom({ surface_color: '#1e293b' }, null, 'classic', classic.target)
    expect(glass.vars.get('--color-dark-surface')).toBe('30 41 59')
    expect(glass.vars).toEqual(classic.vars)
  })

  it('writes the Glass extras: lifted brand text, glows and text on brand fills', () => {
    const { target, vars } = fakeTarget()
    applyThemeToDom({ primary_color: '#3b82f6' }, null, 'glass', target)
    expect(vars.get('--color-primary-500')).toBe('59 130 246')
    expect(vars.get('--glass-primary-500')).toBe('147 186 250')
    expect(vars.get('--glass-glow-1')).toBe('59 130 246')
    expect(vars.get('--color-on-primary')).toBe('3 5 10')
  })

  it('defaults to Royal blue, and treats a blank or broken colour as missing', () => {
    expect(paletteWithDefaults({}).primary_color).toBe('#3b82f6')
    expect(paletteWithDefaults({ primary_color: '' }).primary_color).toBe('#3b82f6')
    expect(paletteWithDefaults({ surface_color: 'teal' }).surface_color).toBe('#161616')
    const { target, vars } = fakeTarget()
    applyThemeToDom({ primary_color: '' }, null, 'glass', target)
    expect(vars.get('--color-primary-500')).toBe('59 130 246')
  })

  it('still sets and clears the mood', () => {
    const { target, attrs } = fakeTarget()
    applyThemeToDom({}, 'luxury', 'classic', target)
    expect(attrs.get('data-mood')).toBe('luxury')
    applyThemeToDom({}, null, 'classic', target)
    expect(attrs.has('data-mood')).toBe(false)
  })
})

describe('the cached snapshot', () => {
  it('stores and restores the style', () => {
    persistThemeSnapshot({ primary_color: '#10b981' }, 'Emerald', 'wellness', 'classic')
    expect(readCachedTheme()?.style).toBe('classic')
    expect(placeholderFromSnapshot(readCachedTheme())).toMatchObject({
      primary_color: '#10b981', theme_mood: 'wellness', theme_style: 'classic',
    })
  })

  it('keeps the cached style when a preset change saves without one', () => {
    persistThemeSnapshot({ primary_color: '#10b981' }, 'Emerald', 'wellness', 'classic')
    persistThemeSnapshot({ primary_color: '#e11d48' }, 'Rose Boutique', 'boutique')
    expect(readCachedTheme()?.style).toBe('classic')
  })

  it('reads a snapshot from before the release as Glass', () => {
    localStorage.setItem('loyalty-admin-theme-v1', JSON.stringify({ colors: { primary_color: '#c9a84c' }, savedAt: 1 }))
    const { target, attrs, vars } = fakeTarget()
    paintCachedTheme(readCachedTheme(), target)
    expect(attrs.get('data-style')).toBe('glass')
    expect(vars.get('--color-primary-500')).toBe('201 168 76')
  })

  it('with no snapshot paints only the default style', () => {
    const { target, attrs, vars } = fakeTarget()
    paintCachedTheme(null, target)
    expect(attrs.get('data-style')).toBe('glass')
    expect(vars.size).toBe(0)
  })

  it('switches only the style for an answer that carries no palette', () => {
    persistThemeSnapshot({ primary_color: '#10b981' }, 'Emerald', null, 'glass')
    const { target, attrs, vars } = fakeTarget('glass')
    applyStyleOnly('classic', target)
    expect(attrs.get('data-style')).toBe('classic')
    expect(vars.size).toBe(0)
    expect(readCachedTheme()).toMatchObject({ style: 'classic', colors: { primary_color: '#10b981' } })
  })
})

describe('themeUpdateFor', () => {
  const palette = { primary_color: '#3b82f6', background_color: '#0d0d0d' }

  it('applies a palette in full, a missing style meaning Glass', () => {
    expect(themeUpdateFor(palette)).toEqual({ kind: 'full', mood: null, style: 'glass' })
    expect(themeUpdateFor({ ...palette, theme_style: 'classic', theme_mood: 'luxury' }))
      .toEqual({ kind: 'full', mood: 'luxury', style: 'classic' })
  })

  it('switches only the style when the answer has a style and no palette', () => {
    expect(themeUpdateFor({ theme_style: 'classic' })).toEqual({ kind: 'style', style: 'classic' })
  })

  it('ignores an empty or broken answer, so the cached paint stays', () => {
    expect(themeUpdateFor({})).toBeNull()
    expect(themeUpdateFor(undefined)).toBeNull()
    expect(themeUpdateFor({ primary_color: '', background_color: '' })).toBeNull()
  })
})
