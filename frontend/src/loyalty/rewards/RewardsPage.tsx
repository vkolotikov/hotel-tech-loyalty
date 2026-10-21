import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { useBoot } from '../LoyaltyProvider'
import { CatalogueTab } from './CatalogueTab'
import { OffersTab } from './OffersTab'
import { RedemptionsTab } from './RedemptionsTab'
import { ReferralsTab } from './ReferralsTab'
import { REWARD_TABS, rewardsActions, searchFor, tabAfter, tabFrom, type RewardTab } from './rewardsMath'
import { TAB_WORDS } from './words'

/**
 * Rewards (spec 2026-10-21 §4.6): the catalogue members spend points on, the redemption codes they bring to the desk,
 * the offers and the referrals. The tab lives in the address (`?tab=`), so a link opens the same one. Staff see every
 * tab; the actions are for whoever the server would let do them (§5).
 */
export function RewardsPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const location = useLocation()
  const navigate = useNavigate()
  const tab = tabFrom(location.search)
  const actions = rewardsActions(boot.staff.can)
  const go = (next: RewardTab) => navigate({ pathname: '/loyalty/rewards', search: searchFor(next) }, { replace: true })

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader title={t('loyalty.rewards.title', 'Rewards')} line={t('loyalty.rewards.line', 'What members spend their points on, and what brings them back.')} />

      <div role="tablist" aria-label={t('loyalty.rewards.tabs', 'Rewards areas')} className="flex flex-wrap gap-2">
        {REWARD_TABS.map(name => (
          // One tab stop; the arrow keys, Home and End move between the tabs.
          <button key={name} type="button" role="tab" id={`rewards-tab-${name}`} aria-selected={tab === name} aria-controls="rewards-panel"
            tabIndex={tab === name ? 0 : -1} onClick={() => go(name)} onKeyDown={(e) => {
              const next = tabAfter(tab, e.key)
              if (next === null) return
              e.preventDefault()
              go(next)
              document.getElementById(`rewards-tab-${next}`)?.focus()
            }}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium ${tab === name ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
            {t(`loyalty.rewards.tab.${name}`, TAB_WORDS[name])}
          </button>
        ))}
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
