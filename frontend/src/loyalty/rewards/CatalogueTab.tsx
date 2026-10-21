import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Eyebrow } from '../../workspace/ui/Typography'
import { useBoot } from '../LoyaltyProvider'
import { amountOf, points, when } from '../lib/format'
import { ToneBadge } from '../ui/formParts'
import { activeTone } from '../program/programMath'
import { named } from '../lib/forms'
import { CATALOGUE_KEY, rewardsApi } from './api'
import { Empty, LoadFailed, Loading, TabHead } from './parts'
import { RewardDialog } from './RewardDialog'
import { rewardDiscount, stockOf } from './rewardsMath'
import type { Reward } from './types'
import { APPLIES_TO_WORDS, DISCOUNT_PHRASE_WORDS, DISCOUNT_TYPE_WORDS } from './words'
import { mediaUrl } from '../lib/api'

/**
 * The catalogue (spec 2026-10-21 §4.6): every reward as a card — its picture (release 2 §7), its cost, stock,
 * per-member limit, how often it was redeemed and fulfilled, whether it is offered. Staff who may manage offers add
 * and change them.
 */
export function CatalogueTab({ manage }: { manage: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const query = useQuery({ queryKey: CATALOGUE_KEY, queryFn: rewardsApi.catalogue })
  const [editing, setEditing] = useState<{ reward: Reward | null } | null>(null)
  const data = query.data

  return (
    <>
      <TabHead line={<>
        <p>{t('loyalty.rewards.catalogue.line', 'What members can spend their points on.')}</p>
        {!manage && <p data-read-only="">{t('loyalty.rewards.catalogue.read_only', 'Only staff allowed to manage offers can add or change rewards.')}</p>}
      </>}>
        {manage && data && (
          <Button size="sm" onClick={() => setEditing({ reward: null })}><Plus size={15} aria-hidden />{t('loyalty.rewards.catalogue.add', 'Add reward')}</Button>
        )}
      </TabHead>

      {query.isError && !data && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
      {!data && query.isLoading && <Loading />}
      {data && data.rewards.length === 0 && <Empty>{t('loyalty.rewards.catalogue.none', 'The catalogue is empty. Rewards added here show in the member app and the portal.')}</Empty>}
      {data && data.rewards.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.rewards.map(reward => (
            <RewardCard key={reward.id} reward={reward} manage={manage} locale={locale} timeZone={boot.venue.timezone} onEdit={() => setEditing({ reward })} />
          ))}
        </ul>
      )}

      {data && editing && <RewardDialog reward={editing.reward} options={data.options} onClose={() => setEditing(null)} />}
    </>
  )
}

/** One reward as a card. */
export function RewardCard({ reward: r, manage, locale, timeZone, onEdit }: { reward: Reward; manage: boolean; locale: string; timeZone: string; onEdit: () => void }) {
  const { t } = useTranslation()
  const currency = useBoot().venue.currency
  const stock = stockOf(r.stock)
  const discount = rewardDiscount(r)
  const phrase = discount ? named('loyalty.rewards.discount_phrase', DISCOUNT_PHRASE_WORDS, discount.type) : null
  const kind = discount && !phrase ? named('loyalty.rewards.discount_type', DISCOUNT_TYPE_WORDS, discount.type) : null
  const scope = r.applies_to !== 'all' ? named('loyalty.rewards.applies_to', APPLIES_TO_WORDS, r.applies_to) : null
  const discountText = discount && [
    phrase ? t(...phrase, { amount: amountOf(discount.type, discount.amount, currency, locale) }) : `${kind ? t(...kind) : discount.type} ${amountOf(discount.type, discount.amount, currency, locale)}`,
    scope ? t(...scope) : r.applies_to !== 'all' ? r.applies_to : null,
  ].filter(Boolean).join(' · ')

  return (
    <li data-reward={r.id} className="flex flex-col gap-3 rounded-2xl border border-a-border bg-a-surface p-4">
      {r.image_url && <img src={mediaUrl(r.image_url)} alt={r.name} loading="lazy" className="aspect-[16/9] w-full rounded-xl bg-a-surface-2 object-cover" />}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          {r.category && <Eyebrow>{r.category}</Eyebrow>}
          <p className="font-medium text-a-text">{r.name}</p>
        </div>
        <ToneBadge tone={activeTone(r.is_active)}>{r.is_active ? t('loyalty.rewards.catalogue.offered', 'Offered') : t('loyalty.rewards.switched_off', 'Switched off')}</ToneBadge>
      </div>
      <p className="font-a-display text-3xl font-light tabular-nums text-a-text">{t('loyalty.common.points_count', '{{points}} pts', { points: points(r.points_cost, locale) })}</p>
      {r.description && <p className="line-clamp-2 text-sm text-a-text-2">{r.description}</p>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <dt className="text-xs text-a-text-2">{t('loyalty.rewards.catalogue.stock', 'Stock')}</dt>
          <dd className={`text-sm font-semibold tabular-nums ${stock === 'none' ? 'l-minus' : 'text-a-text'}`}>
            {stock === 'unlimited' ? t('loyalty.rewards.no_limit', 'No limit') : stock === 'none' ? t('loyalty.rewards.catalogue.none_left', 'None left') : points(r.stock ?? 0, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-a-text-2">{t('loyalty.rewards.catalogue.per_member', 'Per member')}</dt>
          <dd className="text-sm font-semibold tabular-nums text-a-text">{r.per_member_limit === null ? t('loyalty.rewards.no_limit', 'No limit') : points(r.per_member_limit, locale)}</dd>
        </div>
        <div>
          <dt className="text-xs text-a-text-2">{t('loyalty.rewards.catalogue.redeemed', 'Redeemed')}</dt>
          <dd className="text-sm font-semibold tabular-nums text-a-text">{points(r.redeemed, locale)}</dd>
        </div>
        <div>
          <dt className="text-xs text-a-text-2">{t('loyalty.rewards.catalogue.fulfilled', 'Fulfilled')}</dt>
          <dd className="text-sm font-semibold tabular-nums text-a-text">{points(r.fulfilled, locale)}</dd>
        </div>
      </dl>
      {discountText && <p className="text-sm text-a-text">{discountText}</p>}
      {r.expires_at && <p className="text-xs text-a-text-2">{t('loyalty.rewards.catalogue.until', 'Offered until {{when}}', { when: when(r.expires_at, locale, timeZone) })}</p>}
      {manage && (
        <div className="mt-auto pt-1">
          <Button size="sm" variant="secondary" onClick={onEdit}>
            <Pencil size={14} aria-hidden />{t('loyalty.rewards.edit', 'Edit')}<span className="sr-only"> {r.name}</span>
          </Button>
        </div>
      )}
    </li>
  )
}
