import { isDateKey } from '../../workspace/lib/wallClock'
import type { MemberRow, TierRef } from '../lib/types'

export interface AssignmentForm {
  membership_mode: 'assigned' | 'earned'
  tier_id: string
  valid_from: string
  valid_until: string
  confirm_replace: boolean
}

export const assignmentFormOf = (member?: MemberRow): AssignmentForm => ({
  membership_mode: member?.membership_mode ?? 'earned', tier_id: member?.tier_id ? String(member.tier_id) : '',
  valid_from: member?.valid_from ?? '', valid_until: member?.valid_until ?? '', confirm_replace: false,
})

export const assignmentValues = (form: AssignmentForm, original?: MemberRow) => ({
  membership_mode: form.membership_mode,
  ...(form.membership_mode === 'assigned' ? { tier_id: Number(form.tier_id) } : {}),
  ...(!original || form.valid_from !== (original.valid_from ?? '') ? { valid_from: form.valid_from || null } : {}),
  ...(!original || form.valid_until !== (original.valid_until ?? '') ? { valid_until: form.valid_until || null } : {}),
})

export function assignmentProblems(form: AssignmentForm, tiers: readonly TierRef[], today: string, replacesActive = false, original?: MemberRow): Record<string, string> {
  const problems: Record<string, string> = {}
  if (form.membership_mode === 'assigned' && !tiers.some(tier => tier.is_active && String(tier.id) === form.tier_id)) problems.tier_id = 'choose'
  if (form.valid_from && !isDateKey(form.valid_from)) problems.valid_from = 'start'
  if (form.valid_until && !isDateKey(form.valid_until)) problems.valid_until = 'date'
  else if (form.valid_until && form.valid_until < today && form.valid_until !== original?.valid_until) problems.valid_until = 'past'
  if (form.valid_from && form.valid_until && form.valid_from > form.valid_until) problems.valid_from = 'range'
  if (replacesActive && form.valid_from > today && !form.confirm_replace) problems.confirm_replace = 'replace'
  return problems
}
