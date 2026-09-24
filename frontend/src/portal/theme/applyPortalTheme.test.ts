import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { applyPortalTheme, clearPortalTheme, DISPLAY_FACE_STACKS } from './applyPortalTheme'

/** A tiny stand-in for an element's inline style, enough for the writer. */
function fakeRoot() {
  const vars = new Map<string, string>()
  return {
    vars,
    style: {
      setProperty: (k: string, v: string) => { vars.set(k, v) },
      removeProperty: (k: string) => { vars.delete(k) },
    },
  } as unknown as HTMLElement & { vars: Map<string, string> }
}

const THEME = {
  accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' },
  display_face: 'cormorant',
}

describe('applyPortalTheme', () => {
  it('writes the six accent values as rgb triplets and the display face stack', () => {
    const root = fakeRoot()
    applyPortalTheme(root, THEME)

    expect(root.vars.get('--p-accent-l')).toBe('176 74 110')
    expect(root.vars.get('--p-accent-l-ink')).toBe('255 255 255')
    expect(root.vars.get('--p-accent-l-deep')).toBe('142 59 88')
    expect(root.vars.get('--p-accent-d')).toBe('227 138 176')
    expect(root.vars.get('--p-accent-d-ink')).toBe('26 11 18')
    expect(root.vars.get('--p-accent-d-deep')).toBe('240 180 205')
    expect(root.vars.get('--p-font-venue')).toBe(DISPLAY_FACE_STACKS.cormorant)
  })

  it('falls back to the generic face for an unknown one and ignores a malformed hex', () => {
    const root = fakeRoot()
    applyPortalTheme(root, { accent: { ...THEME.accent, hex: 'nope' }, display_face: 'wingdings' })

    expect(root.vars.get('--p-font-venue')).toBe(DISPLAY_FACE_STACKS.manrope)
    expect(root.vars.has('--p-accent-l')).toBe(false)
    expect(root.vars.get('--p-accent-d')).toBe('227 138 176')
  })

  it('writes only variables the portal scope reads rather than re-declares', () => {
    // The writer targets <html>; the tokens live on the [data-portal] element
    // below it. A variable the stylesheet declares on that element shadows
    // the inherited one, so a written value would never reach the page.
    const css = fs.readFileSync(path.resolve(__dirname, 'portal.css'), 'utf8')
    const root = fakeRoot()
    applyPortalTheme(root, THEME)

    for (const name of root.vars.keys()) {
      expect(css, `${name} is re-declared in portal.css`).not.toMatch(new RegExp(`(^|[\\s;{])${name}\\s*:`, 'm'))
      expect(css).toContain(`var(${name},`)
    }
  })

  it('clears everything it wrote', () => {
    const root = fakeRoot()
    applyPortalTheme(root, THEME)
    clearPortalTheme(root)
    expect(root.vars.size).toBe(0)
  })
})
