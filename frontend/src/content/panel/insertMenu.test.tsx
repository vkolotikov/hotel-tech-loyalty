import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Snippet } from '../lib/types'
import { InsertMenu } from './InsertMenu'
import { focusWasInside, listPlace, outside } from '../ui/menuFocus'

const items: Snippet[] = [{ id: 1, kind: 'hashtags', name: 'Autumn colour', body: '#autumnhair #copperhair' }]
/** A stand-in for the menu's element: it contains the nodes named. */
const menu = (...inside: string[]) => ({ contains: (node: Node | null) => inside.includes(node as unknown as string) })
const at = (name: string) => name as unknown as EventTarget

// Final review (Plan 3B): the list never closed on its own, an Escape typed in the field closed the whole panel, and a
// pick by keyboard lost the focus.
describe('InsertMenu', () => {
  it('says it opens a list', () => {
    expect(renderToStaticMarkup(<InsertMenu label="Insert" items={items} onPick={() => {}} />))
      .toMatch(/<button[^>]*aria-haspopup="true"[^>]*aria-expanded="false"/)
  })

  it('closes on a press or focus outside it, not inside', () => {
    expect(outside(menu('toggle', 'item'), at('field'))).toBe(true)
    expect(outside(menu('toggle', 'item'), null)).toBe(true)
    expect(outside(menu('toggle', 'item'), at('item'))).toBe(false)
    expect(outside(null, at('field'))).toBe(false)
  })

  it('hands the focus back to its button only when the focus was in the list (a keyboard pick), not in the field', () => {
    expect(focusWasInside(menu('toggle', 'item'), at('item') as unknown as Element)).toBe(true)
    expect(focusWasInside(menu('toggle', 'item'), at('field') as unknown as Element)).toBe(false)
    expect(focusWasInside(menu('toggle', 'item'), null)).toBe(false)
  })

  it('claims an Escape anywhere while open (the panel stays), and listens for presses outside', () => {
    // The behaviour lives in the shared menu (spec 2026-10-16 §3.5) that Insert, the "+" and the Template menu use.
    const source = fs.readFileSync(new URL('../ui/PopMenu.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/addEventListener\('keydown', [^)]*, true\)/)
    expect(source).toMatch(/addEventListener\('pointerdown', [^)]*, true\)/)
    expect(source).toContain('e.preventDefault()')
    expect(source).toContain('aria-controls={open ? listId : undefined}')
  })

  it('places its list below the button, or above it where a list below would leave the screen', () => {
    expect(listPlace('right', 'below')).toBe('right-0 top-full mt-1')
    expect(listPlace('left', 'above')).toBe('left-0 bottom-full mb-1')
  })
})
