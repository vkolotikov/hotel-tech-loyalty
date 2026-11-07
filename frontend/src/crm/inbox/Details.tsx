import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Download, Globe, Mail, MapPin, Pencil, Phone, RefreshCw, Sparkles, UserPlus } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../CrmProvider'
import { get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { count, dateTime, timeAgo } from '../lib/format'
import { conversationPath, leadPath } from '../lib/links'
import { Pill } from '../ui/Pill'
import { Select } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import { STATUS_TONE, hostOf, intentKey, pagePath, webHref } from './inboxLogic'
import { inboxKeys, useInboxRefresh } from './inboxQueries'
import type { Agent, Brief, ConversationDetail } from './types'
import { INTENT_DEFAULTS, STATUS_DEFAULTS } from './words'

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-a-border px-4 py-4 last:border-b-0">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-a-text-2">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * Everything about the person beside the thread: their contact details and the team's notes, the page they wrote from
 * and the pages they saw, what the assistant thinks they want, the lead, who answers, and their other chats.
 */
export function Details({ detail, onEditContact, onCaptureLead, onTranscript, transcriptBusy }: {
  detail: ConversationDetail
  onEditContact: () => void
  onCaptureLead: () => void
  onTranscript: () => void
  transcriptBusy: boolean
}) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const qc = useQueryClient()
  const refresh = useInboxRefresh()
  const c = detail.conversation
  const lang = i18n.language
  const zone = boot.venue.timezone
  const place = [c.visitor_city ?? c.visitor?.city, c.visitor_country ?? c.visitor?.country].filter(Boolean).join(', ')
  const intent = intentKey(c.intent_tag)
  const pages = c.visitor_page_views ?? []

  const agents = useQuery({ queryKey: inboxKeys.agents, queryFn: () => get<Agent[]>('chat-inbox-agents'), staleTime: 60_000 })
  const assign = useMutation({
    mutationFn: (userId: number) => send('put', `chat-inbox/${c.id}/assign`, { user_id: userId }),
    onSuccess: () => { toast(t('crm.inbox.assigned_saved', 'Assigned')); refresh(c.id) },
    onError: error => toast(errorText(t, error), 'danger'),
  })

  const [briefOn, setBriefOn] = useState(false)
  const brief = useQuery({
    queryKey: inboxKeys.brief(c.id),
    queryFn: () => get<{ data: Brief }>(`engagement/conversations/${c.id}/brief`).then(r => r.data),
    enabled: briefOn && boot.features.engagement,
    staleTime: 5 * 60_000,
  })
  const rebrief = useMutation({
    mutationFn: () => get<{ data: Brief }>(`engagement/conversations/${c.id}/brief${params({ refresh: true })}`).then(r => r.data),
    onSuccess: data => { qc.setQueryData(inboxKeys.brief(c.id), data); void qc.invalidateQueries({ queryKey: inboxKeys.detail(c.id) }) },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const shownBrief = brief.data

  return (
    <div className="text-sm">
      <Section title={t('crm.inbox.contact', 'Contact')}
        action={<button type="button" onClick={onEditContact} className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-a-accent-text hover:underline"><Pencil size={13} aria-hidden />{t('crm.common.edit', 'Edit')}</button>}>
        <ul className="space-y-1.5 text-a-text">
          {c.visitor_email && <li className="flex items-center gap-2"><Mail size={14} aria-hidden className="shrink-0 text-a-text-2" /><a href={`mailto:${c.visitor_email}`} className="truncate hover:underline">{c.visitor_email}</a></li>}
          {c.visitor_phone && <li className="flex items-center gap-2"><Phone size={14} aria-hidden className="shrink-0 text-a-text-2" /><a href={`tel:${c.visitor_phone}`} className="truncate hover:underline">{c.visitor_phone}</a></li>}
          {place && <li className="flex items-center gap-2"><MapPin size={14} aria-hidden className="shrink-0 text-a-text-2" /><span className="truncate">{place}</span></li>}
          {!c.visitor_email && !c.visitor_phone && !place && <li className="text-a-text-2">{t('crm.inbox.no_contact', 'No email or phone yet.')}</li>}
        </ul>
        {c.member?.tier && <Pill tone="accent">{t('crm.inbox.member_tier', 'Member · {{tier}}', { tier: c.member.tier.name })}</Pill>}
        {c.agent_notes && <p className="whitespace-pre-wrap rounded-xl bg-a-surface-2 px-3 py-2 text-a-text">{c.agent_notes}</p>}
      </Section>

      <Section title={t('crm.inbox.lead', 'Lead')}>
        {c.inquiry_id
          ? <Link to={leadPath(c.inquiry_id)} className="inline-flex items-center gap-1.5 font-medium text-a-accent-text hover:underline">{t('crm.inbox.open_lead', 'Open the lead')}<ArrowRight size={14} aria-hidden /></Link>
          : c.lead_captured
            ? <p className="text-a-text-2">{t('crm.inbox.lead_captured', 'A lead was made from this chat.')}</p>
            : <Button variant="secondary" size="sm" onClick={onCaptureLead}><UserPlus size={14} aria-hidden />{t('crm.inbox.capture_lead', 'Capture as lead')}</Button>}
      </Section>

      <Section title={t('crm.inbox.assignment', 'Who answers')}>
        <label className="block">
          <span className="sr-only">{t('crm.inbox.assign_to', 'Assign to')}</span>
          <Select value={c.assigned_to ?? ''} disabled={assign.isPending || agents.isLoading}
            onChange={e => { const id = Number(e.target.value); if (id > 0 && id !== c.assigned_to) assign.mutate(id) }}>
            {!c.assigned_to && <option value="">{t('crm.inbox.nobody', 'Nobody yet')}</option>}
            {c.assigned_to && !(agents.data ?? []).some(a => a.id === c.assigned_to) && <option value={c.assigned_to}>{c.assigned_agent?.name ?? t('crm.inbox.team', 'Team')}</option>}
            {(agents.data ?? []).map(a => <option key={a.id} value={a.id}>{a.id === boot.staff.id ? t('crm.inbox.me_named', '{{name}} (me)', { name: a.name }) : a.name}</option>)}
          </Select>
        </label>
        {c.assigned_to !== boot.staff.id && (
          <button type="button" onClick={() => assign.mutate(boot.staff.id)} disabled={assign.isPending} className="rounded-sm text-sm font-medium text-a-accent-text hover:underline disabled:opacity-60">
            {t('crm.inbox.assign_me', 'Assign to me')}
          </button>
        )}
        {agents.isError && <p className="text-xs text-a-danger">{errorText(t, agents.error)}</p>}
      </Section>

      {(intent || boot.features.engagement) && (
        <Section title={t('crm.inbox.about', 'What they want')}
          action={boot.features.engagement && shownBrief ? (
            <button type="button" onClick={() => rebrief.mutate()} disabled={rebrief.isPending} aria-label={t('crm.inbox.brief_again', 'Write the brief again')} title={t('crm.inbox.brief_again', 'Write the brief again')}
              className="grid h-7 w-7 place-items-center rounded-full crm-ai-text hover:bg-a-surface-2 disabled:opacity-60"><RefreshCw size={14} aria-hidden className={rebrief.isPending ? 'animate-spin' : ''} /></button>
          ) : undefined}>
          {intent && <Pill tone="ai">{t(`crm.inbox.intent.${intent}`, INTENT_DEFAULTS[intent])}</Pill>}
          {boot.features.engagement && (
            !briefOn
              ? (
                <button type="button" onClick={() => setBriefOn(true)} className="inline-flex items-center gap-1.5 rounded-full crm-ai-soft px-3 py-1.5 text-sm font-semibold">
                  <Sparkles size={14} aria-hidden />{t('crm.inbox.brief', 'Sum up the chat with AI')}
                </button>
              )
              : brief.isLoading
                ? <p role="status" className="crm-ai-text">{t('crm.inbox.briefing', 'The AI is reading the chat…')}</p>
                : brief.isError
                  ? <p className="text-a-danger">{errorText(t, brief.error)}</p>
                  : shownBrief?.brief
                    ? (
                      <div className="space-y-1">
                        <p className="whitespace-pre-wrap rounded-xl crm-bubble-ai px-3 py-2 text-a-text">{shownBrief.brief}</p>
                        {shownBrief.generated_at && <p className="text-xs text-a-text-2">{t('crm.inbox.brief_at', 'Written {{when}}', { when: timeAgo(shownBrief.generated_at, lang) })}</p>}
                      </div>
                    )
                    : <p className="text-a-text-2">{t('crm.errors.ai_failed', 'The AI could not help just now. Please try again in a moment.')}</p>
          )}
        </Section>
      )}

      <Section title={t('crm.inbox.pages', 'On the website')}>
        {c.page_url && (
          <p className="flex items-start gap-2 text-a-text">
            <Globe size={14} aria-hidden className="mt-0.5 shrink-0 text-a-text-2" />
            <span className="min-w-0"><span className="block text-xs text-a-text-2">{t('crm.inbox.wrote_from', 'Wrote from')}</span>
              {webHref(c.page_url)
                ? <a href={webHref(c.page_url) ?? undefined} target="_blank" rel="noopener noreferrer" className="block break-all hover:underline">{pagePath(c.page_url)}</a>
                : <span className="block break-all">{c.page_url}</span>}</span>
          </p>
        )}
        {c.visitor && (
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-a-surface-2 px-2 py-2"><dt className="text-xs text-a-text-2">{t('crm.inbox.visits', 'Visits')}</dt><dd className="font-a-display text-lg text-a-text">{count(c.visitor.visit_count ?? 1, lang)}</dd></div>
            <div className="rounded-xl bg-a-surface-2 px-2 py-2"><dt className="text-xs text-a-text-2">{t('crm.inbox.page_views', 'Pages')}</dt><dd className="font-a-display text-lg text-a-text">{count(c.visitor.page_views_count ?? 0, lang)}</dd></div>
            <div className="rounded-xl bg-a-surface-2 px-2 py-2"><dt className="text-xs text-a-text-2">{t('crm.inbox.first_seen', 'First seen')}</dt><dd className="truncate pt-1 text-xs text-a-text">{timeAgo(c.visitor.first_seen_at, lang) || '—'}</dd></div>
          </dl>
        )}
        {c.visitor?.referrer && <p className="text-xs text-a-text-2">{t('crm.inbox.came_from', 'Came from {{site}}', { site: hostOf(c.visitor.referrer) })}</p>}
        {pages.length > 0 && (
          <ol className="space-y-1">
            {pages.map(p => (
              <li key={p.id} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-a-text" title={p.url}>{p.title || pagePath(p.url)}</span>
                <span className="shrink-0 text-xs text-a-text-2">{timeAgo(p.viewed_at, lang)}</span>
              </li>
            ))}
          </ol>
        )}
        {!c.page_url && !c.visitor && <p className="text-a-text-2">{t('crm.inbox.no_pages', 'No pages seen yet.')}</p>}
      </Section>

      {detail.siblings.length > 0 && (
        <Section title={t('crm.inbox.other_chats', 'Other chats from this visitor')}>
          <ul className="space-y-1">
            {detail.siblings.map(s => (
              <li key={s.id}>
                <Link to={conversationPath(s.id)} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-a-surface-2">
                  <span className="min-w-0 flex-1 truncate text-a-text">{dateTime(s.last_message_at, lang, zone) || `#${s.id}`}</span>
                  <Pill tone={STATUS_TONE[s.status]}>{t(`crm.status.${s.status}`, STATUS_DEFAULTS[s.status])}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t('crm.inbox.transcript', 'Transcript')}>
        <Button variant="secondary" size="sm" onClick={onTranscript} loading={transcriptBusy}><Download size={14} aria-hidden />{t('crm.inbox.download', 'Download as text')}</Button>
      </Section>
    </div>
  )
}
