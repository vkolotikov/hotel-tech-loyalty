import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { useFirstFocus } from '../lib/useFirstFocus'
import { afterProgramChange, programApi } from './api'
import { ERRORS } from './errors'
import { FormField, FormFoot } from './formParts'
import {
  benefitChoices, existingOn, named, needsAmount, tierBenefitBody, tierBenefitFormOf, tierBenefitProblems, tierBenefitServerProblems,
  type TierBenefitForm,
} from './programMath'
import type { Benefit, ProgramOptions, Tier, TierBenefit } from './types'
import { APPLIES_TO_WORDS, TIER_BENEFIT_PROBLEM_WORDS, VALUE_TYPE_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Give a tier a benefit from the catalogue, or change the one it gives (spec 2026-10-21 §4.5): the wording members
 * read and, for a discount or a multiplier, the typed value the booking engine applies and what it applies to. The
 * server keeps one per tier and benefit, so choosing one the tier already gives changes that one — the form says so
 * and starts from what is stored.
 */
export function TierBenefitDialog({ tier, current, benefits, options, onClose }: {
  tier: Tier
  /** The tier's benefit being changed, or null to add one. */
  current: TierBenefit | null
  benefits: Benefit[]
  options: ProgramOptions
  onClose: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const firstChoice = useFirstFocus<HTMLSelectElement>()
  const firstWording = useFirstFocus<HTMLInputElement>()
  const [form, setForm] = useState<TierBenefitForm>(() => tierBenefitFormOf(current, options))
  const [tried, setTried] = useState(false)
  const choices = benefitChoices(benefits, current?.benefit_id ?? null)
  const already = current ? null : existingOn(tier, Number(form.benefit_id))

  const save = useMutation({
    mutationFn: () => programApi.attachBenefit(tier.id, tierBenefitBody(form)),
    onSuccess: () => { afterProgramChange(client, { benefits: true }); onClose() },
    onError: (error) => { if (failureOf(error).code === 'not_found') afterProgramChange(client, { benefits: true }) },
  })
  const update = (patch: Partial<TierBenefitForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError) save.reset()
  }
  const choose = (id: string) => {
    const existing = existingOn(tier, Number(id))
    setForm(existing ? tierBenefitFormOf(existing, options) : { ...form, benefit_id: id })
    if (save.isError) save.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...(tried ? tierBenefitProblems(form, options) : {}), ...tierBenefitServerProblems(failure?.fields, form) }
  const problem = (field: string): string | null => {
    const code = problems[field]
    return code ? t(`loyalty.program.tier_benefit.problem.${code}`, TIER_BENEFIT_PROBLEM_WORDS[code] ?? TIER_BENEFIT_PROBLEM_WORDS.benefit_id) : null
  }
  const word = (prefix: string, words: Record<string, string>, value: string) => {
    const key = named(prefix, words, value)
    return key ? t(...key) : value
  }
  const title = current
    ? t('loyalty.program.tier_benefit.edit_title', '{{benefit}} in {{tier}}', { benefit: current.name, tier: tier.name })
    : t('loyalty.program.tier_benefit.add_title', 'Add a benefit to {{tier}}', { tier: tier.name })

  if (choices.length === 0) {
    return (
      <Dialog title={title} onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-a-text">{t('loyalty.program.tier_benefit.empty_catalogue', 'The catalogue has no benefit in use yet. Add one under Benefits first.')}</p>
          <div className="flex justify-end"><Button type="button" variant="secondary" onClick={onClose}>{t('loyalty.program.tier_benefit.close', 'Close')}</Button></div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog title={title} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.keys(tierBenefitProblems(form, options)).length === 0) save.mutate()
      }}>
        {!current && (
          <FormField label={t('loyalty.program.tier_benefit.benefit', 'Benefit')} problem={problem('benefit_id')}>
            <select ref={firstChoice} value={form.benefit_id} onChange={(e) => choose(e.target.value)} className={INPUT}>
              <option value="">{t('loyalty.program.tier_benefit.choose', 'Choose a benefit…')}</option>
              {choices.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
            </select>
          </FormField>
        )}
        {already && (
          <Notice tone="info">{t('loyalty.program.tier_benefit.already', '{{tier}} already gives this benefit: saving changes its wording and value.', { tier: tier.name })}</Notice>
        )}

        <FormField label={t('loyalty.program.tier_benefit.value', 'Wording')} problem={problem('value')}
          hint={t('loyalty.program.tier_benefit.value_hint', 'What members read beside the benefit, e.g. “Until 2 pm”. Optional.')}>
          <input ref={current ? firstWording : undefined} type="text" value={form.value} maxLength={255} onChange={(e) => update({ value: e.target.value })} className={INPUT} />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('loyalty.program.tier_benefit.value_type', 'Kind of value')} problem={problem('value_type')}>
            <select value={form.value_type} onChange={(e) => update({ value_type: e.target.value })} className={INPUT}>
              {options.value_types.map(value => <option key={value} value={value}>{word('loyalty.program.value_type', VALUE_TYPE_WORDS, value)}</option>)}
              {!options.value_types.includes(form.value_type) && <option value={form.value_type}>{form.value_type}</option>}
            </select>
          </FormField>
          {needsAmount(form.value_type) && (
            <FormField label={t('loyalty.program.tier_benefit.value_amount', 'Amount')} problem={problem('value_amount')}>
              <input type="number" inputMode="decimal" min={0} step={0.01} value={form.value_amount}
                onChange={(e) => update({ value_amount: e.target.value })} className={INPUT} />
            </FormField>
          )}
        </div>

        <FormField label={t('loyalty.program.tier_benefit.applies_to', 'Applies to')} problem={problem('applies_to')}
          hint={t('loyalty.program.tier_benefit.applies_to_hint', 'Which bookings a discount or multiplier counts on.')}>
          <select value={form.applies_to} onChange={(e) => update({ applies_to: e.target.value })} className={INPUT}>
            {options.applies_to.map(value => <option key={value} value={value}>{word('loyalty.program.applies_to', APPLIES_TO_WORDS, value)}</option>)}
            {!options.applies_to.includes(form.applies_to) && <option value={form.applies_to}>{form.applies_to}</option>}
          </select>
        </FormField>

        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'tier_benefit', failure))}</Notice>}

        <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} busy={save.isPending} onCancel={onClose}
          save={current || already ? t('loyalty.program.tier_benefit.save', 'Save benefit') : t('loyalty.program.tier_benefit.create', 'Give benefit')} />
      </form>
    </Dialog>
  )
}
