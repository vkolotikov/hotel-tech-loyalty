import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { StylePicker } from './StylePicker'

/** The picker's cards, found by their data-style-option. */
function cards(value: 'glass' | 'classic', onPick = vi.fn()) {
  const tree = StylePicker({ value, brand: '#3b82f6', onPick }) as ReactElement<{ children: ReactElement[] }>
  const buttons = tree.props.children
  const card = (id: string) => buttons.find(b => (b.props as Record<string, unknown>)['data-style-option'] === id) as ReactElement<Record<string, any>>
  return { card, onPick }
}

describe('StylePicker', () => {
  it('shows the three styles, Clean light labelled as coming next', () => {
    const html = renderToStaticMarkup(<StylePicker value="glass" brand="#3b82f6" onPick={() => {}} />)
    expect(html).toContain('Glass')
    expect(html).toContain('Classic')
    expect(html).toContain('Clean light')
    expect(html).toContain('Coming next')
  })

  it('marks the current style as checked', () => {
    const { card } = cards('classic')
    expect(card('classic').props['aria-checked']).toBe(true)
    expect(card('glass').props['aria-checked']).toBe(false)
  })

  it('picks Glass or Classic on click', () => {
    const { card, onPick } = cards('glass')
    card('classic').props.onClick()
    card('glass').props.onClick()
    expect(onPick.mock.calls).toEqual([['classic'], ['glass']])
  })

  it('cannot pick Clean light yet', () => {
    const { card } = cards('glass')
    expect(card('light').props.disabled).toBe(true)
    expect(card('light').props.onClick).toBeUndefined()
  })
})
