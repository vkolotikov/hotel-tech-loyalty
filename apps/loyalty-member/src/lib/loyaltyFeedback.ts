import type { Activity } from './types'

export interface FeedbackSnapshot {
  owner: string
  balance: number | null
  activity: readonly Pick<Activity, 'id' | 'points' | 'type' | 'is_reversed'>[]
  /** Undefined until this source has answered; [] is an observed empty history. */
  checkins?: readonly number[]
  stamps?: { cardId: number; count: number; completed: number } | null
}

export interface FeedbackLedger {
  owner: string
  balance: number | null
  activityMax: number
  checkins?: readonly number[]
  stampCards?: Record<number, number>
  completed?: number
}

export interface LoyaltyFeedback {
  key: string
  kind: 'points' | 'checkin' | 'stamp'
  points?: number
  count?: number
  completed?: boolean
  fromBalance: number | null
  toBalance: number | null
}

/** Read-only feedback from already confirmed facts. It never awards points, marks attendance or changes a balance. */
export function advanceFeedback(previous: FeedbackLedger | null, next: FeedbackSnapshot): { ledger: FeedbackLedger; feedback: LoyaltyFeedback | null } {
  const same = previous?.owner === next.owner
  const before = same ? previous : null
  const maxId = Math.max(before?.activityMax ?? 0, ...next.activity.map(a => Number.isFinite(a.id) ? a.id : 0))
  const checkins = next.checkins === undefined ? before?.checkins : [...new Set([...(before?.checkins ?? []), ...next.checkins])]
  const stampCards = next.stamps === null ? undefined : before?.stampCards ? { ...before.stampCards } : next.stamps === undefined ? undefined : {}
  if (next.stamps && stampCards) stampCards[next.stamps.cardId] = Math.max(stampCards[next.stamps.cardId] ?? 0, next.stamps.count)
  const completed = next.stamps === null ? undefined : next.stamps === undefined ? before?.completed : Math.max(before?.completed ?? 0, next.stamps.completed)
  const ledger: FeedbackLedger = { owner: next.owner, balance: next.balance, activityMax: maxId, checkins, stampCards, completed }
  if (!before) return { ledger, feedback: null }

  const earned = next.activity.filter(a => a.id > before.activityMax && a.points > 0 && Number.isFinite(a.points) && !a.is_reversed && !['reverse', 'refund', 'expire'].includes(a.type))
  const points = earned.reduce((sum, a) => sum + a.points, 0)
  const balances = { fromBalance: before.balance, toBalance: next.balance }
  if (points > 0 && next.balance !== null && Number.isFinite(next.balance)) return { ledger, feedback: { kind: 'points', points, key: `points:${maxId}`, ...balances } }

  const newCheckins = before.checkins && next.checkins?.filter(id => !before.checkins!.includes(id))
  if (newCheckins?.length) return { ledger, feedback: { kind: 'checkin', key: `checkin:${newCheckins.join(',')}`, ...balances } }

  if (before.stampCards && next.stamps) {
    const was = before.stampCards[next.stamps.cardId] ?? 0
    const count = Math.max(0, next.stamps.count - was)
    const finished = (next.stamps.completed ?? 0) > (before.completed ?? 0)
    if (count > 0 || finished) return { ledger, feedback: { kind: 'stamp', count, completed: finished, key: `stamp:${next.stamps.cardId}:${next.stamps.count}:${next.stamps.completed}`, ...balances } }
  }
  return { ledger, feedback: null }
}
