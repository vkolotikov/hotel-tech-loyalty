import { deniedRead } from './design/readState'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { campaignKey, campaignsApi } from './api'
import { CampaignEditor } from './CampaignEditor'
import { CampaignResults, ElsewhereDraft } from './CampaignResults'
import { isLive, SENDING_REFRESH_MS, viewOf } from './campaignsMath'
import { LoadFailed } from './parts'

/**
 * One campaign (`/loyalty/campaigns/<id>`, spec 2026-10-21 release 2 §6): a draft of the workspace's blocks opens in the
 * editor; the full admin's draft is shown with the way there; anything that went out shows its results, read again
 * every 10 s while it sends. Managers only, behind the plan's `campaigns` feature, as the server is.
 */
export function CampaignPage() {
  const { id: raw } = useParams()
  const id = Number(raw)
  const { t } = useTranslation()
  const boot = useBoot()
  const allowed = boot.staff.can.manage_campaigns && boot.features.campaigns
  const valid = Number.isInteger(id) && id > 0
  const query = useQuery({
    queryKey: campaignKey(id),
    queryFn: () => campaignsApi.campaign(id),
    enabled: valid && allowed,
    retry: false,
    refetchInterval: (q) => (isLive(q.state.data?.campaign.status ?? '') ? SENDING_REFRESH_MS : false),
  })

  const back = (
    <Link to="/loyalty/campaigns" className="inline-flex items-center gap-1 text-sm text-a-text-2 hover:text-a-text">
      <ArrowLeft size={15} aria-hidden />{t('loyalty.campaigns.back', 'All campaigns')}
    </Link>
  )
  const frame = (body: ReactNode) => <div className="l-cm-page">{back}{body}</div>

  if (!boot.staff.can.manage_campaigns) {
    return frame(<div className="max-w-xl"><Notice tone="info">{t('loyalty.campaigns.managers_only', 'Only an owner or a manager can work with campaigns and segments.')}</Notice></div>)
  }
  if (!boot.features.campaigns) {
    return frame(<div className="max-w-xl"><Notice tone="info">{t('loyalty.campaigns.plan_locked', 'Your plan does not include email campaigns. Segments still work here.')}</Notice></div>)
  }
  if (!valid || (query.isError && failureOf(query.error).status === 404)) {
    return frame(<div className="max-w-xl"><Notice tone="warning">{t('loyalty.campaigns.load.error.not_found', 'This campaign no longer exists.')}</Notice></div>)
  }
  if (query.isError && (!query.data || deniedRead(query.error))) return frame(<LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />)
  if (!query.data) {
    return frame(
      <div role="status" className="space-y-4">
        <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      </div>,
    )
  }

  const answer = query.data
  const view = viewOf(answer.campaign)
  if (view === 'editor') return <div className="l-cm-page"><CampaignEditor key={answer.campaign.id} answer={answer} /></div>
  return frame(
    view === 'elsewhere' ? <ElsewhereDraft campaign={answer.campaign} /> : <CampaignResults campaign={answer.campaign} />,
  )
}
