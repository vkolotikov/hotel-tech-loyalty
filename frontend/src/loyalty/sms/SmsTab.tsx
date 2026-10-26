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
import { afterSmsChange, smsApi, smsKey, smsListKey } from './api'
import { LoadFailed, Loading, Refusal, StatusBadge, TwilioSetup } from './parts'
import { SmsEditor } from './SmsEditor'
import { SmsResults } from './SmsResults'
import { isLive, progressOf, smsFrom, smsSearch, SMS_REFRESH_MS, viewOf } from './smsMath'
import type { SmsRow } from './types'
import { GetStarted } from '../ui/GetStarted'

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
  return id === null ? <SmsList /> : <SmsPage key={id} id={id} />
}

/** Every SMS campaign of the organisation, newest first. New SMS makes an empty draft and opens it. */
function SmsList() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: smsListKey(page), queryFn: () => smsApi.messages(page), placeholderData: keepPreviousData })
  const data = query.data

  const create = useMutation({
    mutationFn: () => smsApi.create(t('loyalty.sms.list.new_name', 'New SMS, {{day}}', {
      day: formatDate(boot.venue.today, locale, { day: 'numeric', month: 'short', year: 'numeric' }),
    })),
    onSuccess: (answer) => {
      client.setQueryData(smsKey(answer.sms.id), answer)
      afterSmsChange(client, null)
      navigate({ pathname: '/loyalty/campaigns', search: smsSearch(answer.sms.id) })
    },
  })

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 text-sm text-a-text-2">
          {t('loyalty.sms.list.line', 'A short text to the phones of a segment’s members who turned on offers by SMS, sent from the venue’s own Twilio number.')}
        </p>
        {data && data.messages.length > 0 && (
          <Button size="sm" loading={create.isPending} onClick={() => create.mutate()}><Plus size={15} aria-hidden />{t('loyalty.sms.list.new', 'New SMS')}</Button>
        )}
      </div>
      {create.isError && <Refusal family="create" failure={failureOf(create.error)} />}
      {data && !data.twilio.ready && <TwilioSetup twilio={data.twilio} />}

      {query.isError && !data && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
      {!data && query.isLoading && <Loading />}
      {data && data.messages.length === 0 && (
        <GetStarted name="sms" hue="earn" optional title={t('loyalty.sms.get_started.title', 'Send your first SMS')}
          line={t('loyalty.sms.get_started.line', 'A short text to the phones of members who turned on offers by SMS, from your venue’s own Twilio number.')}
          steps={[
              { title: t('loyalty.sms.get_started.s1_title', 'Connect your Twilio number'), line: t('loyalty.sms.get_started.s1_line', 'Your own account and number, set up once.') },
              { title: t('loyalty.sms.get_started.s2_title', 'Write the text'), line: t('loyalty.sms.get_started.s2_line', 'Short and clear: one message, one idea.') },
              { title: t('loyalty.sms.get_started.s3_title', 'Choose who gets it and send'), line: t('loyalty.sms.get_started.s3_line', 'A segment of members who agreed to SMS, now or at a time you pick.') },
            ]}
          action={<Button loading={create.isPending} onClick={() => create.mutate()}><Plus size={15} aria-hidden />{t('loyalty.sms.list.new', 'New SMS')}</Button>} />
      )}
      {data && data.messages.length > 0 && (
        <>
          <ul className={`divide-y divide-a-border overflow-hidden rounded-2xl border border-a-border bg-a-surface ${query.isFetching ? 'opacity-70' : ''}`}>
            {data.messages.map(m => <SmsItem key={m.id} sms={m} locale={locale} timeZone={boot.venue.timezone} />)}
          </ul>
          <Pager page={data.page} pages={data.pages} onPage={setPage} />
        </>
      )}
    </>
  )
}

/** One campaign in the list: name and first line, its segment, its numbers once it went out, and its status. */
function SmsItem({ sms: m, locale, timeZone }: { sms: SmsRow; locale: string; timeZone: string }) {
  const { t } = useTranslation()
  const progress = progressOf(m)
  const when = m.sent_at ?? m.updated_at ?? m.created_at
  return (
    <li data-sms={m.id}>
      <Link to={{ pathname: '/loyalty/campaigns', search: smsSearch(m.id) }} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-a-surface-2">
        <span className="min-w-0 flex-1 basis-56">
          <span className="block truncate font-medium text-a-text">{m.name}</span>
          <span className="block truncate text-xs text-a-text-2">{m.excerpt || t('loyalty.sms.list.no_text', 'No text yet')}</span>
        </span>
        <span className="min-w-0 basis-36 truncate text-sm text-a-text-2">{m.segment ? m.segment.name : t('loyalty.sms.list.no_segment', 'No segment')}</span>
        <span className="basis-40 text-sm tabular-nums text-a-text-2">
          {m.status === 'draft'
            ? (when ? t('loyalty.sms.list.edited', 'Edited {{day}}', { day: day(when, locale, timeZone) }) : '')
            : isScheduled(m.status)
              ? t('loyalty.sms.list.scheduled', 'Goes out {{when}}', { when: scheduledWhen(m.scheduled_for, locale) })
              : t('loyalty.sms.list.counts', '{{sent}} of {{total}} sent', { sent: points(m.results.sent, locale), total: points(progress.total, locale) })}
        </span>
        <StatusBadge status={m.status} />
      </Link>
    </li>
  )
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
    viewOf(answer.sms) === 'editor'
      ? <SmsEditor key={answer.sms.id} answer={answer} />
      : <SmsResults sms={answer.sms} options={answer.options} />,
  )
}
