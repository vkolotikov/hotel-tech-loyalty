import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Mail, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
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

export interface EmailItem { id: string; subject: string; sent_at: string | null; participants: { from: string[]; to: string[]; cc: string[] } }
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
  const query = useQuery({ queryKey: [...key, page], queryFn: () => transport.read<EmailHistory>(`${path}?page=${page}`), retry: false, staleTime: 30_000 })
  const body = useQuery({ queryKey: [...key, 'body', selected], queryFn: () => transport.read<{ body?: string; code?: string }>(`${path}?message_id=${encodeURIComponent(selected!)}`), enabled: !!selected && query.data?.available === true, retry: false })
  const refresh = useMutation({ mutationFn: (older: boolean) => transport.refresh<{ next_cursor: string | null }>(path, older ? { cursor } : {}), onSuccess: result => { setCursor(result.next_cursor ?? null); setPage(1); void qc.invalidateQueries({ queryKey: key }) } })
  const denied = [403, 404].includes((query.error as { response?: { status?: number } } | null)?.response?.status ?? 0)
  if (denied || (!query.isLoading && !query.error && query.data?.available === false)) return null
  const code = query.data?.code
  return <section aria-label={t('crm.mail.title')} className="min-w-0 rounded-2xl border border-a-border bg-a-surface p-4 text-a-text shadow-a-sm">
    <header className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><Mail size={16} aria-hidden />{t('crm.mail.title')}</h2>{query.data?.available && !code && <button type="button" onClick={() => refresh.mutate(false)} disabled={refresh.isPending} className="inline-flex items-center gap-1 rounded-lg border border-a-border px-3 py-2 text-xs disabled:opacity-50"><RefreshCw size={14} aria-hidden />{t(refresh.isPending ? 'crm.mail.loading' : 'crm.mail.refresh')}</button>}</header>
    {query.isLoading && <p role="status" className="text-sm text-a-text-2">{t('crm.mail.loading')}</p>}
    {(query.error || refresh.error) && <div role="alert" className="text-sm text-a-text-2"><p>{t('crm.mail.error')}</p><button type="button" onClick={() => { refresh.reset(); void query.refetch() }} className="mt-2 underline">{t('crm.mail.retry')}</button></div>}
    {code && <p className="text-sm text-a-text-2">{t(`crm.mail.${code}`, t('crm.mail.error'))}</p>}
    {query.data?.available && !code && <>
      <p className="mb-3 break-all text-xs text-a-text-2">{query.data.email} · {t('crm.mail.read_only')}</p>
      {query.data.connected === false && <p className="text-sm text-a-text-2">{t('crm.mail.disconnected')}</p>}
      {!query.data.messages?.length && <p className="py-3 text-sm text-a-text-2">{t('crm.mail.empty')}</p>}
      <div className="divide-y divide-a-border">{query.data.messages?.map(message => <article key={message.id} className="py-3">
        <button type="button" aria-expanded={selected === message.id} onClick={() => select(selected === message.id ? null : message.id)} className="w-full break-words text-left text-sm font-medium text-a-text"><span>{message.subject || t('crm.mail.no_subject')}</span><span className="mt-1 block break-all text-xs font-normal text-a-text-2">{message.participants.from.join(', ')} → {message.participants.to.join(', ')}</span><time className="mt-1 block text-xs font-normal text-a-text-2">{message.sent_at ? new Date(message.sent_at).toLocaleString(i18n.language, { timeZone: query.data?.timezone || 'UTC' }) : t('crm.mail.unknown_date')}</time></button>
        {selected === message.id && <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-a-border p-3 text-sm">{body.isLoading ? <p role="status">{t('crm.mail.loading')}</p> : body.error ? <p role="alert">{t('crm.mail.error')}</p> : body.data?.code ? <p role="alert">{t(`crm.mail.${body.data.code}`, t('crm.mail.error'))}</p> : <pre className="whitespace-pre-wrap break-words font-sans">{body.data?.body}</pre>}</div>}
      </article>)}</div>
      <nav aria-label={t('crm.mail.pages')} className="mt-3 flex items-center justify-between gap-2 text-xs"><button type="button" disabled={page === 1} onClick={() => { select(null); setPage(page - 1) }} className="rounded-lg border border-a-border p-2 disabled:opacity-40" aria-label={t('crm.mail.previous')}><ChevronLeft size={15} /></button><span>{t('crm.mail.count', { count: query.data.total ?? 0 })}</span><button type="button" disabled={page * 25 >= (query.data.total ?? 0)} onClick={() => { select(null); setPage(page + 1) }} className="rounded-lg border border-a-border p-2 disabled:opacity-40" aria-label={t('crm.mail.next')}><ChevronRight size={15} /></button></nav>
      {cursor && <button type="button" onClick={() => refresh.mutate(true)} disabled={refresh.isPending} className="mt-3 text-xs underline">{t('crm.mail.older')}</button>}
    </>}
  </section>
}
