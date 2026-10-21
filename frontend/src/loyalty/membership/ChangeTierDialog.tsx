import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { serverProblems } from '../lib/forms'
import { useFirstFocus } from '../lib/useFirstFocus'
import { FormField, FormFoot } from '../ui/formParts'
import { afterMemberChange, membershipApi } from './api'
import { ERRORS } from './errors'
import { TIER_FIELDS, firstKeepDay, tierBody, tierChoices, tierFormOf, tierNote, tierProblems, type TierForm } from './membershipMath'
import type { MemberProfile } from './types'
import { TIER_PROBLEM_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * A manager puts a member on a tier (spec 2026-10-21 release 2 §4.1), with "keep until": the next tier reviews leave
 * the member there until that day, on the venue's clock. Without it the dialog says so — the next review may move the
 * member again by their points. A tier the member earns above it always applies.
 */
export function ChangeTierDialog({ member, onClose }: { member: MemberProfile; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const today = boot.venue.today
  const tiers = tierChoices(boot.programme.tiers, member.tier_id)
  const client = useQueryClient()
  const first = useFirstFocus<HTMLSelectElement>()
  const [form, setForm] = useState<TierForm>(() => tierFormOf(member))
  const [tried, setTried] = useState(false)

  const save = useMutation({
    mutationFn: () => membershipApi.tier(member.id, tierBody(form)),
    onSuccess: () => { afterMemberChange(client, member.id); onClose() },
  })
  const update = (patch: Partial<TierForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError) save.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...(tried ? tierProblems(form, tiers, today) : {}), ...serverProblems(failure?.fields, TIER_FIELDS) }
  const problem = (field: string): string | null => {
    const code = problems[field]
    return code ? t(`loyalty.membership.tier.problem.${code}`, TIER_PROBLEM_WORDS[code] ?? TIER_PROBLEM_WORDS.tier_id) : null
  }
  const note = tierNote(form)

  return (
    <Dialog title={t('loyalty.membership.tier.title', 'Change the tier of {{name}}', { name: member.name })} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.keys(tierProblems(form, tiers, today)).length === 0) save.mutate()
      }}>
        <FormField label={t('loyalty.membership.tier.tier', 'Tier')} problem={problem('tier_id')}>
          <select ref={first} value={form.tier_id} onChange={(e) => update({ tier_id: e.target.value })} className={INPUT}>
            <option value="" disabled>{t('loyalty.membership.tier.choose', 'Choose a tier')}</option>
            {tiers.map(tier => <option key={tier.id} value={String(tier.id)}>{tier.name}</option>)}
          </select>
        </FormField>
        <FormField label={t('loyalty.membership.tier.keep_until', 'Keep until (optional)')} problem={problem('keep_until')}>
          <input type="date" value={form.keep_until} min={firstKeepDay(today)} onChange={(e) => update({ keep_until: e.target.value })} className={INPUT} />
        </FormField>
        <p data-tier-note={note} className="text-sm text-a-text-2">
          {note === 'kept'
            ? t('loyalty.membership.tier.note_kept', 'The member stays on this tier until the end of {{day}}, whatever their points; a higher tier they earn still applies.', {
              day: formatDate(form.keep_until, locale, { day: 'numeric', month: 'long', year: 'numeric' }),
            })
            : t('loyalty.membership.tier.note_review', 'Without a day to keep it until, the next tier review may move the member again by their points.')}
        </p>

        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'tier', failure))}</Notice>}

        <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} busy={save.isPending} onCancel={onClose} save={t('loyalty.membership.tier.save', 'Change tier')} />
      </form>
    </Dialog>
  )
}
