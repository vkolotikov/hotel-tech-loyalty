import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowDownLeft, ArrowUpRight, ExternalLink, MessageCircle, RefreshCw } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import type { CustomerResource } from '../business/BusinessProfilePanel'
import { useBoot } from '../CrmProvider'
import { get, params } from '../lib/api'
import { count, dateTime } from '../lib/format'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { IconButton } from '../ui/IconButton'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'

type WhatsAppState = 'setup_required' | 'awaiting_messages' | 'connected' | 'needs_attention' | 'review_required' | 'phone_required' | 'bridge_unavailable'
type Status = { available: boolean; state?: WhatsAppState; received_at?: string | null; history_progress?: number; message_count?: number; review_count?: number }
type Message = { id: string; direction: 'inbound' | 'outbound'; sent_at: string | null; body: string; edited: boolean; source: string }
type History = Status & { messages?: Message[]; has_more?: boolean; match_issue?: 'contact_link_required' | 'phone_sync_required' | null }

const CONTACTS_URL = 'https://contacts.hexa-tech.uk/#integrations'
const MATCHES_URL = 'https://contacts.hexa-tech.uk/#whatsapp'

function ContactsLink({ label, matches }: { label: string; matches?: boolean }) {
  return (
    <a href={matches ? MATCHES_URL : CONTACTS_URL} target="_blank" rel="noopener noreferrer"
      className="inline-flex min-h-9 items-center gap-2 rounded-full border border-a-border px-3 text-sm font-medium text-a-text hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent">
      <ExternalLink size={14} aria-hidden />{label}
    </a>
  )
}

export function WhatsAppStatusCard() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const query = useQuery({
    queryKey: ['crm', 'whatsapp-status', boot.brand_id],
    queryFn: () => get<Status>('crm/whatsapp-status'),
  })
  const data = query.data
  if (data?.available === false) return null
  return (
    <Card title={t('crm.whatsapp.title')} icon={MessageCircle} tone="success"
      description={t('crm.whatsapp.description')}
      action={<IconButton icon={RefreshCw} label={t('crm.integrations.refresh', 'Refresh')} onClick={() => void query.refetch()} />}>
      <QueryState loading={query.isLoading} error={query.error} rows={1} onRetry={() => void query.refetch()}>
        {data?.state && (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <Pill tone={data.state === 'connected' ? 'success' : 'neutral'}>{t(`crm.whatsapp.state.${data.state}`)}</Pill>
              {data.state !== 'connected' && <p className="text-sm text-a-text-2">{t(`crm.whatsapp.detail.${data.state}`)}</p>}
              {data.message_count !== undefined && (
                <p className="text-sm text-a-text-2">{t('crm.whatsapp.captured', { messages: count(data.message_count, i18n.language) })}</p>
              )}
              {data.received_at && (
                <p className="text-xs text-a-text-2">{t('crm.whatsapp.last_received', { time: dateTime(data.received_at, i18n.language, boot.venue.timezone) })}</p>
              )}
              {!!data.history_progress && data.history_progress < 100 && (
                <label className="flex items-center gap-2 text-xs text-a-text-2">
                  {t('crm.whatsapp.import_progress')}
                  <progress max={100} value={data.history_progress} />
                </label>
              )}
            </div>
            <ContactsLink matches={!!data.review_count}
              label={data.review_count ? t('crm.whatsapp.review_count', { total: count(data.review_count, i18n.language) }) : t('crm.whatsapp.open_contacts')} />
          </div>
        )}
      </QueryState>
    </Card>
  )
}

export function WhatsAppHistory({ resource, id, onContactDetails }: { resource: CustomerResource; id: number; onContactDetails?: () => void }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['crm', 'whatsapp-history', boot.brand_id, resource, id, page],
    queryFn: () => get<History>(resource + '/' + id + '/whatsapp-history' + params({ page })),
    refetchInterval: page === 1 ? 30000 : false,
  })
  const data = query.data
  const messages = data?.messages ?? []
  const empty = data?.available === false ? 'not_available' : data?.match_issue ?? (data?.state && data.state !== 'connected' ? data.state : 'empty')
  const action = empty === 'phone_required' && onContactDetails
    ? <Button type="button" variant="secondary" size="sm" onClick={onContactDetails}>{t('crm.whatsapp.contact_details')}</Button>
    : empty === 'review_required'
      ? <ContactsLink matches label={t('crm.whatsapp.review_matches')} />
      : ['contact_link_required', 'phone_sync_required', 'setup_required', 'needs_attention', 'bridge_unavailable'].includes(empty)
        ? <ContactsLink label={t('crm.whatsapp.open_contacts')} />
        : undefined
  return (
    <Card title={t('crm.whatsapp.history')} icon={MessageCircle} tone="success"
      description={t('crm.whatsapp.history_description')}
      action={<IconButton icon={RefreshCw} label={t('crm.integrations.refresh', 'Refresh')} onClick={() => void query.refetch()} />}>
      <QueryState loading={query.isLoading} error={query.error} rows={2} onRetry={() => void query.refetch()}>
        {data && messages.length === 0 && <EmptyState icon={MessageCircle}
          title={t(`crm.whatsapp.state.${empty}`)} line={t(`crm.whatsapp.detail.${empty}`)} action={action} />}
        {messages.length > 0 && (
          <ol aria-label={t('crm.whatsapp.history')} className="space-y-3">
            {[...messages].reverse().map(message => {
              const received = message.direction === 'inbound'
              const Icon = received ? ArrowDownLeft : ArrowUpRight
              return (
                <li key={message.id} className={'w-fit min-w-0 max-w-[94%] rounded-xl border border-a-border px-3 py-2.5 sm:max-w-[78%] ' +
                  (received ? 'bg-a-surface-2' : 'ml-auto bg-a-st-success/10')}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-a-text-2">
                    <Icon size={14} aria-hidden />
                    <span>{t(received ? 'crm.whatsapp.received' : 'crm.whatsapp.sent')}</span>
                    <time dateTime={message.sent_at ?? undefined}>{dateTime(message.sent_at, i18n.language, boot.venue.timezone)}</time>
                    {message.source === 'history' && <span>{t('crm.whatsapp.imported')}</span>}
                    {message.edited && <span>{t('crm.whatsapp.edited')}</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-sm text-a-text">{message.body}</p>
                </li>
              )
            })}
          </ol>
        )}
        {(page > 1 || data?.has_more) && (
          <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-a-border pt-3">
            <Button type="button" variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('crm.whatsapp.newer')}</Button>
            <Button type="button" variant="secondary" size="sm" disabled={!data?.has_more} onClick={() => setPage(page + 1)}>{t('crm.whatsapp.older')}</Button>
          </div>
        )}
      </QueryState>
    </Card>
  )
}
