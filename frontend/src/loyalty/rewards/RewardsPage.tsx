import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../workspace/ui/PageHeader'

/** Rewards (spec 2026-10-21 §4.6): the catalogue, redemptions, offers and referrals. */
export function RewardsPage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader title={t('loyalty.rewards.title', 'Rewards')} />
    </div>
  )
}
