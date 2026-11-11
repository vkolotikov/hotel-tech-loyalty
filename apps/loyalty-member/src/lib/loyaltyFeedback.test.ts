import { describe, expect, it } from 'vitest'
import { advanceFeedback, type FeedbackSnapshot } from './loyaltyFeedback'

const snap = (patch: Partial<FeedbackSnapshot> = {}): FeedbackSnapshot => ({
  owner: 'member-session-a', balance: 2450, activity: [{ id: 10, points: 150, type: 'earn' }], ...patch,
})

describe('confirmed loyalty feedback', () => {
  it('does not celebrate historical points or check-ins on first load', () => {
    expect(advanceFeedback(null, snap({ checkins: [1], stamps: { cardId: 1, count: 6, completed: 1 } })).feedback).toBeNull()
  })
  it('reports new confirmed points and the actual server balance once', () => {
    const first = advanceFeedback(null, snap()).ledger
    const next = snap({ balance: 2600, activity: [{ id: 11, points: 150, type: 'earn' }, ...snap().activity] })
    const update = advanceFeedback(first, next)
    expect(update.feedback).toMatchObject({ kind: 'points', points: 150, fromBalance: 2450, toBalance: 2600 })
    expect(advanceFeedback(update.ledger, next).feedback).toBeNull()
  })
  it('ignores reordered, older paginated and reversed records', () => {
    let ledger = advanceFeedback(null, snap()).ledger
    const reordered = snap({ activity: [{ id: 2, points: 100, type: 'earn' }, ...snap().activity] })
    expect(advanceFeedback(ledger, reordered).feedback).toBeNull()
    const reversed = snap({ balance: 2500, activity: [{ id: 11, points: 50, type: 'reverse' }, { id: 12, points: 100, type: 'earn', is_reversed: true }] })
    const update = advanceFeedback(ledger, reversed)
    expect(update.feedback).toBeNull()
    ledger = update.ledger
    expect(advanceFeedback(ledger, reversed).feedback).toBeNull()
  })
  it('initializes a new session independently, even for the same account', () => {
    const first = advanceFeedback(null, snap()).ledger
    expect(advanceFeedback(first, snap({ owner: 'member-session-b', balance: 9000, activity: [{ id: 999, points: 500, type: 'earn' }] })).feedback).toBeNull()
  })
  it('waits for each check-in source to initialize before detecting a new one', () => {
    let ledger = advanceFeedback(null, snap()).ledger
    let update = advanceFeedback(ledger, snap({ checkins: [2] }))
    expect(update.feedback).toBeNull()
    ledger = update.ledger
    update = advanceFeedback(ledger, snap({ checkins: [2, 3] }))
    expect(update.feedback).toMatchObject({ kind: 'checkin' })
    expect(advanceFeedback(update.ledger, snap({ checkins: [3, 2] })).feedback).toBeNull()
  })
  it('does not replay stamps on initial load but reports a new server stamp', () => {
    let ledger = advanceFeedback(null, snap()).ledger
    const initial = snap({ stamps: { cardId: 1, count: 6, completed: 0 } })
    let update = advanceFeedback(ledger, initial)
    expect(update.feedback).toBeNull()
    ledger = update.ledger
    update = advanceFeedback(ledger, snap({ stamps: { cardId: 1, count: 7, completed: 0 } }))
    expect(update.feedback).toMatchObject({ kind: 'stamp', count: 1 })
    expect(advanceFeedback(update.ledger, initial).feedback).toBeNull()
  })
  it('does not infer earned points from a changed balance without a new ledger entry', () => {
    const ledger = advanceFeedback(null, snap()).ledger
    expect(advanceFeedback(ledger, snap({ balance: 2600 })).feedback).toBeNull()
  })
  it('does not replay a historical stamp card when the venue enables stamps', () => {
    const ledger = advanceFeedback(null, snap({ stamps: null })).ledger
    expect(advanceFeedback(ledger, snap({ stamps: { cardId: 1, count: 6, completed: 2 } })).feedback).toBeNull()
  })
})
