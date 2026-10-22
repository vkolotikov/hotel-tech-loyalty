import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Plus } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { formatDate } from '../../workspace/lib/wallClock'
import { isScheduled, scheduledWhen } from '../campaigns/scheduleMath'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { day, points } from '../lib/format'
import { Pager } from '../ui/Pager'
import { afterPushChange, pushApi, pushKey, pushListKey } from './api'
import { CategoryName, Empty, LoadFailed, Loading, Refusal, StatusBadge } from './parts'
import { PushEditor } from './PushEditor'
import { PushResults } from './PushResults'
import { isLive, messageFrom, PUSH_REFRESH_MS, progressOf, pushSearch, viewOf } from './pushMath'
import type { PushRow } from './types'

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
  return id === null ? <PushList /> : <PushPage key={id} id={id} />
}

/** Every push message of the organisation made here, newest first. New push message makes an empty draft and opens it. */
function PushList() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: pushListKey(page), queryFn: () => pushApi.messages(page), placeholderData: keepPreviousData })
  const data = query.data

  const create = useMutation({
    mutationFn: () => pushApi.create(t('loyalty.push.list.new_name', 'New push message, {{day}}', {
      day: formatDate(boot.venue.today, locale, { day: 'numeric', month: 'short', year: 'numeric' }),
    })),
    onSuccess: (answer) => {
      client.setQueryData(pushKey(answer.push.id), answer)
      afterPushChange(client, null)
      navigate({ pathname: '/loyalty/campaigns', search: pushSearch(answer.push.id) })
    },
  })

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 text-sm text-a-text-2">
          {t('loyalty.push.list.line', 'A short message to the phones of a segment’s members who have the app. Each one also stays in their inbox in the app.')}
        </p>
        <Button size="sm" loading={create.isPending} onClick={() => create.mutate()}><Plus size={15} aria-hidden />{t('loyalty.push.list.new', 'New push message')}</Button>
      </div>
      {create.isError && <Refusal family="create" failure={failureOf(create.error)} />}

      {query.isError && !data && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
      {!data && query.isLoading && <Loading />}
      {data && data.messages.length === 0 && <Empty>{t('loyalty.push.list.none', 'No push messages yet. Make one, choose its kind and a segment, and send it.')}</Empty>}
      {data && data.messages.length > 0 && (
        <>
          <ul className={`divide-y divide-a-border overflow-hidden rounded-2xl border border-a-border bg-a-surface ${query.isFetching ? 'opacity-70' : ''}`}>
            {data.messages.map(m => <PushItem key={m.id} push={m} locale={locale} timeZone={boot.venue.timezone} />)}
          </ul>
          <Pager page={data.page} pages={data.pages} onPage={setPage} />
        </>
      )}
    </>
  )
}

/** One message in the list: name and title, its kind and segment, its numbers once it went out, and its status. */
function PushItem({ push: m, locale, timeZone }: { push: PushRow; locale: string; timeZone: string }) {
  const { t } = useTranslation()
  const progress = progressOf(m)
  const when = m.sent_at ?? m.updated_at ?? m.created_at
  return (
    <li data-push={m.id}>
      <Link to={{ pathname: '/loyalty/campaigns', search: pushSearch(m.id) }} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-a-surface-2">
        <span className="min-w-0 flex-1 basis-56">
          <span className="block truncate font-medium text-a-text">{m.name}</span>
          <span className="block truncate text-xs text-a-text-2">{m.title || t('loyalty.push.list.no_title', 'No title yet')}</span>
        </span>
        <span className="min-w-0 basis-40 text-sm text-a-text-2">
          <span className="block truncate"><CategoryName category={m.category} /></span>
          <span className="block truncate">{m.segment ? m.segment.name : t('loyalty.push.list.no_segment', 'No segment')}</span>
        </span>
        <span className="basis-40 text-sm tabular-nums text-a-text-2">
          {m.status === 'draft'
            ? (when ? t('loyalty.push.list.edited', 'Edited {{day}}', { day: day(when, locale, timeZone) }) : '')
            : isScheduled(m.status)
              ? t('loyalty.push.list.scheduled', 'Goes out {{when}}', { when: scheduledWhen(m.scheduled_for, locale) })
              : t('loyalty.push.list.counts', '{{sent}} of {{total}} pushed', { sent: points(m.results.sent, locale), total: points(progress.total, locale) })}
        </span>
        <StatusBadge status={m.status} />
      </Link>
    </li>
  )
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
  if (query.isError && !query.data) return frame(<LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />)
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
