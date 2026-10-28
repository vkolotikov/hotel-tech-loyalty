import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../workspace/ui/Notice'
import { Button } from '../../workspace/ui/Button'
import { formatDate } from '../../workspace/lib/wallClock'
import { useBoot } from '../LoyaltyProvider'
import { CampaignsTab } from './CampaignsTab'
import { tabFrom, campaignPath } from './campaignsMath'
import { SegmentsTab } from './SegmentsTab'
import { PushTab } from '../push/PushTab'
import { SmsTab } from '../sms/SmsTab'
import { afterCampaignChange, campaignKey, campaignsApi } from './api'
import { failureOf } from '../lib/api'
import { Refusal } from './parts'
import { CampaignChannels, CampaignHeading } from './design/CampaignUI'
import { useCampaignWords } from './design/words'

export function CampaignsPage() {
  const { t, i18n } = useTranslation(), w = useCampaignWords(), boot = useBoot()
  const location = useLocation(), navigate = useNavigate(), client = useQueryClient()
  const tab = tabFrom(location.search)
  const create = useMutation({ mutationFn: () => campaignsApi.createCampaign(t('loyalty.campaigns.list.new_name', 'New campaign, {{day}}', { day: formatDate(boot.venue.today, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }) })), onSuccess: answer => { client.setQueryData(campaignKey(answer.campaign.id), answer); afterCampaignChange(client, null); navigate(campaignPath(answer.campaign.id)) } })
  return <div className="l-cm-page"><CampaignHeading title={t('loyalty.campaigns.title', 'Campaigns')} line={w('line')}>{boot.staff.can.manage_campaigns && <><Link className="l-ov-button" to="/loyalty/campaigns?tab=segments">{w('manage')}</Link>{tab === 'campaigns' && boot.features.campaigns && <Button className="l-ov-button l-ov-primary" loading={create.isPending} onClick={() => create.mutate()}>{w('createEmail')}</Button>}</>}</CampaignHeading>
    {!boot.staff.can.manage_campaigns ? <Notice tone="info">{t('loyalty.campaigns.managers_only', 'Only an owner or a manager can work with campaigns and segments.')}</Notice> : <><CampaignChannels tab={tab} />{create.isError && <Refusal family="create" failure={failureOf(create.error)} />}<div className="l-cm-channel-body">
      {tab === 'campaigns' && (boot.features.campaigns ? <CampaignsTab /> : <Notice tone="info">{t('loyalty.campaigns.plan_locked', 'Your plan does not include email campaigns. Segments still work here.')}</Notice>)}
      {tab === 'segments' && <SegmentsTab />}{tab === 'push' && <PushTab />}{tab === 'sms' && <SmsTab />}
    </div><small>{w('channelNote')}</small></>}
  </div>
}
