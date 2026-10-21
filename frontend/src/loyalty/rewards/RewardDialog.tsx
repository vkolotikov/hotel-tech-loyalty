import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { useFirstFocus } from '../lib/useFirstFocus'
import { Check, FormField, FormFoot } from '../ui/formParts'
import { named, wallInput } from '../lib/forms'
import { CATALOGUE_KEY, rewardsApi } from './api'
import { ERRORS } from './errors'
import { PictureField } from './PictureField'
import { MAX_COST, MAX_DISCOUNT, MAX_PER_MEMBER, MAX_STOCK, rewardBody, rewardFormOf, rewardProblems, rewardServerProblems, type RewardForm } from './rewardsMath'
import type { Reward, RewardOptions } from './types'
import { APPLIES_TO_WORDS, DISCOUNT_TYPE_WORDS, REWARD_PROBLEM_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Add a reward to the catalogue or change one (spec 2026-10-21 §4.6): what members see (name, description, terms,
 * category), what it costs in points, how many there are and how many one member may take, an optional typed discount
 * and what it applies to, an expiry on the venue's clock, and whether it is offered. A saved reward's picture is
 * changed here too, at once (PictureField, release 2 §7); a new one gets its picture once it is saved.
 */
export function RewardDialog({ reward, options, onClose }: { reward: Reward | null; options: RewardOptions; onClose: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const client = useQueryClient()
  const first = useFirstFocus<HTMLInputElement>()
  const zone = boot.venue.timezone
  const [form, setForm] = useState<RewardForm>(() => rewardFormOf(reward, options, zone))
  const [tried, setTried] = useState(false)
  const [picture, setPicture] = useState<string | null>(reward?.image_url ?? null)

  const refresh = () => { void client.invalidateQueries({ queryKey: CATALOGUE_KEY }) }
  const save = useMutation({
    mutationFn: () => (reward ? rewardsApi.updateReward(reward.id, rewardBody(form)) : rewardsApi.createReward(rewardBody(form))),
    onSuccess: () => { refresh(); onClose() },
    onError: (error) => { if (failureOf(error).code === 'not_found') refresh() },
  })
  const update = (patch: Partial<RewardForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError) save.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...(tried ? rewardProblems(form, options) : {}), ...rewardServerProblems(failure?.fields, form) }
  const problem = (field: string): string | null => {
    const code = problems[field]
    return code ? t(`loyalty.rewards.reward.problem.${code}`, REWARD_PROBLEM_WORDS[code] ?? REWARD_PROBLEM_WORDS.name) : null
  }
  const word = (prefix: string, words: Record<string, string>, value: string) => {
    const key = named(prefix, words, value)
    return key ? t(...key) : value
  }
  const typed = form.discount_type !== ''

  return (
    <Dialog title={reward ? t('loyalty.rewards.reward.edit_title', 'Change {{name}}', { name: reward.name }) : t('loyalty.rewards.reward.new_title', 'Add a reward')}
      onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.keys(rewardProblems(form, options)).length === 0) save.mutate()
      }}>
        <FormField label={t('loyalty.rewards.reward.name', 'Name')} problem={problem('name')}>
          <input ref={first} type="text" value={form.name} maxLength={191} onChange={(e) => update({ name: e.target.value })} className={INPUT}
            placeholder={t('loyalty.rewards.reward.name_example', 'e.g. Breakfast for two')} />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('loyalty.rewards.reward.points_cost', 'Points it costs')} problem={problem('points_cost')}>
            <input type="number" inputMode="numeric" min={1} max={MAX_COST} step={1} value={form.points_cost}
              onChange={(e) => update({ points_cost: e.target.value })} className={INPUT} />
          </FormField>
          <FormField label={t('loyalty.rewards.reward.category', 'Category')} problem={problem('category')}
            hint={t('loyalty.rewards.reward.category_hint', 'Your own word, e.g. Dining. Optional.')}>
            <input type="text" value={form.category} maxLength={60} onChange={(e) => update({ category: e.target.value })} className={INPUT} />
          </FormField>
          <FormField label={t('loyalty.rewards.reward.stock', 'Stock')} problem={problem('stock')}
            hint={t('loyalty.rewards.reward.stock_hint', 'Empty: no limit.')}>
            <input type="number" inputMode="numeric" min={0} max={MAX_STOCK} step={1} value={form.stock}
              onChange={(e) => update({ stock: e.target.value })} className={INPUT} />
          </FormField>
          <FormField label={t('loyalty.rewards.reward.per_member_limit', 'Per member')} problem={problem('per_member_limit')}
            hint={t('loyalty.rewards.reward.per_member_hint', 'How many one member may take. Empty: no limit.')}>
            <input type="number" inputMode="numeric" min={1} max={MAX_PER_MEMBER} step={1} value={form.per_member_limit}
              onChange={(e) => update({ per_member_limit: e.target.value })} className={INPUT} />
          </FormField>
        </div>

        <FormField label={t('loyalty.rewards.reward.description', 'Description')} problem={problem('description')}
          hint={t('loyalty.rewards.reward.description_hint', 'Optional. Members read it in the app.')}>
          <textarea value={form.description} rows={2} onChange={(e) => update({ description: e.target.value })} className={INPUT} />
        </FormField>
        <FormField label={t('loyalty.rewards.reward.terms', 'Terms')} problem={problem('terms')}
          hint={t('loyalty.rewards.reward.terms_hint', 'Optional, e.g. “Not valid on public holidays.”')}>
          <textarea value={form.terms} rows={2} onChange={(e) => update({ terms: e.target.value })} className={INPUT} />
        </FormField>

        {reward
          ? <PictureField owner="rewards" id={reward.id} picture={picture} alt={reward.name} limits={options.image} onChange={(url) => { setPicture(url); refresh() }} />
          : <p className="text-xs text-a-text-2">{t('loyalty.rewards.picture.after_save_reward', 'You can add a picture once the reward is saved.')}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('loyalty.rewards.reward.discount_type', 'Discount')} problem={problem('discount_type')}
            hint={t('loyalty.rewards.reward.discount_hint', 'For a reward the booking engine takes off the price.')}>
            <select value={form.discount_type} onChange={(e) => update({ discount_type: e.target.value })} className={INPUT}>
              <option value="">{t('loyalty.rewards.reward.no_discount', 'None')}</option>
              {options.discount_types.map(value => <option key={value} value={value}>{word('loyalty.rewards.discount_type', DISCOUNT_TYPE_WORDS, value)}</option>)}
              {typed && !options.discount_types.includes(form.discount_type) && <option value={form.discount_type}>{form.discount_type}</option>}
            </select>
          </FormField>
          {typed && (
            <FormField label={t('loyalty.rewards.reward.discount_value', 'Amount')} problem={problem('discount_value')}>
              <input type="number" inputMode="decimal" min={0.01} max={MAX_DISCOUNT} step={0.01} value={form.discount_value}
                onChange={(e) => update({ discount_value: e.target.value })} className={INPUT} />
            </FormField>
          )}
        </div>
        <FormField label={t('loyalty.rewards.reward.applies_to', 'Applies to')} problem={problem('applies_to')}>
          <select value={form.applies_to} onChange={(e) => update({ applies_to: e.target.value })} className={INPUT}>
            {options.applies_to.map(value => <option key={value} value={value}>{word('loyalty.rewards.applies_to', APPLIES_TO_WORDS, value)}</option>)}
            {!options.applies_to.includes(form.applies_to) && <option value={form.applies_to}>{form.applies_to}</option>}
          </select>
        </FormField>

        <FormField label={t('loyalty.rewards.reward.expires_at', 'Offered until')} problem={problem('expires_at')}
          hint={t('loyalty.rewards.reward.expires_hint', 'On the venue’s clock ({{zone}}). Empty: no end.', { zone })}>
          <input type="datetime-local" value={form.expires_at} onChange={(e) => update({ expires_at: wallInput(e.target.value) })} className={INPUT} />
        </FormField>

        <Check label={t('loyalty.rewards.reward.active', 'Offered to members')} checked={form.is_active} onChange={(on) => update({ is_active: on })}
          hint={t('loyalty.rewards.reward.active_hint', 'Switched off, members can no longer redeem it; codes already issued can still be fulfilled.')} />

        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.rewards', ERRORS, 'reward', failure))}</Notice>}

        <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} busy={save.isPending} onCancel={onClose}
          save={reward ? t('loyalty.rewards.reward.save', 'Save reward') : t('loyalty.rewards.reward.create', 'Add reward')} />
      </form>
    </Dialog>
  )
}
