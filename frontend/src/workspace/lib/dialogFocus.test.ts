import { describe, expect, it } from 'vitest'
import { trapTarget } from './dialogFocus'

const items = ['first', 'middle', 'last']

describe('trapTarget', () => {
  it('wraps Tab from the last item to the first, and Shift+Tab from the first (or the dialog itself) to the last', () => {
    expect(trapTarget(items, 'last', false, true)).toBe('first')
    expect(trapTarget(items, 'first', true, true)).toBe('last')
    expect(trapTarget(items, null, true, true)).toBe('last')
    expect(trapTarget(items, 'middle', false, true)).toBeNull()
  })

  // Generate's result replaces the focused button: the focus fell out of the dialog, and Tab must bring it back.
  it('brings the focus back in when it has left the dialog', () => {
    expect(trapTarget(items, 'body', false, false)).toBe('first')
    expect(trapTarget(items, 'body', true, false)).toBe('last')
    expect(trapTarget([], 'body', false, false)).toBeNull()
  })
})
