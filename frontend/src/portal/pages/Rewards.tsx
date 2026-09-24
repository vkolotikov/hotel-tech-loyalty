import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePortal } from '../PortalProvider'
import { Tabs } from '../ui/Tabs'
import { BenefitsTab } from './rewards/BenefitsTab'
import { CatalogueTab } from './rewards/CatalogueTab'
import { OffersTab } from './rewards/OffersTab'
import { CodesTab } from './rewards/CodesTab'

const TABS = ['benefits', 'catalogue', 'offers', 'codes'] as const
type Tab = (typeof TABS)[number]

/** One destination for everything the level earns; the tab survives reload via ?tab=. */
export function Rewards() {
  const { t } = useTranslation()
  const { data } = usePortal()
  const [params, setParams] = useSearchParams()
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'benefits'

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-p-display text-2xl">{t('portal.rewards.title', 'Rewards')}</h1>
        {data?.member && (
          <span className="text-sm text-p-text-2">{t('portal.rewards.you_have', 'You have {{count}} points', { count: data.member.current_points })}</span>
        )}
      </div>
      <Tabs
        value={tab}
        onChange={key => setParams({ tab: key }, { replace: true })}
        items={[
          { key: 'benefits', label: t('portal.rewards.tab_benefits', 'Benefits') },
          { key: 'catalogue', label: t('portal.rewards.tab_catalogue', 'Catalogue') },
          { key: 'offers', label: t('portal.rewards.tab_offers', 'Offers') },
          { key: 'codes', label: t('portal.rewards.tab_codes', 'My codes') },
        ]}
      />
      {tab === 'benefits' && <BenefitsTab />}
      {tab === 'catalogue' && <CatalogueTab />}
      {tab === 'offers' && <OffersTab />}
      {tab === 'codes' && <CodesTab />}
    </div>
  )
}
