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
import { pushApi, pushKey } from './api'
import { LoadFailed } from './parts'
import { PushEditor } from './PushEditor'
import { PushResults } from './PushResults'
import { isLive, messageFrom, PUSH_REFRESH_MS, pushSearch, viewOf } from './pushMath'

/**
 * Push messages (spec 2026-10-22 release 3 §5), the Campaigns page's third tab (`?tab=push`), a manager's: a title and
 * a message of one kind (the member's own switches in the app) pushed to a segment's members with the app. The list,
 * newest first, with each message's state and how far it got; one message opens in the same tab
 * (`?tab=push&message=<id>`): a draft in the editor, anything that went out in its results. Without the plan's
 * `push_notifications` feature the tab says so calmly (the push routes answer 402 `feature_locked`).
 */
export function PushTab() {
  const { t } = useTranslation()
  const boot = useBoot()
  const location = useLocation()
  if (!boot.features.push) {
    return (
      <div className="max-w-xl space-y-2" data-plan-locked="">
        <Notice tone="info">{t('loyalty.push.plan_locked', 'Your plan does not include push messages. Email campaigns and segments are not affected.')}</Notice>
      </div>
    )
  }
  const id = messageFrom(location.search)
  return id === null ? <CampaignList channel="push" /> : <PushPage key={id} id={id} />
}

/** One message, read again every 10 s while it sends. */
function PushPage({ id }: { id: number }) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: pushKey(id),
    queryFn: () => pushApi.message(id),
    retry: false,
    refetchInterval: (q) => (isLive(q.state.data?.push.status ?? '') ? PUSH_REFRESH_MS : false),
  })

  const back = (
    <Link to={{ pathname: '/loyalty/campaigns', search: pushSearch(null) }} className="inline-flex items-center gap-1 text-sm text-a-text-2 hover:text-a-text">
      <ArrowLeft size={15} aria-hidden />{t('loyalty.push.back', 'All push messages')}
    </Link>
  )
  const frame = (body: ReactNode) => <div className="space-y-5">{back}{body}</div>

  if (query.isError && failureOf(query.error).status === 404) {
    return frame(<div className="max-w-xl"><Notice tone="warning">{t('loyalty.push.load.error.not_found', 'This push message no longer exists.')}</Notice></div>)
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
    viewOf(answer.push) === 'editor'
      ? <PushEditor key={answer.push.id} answer={answer} />
      : <PushResults push={answer.push} options={answer.options} />,
  )
}
