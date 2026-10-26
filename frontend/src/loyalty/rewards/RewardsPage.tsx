import { useLocation, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Gift, Tag, Ticket, Users, type LucideIcon } from 'lucide-react'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { useBoot } from '../LoyaltyProvider'
import { points } from '../lib/format'
import { CATALOGUE_KEY, OFFERS_KEY, redemptionsKey, referralsKey, rewardsApi } from './api'
import { CatalogueTab } from './CatalogueTab'
import { OffersTab } from './OffersTab'
import { RedemptionsTab } from './RedemptionsTab'
import { ReferralsTab } from './ReferralsTab'
import { REWARD_TABS, rewardsActions, searchFor, tabAfter, tabFrom, type RewardTab } from './rewardsMath'
import { TAB_WORDS } from './words'

const TAB_ICONS: Record<RewardTab, LucideIcon> = { catalogue: Gift, redemptions: Ticket, offers: Tag, referrals: Users }

/**
 * Rewards (spec 2026-10-21 §4.6): the catalogue members spend points on, the redemption codes they bring to the desk,
 * the offers and the referrals. The tab lives in the address (`?tab=`), so a link opens the same one. Staff see every
 * tab; the actions are for whoever the server would let do them (§5). Design pass 2026-10-26: each tab has its icon
 * and how many it holds — the redemptions tab the codes waiting at the desk, in the waiting colour — read from the same
 * answers the tabs show (one call each, shared through the query cache).
 */
export function RewardsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const location = useLocation()
  const navigate = useNavigate()
  const tab = tabFrom(location.search)
  const actions = rewardsActions(boot.staff.can)
  const go = (next: RewardTab) => navigate({ pathname: '/loyalty/rewards', search: searchFor(next) }, { replace: true })
  const counts = useTabCounts()

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader title={t('loyalty.rewards.title', 'Rewards')} />

      <div role="tablist" aria-label={t('loyalty.rewards.tabs', 'Rewards areas')} className="flex flex-wrap gap-2">
        {REWARD_TABS.map(name => {
          const Icon = TAB_ICONS[name]
          const on = tab === name
          const count = counts[name]
          const waiting = name === 'redemptions'
          return (
            // One tab stop; the arrow keys, Home and End move between the tabs.
            <button key={name} type="button" role="tab" id={`rewards-tab-${name}`} aria-selected={on} aria-controls="rewards-panel"
              tabIndex={on ? 0 : -1} onClick={() => go(name)} onKeyDown={(e) => {
                const next = tabAfter(tab, e.key)
                if (next === null) return
                e.preventDefault()
                go(next)
                document.getElementById(`rewards-tab-${next}`)?.focus()
              }}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border py-1.5 pl-3 pr-3.5 text-sm font-medium ${on ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
              <Icon size={15} aria-hidden />
              <span>{t(`loyalty.rewards.tab.${name}`, TAB_WORDS[name])}</span>
              {count !== null && (waiting
                ? count > 0 && (
                  // In the waiting colour; on the chosen tab it reads on the accent like the other counts.
                  <span data-tab-count="" data-state="pending" className={`rounded-full px-2 text-xs font-bold tabular-nums ${on ? 'bg-a-accent-ink/20' : 'l-st-tint l-st-text'}`}>
                    {points(count, locale)}<span className="sr-only"> {t('loyalty.rewards.tab_waiting', 'waiting at the desk')}</span>
                  </span>
                )
                : <span data-tab-count="" className={`rounded-full px-2 text-xs font-semibold tabular-nums ${on ? 'bg-a-accent-ink/20' : 'bg-a-surface-2 text-a-text-2'}`}>{points(count, locale)}</span>)}
            </button>
          )
        })}
      </div>

      <div id="rewards-panel" role="tabpanel" aria-labelledby={`rewards-tab-${tab}`} className="space-y-4">
        {tab === 'catalogue' && <CatalogueTab manage={actions.manage} />}
        {tab === 'redemptions' && <RedemptionsTab redeem={actions.redeem} />}
        {tab === 'offers' && <OffersTab manage={actions.manage} />}
        {tab === 'referrals' && <ReferralsTab />}
      </div>
    </div>
  )
}

/**
 * How many each tab holds: the catalogue's rewards, the codes waiting at the desk, the offers, the referrals. The same
 * calls (and keys) as the tabs' own first page, so opening a tab reads what is already here; null until it answers.
 */
function useTabCounts(): Record<RewardTab, number | null> {
  const catalogue = useQuery({ queryKey: CATALOGUE_KEY, queryFn: rewardsApi.catalogue })
  const pending = useQuery({ queryKey: redemptionsKey('pending', 1), queryFn: () => rewardsApi.redemptions('pending', 1), placeholderData: keepPreviousData })
  const offers = useQuery({ queryKey: OFFERS_KEY, queryFn: rewardsApi.offers })
  const referrals = useQuery({ queryKey: referralsKey(1), queryFn: () => rewardsApi.referrals(1), placeholderData: keepPreviousData })
  return {
    catalogue: catalogue.data?.rewards.length ?? null,
    redemptions: pending.data?.counts.pending ?? null,
    offers: offers.data?.offers.length ?? null,
    referrals: referrals.data?.figures.total ?? null,
  }
}
