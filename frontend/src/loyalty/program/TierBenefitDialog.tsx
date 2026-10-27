import { useBoot } from '../LoyaltyProvider'
import { useLook } from '../lib/look'
import { amountOf } from '../lib/format'
import { DesignDialog, NumberControl } from '../redesign/DesignUI'
import { OverviewButton } from '../overview/OverviewUI'
import { overviewAssets } from '../overview/assets'
import { useRedesignWords } from '../redesign/words'
import { readableTierColor } from '../redesign/designMath'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { useFirstFocus } from '../lib/useFirstFocus'
import { afterProgramChange, programApi } from './api'
import { ERRORS } from './errors'
import { FormField } from '../ui/formParts'
import { benefitChoices, existingOn, needsAmount, tierBenefitBody, tierBenefitFormOf, tierBenefitProblems, tierBenefitServerProblems, type TierBenefitForm } from './programMath'
import { decimalOf, named } from '../lib/forms'
import type { Benefit, ProgramOptions, Tier, TierBenefit } from './types'
import { APPLIES_TO_WORDS, FULFILLMENT_WORDS, TIER_BENEFIT_PROBLEM_WORDS, VALUE_TYPE_WORDS, VALUE_PHRASE_WORDS } from './words'

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
  const { t, i18n } = useTranslation()
  const say = useRedesignWords()
  const boot = useBoot()
  const look = useLook()
  const [details, setDetails] = useState(false)
  const client = useQueryClient()
  const firstChoice = useFirstFocus<HTMLSelectElement>()
  const firstWording = useFirstFocus<HTMLTextAreaElement>()
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


  if (!choices.length) return <DesignDialog title={title} onClose={onClose}><p>{t('loyalty.program.tier_benefit.empty_catalogue', 'The catalogue has no benefit in use yet. Add one under Benefits first.')}</p></DesignDialog>
  const selected = benefits.find(b => String(b.id) === form.benefit_id)
  const amount = decimalOf(form.value_amount)
  const typed = needsAmount(form.value_type) && amount !== null && VALUE_PHRASE_WORDS[form.value_type] ? t(`loyalty.program.value_phrase.${form.value_type}`, VALUE_PHRASE_WORDS[form.value_type], { amount: amountOf(form.value_type, amount, boot.venue.currency, i18n.language || 'en') }) : ''
  const amountLabel = form.value_type === 'percent_discount' ? say('discount') : t('loyalty.program.tier_benefit.value_amount', 'Amount')
  return <DesignDialog title={title} wide onClose={onClose} busy={save.isPending}>
    <form className="l-rd-form" noValidate onSubmit={e => { e.preventDefault(); setTried(true); if (!save.isPending && Object.keys(tierBenefitProblems(form, options)).length === 0) save.mutate() }}>
      <p>{say('benefitLine', { name: tier.name })}</p>
      {already && <Notice tone="info">{t('loyalty.program.tier_benefit.already', '{{tier}} already gives this benefit: saving changes its wording and value.', { tier: tier.name })}</Notice>}
      <div className="l-rd-benefit-columns">
        <div className="l-rd-form">
          {!current && <FormField label={t('loyalty.program.tier_benefit.benefit', 'Benefit')} problem={problem('benefit_id')}><select ref={firstChoice} value={form.benefit_id} onChange={e => choose(e.target.value)} className={INPUT}><option value="">{t('loyalty.program.tier_benefit.choose', 'Choose a benefit…')}</option>{choices.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}</select></FormField>}
          <FormField label={say('valueType')} problem={problem('value_type')}><select value={form.value_type} onChange={e => update({ value_type: e.target.value })} className={INPUT}>{options.value_types.map(value => <option key={value} value={value}>{word('loyalty.program.value_type', VALUE_TYPE_WORDS, value)}</option>)}{!options.value_types.includes(form.value_type) && <option value={form.value_type}>{form.value_type}</option>}</select></FormField>
          <div className="l-rd-benefit-value">
            {needsAmount(form.value_type) && <div><span className="l-rd-label">{amountLabel}</span><NumberControl label={amountLabel} value={form.value_amount} onValue={value_amount => update({ value_amount })} min={form.value_type === 'points_multiplier' ? 1 : 0} max={form.value_type === 'percent_discount' ? 100 : 1000000} step={form.value_type === 'points_multiplier' || form.value_type === 'fixed_amount' ? .01 : 1} invalid={!!problem('value_amount')} disabled={save.isPending} />{problem('value_amount') && <p className="text-a-danger">{problem('value_amount')}</p>}</div>}
            <FormField label={t('loyalty.program.tier_benefit.applies_to', 'Applies to')} problem={problem('applies_to')}><select value={form.applies_to} onChange={e => update({ applies_to: e.target.value })} className={INPUT}>{options.applies_to.map(value => <option key={value} value={value}>{word('loyalty.program.applies_to', APPLIES_TO_WORDS, value)}</option>)}{!options.applies_to.includes(form.applies_to) && <option value={form.applies_to}>{form.applies_to}</option>}</select></FormField>
          </div>
          <FormField label={say('wording')} problem={problem('value')} hint={say('wordingHint')}><textarea aria-label={say('wording')} ref={current ? firstWording : undefined} value={form.value} rows={2} maxLength={255} onChange={e => update({ value: e.target.value })} className={INPUT} /></FormField>
        </div>
        <aside className="l-rd-benefit-preview"><span className="l-ov-eyebrow">{say('preview')}</span><h2 style={{ color: readableTierColor(tier.color, look.resolved) }}>{tier.name}</h2><hr /><img src={overviewAssets.gift} alt="" />
          <h3>{typed || form.value || selected?.name || say('previewEmpty')}</h3>{typed && form.value && <p>{form.value}</p>}{selected && <p>{selected.name}</p>}<small>{word('loyalty.program.applies_to', APPLIES_TO_WORDS, form.applies_to)}</small>
          {selected && <><button type="button" className="l-ov-link" aria-expanded={details} onClick={() => setDetails(!details)}>{say('benefitDetails')}</button>{details && <div><p>{selected.description || say('detailsUnavailable')}</p>{selected.fulfillment_mode && <small>{word('loyalty.program.fulfillment_mode', FULFILLMENT_WORDS, selected.fulfillment_mode)}</small>}</div>}</>}
        </aside>
      </div>
      <div className="l-ov-inset l-rd-assignment-note"><strong>{say('valueDefines')}</strong><small>{say('deliveryRules')}</small></div>
      {failure && <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'tier_benefit', failure))}</Notice>}
      <div className="l-rd-form-foot"><small>{say('savesImmediately', { name: tier.name })}</small><OverviewButton type="button" disabled={save.isPending} onClick={onClose}>{t('loyalty.common.cancel', 'Cancel')}</OverviewButton><OverviewButton primary type="submit" disabled={save.isPending} aria-busy={save.isPending}>{current || already ? t('loyalty.program.tier_benefit.save', 'Save benefit') : say('addBenefit')}</OverviewButton></div>
    </form>
  </DesignDialog>
}
