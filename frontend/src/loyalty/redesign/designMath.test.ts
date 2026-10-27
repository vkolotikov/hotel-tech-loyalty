import { describe, expect, it } from 'vitest'
import { contrast } from '../../workspace/theme/accent'
import { filtersFrom, searchFor, withChange } from '../members/membersQuery'
import { steppedValue, readableTierColor } from './designMath'
import { REDESIGN_WORDS } from './words'
import english from '../i18n/redesign.en.json'

describe('Members and Program design controls', () => {
  it('steps fractions without floating-point drift and bounds deliberate steps', () => {
    expect(steppedValue('1.29', .01, 0, 10)).toBe('1.3')
    expect(steppedValue('1,25', -.01)).toBe('1.24')
    expect(steppedValue('', 50, 1, 100000)).toBe('50')
    expect(steppedValue('1', -1, 1)).toBe('1')
    expect(steppedValue('100000', 250, 1, 100000)).toBe('100000')
    expect(steppedValue('bad', 1)).toBe('1')
  })
  it('keeps tier text readable on both themes including missing and hostile colours', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const color of ['#ffd18a', '#37b6e9', '#222834', '#ffffff', 'url(example)', '', null]) {
        expect(contrast(readableTierColor(color, theme), theme === 'dark' ? '#2a2f59' : '#eef2f7')).toBeGreaterThanOrEqual(4.5)
      }
    }
    expect(readableTierColor('#ffd18a', 'dark')).toBe('#ffd18a')
  })
  it('round trips supported page sizes and resets the page when they change', () => {
    const filters = filtersFrom('?tier=2&state=all&per_page=25&page=4', [2])
    expect(filters.per_page).toBe(25)
    const changed = withChange(filters, { per_page: 10 })
    expect(changed.page).toBe(1)
    expect(filtersFrom(searchFor(changed), [2])).toEqual(changed)
    expect(filtersFrom('?per_page=100000', []).per_page).toBeUndefined()
  })
  it('registers every design fallback in the English bundle', () => {
    expect(english).toEqual(REDESIGN_WORDS)
  })
})
