import { describe, expect, it } from 'vitest'
import type { Bootstrap, PostStatus } from './types'
import { approvalsOn, cardFlags, flagWords, staffLocked, statusChoices } from './approval'

const boot = (requires: boolean | undefined, manager: boolean) => ({
  profile: { id: 1, setup_completed: true, readiness: 80, requires_approval: requires },
  staff: { name: 'Sam', role: manager ? 'manager' : 'staff', can_manage: manager },
}) as unknown as Bootstrap
const ALL: PostStatus[] = ['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'ready_to_publish', 'published', 'skipped', 'archived']

describe('approvals as the portal sees them (spec 2026-10-16 §6)', () => {
  it('are on only when the bootstrap says so', () => {
    expect(approvalsOn(boot(true, false))).toBe(true)
    expect(approvalsOn(boot(false, false))).toBe(false)
    expect(approvalsOn(boot(undefined, false))).toBe(false)
    expect(approvalsOn(undefined)).toBe(false)
  })

  it('lock staff, and only while they are on', () => {
    expect(staffLocked(boot(true, false))).toBe(true)
    expect(staffLocked(boot(true, true))).toBe(false)
    expect(staffLocked(boot(false, false))).toBe(false)
  })

  it('take Approved, Ready and Published out of a locked status list, keeping the post’s own status', () => {
    expect(statusChoices(ALL, true, 'draft')).toEqual(['idea', 'draft', 'needs_review', 'needs_visual', 'skipped', 'archived'])
    expect(statusChoices(ALL, true, 'approved')).toEqual(['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'skipped', 'archived'])
    expect(statusChoices(ALL, false, 'draft')).toEqual(ALL)
  })

  it('flag a card waiting for approval only while on, a sent-back draft, and its comments', () => {
    expect(cardFlags({ status: 'needs_review', sent_back: false, comments_count: 2 }, true)).toEqual({ waiting: true, sentBack: false, comments: 2 })
    expect(cardFlags({ status: 'needs_review' }, false)).toEqual({ waiting: false, sentBack: false, comments: 0 })
    expect(cardFlags({ status: 'draft', sent_back: true }, true)).toEqual({ waiting: false, sentBack: true, comments: 0 })
  })
})

describe('a card’s flags in words', () => {
  it('reads them in order, for the name of a card whose marks are drawn without words', () => {
    const t = (_key: string, fallback: string, vars?: Record<string, unknown>) => fallback.replace('{{count}}', String(vars?.count ?? ''))
    expect(flagWords({ waiting: true, sentBack: false, comments: 2 }, t)).toBe('Waiting for approval, Comments: 2')
    expect(flagWords({ waiting: false, sentBack: true, comments: 0 }, t)).toBe('Sent back')
    expect(flagWords({ waiting: false, sentBack: false, comments: 0 }, t)).toBe('')
  })
})
