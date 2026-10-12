import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LOOK, loadBrand, loadLook, parseBrand, parseLook, rememberBrand, resolveTheme, saveBrand, saveLook, subscribeSystemDark, systemDark } from './look'

const g = globalThis as unknown as { window?: unknown }
afterEach(() => { delete g.window })

describe('look', () => {
  it('reads a stored look and falls back to Light + full for anything else', () => {
    expect(parseLook(null)).toEqual(DEFAULT_LOOK)
    expect(DEFAULT_LOOK).toEqual({ theme: 'light', rail: 'full' })
    expect(parseLook('{"theme":"dark","rail":"slim"}')).toEqual({ theme: 'dark', rail: 'slim' })
    expect(parseLook('{"theme":"neon","rail":"tiny"}')).toEqual(DEFAULT_LOOK)
    expect(parseLook('{"theme":"auto"}')).toEqual({ theme: 'auto', rail: 'full' })
    expect(parseLook('not json')).toEqual(DEFAULT_LOOK)
    expect(parseLook('[1,2]')).toEqual(DEFAULT_LOOK)
  })

  it('survives a storage that throws, and writes under its own key', () => {
    g.window = { localStorage: { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') } } }
    expect(loadLook()).toEqual(DEFAULT_LOOK)
    expect(() => saveLook({ theme: 'dark', rail: 'slim' })).not.toThrow()
    const store = new Map<string, string>()
    g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } } }
    saveLook({ theme: 'auto', rail: 'slim' })
    expect(store.get('appointments:look')).toBe('{"theme":"auto","rail":"slim"}')
    expect(loadLook()).toEqual({ theme: 'auto', rail: 'slim' })
  })

  it('resolves Auto from the device, and Light/Dark as chosen', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
  })

  it('follows the device while open (Auto)', () => {
    let listener: (() => void) | null = null
    let dark = false
    const mq = { get matches() { return dark }, addEventListener: (_: string, fn: () => void) => { listener = fn }, removeEventListener: vi.fn() }
    g.window = { matchMedia: () => mq }
    const onChange = vi.fn()
    const stop = subscribeSystemDark(onChange)
    expect(systemDark()).toBe(false)
    dark = true
    listener!()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(systemDark()).toBe(true)
    stop()
    expect(mq.removeEventListener).toHaveBeenCalled()
  })

  it('does nothing without a window (server render, tests)', () => {
    expect(systemDark()).toBe(false)
    expect(() => subscribeSystemDark(() => {})()).not.toThrow()
  })
})

describe('remembered brand (the last accent and mark of this device, shown until the bootstrap arrives)', () => {
  const stub = () => {
    const store = new Map<string, string>()
    const setItem = vi.fn((k: string, v: string) => { store.set(k, v) })
    g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem } }
    return { store, setItem }
  }

  it('reads a stored brand and returns nothing for anything else, without throwing', () => {
    expect(parseBrand('{"accent":"#c9a84c","initial":"L"}')).toEqual({ accent: '#c9a84c', initial: 'L' })
    expect(parseBrand('{"accent":"#C9A84C","initial":" 🌸 "}')).toEqual({ accent: '#c9a84c', initial: '🌸' })
    for (const bad of [
      null, '', 'not json', '[1,2]', '"#c9a84c"', '42', 'null', '{}',
      '{"accent":"blue","initial":"L"}', '{"accent":"#abc","initial":"L"}', '{"accent":"#c9a84c"}', '{"accent":"#c9a84c","initial":""}',
      '{"accent":"#c9a84c","initial":"   "}', '{"accent":"#c9a84c","initial":7}', '{"accent":3,"initial":"L"}',
      '{"accent":"#c9a84c","initial":"A very long organisation name"}',
    ]) expect(parseBrand(bad), String(bad)).toBeNull()
  })

  it('survives a storage that throws or is missing', () => {
    g.window = { localStorage: { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') } } }
    expect(loadBrand()).toBeNull()
    expect(() => saveBrand({ accent: '#c9a84c', initial: 'L' })).not.toThrow()
    expect(() => rememberBrand({ accent: '#c9a84c', initial: 'L' })).not.toThrow()
    delete g.window
    expect(loadBrand()).toBeNull()
    expect(() => saveBrand({ accent: '#c9a84c', initial: 'L' })).not.toThrow()
  })

  it('writes under its own key, apart from the look, and loads what it wrote', () => {
    const { store } = stub()
    expect(loadBrand()).toBeNull()
    saveBrand({ accent: '#4a9fd8', initial: 'M' })
    expect(store.get('appointments:brand')).toBe('{"accent":"#4a9fd8","initial":"M"}')
    expect(store.has('appointments:look')).toBe(false)
    expect(loadBrand()).toEqual({ accent: '#4a9fd8', initial: 'M' })
  })

  it('rewrites only when the brand changed', () => {
    const { store, setItem } = stub()
    rememberBrand({ accent: '#4a9fd8', initial: 'M' })
    expect(setItem).toHaveBeenCalledTimes(1)
    rememberBrand({ accent: '#4a9fd8', initial: 'M' })
    expect(setItem).toHaveBeenCalledTimes(1)
    rememberBrand({ accent: '#d96aa8', initial: 'M' })
    expect(setItem).toHaveBeenCalledTimes(2)
    rememberBrand({ accent: '#d96aa8', initial: 'N' })
    expect(setItem).toHaveBeenCalledTimes(3)
    expect(loadBrand()).toEqual({ accent: '#d96aa8', initial: 'N' })
    // A damaged value is replaced.
    store.set('appointments:brand', 'garbage')
    rememberBrand({ accent: '#d96aa8', initial: 'N' })
    expect(setItem).toHaveBeenCalledTimes(4)
  })
})
