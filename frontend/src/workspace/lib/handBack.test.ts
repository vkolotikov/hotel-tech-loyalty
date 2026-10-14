import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { handBackFocus, isHandedBack } from './handBack'

/** A stand-in element: its focus() records whether, while its focus event runs, it is known to be handed back. */
const element = () => {
  const seen: boolean[] = []
  const el = { focus: () => { seen.push(isHandedBack(el as unknown as Element)) } }
  return { el: el as unknown as HTMLElement, seen }
}

describe('handBackFocus', () => {
  it('focuses the element, which knows while its focus runs that the focus was handed back', () => {
    const { el, seen } = element()
    handBackFocus(el)
    expect(seen).toEqual([true])
    expect(isHandedBack(el)).toBe(false) // only during that focus
  })

  it('says so of that element only', () => {
    const one = element(), other = element()
    let otherKnew: boolean | null = null
    const el = { focus: () => { otherKnew = isHandedBack(other.el) } } as unknown as HTMLElement
    handBackFocus(el)
    expect(otherKnew).toBe(false)
    one.el.focus() // a focus the keyboard (or anything else) moves is not handed back
    expect(one.seen).toEqual([false])
  })

  it('does nothing without an element, and forgets the element even when its focus throws', () => {
    expect(() => handBackFocus(null)).not.toThrow()
    expect(() => handBackFocus(undefined)).not.toThrow()
    const el = { focus: () => { throw new Error('gone') } } as unknown as HTMLElement
    expect(() => handBackFocus(el)).toThrow('gone')
    expect(isHandedBack(el)).toBe(false)
  })
})

// Effects and focus events do not run in this test setup: the wiring is read from the source.
describe('who hands the focus back, and who listens', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

  it('the panel, Find, the shortcuts sheet and the drop dialog hand it back through handBackFocus', () => {
    expect(source('../../appointments/panel/AppointmentPanel.tsx')).toMatch(/handBackFocus\(back\)/)
    expect(source('../find/FindFrame.tsx')).toMatch(/handBackFocus\(focusTarget\(/)
    expect(source('../ui/ShortcutsSheet.tsx')).toMatch(/handBackFocus\(focusTarget\(/)
    expect(source('../../appointments/calendar/focusDialog.ts')).toMatch(/handBackFocus\(before\)/)
    for (const path of ['../../appointments/panel/AppointmentPanel.tsx', '../find/FindFrame.tsx', '../ui/ShortcutsSheet.tsx', '../../appointments/calendar/focusDialog.ts']) {
      expect(source(path), path).not.toMatch(/\b(back|before)\?*\.focus\(\)|focusTarget\([^)]*\)\)\?\.focus\(\)/)
    }
  })

  it('a calendar card opens no preview for a focus handed back to it', () => {
    expect(source('../../appointments/calendar/AppointmentCard.tsx')).toMatch(/if \(isKeyboardFocus\(e\) && !isHandedBack\(e\.currentTarget\)\) onPreviewStart\?\.\(item\.id, 'focus'\)/)
  })
})
