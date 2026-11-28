import { useEditorClose } from '../editors/useEditorClose'
import { EditorDialog, EditorSection, EditorDisclosure, EditorNote, EditorPreview, EditorArt, EditorFooter } from '../editors/EditorUI'
import { ManagementFact } from '../management/ManagementUI'
import { useAdminWords } from '../management/words'
import { useBoot } from '../LoyaltyProvider'
import { amountOf } from '../lib/format'
import { NumberControl } from '../redesign/DesignUI'
import { useRedesignWords } from '../redesign/words'
import './design/program.css'
import { useState, type ReactNode } from 'react'
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


/**
 * Give a tier a benefit from the catalogue, or change the one it gives (spec 2026-10-21 §4.5): the wording members
 * read and, for a discount or a multiplier, the typed value the booking engine applies and what it applies to. The
 * server keeps one per tier and benefit, so choosing one the tier already gives changes that one — the form says so
 * and starts from what is stored.
 */
export function TierBenefitDialog({ tier, current, benefits, options, onClose, initialBenefitId, onRemove, confirmation }: {
  tier: Tier
  /** The tier's benefit being changed, or null to add one. */
  current: TierBenefit | null
  benefits: Benefit[]
  options: ProgramOptions
  onClose: () => void
  onRemove?: () => void
  /** Replaces the modal content while keeping this editor's draft and validation state mounted. */
  confirmation?: ReactNode
  initialBenefitId?: number
}) {
  const { t, i18n } = useTranslation()
  const say = useRedesignWords()
  const boot = useBoot()
  const client = useQueryClient()
  const firstChoice = useFirstFocus<HTMLSelectElement>()
  const firstWording = useFirstFocus<HTMLTextAreaElement>()
  const [form, setForm] = useState<TierBenefitForm>(() => ({ ...tierBenefitFormOf(current, options), ...(!current && initialBenefitId ? { benefit_id: String(initialBenefitId) } : {}) }))
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


  const close = useEditorClose(form, onClose, save.isPending), admin = useAdminWords()
  if (confirmation) return confirmation
  if (!choices.length) return <EditorDialog area="rewards" title={title} section={admin('perks')} icon="perk" onClose={onClose}><p>{t('loyalty.program.tier_benefit.empty_catalogue', 'The catalogue has no benefit in use yet. Add one under Benefits first.')}</p></EditorDialog>
  const selected = benefits.find(b => String(b.id) === form.benefit_id)
  const amount = decimalOf(form.value_amount)
  const typed = needsAmount(form.value_type) && amount !== null && VALUE_PHRASE_WORDS[form.value_type] ? t(`loyalty.program.value_phrase.${form.value_type}`, VALUE_PHRASE_WORDS[form.value_type], { amount: amountOf(form.value_type, amount, boot.venue.currency, i18n.language || 'en') }) : ''
  const amountLabel = form.value_type === 'percent_discount' ? say('discount') : t('loyalty.program.tier_benefit.value_amount', 'Amount')
  return <><EditorDialog area="rewards" title={title} section={admin('perks')} icon="level" tone="gold" wide onClose={close.cancel} busy={save.isPending}>
    <form className="l-editor-form" noValidate onSubmit={e => { e.preventDefault(); setTried(true); if (!save.isPending && Object.keys(tierBenefitProblems(form, options)).length === 0) save.mutate() }}><div className="l-editor-body"><div className="l-editor-columns"><fieldset disabled={save.isPending} className="l-editor-stack">
      {already && <Notice tone="info">{t('loyalty.program.tier_benefit.already', '{{tier}} already gives this benefit: saving changes its wording and value.', { tier: tier.name })}</Notice>}
      <EditorSection icon="perk" title={selected?.name || t('loyalty.program.tier_benefit.benefit', 'Benefit')}>
        {!current && <FormField label={t('loyalty.program.tier_benefit.benefit', 'Benefit')} problem={problem('benefit_id')}><select ref={firstChoice} value={form.benefit_id} onChange={e => choose(e.target.value)}><option value="">{t('loyalty.program.tier_benefit.choose', 'Choose a benefit…')}</option>{choices.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}</select></FormField>}
        <div className="l-editor-two"><FormField label={say('level')}><input readOnly value={tier.name} /></FormField><FormField label={t('loyalty.program.benefit.fulfillment_mode', 'How it is given')}><input readOnly value={selected ? word('loyalty.program.fulfillment_mode', FULFILLMENT_WORDS, selected.fulfillment_mode ?? '') : '—'} /></FormField></div>
      </EditorSection><EditorSection icon="level" title={say('valueType')}><div className="l-editor-two">
        <FormField label={say('valueType')} problem={problem('value_type')}><select value={form.value_type} onChange={e => update({ value_type: e.target.value })}>{[...new Set([...options.value_types, form.value_type])].map(value => <option key={value} value={value}>{word('loyalty.program.value_type', VALUE_TYPE_WORDS, value)}</option>)}</select></FormField>
        {needsAmount(form.value_type) && <FormField label={amountLabel} problem={problem('value_amount')}><NumberControl label={amountLabel} value={form.value_amount} onValue={value_amount => update({ value_amount })} min={form.value_type === 'points_multiplier' ? 1 : 0} max={form.value_type === 'percent_discount' ? 100 : 1000000} step={form.value_type === 'points_multiplier' || form.value_type === 'fixed_amount' ? .01 : 1} invalid={!!problem('value_amount')} disabled={save.isPending} /></FormField>}
      </div><FormField label={t('loyalty.program.tier_benefit.applies_to', 'Applies to')} problem={problem('applies_to')}><select value={form.applies_to} onChange={e => update({ applies_to: e.target.value })}>{[...new Set([...options.applies_to, form.applies_to])].map(value => <option key={value} value={value}>{word('loyalty.program.applies_to', APPLIES_TO_WORDS, value)}</option>)}</select></FormField></EditorSection>
      <EditorNote icon="level" title={say('valueDefines')}>{say('deliveryRules')}</EditorNote>
      <EditorDisclosure title={say('wording')} open={!!problem('value')}><FormField label={say('wording')} problem={problem('value')} hint={say('wordingHint')}><textarea ref={current ? firstWording : undefined} value={form.value} rows={2} maxLength={255} onChange={e => update({ value: e.target.value })} /></FormField>{selected?.description && <p>{selected.description}</p>}</EditorDisclosure>
      {failure && <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'tier_benefit', failure))}</Notice>}
    </fieldset><EditorPreview tone="gold"><EditorArt kind="perkArt" label={selected?.name || say('preview')} title={typed || form.value || say('previewEmpty')} line={word('loyalty.program.applies_to', APPLIES_TO_WORDS, form.applies_to)} /><ManagementFact icon="bronze" label={say('level')}>{tier.name}</ManagementFact><ManagementFact icon="people" label={t('loyalty.program.benefit.fulfillment_mode', 'How it is given')}>{selected ? word('loyalty.program.fulfillment_mode', FULFILLMENT_WORDS, selected.fulfillment_mode ?? '') : '—'}</ManagementFact><small>{say('savesImmediately', { name: tier.name })}</small></EditorPreview></div></div>
    <EditorFooter onCancel={close.cancel} busy={save.isPending} dirty={close.dirty} creating={!current} save={current || already ? t('loyalty.program.tier_benefit.save', 'Save benefit') : say('addBenefit')}>{current && onRemove && <button type="button" className="l-ov-link" disabled={save.isPending} onClick={onRemove}>{t('loyalty.program.take_off.confirm', 'Take it off')}</button>}</EditorFooter></form>
  </EditorDialog>{close.warning}</>
}
