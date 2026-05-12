import { lazy, Suspense } from 'react'
import { Sparkles, Gift, UserPlus } from 'lucide-react'
import { HubTabs } from '../../components/HubTabs'

const Rewards    = lazy(() => import('../Rewards').then(m => ({ default: m.Rewards })))
const Offers     = lazy(() => import('../Offers').then(m => ({ default: m.Offers })))
const Referrals  = lazy(() => import('../Referrals').then(m => ({ default: m.Referrals })))

const fallback = <div className="text-center text-[#636366] py-8 text-sm">Loading…</div>

export function RewardsHub() {
  return (
    <HubTabs
      title="Rewards & offers"
      subtitle="What members can earn, redeem, and invite others for."
      tabs={[
        {
          key: 'catalog',
          label: 'Rewards catalog',
          icon: <Sparkles size={15} />,
          description: 'Self-serve catalog members spend their points on. Stock + per-member limits enforced atomically.',
          render: () => <Suspense fallback={fallback}><Rewards /></Suspense>,
        },
        {
          key: 'offers',
          label: 'Offers',
          icon: <Gift size={15} />,
          description: 'Targeted promotions surfaced in the mobile app and member emails.',
          render: () => <Suspense fallback={fallback}><Offers /></Suspense>,
        },
        {
          key: 'referrals',
          label: 'Referrals',
          icon: <UserPlus size={15} />,
          description: 'Member-to-member invites — bonuses awarded automatically when a new member registers using a code.',
          render: () => <Suspense fallback={fallback}><Referrals /></Suspense>,
        },
      ]}
    />
  )
}
