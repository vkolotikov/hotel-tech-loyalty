import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { StylePicker } from './StylePicker'
import { LIGHT_SURFACES, LIGHT_TEXT } from '../../theme/lightTokens'

/** The picker's cards, found by their data-style-option. */
function cards(value: 'glass' | 'classic' | 'light', onPick = vi.fn()) {
  const tree = StylePicker({ value, brand: '#3b82f6', onPick }) as ReactElement<{ children: ReactElement[] }>
  const buttons = tree.props.children
  const card = (id: string) => buttons.find(b => (b.props as Record<string, unknown>)['data-style-option'] === id) as ReactElement<Record<string, any>>
  return { card, onPick }
}

describe('StylePicker', () => {
  it('shows the three styles', () => {
    const html = renderToStaticMarkup(<StylePicker value="glass" brand="#3b82f6" onPick={() => {}} />)
    expect(html).toContain('Glass')
    expect(html).toContain('Classic')
    expect(html).toContain('Clean light')
    expect(html).not.toContain('Coming next')
    expect(html).not.toMatch(/\sdisabled(=|\s|>)/)
  })

  it('marks the current style as checked', () => {
    const { card } = cards('classic')
    expect(card('classic').props['aria-checked']).toBe(true)
    expect(card('glass').props['aria-checked']).toBe(false)
  })

  it('picks any style on click', () => {
    const { card, onPick } = cards('glass')
    card('classic').props.onClick()
    card('glass').props.onClick()
    card('light').props.onClick()
    expect(onPick.mock.calls).toEqual([['classic'], ['glass'], ['light']])
  })

  it('lets Tab reach only the checked card, as a radio group does', () => {
    const { card } = cards('classic')
    expect(card('classic').props.tabIndex).toBe(0)
    expect(card('glass').props.tabIndex).toBe(-1)
  })

  it('moves between all three styles with the arrow keys and wraps', () => {
    const press = (value: 'glass' | 'classic' | 'light', key: string) => {
      const onPick = vi.fn()
      const focused: string[] = []
      let prevented = false
      const tree = StylePicker({ value, brand: '#3b82f6', onPick }) as ReactElement<{ onKeyDown: (event: object) => void }>
      tree.props.onKeyDown({
        key,
        preventDefault: () => { prevented = true },
        // The card found by this selector records it when it takes focus.
        currentTarget: { querySelector: (selector: string) => ({ focus: () => focused.push(selector) }) },
      })
      return { picked: onPick.mock.calls.map(c => c[0]), focused, prevented }
    }
    expect(press('glass', 'ArrowRight')).toEqual({ picked: ['classic'], focused: ['[data-style-option="classic"]'], prevented: true })
    expect(press('glass', 'ArrowDown').picked).toEqual(['classic'])
    expect(press('classic', 'ArrowRight').picked).toEqual(['light'])
    expect(press('light', 'ArrowRight').picked).toEqual(['glass'])
    expect(press('glass', 'ArrowLeft').picked).toEqual(['light'])
    expect(press('light', 'ArrowLeft').picked).toEqual(['classic'])
    expect(press('classic', 'ArrowUp').picked).toEqual(['glass'])
    expect(press('glass', 'Enter')).toEqual({ picked: [], focused: [], prevented: false })
  })

  it("draws the Clean light sample in the style's real tokens", () => {
    const { card } = cards('glass')
    const html = renderToStaticMarkup(card('light'))
    for (const colour of [LIGHT_SURFACES['dark-bg'], LIGHT_SURFACES['dark-surface'], LIGHT_SURFACES['dark-border'], LIGHT_TEXT.primary, LIGHT_TEXT.secondary]) {
      expect(html, colour).toContain(colour)
    }
  })

  it('picks Clean light like the others', () => {
    const { card, onPick } = cards('glass')
    expect(card('light').props.disabled).toBeFalsy()
    card('light').props.onClick()
    expect(onPick).toHaveBeenCalledWith('light')
  })

  it('lets Tab reach Clean light when it is the checked card', () => {
    const { card } = cards('light')
    expect(card('light').props.tabIndex).toBe(0)
    expect(card('light').props['aria-checked']).toBe(true)
    expect(card('glass').props.tabIndex).toBe(-1)
  })
})
