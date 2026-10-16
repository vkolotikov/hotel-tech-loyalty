import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import type { PostCard } from '../lib/types'
import { createMover, dropTargetAt, isDragClick, keyMove, leavesRange, movePost, movedDate, pointerStartsDrag, refetchAfter, touchStartsDrag, undoOf } from './moveMath'

const card: PostCard = {
  id: 9, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: '09:00', status: 'draft',
  title: null, hook: 'Hook', topic: null, pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z',
}
const el = (attrs: Record<string, Record<string, string>>) => ({
  closest: (selector: string) => {
    const hit = attrs[selector]
    return hit ? { getAttribute: (name: string) => hit[name] ?? null } : null
  },
})

describe('dropTargetAt', () => {
  it('finds the day an element is in, or the tray, or nowhere', () => {
    expect(dropTargetAt(el({ '[data-drop-date]': { 'data-drop-date': '2026-10-09' } }))).toEqual({ kind: 'day', date: '2026-10-09' })
    expect(dropTargetAt(el({ '[data-drop="tray"]': {} }))).toEqual({ kind: 'tray' })
    expect(dropTargetAt(el({}))).toBeNull()
    expect(dropTargetAt(el({ '[data-drop-date]': { 'data-drop-date': 'soon' } }))).toBeNull()
    expect(dropTargetAt(null)).toBeNull()
  })
})

describe('movedDate and keyMove', () => {
  it('a drop gives the day or "no day", and nothing when it changes nothing', () => {
    expect(movedDate('2026-10-07', { kind: 'day', date: '2026-10-09' })).toBe('2026-10-09')
    expect(movedDate('2026-10-07', { kind: 'tray' })).toBeNull()
    expect(movedDate('2026-10-07', { kind: 'day', date: '2026-10-07' })).toBeUndefined()
    expect(movedDate(null, { kind: 'tray' })).toBeUndefined()
  })

  it('Shift+← → moves a dated post a day; any other key, or a post with no day, nothing', () => {
    expect(keyMove('2026-10-07', 'ArrowLeft', true)).toBe('2026-10-06')
    expect(keyMove('2026-10-31', 'ArrowRight', true)).toBe('2026-11-01')
    expect(keyMove('2026-10-07', 'ArrowRight', false)).toBeUndefined()
    expect(keyMove('2026-10-07', 'ArrowUp', true)).toBeUndefined()
    expect(keyMove(null, 'ArrowRight', true)).toBeUndefined()
  })
})

describe('the drag\'s thresholds', () => {
  it('a mouse drags after 4 px, a finger after a still 400 ms, and the click a release fires is not an opening', () => {
    expect([pointerStartsDrag(3), pointerStartsDrag(4)]).toEqual([false, true])
    expect([touchStartsDrag(399, 0), touchStartsDrag(400, 8), touchStartsDrag(500, 9)]).toEqual([false, true, false])
    expect([isDragClick(null, 1000), isDragClick(900, 1000), isDragClick(500, 1000)]).toEqual([false, true, false])
  })
})

describe('movePost', () => {
  it('sends the version it read and the new day (null for the tray), and answers with the moved card', async () => {
    const moved = { ...card, scheduled_date: null, updated_at: '2026-10-05T06:01:00.000000Z' }
    const api = { movePost: vi.fn(() => Promise.resolve({ post: moved })) }
    await expect(movePost(api, card, null)).resolves.toEqual({ ok: true, moved })
    expect(api.movePost).toHaveBeenCalledWith(9, { updated_at: card.updated_at, scheduled_date: null })
  })

  it('turns a refusal into its code, and asks for a new read when the plan shows something no longer true, or the answer was lost', async () => {
    const api = { movePost: vi.fn(() => Promise.reject({ response: { status: 409, data: { error: 'changed_elsewhere', post: { id: 9 } } } })) }
    await expect(movePost(api, card, '2026-10-09')).resolves.toEqual({ ok: false, code: 'changed_elsewhere' })
    expect([refetchAfter('changed_elsewhere'), refetchAfter('not_found'), refetchAfter('published_cannot_move'), refetchAfter('network')])
      .toEqual([true, true, true, true])
  })
})

describe('Undo', () => {
  it('sends the moved post back to its day and its time (a move to the tray clears the time on the server)', async () => {
    const moved = { ...card, scheduled_date: null, scheduled_time: null, updated_at: '2026-10-05T06:01:00.000000Z' }
    expect(undoOf(card, moved)).toEqual({ post: moved, to: '2026-10-07', time: '09:00' })
    const api = { movePost: vi.fn(() => Promise.resolve({ post: card })) }
    await movePost(api, moved, '2026-10-07', '09:00')
    expect(api.movePost).toHaveBeenCalledWith(9, { updated_at: moved.updated_at, scheduled_date: '2026-10-07', scheduled_time: '09:00' })
  })
})

describe('createMover', () => {
  const moved = { ...card, scheduled_date: '2026-10-08', updated_at: '2026-10-05T06:01:00.000000Z' }

  it('shows a saved move on the plan before reading the plan again', async () => {
    const calls: string[] = []
    const api = { movePost: vi.fn(() => Promise.resolve({ post: moved })) }
    const mover = createMover({ api, place: (post) => { calls.push(`place ${post.scheduled_date}`) }, refresh: async () => { calls.push('refresh') } })
    await expect(mover(card, '2026-10-08')).resolves.toEqual({ ok: true, moved })
    expect(calls).toEqual(['place 2026-10-08', 'refresh'])
  })

  it('places nothing after a refusal, and reads the plan again when it shows something no longer true', async () => {
    const place = vi.fn()
    const refresh = vi.fn(() => Promise.resolve())
    const api = { movePost: vi.fn(() => Promise.reject({ response: { status: 409, data: { error: 'changed_elsewhere' } } })) }
    await expect(createMover({ api, place, refresh })(card, '2026-10-08')).resolves.toEqual({ ok: false, code: 'changed_elsewhere' })
    expect(place).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('moves one post once at a time: a second move of it while the first is on its way is not sent', async () => {
    let finish: (value: { post: typeof moved }) => void = () => {}
    const api = { movePost: vi.fn(() => new Promise<{ post: typeof moved }>((resolve) => { finish = resolve })) }
    const mover = createMover({ api, place: () => {}, refresh: () => Promise.resolve() })
    const first = mover(card, '2026-10-08')
    await expect(mover(card, '2026-10-09')).resolves.toEqual({ ok: false, code: 'busy' })
    finish({ post: moved })
    await expect(first).resolves.toEqual({ ok: true, moved })
    expect(api.movePost).toHaveBeenCalledTimes(1)
    // Once it has landed, the next move goes (sent at once; this fake never answers it).
    void mover(moved, '2026-10-09')
    expect(api.movePost).toHaveBeenCalledTimes(2)
  })
})

describe('leavesRange', () => {
  // Plan B deferred: Shift+→ on Sunday saved the move but the card left the view and the focus with it.
  it('tells a keyboard move that leaves the week on screen, so the Plan can follow it', () => {
    const week = { from: '2026-10-05', to: '2026-10-11' }
    expect(leavesRange(keyMove('2026-10-11', 'ArrowRight', true) as string, week)).toBe(true)
    expect(leavesRange(keyMove('2026-10-05', 'ArrowLeft', true) as string, week)).toBe(true)
    expect(leavesRange(keyMove('2026-10-07', 'ArrowRight', true) as string, week)).toBe(false)
  })
})
