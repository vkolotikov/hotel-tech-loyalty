import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarClock, CircleCheck, Gift, Package, Pencil, Percent, Plus, Ticket, UserRound, type LucideIcon } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Eyebrow } from '../../workspace/ui/Typography'
import { useBoot } from '../LoyaltyProvider'
import { amountOf, points, when } from '../lib/format'
import { Toggle, ToneBadge } from '../ui/formParts'
import { activeTone } from '../program/programMath'
import { named } from '../lib/forms'
import { CATALOGUE_KEY, rewardsApi } from './api'
import { Empty, LoadFailed, Loading, TabHead } from './parts'
import { RewardDialog } from './RewardDialog'
import { CATALOGUE_SHOWS, catalogueCounts, catalogueShown, rewardDiscount, stockOf, type CatalogueShow } from './rewardsMath'
import type { Reward } from './types'
import { APPLIES_TO_WORDS, DISCOUNT_PHRASE_WORDS, DISCOUNT_TYPE_WORDS } from './words'
import { mediaUrl } from '../lib/api'
import { GetStarted } from '../ui/GetStarted'

/**
 * The catalogue (spec 2026-10-21 §4.6): every reward as a card — its picture (release 2 §7), its cost, stock,
 * per-member limit, how often it was redeemed and fulfilled, whether it is offered. Staff who may manage offers add
 * and change them. Design pass 2026-10-26: a filter (every reward, the offered ones, the switched-off ones) and cards of
 * one shape — a picture or its stand-in in the rewards' colour with the cost on it, then the four figures as small
 * tiles with their icons.
 */
export function CatalogueTab({ manage }: { manage: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const query = useQuery({ queryKey: CATALOGUE_KEY, queryFn: rewardsApi.catalogue })
  const [editing, setEditing] = useState<{ reward: Reward | null } | null>(null)
  const [show, setShow] = useState<CatalogueShow>('all')
  const data = query.data
  const counts = data ? catalogueCounts(data.rewards) : null
  const shown = data ? catalogueShown(data.rewards, show) : []
  const showWords: Record<CatalogueShow, string> = {
    all: t('loyalty.rewards.catalogue.all', 'All'),
    offered: t('loyalty.rewards.catalogue.offered', 'Offered'),
    off: t('loyalty.rewards.switched_off', 'Switched off'),
  }

  return (
    <>
      <TabHead line={<>
        <p>{t('loyalty.rewards.catalogue.line', 'What members can spend their points on.')}</p>
        {!manage && <p data-read-only="">{t('loyalty.rewards.catalogue.read_only', 'Only staff allowed to manage offers can add or change rewards.')}</p>}
      </>}>
        {/* An empty catalogue's Get started panel holds the one action. */}
        {manage && data && data.rewards.length > 0 && (
          <Button size="sm" onClick={() => setEditing({ reward: null })}><Plus size={15} aria-hidden />{t('loyalty.rewards.catalogue.add', 'Add reward')}</Button>
        )}
      </TabHead>

      {query.isError && !data && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
      {!data && query.isLoading && <Loading />}
      {data && data.rewards.length === 0 && (
        // Release 10 (the owner's Figma): the empty catalogue teaches how to start, in the rewards' colour.
        <GetStarted name="rewards" hue="gift" who={null} title={t('loyalty.rewards.get_started.catalogue.title', 'Add your first reward')}
          line={t('loyalty.rewards.get_started.catalogue.line', 'Rewards are what members spend their points on. They show in the member app and the portal.')}
          steps={[
              { title: t('loyalty.rewards.get_started.catalogue.s1_title', 'Name it and set its cost'), line: t('loyalty.rewards.get_started.catalogue.s1_line', 'A free coffee for 200 points, a treatment for 2,000.') },
              { title: t('loyalty.rewards.get_started.catalogue.s2_title', 'Add a picture'), line: t('loyalty.rewards.get_started.catalogue.s2_line', 'Optional, but a photo helps members choose.') },
              { title: t('loyalty.rewards.get_started.catalogue.s3_title', 'Hand it over at the desk'), line: t('loyalty.rewards.get_started.catalogue.s3_line', 'Members get a code; staff hand the reward over on Redemptions.') },
            ]}
          action={manage && <Button onClick={() => setEditing({ reward: null })}><Plus size={15} aria-hidden />{t('loyalty.rewards.catalogue.add', 'Add reward')}</Button>} />
      )}
      {data && counts && data.rewards.length > 0 && (
        <>
          <div role="group" aria-label={t('loyalty.rewards.catalogue.show', 'Show')} className="flex flex-wrap gap-2">
            {CATALOGUE_SHOWS.map(name => (
              <Toggle key={name} on={show === name} onClick={() => setShow(name)}>
                {showWords[name]}<span className="tabular-nums text-a-text-2">{points(counts[name], locale)}</span>
              </Toggle>
            ))}
          </div>
          {shown.length === 0
            ? <Empty>{t('loyalty.rewards.catalogue.none_shown', 'No rewards here.')}</Empty>
            : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {shown.map(reward => (
                  <RewardCard key={reward.id} reward={reward} manage={manage} locale={locale} timeZone={boot.venue.timezone} onEdit={() => setEditing({ reward })} />
                ))}
              </ul>
            )}
        </>
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

  const stockText = stock === 'unlimited' ? t('loyalty.rewards.no_limit', 'No limit') : stock === 'none' ? t('loyalty.rewards.catalogue.none_left', 'None left') : points(r.stock ?? 0, locale)

  return (
    <li data-reward={r.id} data-hue={r.is_active ? 'gift' : 'off'} className="flex flex-col overflow-hidden rounded-2xl border border-a-border bg-a-surface">
      <div className="l-hue-fade relative h-24 shrink-0 sm:h-32">
        {r.image_url
          ? <img src={mediaUrl(r.image_url)} alt={r.name} loading="lazy" className={`h-full w-full object-cover ${r.is_active ? '' : 'grayscale'}`} />
          : <span aria-hidden className="l-hue-text absolute inset-0 flex items-center justify-center"><Gift size={40} strokeWidth={1.5} /></span>}
        {/* On the surface, so the badge reads over any picture. */}
        <span className="absolute left-3 top-3 rounded-full bg-a-surface shadow-a-sm">
          <ToneBadge tone={activeTone(r.is_active)}>{r.is_active ? t('loyalty.rewards.catalogue.offered', 'Offered') : t('loyalty.rewards.switched_off', 'Switched off')}</ToneBadge>
        </span>
        <span className="absolute bottom-3 left-3 rounded-full bg-a-surface px-3 py-1 font-a-display text-xl tabular-nums text-a-text shadow-a-sm">
          {t('loyalty.common.points_count', '{{points}} pts', { points: points(r.points_cost, locale) })}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          {r.category && <Eyebrow>{r.category}</Eyebrow>}
          <p className="font-semibold text-a-text">{r.name}</p>
          {r.description && <p className="line-clamp-2 text-sm text-a-text-2">{r.description}</p>}
        </div>
        {discountText && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-a-text"><Percent size={14} aria-hidden className="l-hue-text shrink-0" />{discountText}</p>
        )}
        <dl className="grid grid-cols-2 gap-2">
          <Figure icon={Package} label={t('loyalty.rewards.catalogue.stock', 'Stock')} value={stockText} warn={stock === 'none'} />
          <Figure icon={UserRound} label={t('loyalty.rewards.catalogue.per_member', 'Per member')} value={r.per_member_limit === null ? t('loyalty.rewards.no_limit', 'No limit') : points(r.per_member_limit, locale)} />
          <Figure icon={Ticket} label={t('loyalty.rewards.catalogue.redeemed', 'Redeemed')} value={points(r.redeemed, locale)} />
          <Figure icon={CircleCheck} label={t('loyalty.rewards.catalogue.fulfilled', 'Fulfilled')} value={points(r.fulfilled, locale)} />
        </dl>
        {r.expires_at && (
          <p className="flex items-center gap-1.5 text-xs text-a-text-2">
            <CalendarClock size={13} aria-hidden className="shrink-0" />{t('loyalty.rewards.catalogue.until', 'Offered until {{when}}', { when: when(r.expires_at, locale, timeZone) })}
          </p>
        )}
        {manage && (
          <div className="mt-auto pt-1">
            <Button size="sm" variant="secondary" onClick={onEdit}>
              <Pencil size={14} aria-hidden />{t('loyalty.rewards.edit', 'Edit')}<span className="sr-only"> {r.name}</span>
            </Button>
          </div>
        )}
      </div>
    </li>
  )
}

/** One of a reward's figures as a small tile: its icon, its name, its value (in the minus colour when none is left). */
function Figure({ icon: Icon, label, value, warn = false }: { icon: LucideIcon; label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-a-surface-2 px-3 py-2">
      <dt className="flex items-center gap-1.5 text-xs text-a-text-2"><Icon size={13} aria-hidden className="shrink-0" />{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums ${warn ? 'l-minus' : 'text-a-text'}`}>{value}</dd>
    </div>
  )
}
