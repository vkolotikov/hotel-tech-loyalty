import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { HX_COLOR_SCHEME, LIGHT_CHART, dataInkFor, hx, hxWhite, lightChartChrome, lightNow, subscribeLight } from './hx'
import { contrast, hexToRgb } from './colour'
import { LIGHT_SURFACES } from './lightTokens'

describe('inline colour helpers', () => {
  it('hx keeps the exact old colour as the fallback', () => {
    expect(hx('f', '#2c2c2c')).toBe('rgb(var(--hx-f-2c2c2c, 44 44 44) / 1)')
    expect(hx('t', '888', 0.5)).toBe('rgb(var(--hx-t-888888, 136 136 136) / 0.5)')
  })

  it('hxWhite is white unless Clean light sets the ink', () => {
    expect(hxWhite(0.06)).toBe('rgb(var(--hx-white, 255 255 255) / 0.06)')
  })

  it('keeps native controls dark outside Clean light', () => {
    expect(HX_COLOR_SCHEME).toBe('var(--hx-color-scheme, dark)')
  })

  it('has light chart colours', () => {
    expect(LIGHT_CHART.grid).toBe('#E5EAEF')
    expect(LIGHT_CHART.tooltipBg).toBe('#FFFFFF')
  })

  it('dataInkFor reads 4.5:1 on every light surface, and leaves non-hex values alone', () => {
    for (const c of ['#74c895', '#fbbf24', '#22d3ee', '#a78bfa']) {
      const [r, g, b] = dataInkFor(c).match(/[0-9a-f]{2}/gi)!.map(x => parseInt(x, 16))
      for (const s of ['dark-surface', 'dark-bg', 'dark-surface2', 'dark-hover'] as const) {
        expect(contrast([r, g, b], hexToRgb(LIGHT_SURFACES[s])), `${c} on ${s}`).toBeGreaterThanOrEqual(4.5)
      }
    }
    expect(dataInkFor('var(--x)')).toBe('var(--x)')
  })

  it('dataInkFor gives the same answer from its memo, whatever the spelling', () => {
    const first = dataInkFor('#FBBF24')
    expect(dataInkFor('#fbbf24')).toBe(first)
    expect(dataInkFor(' #fbbf24 ')).toBe(first)
    expect(dataInkFor('#fb2')).toBe(dataInkFor('#ffbb22'))
  })
})

describe('lightChartChrome: chart text on paper', () => {
  type El = { type: unknown; props: Record<string, unknown> & { children?: unknown } }

  it('changes nothing outside Clean light', () => {
    const dark = lightChartChrome(false)
    expect(dark.tooltipStyle).toBeUndefined()
    expect(dark.itemStyle).toBeUndefined()
    expect(dark.legendFormatter).toBeUndefined()
    expect(dark.pieLabelProps).toBeUndefined()
    const label = (p: { name: string }) => p.name
    expect(dark.pieLabel(label)).toBe(label)
  })

  it('draws the tooltip box, its items, legend words and pie labels in the ink in Clean light', () => {
    const lc = lightChartChrome(true)
    expect(lc.tooltipStyle).toEqual({ backgroundColor: '#FFFFFF', border: '1px solid #DDE3E8', color: '#1B2A34' })
    expect(lc.itemStyle).toEqual({ color: '#1B2A34' })
    expect(lc.pieLabelProps).toEqual({ fill: '#1B2A34' })
    expect(contrast(hexToRgb(LIGHT_CHART.tooltipText), hexToRgb(LIGHT_CHART.tooltipBg))).toBeGreaterThanOrEqual(4.5)
    for (const s of ['dark-surface', 'dark-bg', 'dark-surface2', 'dark-hover'] as const) {
      expect(contrast(hexToRgb(LIGHT_CHART.tooltipText), hexToRgb(LIGHT_SURFACES[s])), s).toBeGreaterThanOrEqual(4.5)
    }

    const legend = lc.legendFormatter!('Leads') as unknown as El
    expect(legend.type).toBe('span')
    expect(legend.props.style).toEqual({ color: '#1B2A34' })
    expect(legend.props.children).toBe('Leads')
  })

  it('wraps a pie label function: recharts places it, the ink fills it', () => {
    const lc = lightChartChrome(true)
    const render = lc.pieLabel((p: { name: string; x: number; y: number; textAnchor: string; fill: string }) => p.name)
    const el = render({ name: 'Email', x: 120, y: 40, textAnchor: 'start', fill: '#22c55e' }) as unknown as El
    expect(el.type).toBe('text')
    expect(el.props).toMatchObject({ x: 120, y: 40, textAnchor: 'start', fill: '#1B2A34', alignmentBaseline: 'middle', className: 'recharts-pie-label-text' })
    expect(el.props.children).toBe('Email')
  })

  it('keeps a pie label that renders its own element', () => {
    const own = createElement('text', { fill: 'red' }, 'x')
    expect(lightChartChrome(true).pieLabel(() => own)({})).toBe(own)
  })

  it('returns the same objects on every call', () => {
    expect(lightChartChrome(true)).toBe(lightChartChrome(true))
    expect(lightChartChrome(false)).toBe(lightChartChrome(false))
  })
})

describe('the shared Clean light store behind useIsLight', () => {
  /** <html> with attributes, and a MutationObserver stand-in that records observers and fires on demand. */
  function fakePage() {
    const attrs = new Map<string, string>()
    const observers: { callback: () => void; connected: boolean }[] = []
    class FakeObserver {
      entry: { callback: () => void; connected: boolean }
      constructor(callback: () => void) {
        this.entry = { callback, connected: false }
        observers.push(this.entry)
      }
      observe() { this.entry.connected = true }
      disconnect() { this.entry.connected = false }
    }
    const g = globalThis as Record<string, unknown>
    g.document = { documentElement: { getAttribute: (n: string) => attrs.get(n) ?? null } }
    g.MutationObserver = FakeObserver
    const set = (name: string, value: string) => {
      attrs.set(name, value)
      for (const o of observers) if (o.connected) o.callback()
    }
    return { attrs, observers, set }
  }
  afterEach(() => {
    const g = globalThis as Record<string, unknown>
    delete g.document
    delete g.MutationObserver
  })

  it('reads the DOM at the moment it is asked (a flag set before subscribing is seen)', () => {
    const page = fakePage()
    expect(lightNow()).toBe(false)
    // Layout sets data-shell in a layout effect before any child subscribes:
    // the snapshot useSyncExternalStore takes at subscribe time is already true.
    page.attrs.set('data-style', 'light')
    page.attrs.set('data-shell', 'admin')
    expect(lightNow()).toBe(true)
    page.attrs.set('data-shell', 'portal')
    expect(lightNow()).toBe(false)
  })

  it('shares one MutationObserver between every subscriber and drops it with the last', () => {
    const page = fakePage()
    const calls: string[] = []
    const offA = subscribeLight(() => calls.push('a'))
    const offB = subscribeLight(() => calls.push('b'))
    const offC = subscribeLight(() => calls.push('c'))
    expect(page.observers.length).toBe(1)
    expect(page.observers[0].connected).toBe(true)

    page.set('data-style', 'light')
    expect(calls).toEqual(['a', 'b', 'c'])

    offA()
    offB()
    expect(page.observers[0].connected).toBe(true)
    offC()
    expect(page.observers[0].connected).toBe(false)

    const offD = subscribeLight(() => {})
    expect(page.observers.length).toBe(2)
    expect(page.observers[1].connected).toBe(true)
    offD()
  })
})
