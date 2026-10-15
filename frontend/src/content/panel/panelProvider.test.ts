import { describe, expect, it, vi } from 'vitest'
import { mayDrop } from './PanelProvider'

describe('mayDrop', () => {
  it('lets anything go ahead without unsaved edits, and with edits only when the person says so', () => {
    const ask = vi.fn(() => false)
    expect(mayDrop(false, ask)).toBe(true)
    expect(ask).not.toHaveBeenCalled()
    expect(mayDrop(true, ask)).toBe(false)
    expect(mayDrop(true, () => true)).toBe(true)
  })
})
