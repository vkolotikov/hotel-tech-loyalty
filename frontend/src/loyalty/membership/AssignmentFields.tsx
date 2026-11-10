import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Crown, Gift } from 'lucide-react'
import { useBoot } from '../LoyaltyProvider'
import { PROGRAM_KEY, programApi } from '../program/api'
import { useTypedPhrase } from '../scan/useTypedPhrase'
import { benefitDetail } from '../scan/verdict'
import { Check, FormField } from '../ui/formParts'
import { VALIDITY_PROBLEM_WORDS } from './words'
import { useAssignmentWords } from './assignmentWords'
import { assignmentProblems, type AssignmentForm } from './assignmentMath'
import type { MemberRow } from '../lib/types'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/** The same explicit package/date choice for enrolment and later membership changes. */
export function AssignmentFields({ form, onChange, tried, serverFields, replacesActive = false, disabled = false, showLegend = true, original }: {
  form: AssignmentForm; onChange: (patch: Partial<AssignmentForm>) => void; tried: boolean;
  serverFields?: Record<string, unknown>; replacesActive?: boolean; disabled?: boolean; showLegend?: boolean; original?: MemberRow;
}) {
  const boot = useBoot(), { t } = useTranslation(), say = useAssignmentWords(), phrase = useTypedPhrase()
  const tiers = boot.programme.tiers.filter(tier => tier.is_active)
  const programme = useQuery({ queryKey: PROGRAM_KEY, queryFn: programApi.program, enabled: form.membership_mode === 'assigned' })
  const tier = programme.data?.tiers.find(item => String(item.id) === form.tier_id)
  const problems = tried ? assignmentProblems(form, tiers, boot.venue.today, replacesActive, original) : {}
  const problem = (field: string) => {
    const code = problems[field]
    if (code === 'choose' || serverFields?.tier_id && field === 'tier_id') return say('choose')
    if (code === 'replace') return say('replace')
    if (code) return t(`loyalty.membership.validity.problem.${code}`, VALIDITY_PROBLEM_WORDS[code] ?? say('failed'))
    return serverFields?.[field] ? say('failed') : null
  }
  return <fieldset className="min-w-0 space-y-4 border-0 p-0" data-membership-assignment="" disabled={disabled}>
    <legend className={showLegend ? 'mb-3 flex items-center gap-2 text-sm font-semibold' : 'sr-only'}><Crown size={18} aria-hidden />{say('title')}</legend>
    <FormField label={say('mode')} hint={say(form.membership_mode === 'assigned' ? 'assignedHint' : 'earnedHint')}>
      <select className={INPUT} value={form.membership_mode} onChange={e => onChange({ membership_mode: e.target.value as AssignmentForm['membership_mode'] })}>
        <option value="earned">{say('earned')}</option><option value="assigned">{say('assigned')}</option>
      </select>
    </FormField>
    {form.membership_mode === 'assigned' && <>
      <FormField label={say('level')} problem={problem('tier_id')}>
        <select className={INPUT} value={form.tier_id} onChange={e => onChange({ tier_id: e.target.value })}>
          <option value="">{say('choose')}</option>{tiers.map(item => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
        </select>
      </FormField>
      {tier && <section className="space-y-2 rounded-xl border border-a-border p-3" data-assignment-benefits="">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Gift size={16} aria-hidden />{say('benefits')}</h3>
        <p className="text-xs text-a-text-2">{say('inherits')}</p>
        {tier.benefits.length ? <ul className="space-y-1 text-sm">{tier.benefits.map(benefit => <li key={benefit.id}>{benefit.name}{benefitDetail(benefit, phrase) ? ` · ${benefitDetail(benefit, phrase)}` : ''}</li>)}</ul> : <p className="text-sm text-a-text-2">{say('noBenefits')}</p>}
      </section>}
      {form.tier_id && programme.isPending && <p className="text-sm text-a-text-2">{t('loyalty.common.loading', 'Loading…')}</p>}
      {programme.isError && <p className="text-sm text-a-text-2">{say('reviewBenefits')}</p>}
    </>}
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label={t('loyalty.membership.validity.from_label', 'Valid from (optional)')} problem={problem('valid_from')}>
        <input className={INPUT} type="date" value={form.valid_from} onChange={e => onChange({ valid_from: e.target.value })} />
      </FormField>
      <FormField label={t('loyalty.membership.add.valid_until', 'Valid until (optional)')} problem={problem('valid_until')}>
        <input className={INPUT} type="date" min={boot.venue.today} value={form.valid_until} onChange={e => onChange({ valid_until: e.target.value })} />
      </FormField>
    </div>
    <p className="text-xs text-a-text-2">{say('datesHint')}</p>
    {replacesActive && form.valid_from > boot.venue.today && <div><Check label={say('replace')} checked={form.confirm_replace} onChange={checked => onChange({ confirm_replace: checked })} />{problem('confirm_replace') && <p role="alert" className="text-sm text-a-danger">{problem('confirm_replace')}</p>}</div>}
  </fieldset>
}
