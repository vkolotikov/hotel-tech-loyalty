import { Fragment, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Mail, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { groupBySubject, messageParties, splitMailBody } from './mailPresentation'
import { api } from '../lib/api'
import i18n from 'i18next'
import { useBrandStore } from '../stores/brandStore'
import en from '../crm/i18n/mail.en.json'
import de from '../crm/i18n/mail.de.json'
import es from '../crm/i18n/mail.es.json'
import fr from '../crm/i18n/mail.fr.json'
import ru from '../crm/i18n/mail.ru.json'

function registerMailWords() {
  for (const [lang, words] of Object.entries({ en, de, es, fr, ru })) i18n.addResourceBundle(lang, 'common', { crm: { mail: words } }, true, true)
}
if (i18n.isInitialized) registerMailWords()
else i18n.on('initialized', registerMailWords)

export interface EmailItem { id: string; subject: string; sent_at: string | null; reply_status?: 'needs_reply' | 'awaiting_customer'; participants: { from: string[]; to: string[]; cc: string[] } }
export interface EmailHistory { available: boolean; code?: string; connected?: boolean; messages?: EmailItem[]; total?: number; page?: number; email?: string; timezone?: string; last_fetched_at?: string | null }
export interface MailTransport { read: <T>(path: string) => Promise<T>; refresh: <T>(path: string, data: unknown) => Promise<T> }
const defaultTransport: MailTransport = { read: path => api.get(`/v1/admin/${path}`).then(r => r.data), refresh: (path, data) => api.post(`/v1/admin/${path}`, data).then(r => r.data) }

export function CrmEmailHistory({ resource, id, transport = defaultTransport, scope }: { resource: 'guests' | 'inquiries'; id: number; transport?: MailTransport; scope?: string }) {
  const brand = useBrandStore(s => s.currentBrandId)
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [selected, select] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const path = `${resource}/${id}/email-history`
  const key = ['crm-mail', scope ?? `admin:${brand}`, resource, id]
  const query = useQuery({ queryKey: [...key, page], queryFn: () => transport.read<EmailHistory>(`${path}?page=${page}`), retry: false, staleTime: 30_000,
    refetchInterval: q => page === 1 && q.state.data?.connected ? 30_000 : false, })
  const body = useQuery({ queryKey: [...key, 'body', selected], queryFn: () => transport.read<{ body?: string; code?: string }>(`${path}?message_id=${encodeURIComponent(selected!)}`), enabled: !!selected && query.data?.available === true, retry: false })
  const refresh = useMutation({ mutationFn: (older: boolean) => transport.refresh<{ next_cursor: string | null }>(path, older ? { cursor } : {}), onSuccess: result => { setCursor(result.next_cursor ?? null); setPage(1); void qc.invalidateQueries({ queryKey: key }) } })
  const denied = [403, 404].includes((query.error as { response?: { status?: number } } | null)?.response?.status ?? 0)
  if (denied || (!query.isLoading && !query.error && query.data?.available === false)) return null
  const code = query.data?.code
  return <section aria-label={t('crm.mail.title')} className="min-w-0 rounded-2xl border border-a-border bg-a-surface p-4 text-a-text shadow-a-sm">
    <header className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><Mail size={16} aria-hidden />{t('crm.mail.title')}</h2>{query.data?.available && !code && <button type="button" onClick={() => refresh.mutate(false)} disabled={refresh.isPending} className="inline-flex items-center gap-1 rounded-lg border border-a-border px-3 py-2 text-xs disabled:opacity-50"><RefreshCw size={14} aria-hidden />{t(refresh.isPending ? 'crm.mail.loading' : 'crm.mail.refresh')}</button>}</header>
    {query.isLoading && <p role="status" className="text-sm text-a-text-2">{t('crm.mail.loading')}</p>}
    {(query.error || refresh.error) && <div role="alert" className="text-sm text-a-text-2"><p>{t('crm.mail.error')}</p><button type="button" onClick={() => { if (refresh.isError) refresh.mutate(refresh.variables ?? false); else void query.refetch() }} disabled={query.isFetching || refresh.isPending} className="mt-2 underline disabled:opacity-50">{t('crm.mail.retry')}</button></div>}
    {code && <p className="text-sm text-a-text-2">{t(`crm.mail.${code}`, t('crm.mail.error'))}</p>}
    {query.data?.available && !code && <>
      <p className="mb-3 break-all text-xs text-a-text-2">{query.data.email} · {t(resource === 'inquiries' && query.data.connected ? 'crm.mail.auto_sync' : 'crm.mail.read_only')}</p>
      {query.data.connected === false && <p className="text-sm text-a-text-2">{t('crm.mail.disconnected')}</p>}
      {!query.data.messages?.length && !query.isFetching && !refresh.isPending && !query.error && !refresh.error && <p role="status" className="py-3 text-sm text-a-text-2">{t(refresh.isSuccess || resource === 'inquiries' ? 'crm.mail.no_matches' : 'crm.mail.empty')}</p>}
      <div className="space-y-4">{groupBySubject(query.data.messages ?? []).map(group => <section key={group.messages[0].id} className="overflow-hidden rounded-xl border border-a-border">
        <header className="flex items-start justify-between gap-3 border-b border-a-border bg-a-surface-2 px-3 py-3 sm:px-4">
          <h3 className="min-w-0 break-words text-sm font-semibold leading-5">{group.subject || t('crm.mail.no_subject')}</h3>
          <span className="shrink-0 text-xs leading-5 text-a-text-2">{t('crm.mail.count', { count: group.messages.length })}</span>
        </header>
        <div className="divide-y divide-a-border">{group.messages.map(message => {
          const { direction, sender } = messageParties(message.participants, query.data?.email)
          const expanded = selected === message.id
          const Icon = direction === 'incoming' ? ArrowDownLeft : direction === 'outgoing' ? ArrowUpRight : Mail
          const date = message.sent_at ? new Date(message.sent_at) : null
          return <article key={message.id}>
            <button type="button" aria-expanded={expanded} onClick={() => select(expanded ? null : message.id)}
              className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-a-surface-2 focus-visible:-outline-offset-2 sm:px-4 ${expanded ? 'bg-a-surface-2/60' : ''}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${direction === 'incoming' ? 'bg-a-accent/10 text-a-accent-text' : 'border border-a-border text-a-text-2'}`}><Icon size={16} aria-hidden /></span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="min-w-0"><span className="flex flex-wrap items-center gap-2 text-xs text-a-text-2">
                  {t(`crm.mail.${direction}`)}
                  {message.reply_status && <span className={`rounded-full px-2 py-0.5 font-medium ${message.reply_status === 'needs_reply' ? 'bg-a-st-pending/12 text-a-st-pending' : 'bg-a-surface-2 text-a-text-2'}`}>{t(`crm.mail.${message.reply_status}`)}</span>}
                </span><span className="block break-words text-sm font-semibold [overflow-wrap:anywhere]">{sender || t('crm.mail.unknown_sender')}</span></span>
                <time dateTime={message.sent_at ?? undefined} className="text-xs tabular-nums text-a-text-2">{date && Number.isFinite(date.getTime()) ? date.toLocaleString(i18n.language, { timeZone: query.data?.timezone || 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : t('crm.mail.unknown_date')}</time>
              </span>
              <ChevronDown size={16} aria-hidden className={`shrink-0 text-a-text-2 ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && <div className="border-t border-a-border px-3 py-4 sm:px-6">
              <dl className="mb-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs text-a-text-2">
                {(['from', 'to', 'cc'] as const).filter(field => message.participants[field]?.length).map(field => <Fragment key={field}><dt className="font-medium">{t(`crm.mail.${field}`)}</dt><dd className="break-words [overflow-wrap:anywhere]">{message.participants[field].join(', ')}</dd></Fragment>)}
              </dl>
              {body.isLoading ? <p role="status">{t('crm.mail.loading')}</p> : body.error ? <div role="alert">{t('crm.mail.error')} <button type="button" className="underline" onClick={() => void body.refetch()}>{t('crm.mail.retry')}</button></div> : body.data?.code ? <p role="alert">{t(`crm.mail.${body.data.code}`, t('crm.mail.error'))}</p> : <MailText text={body.data?.body ?? ''} />}
            </div>}
          </article>
        })}</div>
      </section>)}</div>
      {(query.data.total ?? 0) > 25 && <nav aria-label={t('crm.mail.pages')} className="mt-3 flex items-center justify-between gap-2 text-xs">
        <button type="button" disabled={page === 1} onClick={() => { select(null); setPage(page - 1) }} className="rounded-lg border border-a-border p-2 disabled:opacity-40" aria-label={t('crm.mail.previous')}><ChevronLeft size={15} /></button>
        <span>{t('crm.mail.range', { start: (page - 1) * 25 + 1, end: Math.min(page * 25, query.data.total ?? 0), total: query.data.total })}</span>
        <button type="button" disabled={page * 25 >= (query.data.total ?? 0)} onClick={() => { select(null); setPage(page + 1) }} className="rounded-lg border border-a-border p-2 disabled:opacity-40" aria-label={t('crm.mail.next')}><ChevronRight size={15} /></button>
      </nav>}
      {cursor && <button type="button" onClick={() => refresh.mutate(true)} disabled={refresh.isPending} className="mt-3 text-xs underline">{t('crm.mail.older')}</button>}
    </>}
  </section>
}

function MailText({ text }: { text: string }) {
  const { t } = useTranslation()
  const { current, quoted } = splitMailBody(text)
  return <div className="max-w-[72ch] text-sm leading-6 [overflow-wrap:anywhere]">
    {current && <div className="whitespace-pre-wrap">{current}</div>}
    {quoted && <details className="mt-3 border-l-2 border-a-border pl-3 text-a-text-2" open={current ? undefined : true}>
      <summary className="cursor-pointer text-xs font-medium">{t('crm.mail.quoted')}</summary>
      <div className="mt-2 whitespace-pre-wrap">{quoted}</div>
    </details>}
    {!current && !quoted && <p className="text-a-text-2">{t('crm.mail.no_text')}</p>}
  </div>
}
