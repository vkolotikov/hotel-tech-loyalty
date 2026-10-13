import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PREVIEW_DELAY_MS, PREVIEW_GRACE_MS, createPreviewTimer, gridKey, ontoOwnCard, previewEscape, previewStillShown, watchPreviewEscape } from './previewTimer'

describe('ontoOwnCard', () => {
  /** An element as the pointer event names it: `closest` finds the grid stop it is in, if any. */
  const inside = (stop: string | null) => ({ closest: (q: string) => (q === '[data-stop]' && stop !== null ? { getAttribute: (n: string) => (n === 'data-stop' ? stop : null) } : null) })

  it('is true only when the pointer left the preview for its own card (or something inside it)', () => {
    expect(ontoOwnCard(inside('appt:7'), 7)).toBe(true)
    expect(ontoOwnCard(inside('appt:8'), 7)).toBe(false) // another card
    expect(ontoOwnCard(inside('slot:1:600'), 7)).toBe(false) // a free slot
    expect(ontoOwnCard(inside(null), 7)).toBe(false) // the grid's background, the page
  })

  it('is false for no element at all (the pointer left the window) or a target that is not an element', () => {
    expect(ontoOwnCard(null, 7)).toBe(false)
    expect(ontoOwnCard(undefined, 7)).toBe(false)
    expect(ontoOwnCard({}, 7)).toBe(false)
  })
})

describe('previewStillShown', () => {
  const day = gridKey([{ key: 'm1', date: '2026-10-13' }, { key: 'm2', date: '2026-10-13' }])

  it('keeps a preview while the grid still draws its card in the columns it opened in', () => {
    expect(previewStillShown({ id: 7, grid: day }, new Set([7, 8]), day)).toBe(true)
  })

  it('closes it once its card is no longer drawn: another day (T, ← →), or a refresh that no longer has it', () => {
    expect(previewStillShown({ id: 7, grid: day }, new Set([8]), day)).toBe(false)
    expect(previewStillShown({ id: 7, grid: day }, new Set(), day)).toBe(false)
  })

  it('closes it when the columns are not the ones it opened in (W / D, a person hidden), even with its card still drawn', () => {
    const week = gridKey([{ key: '1-2026-10-12', date: '2026-10-12' }, { key: '1-2026-10-13', date: '2026-10-13' }])
    expect(previewStillShown({ id: 7, grid: day }, new Set([7]), week)).toBe(false)
    expect(previewStillShown({ id: 7, grid: day }, new Set([7]), gridKey([{ key: 'm1', date: '2026-10-13' }]))).toBe(false)
  })
})

describe('gridKey', () => {
  it('names each column and its date: a day view\'s columns keep their keys from day to day, so the date tells them apart', () => {
    expect(gridKey([{ key: 'm1', date: '2026-10-13' }])).not.toBe(gridKey([{ key: 'm1', date: '2026-10-14' }]))
    expect(gridKey([{ key: 'm1', date: '2026-10-13' }, { key: 'm2', date: '2026-10-13' }]))
      .toBe(gridKey([{ key: 'm1', date: '2026-10-13' }, { key: 'm2', date: '2026-10-13' }]))
    expect(gridKey([])).toBe('')
  })
})

// Effects and state do not run in a static render: the grid's wiring is read from its source.
describe('TimeGrid: a preview never outlives its card', () => {
  const source = readFileSync(new URL('./TimeGrid.tsx', import.meta.url), 'utf8')

  it('closes the preview while rendering once its card or columns are gone, through the timer, so a pending rest is dropped too', () => {
    expect(source).toMatch(/if \(preview !== null && \(dragging \|\| !previewStillShown\(preview, drawn, grid\)\)\) previewTimer\.end\(\)/)
    // The rest remembers the grid it began on: a timer that fires after the card has gone opens a preview the check above closes in the same render.
    expect(source).toMatch(/previewTimer\.start\(\{ id, grid[,} ]/)
    expect(source).toMatch(/const grid = gridKey\(columns\)/)
    expect(source).toMatch(/const drawn = new Set\(cols\.flatMap\(c => c\.placed\.map\(p => p\.item\.id\)\)\)/)
    // The check runs before the grid's early return for an empty team, so a team emptied by a refresh closes it as well.
    expect(source.indexOf('previewStillShown(preview')).toBeLessThan(source.indexOf('if (columns.length === 0)'))
  })

  it('makes the preview a hover card: leaving a card starts the grace, the preview holds itself open, closes when left (unless for its own card) and opens its appointment on a click', () => {
    expect(source).toMatch(/onPreviewLeave=\{previewTimer\.leave\}/)
    expect(source).toMatch(/onHold=\{previewTimer\.hold\}/)
    expect(source).toMatch(/onLeave=\{\(to\) => \{ if \(!ontoOwnCard\(to, p\.item\.id\)\) previewTimer\.end\(\) \}\}/)
    // A click on the preview does what a click on the card does: the preview closes and the panel opens (unless it ends a drag).
    expect(source).toMatch(/const open = \(id: number\) => \{ previewTimer\.end\(\); if \(!consumeClick\(\)\) onOpen\(id\) \}/)
    expect(source).toMatch(/onOpen=\{\(\) => open\(p\.item\.id\)\}/)
  })
})

describe('previewEscape', () => {
  const key = (k: string, defaultPrevented = false) => ({ key: k, defaultPrevented, preventDefault: vi.fn() })

  it('closes the preview on Escape and claims the key, so an open panel stays', () => {
    const close = vi.fn()
    const e = key('Escape')
    previewEscape(e, close)
    expect(close).toHaveBeenCalledTimes(1)
    expect(e.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('does nothing for any other key', () => {
    const close = vi.fn()
    for (const k of ['Enter', 'ArrowDown', 'Tab', ' ', 'a', 'Esc']) {
      const e = key(k)
      previewEscape(e, close)
      expect(e.preventDefault, k).not.toHaveBeenCalled()
    }
    expect(close).not.toHaveBeenCalled()
  })
})

describe('watchPreviewEscape', () => {
  /** A window that only remembers its listeners. */
  const fakeWindow = () => {
    const listeners: { type: string; fn: (e: KeyboardEvent) => void; capture: boolean }[] = []
    return {
      listeners,
      addEventListener: (type: 'keydown', fn: (e: KeyboardEvent) => void, capture: boolean) => { listeners.push({ type, fn, capture }) },
      removeEventListener: (type: 'keydown', fn: (e: KeyboardEvent) => void, capture: boolean) => {
        const at = listeners.findIndex(l => l.type === type && l.fn === fn && l.capture === capture)
        if (at >= 0) listeners.splice(at, 1)
      },
    }
  }

  it('listens for keydown in the capture phase, ahead of the panel, whoever has the focus', () => {
    const w = fakeWindow()
    const close = vi.fn()
    watchPreviewEscape(w, close)
    expect(w.listeners).toHaveLength(1)
    expect(w.listeners[0].type).toBe('keydown')
    expect(w.listeners[0].capture).toBe(true)
    const e = { key: 'Escape', defaultPrevented: false, preventDefault: vi.fn() }
    w.listeners[0].fn(e as unknown as KeyboardEvent)
    expect(close).toHaveBeenCalledTimes(1)
    expect(e.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('stops listening when it is undone (the preview closed), so Escape then reaches the panel as before', () => {
    const w = fakeWindow()
    const undo = watchPreviewEscape(w, vi.fn())
    undo()
    expect(w.listeners).toHaveLength(0)
  })
})

describe('createPreviewTimer', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const card = (id: number) => ({ id, grid: 'g' })

  it('rests for 300 ms before the preview opens, not a moment sooner', () => {
    expect(PREVIEW_DELAY_MS).toBe(300)
    const show = vi.fn()
    createPreviewTimer(show).start(card(7))
    vi.advanceTimersByTime(PREVIEW_DELAY_MS - 1)
    expect(show).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(show.mock.calls).toEqual([[card(7)]])
  })

  it('opens the preview for what the rest began on, grid and all, so a rest that ends after the grid changed is caught', () => {
    const show = vi.fn()
    createPreviewTimer(show).start({ id: 7, grid: 'tuesday' })
    vi.advanceTimersByTime(PREVIEW_DELAY_MS)
    const opened = show.mock.calls[0][0]
    expect(opened).toEqual({ id: 7, grid: 'tuesday' })
    expect(previewStillShown(opened, new Set([7]), 'wednesday')).toBe(false)
  })

  it('moving to another card starts the rest again, and only the last card opens', () => {
    const show = vi.fn()
    const timer = createPreviewTimer(show)
    timer.start(card(7))
    vi.advanceTimersByTime(200)
    timer.start(card(8))
    vi.advanceTimersByTime(200)
    expect(show).not.toHaveBeenCalled() // 7's rest was cancelled, 8 has rested 200 ms
    vi.advanceTimersByTime(100)
    expect(show.mock.calls).toEqual([[card(8)]])
  })

  it('leaving before the rest is over opens nothing; leaving after it closes the preview', () => {
    const show = vi.fn()
    const timer = createPreviewTimer(show)
    timer.start(card(7))
    vi.advanceTimersByTime(250)
    timer.end()
    vi.advanceTimersByTime(1000)
    expect(show.mock.calls).toEqual([[null]]) // only the close, never the open

    show.mockClear()
    timer.start(card(7))
    vi.advanceTimersByTime(PREVIEW_DELAY_MS)
    timer.end()
    expect(show.mock.calls).toEqual([[card(7)], [null]])
  })

  // WCAG 1.4.13 (hoverable): the pointer may move from a card onto its preview without the preview closing.
  describe('the grace after the pointer leaves a card', () => {
    const opened = (timer: ReturnType<typeof createPreviewTimer<{ id: number; grid: string }>>, show: ReturnType<typeof vi.fn>, id = 7) => {
      timer.start(card(id))
      vi.advanceTimersByTime(PREVIEW_DELAY_MS)
      show.mockClear()
    }

    it('is 150 ms: an open preview closes that long after the pointer leaves its card, not sooner', () => {
      expect(PREVIEW_GRACE_MS).toBe(150)
      const show = vi.fn()
      const timer = createPreviewTimer(show)
      opened(timer, show)
      timer.leave()
      vi.advanceTimersByTime(PREVIEW_GRACE_MS - 1)
      expect(show).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(show.mock.calls).toEqual([[null]])
    })

    it('reaching the preview within the grace keeps it open for as long as the pointer stays; leaving it then closes it at once', () => {
      const show = vi.fn()
      const timer = createPreviewTimer(show)
      opened(timer, show)
      timer.leave()
      vi.advanceTimersByTime(100)
      timer.hold()
      vi.advanceTimersByTime(5000)
      expect(show).not.toHaveBeenCalled()
      timer.end()
      expect(show.mock.calls).toEqual([[null]])
    })

    it('coming back onto its own card keeps it, without opening it again', () => {
      const show = vi.fn()
      const timer = createPreviewTimer(show)
      opened(timer, show)
      timer.leave()
      vi.advanceTimersByTime(100)
      timer.start(card(7))
      vi.advanceTimersByTime(5000)
      expect(show).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    })

    it('moving on to another card (not under the preview) works as before: this preview closes after the grace, the other opens after its own rest', () => {
      const show = vi.fn()
      const timer = createPreviewTimer(show)
      opened(timer, show)
      timer.leave()
      timer.start(card(8))
      vi.advanceTimersByTime(PREVIEW_GRACE_MS)
      expect(show.mock.calls).toEqual([[null]])
      vi.advanceTimersByTime(PREVIEW_DELAY_MS - PREVIEW_GRACE_MS)
      expect(show.mock.calls).toEqual([[null], [card(8)]])
    })

    it('on the preview nothing else opens: a rest begun on the way there (crossing another card) is dropped', () => {
      const show = vi.fn()
      const timer = createPreviewTimer(show)
      opened(timer, show)
      timer.leave()
      timer.start(card(8))
      vi.advanceTimersByTime(50)
      timer.hold()
      vi.advanceTimersByTime(5000)
      expect(show).not.toHaveBeenCalled()
    })

    it('leaving a card before its rest is over still opens nothing and closes nothing', () => {
      const show = vi.fn()
      const timer = createPreviewTimer(show)
      timer.start(card(7))
      vi.advanceTimersByTime(200)
      timer.leave()
      vi.advanceTimersByTime(5000)
      expect(show).not.toHaveBeenCalled()
    })

    it('a grace still running is dropped by cancel (the grid went away) and replaced by an immediate close on end (a click, Escape)', () => {
      const show = vi.fn()
      const timer = createPreviewTimer(show)
      opened(timer, show)
      timer.leave()
      timer.cancel()
      vi.advanceTimersByTime(5000)
      expect(show).not.toHaveBeenCalled()
      timer.leave()
      timer.end()
      vi.advanceTimersByTime(5000)
      expect(show.mock.calls).toEqual([[null]])
    })
  })

  it('cancel stops a pending open without touching what is shown (a drag began, or the grid went away)', () => {
    const show = vi.fn()
    const timer = createPreviewTimer(show)
    timer.start(card(7))
    timer.cancel()
    vi.advanceTimersByTime(1000)
    expect(show).not.toHaveBeenCalled()
    timer.cancel() // nothing pending: harmless
    expect(vi.getTimerCount()).toBe(0)
  })
})
