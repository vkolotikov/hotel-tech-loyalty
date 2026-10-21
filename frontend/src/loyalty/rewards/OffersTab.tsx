import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Star } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import type { ThemeName } from '../../workspace/theme/accent'
import { formatDate } from '../../workspace/lib/wallClock'
import { useBoot } from '../LoyaltyProvider'
import { amountOf, points } from '../lib/format'
import { useLook } from '../lib/look'
import type { TierRef } from '../lib/types'
import { ToneBadge } from '../ui/formParts'
import { chosenTiers, named } from '../lib/forms'
import { TierChip } from '../ui/TierChip'
import { OFFERS_KEY, rewardsApi } from './api'
import { OfferDialog } from './OfferDialog'
import { Empty, LoadFailed, Loading, TabHead } from './parts'
import { offerState, offerTone, offerValue } from './rewardsMath'
import type { Offer } from './types'
import { APPLIES_TO_WORDS, OFFER_STATE_WORDS, OFFER_TYPE_WORDS, OFFER_VALUE_WORDS } from './words'

const DAY: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }

/**
 * Offers (spec 2026-10-21 §4.6): each with its kind and value, code, the venue days it runs, the tiers that see it,
 * how often it was used, and whether it is running. Staff who may manage offers add and change them.
 */
export function OffersTab({ manage }: { manage: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const look = useLook()
  const query = useQuery({ queryKey: OFFERS_KEY, queryFn: rewardsApi.offers })
  const [editing, setEditing] = useState<{ offer: Offer | null } | null>(null)
  const data = query.data

  return (
    <>
      <TabHead line={<>
        <p>{t('loyalty.rewards.offers.line', 'Special offers members see in the app and the portal.')}</p>
        {!manage && <p data-read-only="">{t('loyalty.rewards.offers.read_only', 'Only staff allowed to manage offers can add or change them.')}</p>}
      </>}>
        {manage && data && (
          <Button size="sm" onClick={() => setEditing({ offer: null })}><Plus size={15} aria-hidden />{t('loyalty.rewards.offers.add', 'Add offer')}</Button>
        )}
      </TabHead>

      {query.isError && !data && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
      {!data && query.isLoading && <Loading />}
      {data && data.offers.length === 0 && <Empty>{t('loyalty.rewards.offers.none', 'No offers yet.')}</Empty>}
      {data && data.offers.length > 0 && (
        <ul className="divide-y divide-a-border overflow-hidden rounded-2xl border border-a-border bg-a-surface">
          {data.offers.map(offer => (
            <OfferRow key={offer.id} offer={offer} tiers={boot.programme.tiers} manage={manage} theme={look.resolved} locale={locale} onEdit={() => setEditing({ offer })} />
          ))}
        </ul>
      )}

      {data && editing && <OfferDialog offer={editing.offer} options={data.options} onClose={() => setEditing(null)} />}
    </>
  )
}

/** One offer as a row. */
export function OfferRow({ offer: o, tiers, manage, theme, locale, onEdit }: {
  offer: Offer; tiers: TierRef[]; manage: boolean; theme: ThemeName; locale: string; onEdit: () => void
}) {
  const { t } = useTranslation()
  const currency = useBoot().venue.currency
  const state = offerState(o.state)
  const type = named('loyalty.rewards.offer_type', OFFER_TYPE_WORDS, o.type)
  const shown = offerValue(o.type, o.value, Object.keys(OFFER_VALUE_WORDS))
  const scope = o.applies_to !== 'all' ? named('loyalty.rewards.applies_to', APPLIES_TO_WORDS, o.applies_to) : null
  const kind = [
    type ? t(...type) : o.type,
    shown === 'phrase' ? t(`loyalty.rewards.offer_value.${o.type}`, OFFER_VALUE_WORDS[o.type], { value: amountOf(o.type, o.value, currency, locale) }) : shown === 'number' ? amountOf(o.type, o.value, currency, locale) : null,
    scope ? t(...scope) : o.applies_to !== 'all' ? o.applies_to : null,
  ].filter(Boolean).join(' · ')
  const days = o.start_date && o.end_date
    ? t('loyalty.rewards.offers.dates', '{{from}} – {{to}}', { from: formatDate(o.start_date, locale, DAY), to: formatDate(o.end_date, locale, DAY) })
    : null
  const used = o.usage_limit === null
    ? t('loyalty.rewards.offers.used', 'Used: {{used}}', { used: points(o.times_used, locale) })
    : t('loyalty.rewards.offers.used_of', 'Used: {{used}} of {{limit}}', { used: points(o.times_used, locale), limit: points(o.usage_limit, locale) })
  const perMember = o.per_member_limit !== null ? t('loyalty.rewards.offers.per_member', 'Up to {{limit}} per member', { limit: points(o.per_member_limit, locale) }) : null
  const chosen = chosenTiers(o.tier_ids, tiers)

  return (
    <li data-offer={o.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex items-center gap-1.5 font-medium text-a-text">
          {o.title}
          {o.is_featured && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-a-accent-text">
              <Star size={13} aria-hidden className="fill-current" />{t('loyalty.rewards.offers.featured', 'Featured')}
            </span>
          )}
        </p>
        <p className="text-sm text-a-text">{kind}</p>
        <p className="text-xs text-a-text-2">
          {[days, used, perMember].filter(Boolean).join(' · ')}
          {o.code && <> · <span className="font-a-mono font-semibold text-a-text">{o.code}</span></>}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {chosen.length === 0
            ? <span className="text-xs text-a-text-2">{t('loyalty.rewards.offers.every_tier', 'Every tier')}</span>
            : chosen.map(tier => <TierChip key={tier.id} tier={tier} theme={theme} size="sm" />)}
        </div>
      </div>
      <ToneBadge tone={offerTone(state)}>{t(`loyalty.rewards.offer_state.${state}`, OFFER_STATE_WORDS[state])}</ToneBadge>
      {manage && (
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil size={14} aria-hidden />{t('loyalty.rewards.edit', 'Edit')}<span className="sr-only"> {o.title}</span>
        </Button>
      )}
    </li>
  )
}
