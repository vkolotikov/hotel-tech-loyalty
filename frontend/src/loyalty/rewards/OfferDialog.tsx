import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { useLook } from '../lib/look'
import { useFirstFocus } from '../lib/useFirstFocus'
import { Check, FormField, FormFoot, Toggle } from '../ui/formParts'
import { named, serverProblems, toggled } from '../lib/forms'
import { TierChip } from '../ui/TierChip'
import { OFFERS_KEY, rewardsApi } from './api'
import { ERRORS } from './errors'
import { BrandField } from './parts'
import { PictureField } from './PictureField'
import { MAX_OFFER_VALUE, OFFER_FIELDS, brandPart, initialBrand, offerBody, offerFormOf, offerProblems, typeChoices, type OfferForm } from './rewardsMath'
import type { Offer, OfferOptions } from './types'
import { APPLIES_TO_WORDS, OFFER_PROBLEM_WORDS, OFFER_TYPE_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Add an offer or change one (spec 2026-10-21 §4.6): what members read, its kind and value, an optional code they
 * type, what it applies to, which tiers see it (none chosen: every tier), the venue days it runs, how often it may be
 * used, whether it is featured — and, once made, whether it is on and its picture, changed at once (PictureField,
 * release 2 §7). With more than one brand, a new offer names its brand and a saved one shows it (release 4).
 */
export function OfferDialog({ offer, options, onClose }: { offer: Offer | null; options: OfferOptions; onClose: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const look = useLook()
  const client = useQueryClient()
  const first = useFirstFocus<HTMLInputElement>()
  const tiersId = useId()
  const current = offer?.type ?? null
  const [form, setForm] = useState<OfferForm>(() => offerFormOf(offer, options, boot.venue.today))
  const [tried, setTried] = useState(false)
  const [picture, setPicture] = useState<string | null>(offer?.image_url ?? null)
  const [brand, setBrand] = useState<number | null>(() => initialBrand(options.brands))
  const tiers = boot.programme.tiers

  const refresh = () => { void client.invalidateQueries({ queryKey: OFFERS_KEY }) }
  const save = useMutation({
    mutationFn: () => (offer ? rewardsApi.updateOffer(offer.id, offerBody(form, true)) : rewardsApi.createOffer({ ...offerBody(form, false), ...brandPart(brand) })),
    onSuccess: () => { refresh(); onClose() },
    onError: (error) => { if (failureOf(error).code === 'not_found') refresh() },
  })
  const update = (patch: Partial<OfferForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError) save.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...(tried ? offerProblems(form, options, current) : {}), ...serverProblems(failure?.fields, OFFER_FIELDS) }
  const problem = (field: string): string | null => {
    const code = problems[field]
    return code ? t(`loyalty.rewards.offer.problem.${code}`, OFFER_PROBLEM_WORDS[code] ?? OFFER_PROBLEM_WORDS.title) : null
  }
  const word = (prefix: string, words: Record<string, string>, value: string) => {
    const key = named(prefix, words, value)
    return key ? t(...key) : value
  }
  const tierProblem = problem('tier_ids')

  return (
    <Dialog title={offer ? t('loyalty.rewards.offer.edit_title', 'Change {{title}}', { title: offer.title }) : t('loyalty.rewards.offer.new_title', 'Add an offer')}
      onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.keys(offerProblems(form, options, current)).length === 0) save.mutate()
      }}>
        <FormField label={t('loyalty.rewards.offer.title_field', 'Title')} problem={problem('title')}>
          <input ref={first} type="text" value={form.title} maxLength={191} onChange={(e) => update({ title: e.target.value })} className={INPUT}
            placeholder={t('loyalty.rewards.offer.title_example', 'e.g. Autumn weekend')} />
        </FormField>
        <BrandField options={options.brands} value={brand} saved={offer ? (offer.brand_id ?? null) : undefined}
          refused={!!failure?.fields?.brand} onChange={(id) => { setBrand(id); if (save.isError) save.reset() }} />
        <FormField label={t('loyalty.rewards.offer.description', 'Description')} problem={problem('description')}
          hint={t('loyalty.rewards.offer.description_hint', 'Members read this in the app and the portal.')}>
          <textarea value={form.description} rows={3} onChange={(e) => update({ description: e.target.value })} className={INPUT} />
        </FormField>

        {offer
          ? <PictureField owner="offers" id={offer.id} picture={picture} alt={offer.title} limits={options.image} onChange={(url) => { setPicture(url); refresh() }} />
          : <p className="text-xs text-a-text-2">{t('loyalty.rewards.picture.after_save_offer', 'You can add a picture once the offer is saved.')}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('loyalty.rewards.offer.type', 'Kind')} problem={problem('type')}>
            <select value={form.type} onChange={(e) => update({ type: e.target.value })} className={INPUT}>
              {form.type === '' && <option value="">{t('loyalty.rewards.offer.choose', 'Choose…')}</option>}
              {typeChoices(options.types, current).map(value => <option key={value} value={value}>{word('loyalty.rewards.offer_type', OFFER_TYPE_WORDS, value)}</option>)}
            </select>
          </FormField>
          <FormField label={t('loyalty.rewards.offer.value', 'Value')} problem={problem('value')}
            hint={t('loyalty.rewards.offer.value_hint', 'A percentage, an amount, a multiplier or points, as the kind says.')}>
            <input type="number" inputMode="decimal" min={0} max={MAX_OFFER_VALUE} step={0.01} value={form.value}
              onChange={(e) => update({ value: e.target.value })} className={INPUT} />
          </FormField>
          <FormField label={t('loyalty.rewards.offer.code', 'Code')} problem={problem('code')}
            hint={t('loyalty.rewards.offer.code_hint', 'Optional: 4 to 24 letters, digits or hyphens, saved in capitals.')}>
            <input type="text" value={form.code} maxLength={24} spellCheck={false} onChange={(e) => update({ code: e.target.value })} className={`${INPUT} font-a-mono uppercase`} />
          </FormField>
          <FormField label={t('loyalty.rewards.offer.applies_to', 'Applies to')} problem={problem('applies_to')}>
            <select value={form.applies_to} onChange={(e) => update({ applies_to: e.target.value })} className={INPUT}>
              {options.applies_to.map(value => <option key={value} value={value}>{word('loyalty.rewards.applies_to', APPLIES_TO_WORDS, value)}</option>)}
              {!options.applies_to.includes(form.applies_to) && <option value={form.applies_to}>{form.applies_to}</option>}
            </select>
          </FormField>
          <FormField label={t('loyalty.rewards.offer.start_date', 'First day')} problem={problem('start_date')}>
            <input type="date" value={form.start_date} onChange={(e) => update({ start_date: e.target.value })} className={INPUT} />
          </FormField>
          <FormField label={t('loyalty.rewards.offer.end_date', 'Last day')} problem={problem('end_date')}>
            <input type="date" value={form.end_date} onChange={(e) => update({ end_date: e.target.value })} className={INPUT} />
          </FormField>
          <FormField label={t('loyalty.rewards.offer.usage_limit', 'Uses in all')} problem={problem('usage_limit')}
            hint={t('loyalty.rewards.offer.limit_hint', 'Empty: no limit.')}>
            <input type="number" inputMode="numeric" min={1} step={1} value={form.usage_limit} onChange={(e) => update({ usage_limit: e.target.value })} className={INPUT} />
          </FormField>
          <FormField label={t('loyalty.rewards.offer.per_member_limit', 'Uses per member')} problem={problem('per_member_limit')}
            hint={t('loyalty.rewards.offer.limit_hint', 'Empty: no limit.')}>
            <input type="number" inputMode="numeric" min={1} step={1} value={form.per_member_limit} onChange={(e) => update({ per_member_limit: e.target.value })} className={INPUT} />
          </FormField>
        </div>

        {tiers.length > 0 && (
          <div role="group" aria-labelledby={tiersId} className="space-y-1.5">
            <p id={tiersId} className="text-xs font-medium text-a-text-2">{t('loyalty.rewards.offer.tiers', 'Tiers')}</p>
            <div className="flex flex-wrap gap-1.5">
              {tiers.map(tier => (
                <Toggle key={tier.id} on={form.tiers.includes(tier.id)} onClick={() => update({ tiers: toggled(form.tiers, tier.id) })}>
                  <TierChip tier={tier} theme={look.resolved} size="sm" />
                </Toggle>
              ))}
            </div>
            <p className="text-xs text-a-text-2">{t('loyalty.rewards.offer.tiers_hint', 'None chosen: every tier.')}</p>
            {tierProblem && <p className="text-xs font-medium text-a-danger">{tierProblem}</p>}
          </div>
        )}

        <Check label={t('loyalty.rewards.offer.featured', 'Featured')} checked={form.is_featured} onChange={(on) => update({ is_featured: on })}
          hint={t('loyalty.rewards.offer.featured_hint', 'Shown first to members.')} />
        {offer && (
          <Check label={t('loyalty.rewards.offer.active', 'On')} checked={form.is_active} onChange={(on) => update({ is_active: on })}
            hint={t('loyalty.rewards.offer.active_hint', 'Switched off, members no longer see it, even between its dates.')} />
        )}

        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.rewards', ERRORS, 'offer', failure))}</Notice>}

        <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} busy={save.isPending} onCancel={onClose}
          save={offer ? t('loyalty.rewards.offer.save', 'Save offer') : t('loyalty.rewards.offer.create', 'Add offer')} />
      </form>
    </Dialog>
  )
}
