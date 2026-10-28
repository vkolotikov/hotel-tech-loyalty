import { CampaignList } from '../campaigns/design/CampaignList'
import { deniedRead } from '../campaigns/design/readState'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { smsApi, smsKey } from './api'
import { LoadFailed } from './parts'
import { SmsEditor } from './SmsEditor'
import { SmsResults } from './SmsResults'
import { isLive, smsFrom, smsSearch, SMS_REFRESH_MS, viewOf } from './smsMath'

/**
 * SMS campaigns (spec 2026-10-22 release 4 §5, owner decision R4-4), the Campaigns page's fourth tab (`?tab=sms`), a
 * manager's: a short text to a segment's members who turned "Offers by SMS" on, through the venue's own Twilio
 * account. The list, newest first, with each campaign's state and how far it got, and — while the venue's Twilio
 * account is not set up — what to set and where; one campaign opens in the same tab (`?tab=sms&message=<id>`): a draft
 * in the editor, anything else in its results. Without the plan's `campaigns` feature the tab says so calmly (the SMS
 * routes answer 402 `feature_locked`).
 */
export function SmsTab() {
  const { t } = useTranslation()
  const boot = useBoot()
  const location = useLocation()
  if (!boot.features.campaigns) {
    return (
      <div className="max-w-xl space-y-2" data-plan-locked="">
        <Notice tone="info">{t('loyalty.sms.plan_locked', 'Your plan does not include campaigns, so SMS campaigns are not available either.')}</Notice>
      </div>
    )
  }
  const id = smsFrom(location.search)
  return id === null ? <CampaignList channel="sms" /> : <SmsPage key={id} id={id} />
}

/** One campaign, read again every 10 s while it sends. */
function SmsPage({ id }: { id: number }) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: smsKey(id),
    queryFn: () => smsApi.message(id),
    retry: false,
    refetchInterval: (q) => (isLive(q.state.data?.sms.status ?? '') ? SMS_REFRESH_MS : false),
  })

  const back = (
    <Link to={{ pathname: '/loyalty/campaigns', search: smsSearch(null) }} className="inline-flex items-center gap-1 text-sm text-a-text-2 hover:text-a-text">
      <ArrowLeft size={15} aria-hidden />{t('loyalty.sms.back', 'All SMS campaigns')}
    </Link>
  )
  const frame = (body: ReactNode) => <div className="space-y-5">{back}{body}</div>

  if (query.isError && failureOf(query.error).status === 404) {
    return frame(<div className="max-w-xl"><Notice tone="warning">{t('loyalty.sms.load.error.not_found', 'This SMS campaign no longer exists.')}</Notice></div>)
  }
  if (query.isError && (!query.data || deniedRead(query.error))) return frame(<LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />)
  if (!query.data) {
    return frame(
      <div role="status" className="space-y-4">
        <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
        <Skeleton className="h-10 w-72 max-w-full" />
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      </div>,
    )
  }

  const answer = query.data
  return frame(
    viewOf(answer.sms) === 'editor'
      ? <SmsEditor key={answer.sms.id} answer={answer} />
      : <SmsResults sms={answer.sms} options={answer.options} />,
  )
}
