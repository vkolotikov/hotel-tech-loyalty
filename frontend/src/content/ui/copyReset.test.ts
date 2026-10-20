import { afterEach, describe, expect, it, vi } from 'vitest'
import { COPIED_FOR_MS, resetAfterCopied } from './copyReset'

// 5B-2 review: "Copied" stayed for as long as the button was shown, so a second copy said nothing new.
describe('Copied goes back to the button’s words', () => {
  afterEach(() => { vi.useRealTimers() })
  it('two seconds after a copy, and never after a refusal (its words stay until the next try)', () => {
    vi.useFakeTimers()
    const idle = vi.fn()
    const stop = resetAfterCopied('copied', idle)
    vi.advanceTimersByTime(COPIED_FOR_MS - 1)
    expect(idle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(idle).toHaveBeenCalledTimes(1)
    expect(COPIED_FOR_MS).toBe(2000)
    expect(resetAfterCopied('failed', idle)).toBeUndefined()
    expect(resetAfterCopied('idle', idle)).toBeUndefined()
    stop?.()
  })
  it('stops waiting when the button goes away first', () => {
    vi.useFakeTimers()
    const idle = vi.fn()
    resetAfterCopied('copied', idle)?.()
    vi.advanceTimersByTime(COPIED_FOR_MS)
    expect(idle).not.toHaveBeenCalled()
  })
})
