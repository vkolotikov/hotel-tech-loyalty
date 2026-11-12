import { describe, expect, it } from 'vitest'
import { assignmentFormOf, assignmentProblems, assignmentValues } from './assignmentMath'
import type { MemberRow } from '../lib/types'

describe('changing an expired assignment without renewing it', () => {
  const member = { id: 1, membership_mode: 'assigned', tier_id: 2, valid_from: '2026-01-01', valid_until: '2026-10-01' } as MemberRow
  it('releases the assignment without clearing or extending expired dates', () => {
    const form = { ...assignmentFormOf(member), membership_mode: 'earned' as const }
    expect(assignmentProblems(form, [], '2026-11-10', false, member)).toEqual({})
    expect(assignmentValues(form, member)).toEqual({ membership_mode: 'earned' })
  })
  it('still refuses a newly entered past expiry', () => {
    const form = { ...assignmentFormOf(member), membership_mode: 'earned' as const, valid_until: '2026-10-02' }
    expect(assignmentProblems(form, [], '2026-11-10', false, member)).toMatchObject({ valid_until: 'past' })
  })
})
