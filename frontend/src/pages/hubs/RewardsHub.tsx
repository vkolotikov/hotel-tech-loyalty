import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Gift, UserPlus } from 'lucide-react'
import { HubTabs } from '../../components/HubTabs'

const Rewards    = lazy(() => import('../Rewards').then(m => ({ default: m.Rewards })))
const Offers     = lazy(() => import('../Offers').then(m => ({ default: m.Offers })))
const Referrals  = lazy(() => import('../Referrals').then(m => ({ default: m.Referrals })))

const fallback = <div className="text-center text-[#636366] py-8 text-sm">Loading…</div>

export function RewardsHub() {
  const { t } = useTranslation()
  return (
    <HubTabs
      title={t('rewardsHub.title', 'Rewards & offers')}
      subtitle={t('rewardsHub.subtitle', 'What members can earn, redeem, and invite others for.')}
      tabs={[
        {
          key: 'catalog',
          label: t('rewardsHub.tabs.catalog', 'Rewards catalog'),
          icon: <Sparkles size={15} />,
          description: t('rewardsHub.tabs.catalog_desc', 'Self-serve catalog members spend their points on. Stock + per-member limits enforced atomically.'),
          render: () => <Suspense fallback={fallback}><Rewards /></Suspense>,
        },
        {
          key: 'offers',
          label: t('rewardsHub.tabs.offers', 'Offers'),
          icon: <Gift size={15} />,
          description: t('rewardsHub.tabs.offers_desc', 'Targeted promotions surfaced in the mobile app and member emails.'),
          render: () => <Suspense fallback={fallback}><Offers /></Suspense>,
        },
        {
          key: 'referrals',
          label: t('rewardsHub.tabs.referrals', 'Referrals'),
          icon: <UserPlus size={15} />,
          description: t('rewardsHub.tabs.referrals_desc', 'Member-to-member invites — bonuses awarded automatically when a new member registers using a code.'),
          render: () => <Suspense fallback={fallback}><Referrals /></Suspense>,
        },
      ]}
    />
  )
}
