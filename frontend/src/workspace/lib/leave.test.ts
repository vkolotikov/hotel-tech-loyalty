import { describe, expect, it, vi } from 'vitest'
import { leave } from './leave'

// "Full admin" and Sign out leave the workspace without a page unload the browser could ask about
// (Sign out even revokes the session first), so the workspace asks before they go.
describe('leave', () => {
  it('stays when the workspace says no, and stops the link', () => {
    const go = vi.fn()
    const e = { preventDefault: vi.fn() }
    leave(() => false, go, e)
    expect(go).not.toHaveBeenCalled()
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('goes when the workspace says yes, or asks nothing', () => {
    const go = vi.fn()
    const e = { preventDefault: vi.fn() }
    leave(() => true, go, e)
    leave(undefined, go)
    expect(go).toHaveBeenCalledTimes(2)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })
})
