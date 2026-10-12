import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { markShell } from './shellMark'

/** A stand-in for <html>: only the three attribute calls markShell makes. */
function fakeRoot(initial?: string) {
  const attrs = new Map<string, string>()
  if (initial !== undefined) attrs.set('data-shell', initial)
  const el = {
    getAttribute: (name: string) => attrs.get(name) ?? null,
    setAttribute: (name: string, value: string) => { attrs.set(name, value) },
    removeAttribute: (name: string) => { attrs.delete(name) },
  } as unknown as HTMLElement
  return { attrs, el }
}

describe('markShell', () => {
  it('marks the root as the workspace while mounted and removes the mark after', () => {
    const { attrs, el } = fakeRoot()
    const cleanup = markShell(el)
    expect(attrs.get('data-shell')).toBe('appointments')
    cleanup()
    expect(attrs.has('data-shell')).toBe(false)
  })

  it('puts back the mark that was there before', () => {
    const { attrs, el } = fakeRoot('admin')
    const cleanup = markShell(el)
    expect(attrs.get('data-shell')).toBe('appointments')
    cleanup()
    expect(attrs.get('data-shell')).toBe('admin')
  })

  it('is set by the shell before the first paint and undone when it unmounts (as the full admin Layout does)', () => {
    // A static render runs no effects, so the wiring is read from the source.
    const shell = readFileSync(new URL('../AppointmentsShell.tsx', import.meta.url), 'utf8')
    expect(shell).toContain('useLayoutEffect(() => markShell(document.documentElement), [])')
    // Above the early return, so the hook order never changes.
    expect(shell.indexOf('markShell(document.documentElement)')).toBeLessThan(shell.indexOf('return <Navigate'))
  })
})

describe('index.css mood rules', () => {
  // The full admin's Branding "mood" typography ((0,3,0) on .text-lg … .text-7xl)
  // would override the workspace's own faces, weights and italics. Every mood
  // selector leaves out <html data-shell="appointments">.
  const OLD = ':root:where(:not([data-style="glass"][data-shell="admin"], [data-style="light"][data-shell="admin"]))'
  const NEW = ':root:where(:not([data-style="glass"][data-shell="admin"], [data-style="light"][data-shell="admin"], [data-shell="appointments"]))'
  const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const count = (needle: string) => css.split(needle).length - 1

  it('leave out the workspace, every one of them (70 before the change, 70 after)', () => {
    expect(count('[data-mood')).toBe(70)
    expect(count(OLD)).toBe(0)
    expect(count(NEW + '[data-mood')).toBe(70)
  })
})
