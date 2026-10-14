import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** Appointments' own rules, on top of the shared Atelier stylesheet (src/workspace/theme/workspace.css). */
const css = readFileSync(new URL('./appointments.css', import.meta.url), 'utf8')

describe('appointments stylesheet', () => {
  it('holds no font, token block or focus rule of its own: those are the shared core\'s', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).not.toContain('@font-face')
    expect(rules).not.toMatch(/--a-canvas\s*:/)
    expect(rules).not.toContain(':focus-visible')
  })

  it('a narrow card drops the status word from view without removing it from the page', () => {
    const tail = css.slice(css.indexOf('@container'))
    expect(css).toContain('container-type: inline-size')
    expect(tail).toMatch(/@container \(max-width: \d+px\)\s*\{\s*\[data-appointments\] \[data-density\] \[data-status-word\]/)
    expect(tail).not.toMatch(/display:\s*none/) // hidden from sight only: the word stays in the card's name
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
})
