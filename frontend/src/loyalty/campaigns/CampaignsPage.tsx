import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BellRing, Mail, MessageSquareText, UsersRound, type LucideIcon } from 'lucide-react'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { useBoot } from '../LoyaltyProvider'
import { CampaignsTab } from './CampaignsTab'
import { CAMPAIGN_TABS, searchFor, tabFrom, type CampaignTab } from './campaignsMath'
import { SegmentsTab } from './SegmentsTab'
import { TAB_CAPTION_WORDS, TAB_WORDS } from './words'
import { SectionCards } from '../ui/SectionCards'
import type { Hue } from '../ui/sections'
import { PushTab } from '../push/PushTab'
import { SmsTab } from '../sms/SmsTab'

const TAB_ICONS: Record<CampaignTab, LucideIcon> = { campaigns: Mail, segments: UsersRound, push: BellRing, sms: MessageSquareText }
/** Each tab's colour (release 10): emails blue, segments violet, push rose, SMS green. */
const TAB_HUE: Record<CampaignTab, Hue> = { campaigns: 'tier', segments: 'rule', push: 'bonus', sms: 'earn' }

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
      <PageHeader stacked title={t('loyalty.campaigns.title', 'Campaigns')} line={t('loyalty.campaigns.line', 'Email, push messages and SMS to your members, and the segments you send them to.')} />

      {!boot.staff.can.manage_campaigns ? (
        <div className="max-w-xl">
          <Notice tone="info">{t('loyalty.campaigns.managers_only', 'Only an owner or a manager can work with campaigns and segments.')}</Notice>
        </div>
      ) : (
        <>
          <SectionCards label={t('loyalty.campaigns.tabs', 'Campaigns areas')} idPrefix="campaigns-tab" panelId="campaigns-panel" value={tab} onChange={go}
            items={CAMPAIGN_TABS.map(name => ({
              id: name, icon: TAB_ICONS[name], hue: TAB_HUE[name],
              title: t(`loyalty.campaigns.tab.${name}`, TAB_WORDS[name]),
              caption: t(`loyalty.campaigns.tab_caption.${name}`, TAB_CAPTION_WORDS[name]),
            }))} />

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
