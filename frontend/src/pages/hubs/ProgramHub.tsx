import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Crown, Award, Zap } from 'lucide-react'
import { HubTabs } from '../../components/HubTabs'

const Tiers           = lazy(() => import('../Tiers').then(m => ({ default: m.Tiers })))
const Benefits        = lazy(() => import('../Benefits').then(m => ({ default: m.Benefits })))
const EarnRateEvents  = lazy(() => import('../EarnRateEvents').then(m => ({ default: m.EarnRateEvents })))

const fallback = <div className="text-center text-[#636366] py-8 text-sm">Loading…</div>

export function ProgramHub() {
  const { t } = useTranslation()
  return (
    <HubTabs
      title={t('programHub.title', 'Loyalty program')}
      subtitle={t('programHub.subtitle', 'The rules of the program — who qualifies for what, and when bonus points apply.')}
      tabs={[
        {
          key: 'tiers',
          label: t('programHub.tabs.tiers', 'Tiers'),
          icon: <Crown size={15} />,
          description: t('programHub.tabs.tiers_desc', 'Tier definitions, qualification rules, and the live preview calculator.'),
          render: () => <Suspense fallback={fallback}><Tiers /></Suspense>,
        },
        {
          key: 'benefits',
          label: t('programHub.tabs.benefits', 'Benefits'),
          icon: <Award size={15} />,
          description: t('programHub.tabs.benefits_desc', 'Reusable benefit definitions assigned to tiers.'),
          render: () => <Suspense fallback={fallback}><Benefits /></Suspense>,
        },
        {
          key: 'boost-events',
          label: t('programHub.tabs.boost', 'Boost events'),
          icon: <Zap size={15} />,
          description: t('programHub.tabs.boost_desc', 'Time-bounded earn-rate multipliers ("Double points weekend"). Highest match wins, no stacking.'),
          render: () => <Suspense fallback={fallback}><EarnRateEvents /></Suspense>,
        },
      ]}
    />
  )
}
