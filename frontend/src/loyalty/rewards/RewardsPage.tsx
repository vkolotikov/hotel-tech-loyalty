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
import { REWARD_TABS, rewardsActions, searchFor, tabFrom, type RewardTab } from './rewardsMath'
import { TAB_CAPTION_WORDS, TAB_WORDS } from './words'
import { SectionCards, SectionCount } from '../ui/SectionCards'
import type { Hue } from '../ui/sections'

const TAB_ICONS: Record<RewardTab, LucideIcon> = { catalogue: Gift, redemptions: Ticket, offers: Tag, referrals: Users }
/** Each tab's colour (release 10): rewards amber, codes at the desk teal, offers blue, referrals rose. */
const TAB_HUE: Record<RewardTab, Hue> = { catalogue: 'gift', redemptions: 'place', offers: 'offer', referrals: 'bonus' }

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
      <PageHeader stacked title={t('loyalty.rewards.title', 'Rewards')} line={t('loyalty.rewards.line', 'What members spend their points on, the codes they bring to the desk, and the offers and referrals that bring them back.')} />

      <SectionCards label={t('loyalty.rewards.tabs', 'Rewards areas')} idPrefix="rewards-tab" panelId="rewards-panel" value={tab} onChange={go}
        items={REWARD_TABS.map(name => {
          const count = counts[name]
          return {
            id: name, icon: TAB_ICONS[name], hue: TAB_HUE[name],
            title: t(`loyalty.rewards.tab.${name}`, TAB_WORDS[name]),
            caption: t(`loyalty.rewards.tab_caption.${name}`, TAB_CAPTION_WORDS[name]),
            // The codes waiting at the desk in the waiting colour, only when some wait; every other tab its count.
            badge: count === null ? undefined : name === 'redemptions'
              ? (count > 0 ? <SectionCount waiting value={points(count, locale)} waitingLabel={t('loyalty.rewards.tab_waiting', 'waiting at the desk')} /> : undefined)
              : <SectionCount value={points(count, locale)} />,
          }
        })} />

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
