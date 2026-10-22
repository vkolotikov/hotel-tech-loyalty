import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { useBoot } from '../LoyaltyProvider'
import { CampaignsTab } from './CampaignsTab'
import { CAMPAIGN_TABS, searchFor, tabAfter, tabFrom, type CampaignTab } from './campaignsMath'
import { SegmentsTab } from './SegmentsTab'
import { TAB_WORDS } from './words'
import { PushTab } from '../push/PushTab'
import { SmsTab } from '../sms/SmsTab'

/**
 * Campaigns (spec 2026-10-21 release 2 §6), a manager's area: email campaigns to the programme's members, and the
 * segments they are sent to. The tab lives in the address (`?tab=segments`). Without the plan's `campaigns` feature
 * the Campaigns tab says so calmly and Segments still work (the campaigns routes answer 402 `feature_locked`).
 */
export function CampaignsPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const location = useLocation()
  const navigate = useNavigate()
  const tab = tabFrom(location.search)
  const go = (next: CampaignTab) => navigate({ pathname: '/loyalty/campaigns', search: searchFor(next) }, { replace: true })

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader title={t('loyalty.campaigns.title', 'Campaigns')} line={t('loyalty.campaigns.line', 'Email, push messages and SMS to your members, and the segments you send them to.')} />

      {!boot.staff.can.manage_campaigns ? (
        <div className="max-w-xl">
          <Notice tone="info">{t('loyalty.campaigns.managers_only', 'Only an owner or a manager can work with campaigns and segments.')}</Notice>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label={t('loyalty.campaigns.tabs', 'Campaigns areas')} className="flex flex-wrap gap-2">
            {CAMPAIGN_TABS.map(name => (
              // One tab stop; the arrow keys, Home and End move between the tabs.
              <button key={name} type="button" role="tab" id={`campaigns-tab-${name}`} aria-selected={tab === name} aria-controls="campaigns-panel"
                tabIndex={tab === name ? 0 : -1} onClick={() => go(name)} onKeyDown={(e) => {
                  const next = tabAfter(tab, e.key)
                  if (next === null) return
                  e.preventDefault()
                  go(next)
                  document.getElementById(`campaigns-tab-${next}`)?.focus()
                }}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium ${tab === name ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
                {t(`loyalty.campaigns.tab.${name}`, TAB_WORDS[name])}
              </button>
            ))}
          </div>

          <div id="campaigns-panel" role="tabpanel" aria-labelledby={`campaigns-tab-${tab}`} className="space-y-4">
            {tab === 'campaigns' && (boot.features.campaigns ? <CampaignsTab /> : (
              <div className="max-w-xl space-y-2" data-plan-locked="">
                <Notice tone="info">
                  {t('loyalty.campaigns.plan_locked', 'Your plan does not include email campaigns. Segments still work here.')}
                </Notice>
              </div>
            ))}
            {tab === 'segments' && <SegmentsTab />}
            {tab === 'push' && <PushTab />}
            {tab === 'sms' && <SmsTab />}
          </div>
        </>
      )}
    </div>
  )
}
