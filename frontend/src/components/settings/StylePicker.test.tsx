import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { StylePicker, StylePreview } from './StylePicker'
import { canPreviewStyles } from '../../lib/stylePreview'
import { LIGHT_SURFACES, LIGHT_TEXT } from '../../theme/lightTokens'

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

  it('lets Tab reach only the checked card, as a radio group does', () => {
    const { card } = cards('classic')
    expect(card('classic').props.tabIndex).toBe(0)
    expect(card('glass').props.tabIndex).toBe(-1)
  })

  it('moves between the styles with the arrow keys, skipping Clean light and wrapping', () => {
    const press = (value: 'glass' | 'classic', key: string) => {
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
    expect(press('classic', 'ArrowRight').picked).toEqual(['glass'])
    expect(press('glass', 'ArrowLeft').picked).toEqual(['classic'])
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

  it('cannot pick Clean light yet', () => {
    const { card } = cards('glass')
    expect(card('light').props.disabled).toBe(true)
    expect(card('light').props.onClick).toBeUndefined()
  })
})

describe('StylePreview', () => {
  it('offers a device preview of Clean light to platform admins only', () => {
    const asPlatformAdmin = renderToStaticMarkup(
      <StylePreview canPreview={canPreviewStyles({ is_platform_admin: true })} previewing={false} onToggle={() => {}} />,
    )
    expect(asPlatformAdmin).toContain('Preview Clean light on this device')
    // An organisation owner (staff role super_admin) is not a platform admin: no button.
    const asOrgOwner = StylePreview({ canPreview: canPreviewStyles({ is_platform_admin: false }), previewing: false, onToggle: () => {} })
    expect(asOrgOwner).toBeNull()
    expect(StylePreview({ canPreview: canPreviewStyles({}), previewing: false, onToggle: () => {} })).toBeNull()
  })

  it('switches the preview on and off', () => {
    const onToggle = vi.fn()
    const off = StylePreview({ canPreview: true, previewing: false, onToggle }) as ReactElement<{ onClick: () => void }>
    off.props.onClick()
    const on = StylePreview({ canPreview: true, previewing: true, onToggle }) as ReactElement<{ onClick: () => void }>
    expect(renderToStaticMarkup(on)).toContain('Stop the preview')
    on.props.onClick()
    expect(onToggle.mock.calls).toEqual([[true], [false]])
  })
})
