import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_LOOK, loadLook, loadPaint, parsePaint, rememberPaint, saveLook, savePaint, type LookKeys } from './look'

const g = globalThis as unknown as { window?: unknown }
afterEach(() => { delete g.window })

function memory() {
  const store = new Map<string, string>()
  const writes: string[] = []
  g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { writes.push(k); store.set(k, v) } } }
  return { store, writes }
}

const A: LookKeys = { look: 'appointments:look', paint: 'appointments:brand' }
const C: LookKeys = { look: 'content:look', paint: 'content:brand-paint' }

describe('a workspace look under its own keys', () => {
  it('keeps each workspace\'s look apart', () => {
    const { store } = memory()
    saveLook(A, { theme: 'dark', rail: 'slim' })
    saveLook(C, { theme: 'light', rail: 'full' })
    expect(store.get('appointments:look')).toBe('{"theme":"dark","rail":"slim"}')
    expect(store.get('content:look')).toBe('{"theme":"light","rail":"full"}')
    expect(loadLook(A)).toEqual({ theme: 'dark', rail: 'slim' })
    expect(loadLook(C)).toEqual({ theme: 'light', rail: 'full' })
    expect(loadLook({ look: 'nobody:look', paint: 'nobody:paint' })).toEqual(DEFAULT_LOOK)
  })

  it('keeps each workspace\'s paint apart, and writes it only when it changed', () => {
    const { store, writes } = memory()
    savePaint(A, { accent: '#c9a84c', initial: 'L' })
    expect(loadPaint(A)).toEqual({ accent: '#c9a84c', initial: 'L' })
    expect(loadPaint(C)).toBeNull()
    rememberPaint(A, { accent: '#c9a84c', initial: 'L' })
    expect(writes.filter(k => k === 'appointments:brand')).toHaveLength(1)
    rememberPaint(C, { accent: '#3b82f6', initial: 'F' })
    expect(store.get('content:brand-paint')).toBe('{"accent":"#3b82f6","initial":"F"}')
  })

  it('reads a damaged paint as no memory, and a capital hex as the same colour', () => {
    expect(parsePaint('{"accent":"blue","initial":"L"}')).toBeNull()
    expect(parsePaint('{"accent":"#ABCDEF","initial":"L"}')).toEqual({ accent: '#abcdef', initial: 'L' })
  })
})
