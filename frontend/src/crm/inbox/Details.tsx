import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowUpRight, Contact, Eye, Globe, History, Link2, Mail, MapPin, PanelRightClose, Pencil, Phone, RefreshCw, Repeat, Sparkles,
  Target, UserPlus, UserRound, type LucideIcon,
} from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { get, params } from '../lib/api'
import { errorText } from '../lib/errors'
import { count, dateTime, timeAgo } from '../lib/format'
import { conversationPath } from '../lib/links'
import { useRecords } from '../lib/useRecords'
import { IconButton } from '../ui/IconButton'
import { Pill } from '../ui/Pill'
import { sectionAfter } from '../ui/SectionNav'
import { useToast } from '../ui/Toast'
import type { VisitorDetail } from '../visitors/types'
import { IntentMark } from './ConversationList'
import { STATUS_TONE, hostOf, intentKey, pagePath, webHref, type DetailsTab } from './inboxLogic'
import { inboxKeys } from './inboxQueries'
import type { Brief, ConversationDetail } from './types'
import { STATUS_DEFAULTS } from './words'

const TAB_ICON: Record<DetailsTab, LucideIcon> = { contact: UserRound, lead: Target, ai: Sparkles, website: Globe }
const TAB_DEFAULTS: Record<DetailsTab, string> = { contact: 'Contact', lead: 'Lead', ai: 'AI', website: 'Website' }

/** A short labelled block inside a tab: a small heading (its icon, its words) and an action at the end. */
function Block({ title, icon: Icon, action, children }: { title?: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      {(title || action) && (
        <div className="flex min-h-8 items-center gap-1.5">
          {Icon && <Icon size={14} aria-hidden className="shrink-0 text-a-text-2" />}
          {title && <h3 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-a-text-2">{title}</h3>}
          {action && <div className="ml-auto flex shrink-0 items-center gap-0.5">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * Everything about the person beside the thread (round 5: tabs instead of one long column) — Contact (how to reach
 * them, the team's notes, their contact record and other chats), Lead (open it, or capture this chat as one), AI (what
 * the assistant thinks they want, and its summary of the chat), Website (the page they wrote from and what they saw).
 * The record links open the lead's or the contact's panel over the inbox.
 */
export function Details({ detail, tab, onTab, onCollapse, onEditContact, onCaptureLead, idPrefix = 'crm-details' }: {
  detail: ConversationDetail
  tab: DetailsTab
  onTab: (tab: DetailsTab) => void
  /** Folds the column away (a wide screen); absent in the panel. */
  onCollapse?: () => void
  onEditContact: () => void
  onCaptureLead: () => void
  idPrefix?: string
}) {
  const { t } = useTranslation()
  const boot = useBoot()
  const c = detail.conversation
  const aiShown = Boolean(intentKey(c.intent_tag)) || boot.features.engagement
  const tabs = (['contact', 'lead', 'ai', 'website'] as const).filter(key => key !== 'ai' || aiShown)
  const current = (tabs as readonly DetailsTab[]).includes(tab) ? tab : 'contact'
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = sectionAfter(tabs, current, e.key)
    if (!next) return
    e.preventDefault()
    onTab(next)
    document.getElementById(`${idPrefix}-tab-${next}`)?.focus()
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div className="flex items-center gap-1 border-b border-a-border px-2">
        <div role="tablist" aria-label={t('crm.inbox.details', 'Details')} className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none]">
          {tabs.map(key => {
            const Icon = TAB_ICON[key]
            const on = key === current
            const label = t(`crm.inbox.dtab.${key}`, TAB_DEFAULTS[key])
            return (
              <button key={key} type="button" role="tab" id={`${idPrefix}-tab-${key}`} aria-selected={on} aria-controls={`${idPrefix}-panel`} tabIndex={on ? 0 : -1}
                title={label} onClick={() => onTab(key)} onKeyDown={onKey}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-2 pb-2.5 pt-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-a-accent ${on ? 'border-a-accent text-a-text' : 'border-transparent text-a-text-2 hover:text-a-text'}`}>
                <Icon size={15} aria-hidden className={key === 'ai' ? 'crm-ai-text' : ''} />
                <span className={on ? 'whitespace-nowrap' : 'sr-only 2xl:not-sr-only 2xl:whitespace-nowrap'}>{label}</span>
                {key === 'lead' && (c.inquiry_id || c.lead_captured) && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-a-st-confirmed" />}
              </button>
            )
          })}
        </div>
        {onCollapse && <IconButton icon={PanelRightClose} size="sm" label={t('crm.inbox.details_hide', 'Hide the details')} onClick={onCollapse} />}
      </div>
      <div id={`${idPrefix}-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${current}`} tabIndex={-1}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 outline-hidden">
        {current === 'contact' && <ContactTab detail={detail} onEdit={onEditContact} />}
        {current === 'lead' && <LeadTab detail={detail} onCapture={onCaptureLead} />}
        {current === 'ai' && <AiTab detail={detail} />}
        {current === 'website' && <WebsiteTab detail={detail} />}
      </div>
    </div>
  )
}

function ContactTab({ detail, onEdit }: { detail: ConversationDetail; onEdit: () => void }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const records = useRecords()
  const c = detail.conversation
  const lang = i18n.language
  const place = [c.visitor_city ?? c.visitor?.city, c.visitor_country ?? c.visitor?.country].filter(Boolean).join(', ')
  // The contact record a visitor is linked to once they became a lead (the visitor's own record says which).
  const visitor = useQuery({
    queryKey: ['crm', 'visitors', 'detail', c.visitor_id ?? 0],
    queryFn: () => get<VisitorDetail>(`visitors/${c.visitor_id}`),
    enabled: Boolean(c.visitor_id) && Boolean(c.visitor?.is_lead || c.inquiry_id || c.lead_captured),
    staleTime: 60_000,
  })
  const guestId = visitor.data?.visitor?.guest?.id ?? null

  return (
    <>
      <Block title={t('crm.inbox.contact', 'Contact')} icon={UserRound}
        action={<>
          {guestId && <IconButton icon={Contact} size="sm" tone="accent" label={t('crm.inbox.open_contact', 'Open the contact')} to={records.href('contact', guestId)} />}
          <IconButton icon={Pencil} size="sm" label={t('crm.inbox.contact_title', 'Contact details')} onClick={onEdit} />
        </>}>
        <ul className="space-y-1.5 text-a-text">
          {c.visitor_email && <li className="flex items-center gap-2"><Mail size={14} aria-hidden className="shrink-0 text-a-text-2" /><a href={`mailto:${c.visitor_email}`} className="truncate hover:underline">{c.visitor_email}</a></li>}
          {c.visitor_phone && <li className="flex items-center gap-2"><Phone size={14} aria-hidden className="shrink-0 text-a-text-2" /><a href={`tel:${c.visitor_phone}`} className="truncate hover:underline">{c.visitor_phone}</a></li>}
          {place && <li className="flex items-center gap-2"><MapPin size={14} aria-hidden className="shrink-0 text-a-text-2" /><span className="truncate">{place}</span></li>}
          {!c.visitor_email && !c.visitor_phone && !place && <li className="text-a-text-2">{t('crm.inbox.no_contact', 'No email or phone yet.')}</li>}
        </ul>
        {c.member?.tier && <Pill tone="accent">{t('crm.inbox.member_tier', 'Member · {{tier}}', { tier: c.member.tier.name })}</Pill>}
        {c.agent_notes && <p className="whitespace-pre-wrap rounded-xl bg-a-surface-2 px-3 py-2 text-a-text">{c.agent_notes}</p>}
      </Block>

      {detail.siblings.length > 0 && (
        <Block title={t('crm.inbox.other_chats_short', 'Other chats')} icon={History}>
          <ul className="space-y-0.5">
            {detail.siblings.map(s => (
              <li key={s.id}>
                <Link to={conversationPath(s.id)} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-a-surface-2">
                  <span className="min-w-0 flex-1 truncate text-a-text">{dateTime(s.last_message_at, lang, boot.venue.timezone) || `#${s.id}`}</span>
                  <Pill tone={STATUS_TONE[s.status]}>{t(`crm.status.${s.status}`, STATUS_DEFAULTS[s.status])}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </>
  )
}

function LeadTab({ detail, onCapture }: { detail: ConversationDetail; onCapture: () => void }) {
  const { t } = useTranslation()
  const records = useRecords()
  const c = detail.conversation
  const button = 'inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-a-accent'
  return (
    <Block>
      {c.inquiry_id
        ? (
          <Link to={records.href('lead', c.inquiry_id)} className={`${button} bg-a-accent text-a-accent-ink shadow-a-sm hover:bg-a-accent-deep`}>
            <Target size={15} aria-hidden />{t('crm.inbox.open_lead', 'Open the lead')}<ArrowUpRight size={14} aria-hidden />
          </Link>
        )
        : c.lead_captured
          ? <p className="flex items-center gap-2 text-a-text-2"><Link2 size={14} aria-hidden />{t('crm.inbox.lead_captured', 'A lead was made from this chat.')}</p>
          : (
            <button type="button" onClick={onCapture} className={`${button} border border-a-border bg-a-surface text-a-text hover:bg-a-surface-2`}>
              <UserPlus size={15} aria-hidden />{t('crm.inbox.capture_lead', 'Capture as lead')}
            </button>
          )}
    </Block>
  )
}

function AiTab({ detail }: { detail: ConversationDetail }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const qc = useQueryClient()
  const c = detail.conversation
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
  const shown = brief.data
  return (
    <Block title={t('crm.inbox.about', 'What they want')} icon={Sparkles}
      action={boot.features.engagement && shown ? (
        <IconButton icon={RefreshCw} size="sm" label={t('crm.inbox.brief_again', 'Write the brief again')} onClick={() => rebrief.mutate()} disabled={rebrief.isPending}
          className={rebrief.isPending ? 'animate-spin' : ''} />
      ) : undefined}>
      {intentKey(c.intent_tag) && <span className="inline-flex rounded-full crm-ai-soft px-2.5 py-1"><IntentMark tag={c.intent_tag} withLabel /></span>}
      {boot.features.engagement && (
        !briefOn
          ? (
            <button type="button" onClick={() => setBriefOn(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full crm-ai-soft px-3 text-sm font-semibold">
              <Sparkles size={14} aria-hidden />{t('crm.inbox.brief', 'Sum up the chat with AI')}
            </button>
          )
          : brief.isLoading
            ? <p role="status" className="crm-ai-text">{t('crm.inbox.briefing', 'The AI is reading the chat…')}</p>
            : brief.isError
              ? <p className="text-a-danger">{errorText(t, brief.error)}</p>
              : shown?.brief
                ? (
                  <div className="space-y-1">
                    <p className="whitespace-pre-wrap rounded-xl crm-bubble-ai px-3 py-2 text-a-text">{shown.brief}</p>
                    {shown.generated_at && <p className="text-xs text-a-text-2">{t('crm.inbox.brief_at', 'Written {{when}}', { when: timeAgo(shown.generated_at, i18n.language) })}</p>}
                  </div>
                )
                : <p className="text-a-text-2">{t('crm.errors.ai_failed', 'The AI could not help just now. Please try again in a moment.')}</p>
      )}
    </Block>
  )
}

function WebsiteTab({ detail }: { detail: ConversationDetail }) {
  const { t, i18n } = useTranslation()
  const c = detail.conversation
  const lang = i18n.language
  const pages = c.visitor_page_views ?? []
  const from = webHref(c.page_url)
  const figure = (icon: LucideIcon, label: string, value: string) => {
    const Icon = icon
    return (
      <div title={label} className="flex items-center gap-2 rounded-xl bg-a-surface-2 px-2.5 py-2">
        <Icon size={14} aria-hidden className="shrink-0 text-a-text-2" />
        <span className="sr-only">{label}</span>
        <span className="truncate text-sm font-semibold text-a-text">{value}</span>
      </div>
    )
  }
  return (
    <>
      {c.page_url && (
        <Block title={t('crm.inbox.wrote_from', 'Wrote from')} icon={Globe}>
          {from
            ? <a href={from} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 break-all text-a-text hover:underline">{pagePath(c.page_url)}<ArrowUpRight size={13} aria-hidden className="shrink-0" /></a>
            : <p className="break-all text-a-text">{c.page_url}</p>}
        </Block>
      )}
      {c.visitor && (
        <div className="grid grid-cols-3 gap-1.5">
          {figure(Repeat, t('crm.inbox.visits', 'Visits'), count(c.visitor.visit_count ?? 1, lang))}
          {figure(Eye, t('crm.inbox.page_views', 'Pages'), count(c.visitor.page_views_count ?? 0, lang))}
          {figure(History, t('crm.inbox.first_seen', 'First seen'), timeAgo(c.visitor.first_seen_at, lang) || '—')}
        </div>
      )}
      {c.visitor?.referrer && <p className="text-xs text-a-text-2">{t('crm.inbox.came_from', 'Came from {{site}}', { site: hostOf(c.visitor.referrer) })}</p>}
      {pages.length > 0 && (
        <Block title={t('crm.inbox.pages', 'On the website')} icon={Eye}>
          <ol className="space-y-1">
            {pages.map(p => (
              <li key={p.id} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-a-text" title={p.url}>{p.title || pagePath(p.url)}</span>
                <span className="shrink-0 text-xs text-a-text-2">{timeAgo(p.viewed_at, lang)}</span>
              </li>
            ))}
          </ol>
        </Block>
      )}
      {!c.page_url && !c.visitor && <p className="text-a-text-2">{t('crm.inbox.no_pages', 'No pages seen yet.')}</p>}
    </>
  )
}
