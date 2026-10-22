import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { formatDate } from '../../workspace/lib/wallClock'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { day, points } from '../lib/format'
import { Pager } from '../ui/Pager'
import { afterCampaignChange, campaignKey, campaignsApi, campaignsKey } from './api'
import { campaignPath, progressOf } from './campaignsMath'
import { isScheduled, scheduledWhen } from './scheduleMath'
import { Empty, LoadFailed, Loading, Refusal, StatusBadge, TabHead } from './parts'
import type { CampaignRow } from './types'

/**
 * The campaigns (spec 2026-10-21 release 2 §6): every email campaign of the organisation, the full admin's too, newest
 * first, with its status and how many it reached. New campaign makes an empty draft and opens it.
 */
export function CampaignsTab() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: campaignsKey(page), queryFn: () => campaignsApi.campaigns(page), placeholderData: keepPreviousData })
  const data = query.data

  const create = useMutation({
    mutationFn: () => campaignsApi.createCampaign(t('loyalty.campaigns.list.new_name', 'New campaign, {{day}}', {
      day: formatDate(boot.venue.today, locale, { day: 'numeric', month: 'short', year: 'numeric' }),
    })),
    onSuccess: (answer) => {
      client.setQueryData(campaignKey(answer.campaign.id), answer)
      afterCampaignChange(client, null)
      navigate(campaignPath(answer.campaign.id))
    },
  })

  return (
    <>
      <TabHead line={<p>{t('loyalty.campaigns.list.line', 'Emails to the members of a segment. Only members who agreed to marketing email receive them.')}</p>}>
        <Button size="sm" loading={create.isPending} onClick={() => create.mutate()}><Plus size={15} aria-hidden />{t('loyalty.campaigns.list.new', 'New campaign')}</Button>
      </TabHead>
      {create.isError && <Refusal family="create" failure={failureOf(create.error)} />}

      {query.isError && !data && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
      {!data && query.isLoading && <Loading />}
      {data && data.campaigns.length === 0 && <Empty>{t('loyalty.campaigns.list.none', 'No campaigns yet. Make one, choose a segment, write the email and send it.')}</Empty>}
      {data && data.campaigns.length > 0 && (
        <>
          <ul className={`divide-y divide-a-border overflow-hidden rounded-2xl border border-a-border bg-a-surface ${query.isFetching ? 'opacity-70' : ''}`}>
            {data.campaigns.map(c => <CampaignItem key={c.id} campaign={c} locale={locale} timeZone={boot.venue.timezone} />)}
          </ul>
          <Pager page={data.page} pages={data.pages} onPage={setPage} />
        </>
      )}
    </>
  )
}

/** One campaign in the list: name and subject, status, audience, and its numbers once it went out. */
function CampaignItem({ campaign: c, locale, timeZone }: { campaign: CampaignRow; locale: string; timeZone: string }) {
  const { t } = useTranslation()
  const progress = progressOf(c)
  const when = c.sent_at ?? c.updated_at ?? c.created_at
  return (
    <li data-campaign={c.id}>
      <Link to={campaignPath(c.id)} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-a-surface-2">
        <span className="min-w-0 flex-1 basis-56">
          <span className="block truncate font-medium text-a-text">{c.name}</span>
          <span className="block truncate text-xs text-a-text-2">{c.subject || t('loyalty.campaigns.list.no_subject', 'No subject yet')}</span>
        </span>
        <span className="min-w-0 basis-36 truncate text-sm text-a-text-2">
          {c.segment ? c.segment.name : t('loyalty.campaigns.list.no_segment', 'No segment')}
        </span>
        <span className="basis-40 text-sm tabular-nums text-a-text-2">
          {c.status === 'draft'
            ? (when ? t('loyalty.campaigns.list.edited', 'Edited {{day}}', { day: day(when, locale, timeZone) }) : '')
            : isScheduled(c.status)
              ? t('loyalty.campaigns.list.scheduled', 'Goes out {{when}}', { when: scheduledWhen(c.scheduled_for, locale) })
              : t('loyalty.campaigns.list.counts', '{{sent}} of {{total}} sent · {{failed}} failed', {
              sent: points(c.sent_count, locale), failed: points(c.failed_count, locale), total: points(progress.total, locale),
            })}
        </span>
        <StatusBadge status={c.status} />
      </Link>
    </li>
  )
}
