import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowUpRight, Contact, Eye, Globe, History, Mail, MapPin, MessageCircle, MessagesSquare, Phone, Repeat, Target, Trash2, UserRound,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { count, dateTime, timeAgo } from '../lib/format'
import { conversationPath } from '../lib/links'
import { hrefOf, withRecord } from '../lib/records'
import { Avatar } from '../ui/Avatar'
import { Confirm } from '../ui/Confirm'
import { IconButton } from '../ui/IconButton'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { RecordFrame, RecordPanel } from '../ui/RecordPanel'
import { useToast } from '../ui/Toast'
import type { VisitorDetail } from './types'
import { VISITOR_PARAM, hostOf, pageLabel, pathOf, placeOf, presence, visitorName, webHref, type PanelTab } from './visitorsLogic'
import { PANEL_TAB_DEFAULTS, PRESENCE_DEFAULTS, PRESENCE_TONE, STATUS_DEFAULTS, STATUS_TONE } from './words'

/**
 * One visitor in the record panel (round 5: the CRM's slide-over, compact, in tabs): on the site or when last seen and
 * how to reach them in its head, with "Start a chat" (their latest conversation in the inbox, or a new one), their
 * contact record and Delete; then Overview (where they are, where they came from, the figures), Chats and Pages. `[`
 * and `]` step to the visitor before or after in the list.
 */
export function VisitorPanel({ id, tab, onTab, onClose, onPrev, onNext }: {
  id: number
  tab: PanelTab
  onTab: (tab: string) => void
  onClose: () => void
  onPrev: (() => void) | null
  onNext: (() => void) | null
}) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [search] = useSearchParams()
  const lang = i18n.language
  const zone = boot.venue.timezone
  const [asking, setAsking] = useState(false)

  const detail = useQuery({
    queryKey: ['crm', 'visitors', 'detail', id],
    queryFn: () => get<VisitorDetail>(`visitors/${id}`),
    refetchInterval: 15_000,
  })
  const chat = useMutation({
    mutationFn: () => send<{ conversation_id: number }>('post', `visitors/${id}/start-chat`),
    onSuccess: answer => {
      void qc.invalidateQueries({ queryKey: ['crm', 'inbox'] })
      if (answer?.conversation_id) navigate(conversationPath(answer.conversation_id))
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const remove = useMutation({
    mutationFn: () => send('delete', `visitors/${id}`),
    onSuccess: () => {
      toast(t('crm.visitors.deleted', 'Visitor deleted'))
      setAsking(false)
      void qc.invalidateQueries({ queryKey: ['crm', 'visitors'] })
      void qc.invalidateQueries({ queryKey: ['crm', 'inbox'] })
      void qc.invalidateQueries({ queryKey: ['crm', 'bootstrap'] })
      void qc.invalidateQueries({ queryKey: ['crm', 'today'] })
      onClose()
    },
  })

  const v = detail.data?.visitor
  const name = v ? (visitorName(v) ?? t('crm.visitors.anonymous', 'Anonymous visitor')) : t('crm.visitors.visitor', 'Visitor')
  const state = v ? presence(v.last_seen_at) : 'away'
  const place = v ? placeOf(v) : null
  const email = v?.email ?? v?.guest?.email ?? null
  const phone = v?.phone ?? v?.guest?.phone ?? null
  const pages = detail.data?.page_views ?? []
  const chats = detail.data?.conversations ?? []
  const here = v ? webHref(v.current_page) : null
  // Their contact opens in its own panel instead of this one (the visitor's `?v=` leaves the address).
  const contactHref = (guestId: number) => {
    const next = new URLSearchParams(search)
    next.delete(VISITOR_PARAM.visitor)
    next.delete(VISITOR_PARAM.panelTab)
    return hrefOf(pathname, withRecord(next, 'contact', guestId))
  }
  const seen = state === 'online' ? t('crm.visitors.presence.online', PRESENCE_DEFAULTS.online) : t('crm.visitors.seen', 'Seen {{when}}', { when: timeAgo(v?.last_seen_at, lang) || '—' })

  return (
    <>
      <RecordPanel label={name} onClose={onClose} onPrev={onPrev} onNext={onNext}>
        {(tools, titleId) => (
          <RecordFrame idPrefix="crm-visitor" titleId={titleId} title={name} tools={tools} tab={tab} onTab={onTab}
            avatar={(
              <span className="relative shrink-0">
                <Avatar name={name} size="lg" tone={v?.is_lead ? 'accent' : 'neutral'} />
                <span aria-hidden className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-a-surface ${state === 'online' ? 'bg-a-st-confirmed' : state === 'recent' ? 'bg-a-st-pending' : 'bg-a-text-2'}`} />
              </span>
            )}
            badges={v ? <>
              <Pill tone={PRESENCE_TONE[state]}>{seen}</Pill>
              {v.is_lead && <Pill tone="accent"><Target size={12} aria-hidden />{t('crm.visitors.lead', 'Lead')}</Pill>}
            </> : undefined}
            subtitle={v && place ? <span className="inline-flex min-w-0 items-center gap-1"><MapPin size={13} aria-hidden className="shrink-0" /><span className="truncate">{place}</span></span> : undefined}
            actions={v ? <>
              <Button size="sm" onClick={() => chat.mutate()} loading={chat.isPending}>
                {!chat.isPending && <MessageCircle size={15} aria-hidden />}{chats.length ? t('crm.visitors.open_chat', 'Open their chat') : t('crm.visitors.start_chat', 'Start a chat')}
              </Button>
              {v.guest && <IconButton icon={Contact} tone="accent" label={t('crm.visitors.open_contact', 'Open the contact')} to={contactHref(v.guest.id)} />}
              {boot.staff.can.delete_records && <IconButton icon={Trash2} tone="danger" label={t('crm.common.delete', 'Delete')} onClick={() => setAsking(true)} />}
            </> : undefined}
            tabs={[
              { key: 'overview', label: t('crm.visitors.ptab.overview', PANEL_TAB_DEFAULTS.overview), icon: UserRound },
              { key: 'chats', label: t('crm.visitors.ptab.chats', PANEL_TAB_DEFAULTS.chats), icon: MessagesSquare, count: chats.length },
              { key: 'pages', label: t('crm.visitors.ptab.pages', PANEL_TAB_DEFAULTS.pages), icon: Eye, count: pages.length },
            ]}>
            <QueryState loading={detail.isLoading} error={detail.error} onRetry={() => { void detail.refetch() }}>
              {v && tab === 'overview' && (
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-1.5">
                      <Figure icon={Eye} label={t('crm.visitors.views_count', '{{n}} pages', { n: count(v.page_views_count ?? 0, lang) })} />
                      <Figure icon={Repeat} label={t('crm.visitors.visits_count', '{{n}} visits', { n: count(v.visit_count ?? 1, lang) })} />
                      <Figure icon={MessageCircle} label={t('crm.visitors.messages_count', '{{n}} messages', { n: count(v.messages_count ?? 0, lang) })} />
                    </div>
                    <dl className="space-y-3 text-sm">
                      {email && <Fact icon={Mail} label={t('crm.visitors.email', 'Email')}><a href={`mailto:${email}`} className="hover:underline">{email}</a></Fact>}
                      {phone && <Fact icon={Phone} label={t('crm.visitors.phone', 'Phone')}><a href={`tel:${phone}`} className="hover:underline">{phone}</a></Fact>}
                      <Fact icon={History} label={t('crm.visitors.first_seen', 'First seen')}>{dateTime(v.first_seen_at, lang, zone) || '—'}</Fact>
                      <Fact icon={Globe} label={t('crm.visitors.came_from', 'Came from')}>{v.referrer ? hostOf(v.referrer) : '—'}</Fact>
                      {v.current_page && (
                        <Fact icon={Eye} label={state === 'online' ? t('crm.visitors.on_page', 'On the page') : t('crm.visitors.last_page', 'Last page')}>
                          {here
                            ? <a href={here} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 hover:underline"><span className="truncate">{pageLabel(v.current_page_title, v.current_page)}</span><ArrowUpRight size={13} aria-hidden className="shrink-0" /></a>
                            : pageLabel(v.current_page_title, v.current_page)}
                        </Fact>
                      )}
                    </dl>
                    {!email && !phone && <p className="text-sm text-a-text-2">{t('crm.visitors.no_reach_short', 'No email or phone yet.')}</p>}
                  </div>
                  {pages.length > 0 && (
                    <div className="min-w-0 space-y-1.5">
                      <button type="button" onClick={() => onTab('pages')} className="inline-flex items-center gap-1.5 rounded-sm text-xs font-semibold uppercase tracking-wide text-a-text-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent">
                        <Eye size={13} aria-hidden />{t('crm.visitors.journey', 'Pages they viewed')}
                      </button>
                      <ol className="space-y-0.5">
                        {pages.slice(0, 6).map(p => (
                          <li key={p.id} className="flex items-baseline gap-2 text-sm">
                            <span className="min-w-0 flex-1 truncate text-a-text" title={p.url}>{pageLabel(p.title, p.url)}</span>
                            <span className="shrink-0 text-xs text-a-text-2">{timeAgo(p.viewed_at, lang)}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {v && tab === 'chats' && (chats.length === 0
                ? <p className="rounded-xl bg-a-surface-2 px-3 py-3 text-sm text-a-text-2">{t('crm.visitors.no_chats_short', 'No chat yet.')}</p>
                : (
                  <ul className="divide-y divide-a-border overflow-hidden rounded-xl border border-a-border">
                    {chats.map(c => (
                      <li key={c.id}>
                        <Link to={conversationPath(c.id)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-a-accent">
                          <MessagesSquare size={15} aria-hidden className="shrink-0 text-a-text-2" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-a-text">{dateTime(c.last_message_at ?? c.created_at, lang, zone) || `#${c.id}`}</span>
                            <span className="flex items-center gap-2 text-xs text-a-text-2">
                              <span className="inline-flex items-center gap-0.5"><MessageCircle size={12} aria-hidden />{t('crm.visitors.chat_messages', '{{count}} messages', { count: c.messages_count ?? 0 })}</span>
                              {c.lead_captured && <span className="inline-flex items-center gap-0.5 text-a-accent-text"><Target size={12} aria-hidden />{t('crm.visitors.lead_made', 'lead made')}</span>}
                            </span>
                          </span>
                          <Pill tone={STATUS_TONE[c.status] ?? 'neutral'}>{t(`crm.status.${c.status}`, STATUS_DEFAULTS[c.status] ?? c.status)}</Pill>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ))}

              {v && tab === 'pages' && (pages.length === 0
                ? <p className="rounded-xl bg-a-surface-2 px-3 py-3 text-sm text-a-text-2">{t('crm.visitors.no_pages', 'No pages recorded yet.')}</p>
                : (
                  <ol className="relative space-y-0.5 border-l border-a-border pl-4">
                    {pages.map(p => (
                      <li key={p.id} className="relative flex items-baseline gap-3 py-1 text-sm">
                        <span aria-hidden className="absolute -left-[1.3rem] top-2.5 h-2 w-2 rounded-full border-2 border-a-surface bg-a-text-2" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-a-text">{pageLabel(p.title, p.url)}</span>
                          {p.title && <span className="block truncate text-xs text-a-text-2">{pathOf(p.url)}</span>}
                        </span>
                        <span className="shrink-0 text-xs text-a-text-2">{timeAgo(p.viewed_at, lang)}</span>
                      </li>
                    ))}
                  </ol>
                ))}
              {chat.isError && <div className="mt-3"><Notice tone="danger">{errorText(t, chat.error)}</Notice></div>}
            </QueryState>
          </RecordFrame>
        )}
      </RecordPanel>

      {asking && v && (
        <Confirm title={t('crm.visitors.delete_title', 'Delete {{name}}?', { name })} confirm={t('crm.visitors.delete_confirm', 'Delete for good')}
          busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setAsking(false)}>
          <p>{t('crm.visitors.delete_line', 'This removes the visitor with the {{pages}} pages they viewed and their {{chats}} chats and every message in them. It cannot be undone.', { pages: count(Math.max(v.page_views_count ?? 0, pages.length), lang), chats: count(chats.length, lang) })}</p>
          {v.guest && <p className="mt-2">{t('crm.visitors.delete_keeps', 'Their contact and any lead stay in your CRM.')}</p>}
          {remove.isError && <div className="mt-3"><Notice tone="danger">{errorText(t, remove.error)}</Notice></div>}
        </Confirm>
      )}
    </>
  )
}

/** A figure in the panel as a chip: its icon and its words ("4 pages"). */
function Figure({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-a-surface-2 px-2.5 py-1 text-sm text-a-text">
      <Icon size={14} aria-hidden className="shrink-0 text-a-text-2" />{label}
    </span>
  )
}

function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon size={14} aria-hidden className="mt-0.5 shrink-0 text-a-text-2" />
      <div className="min-w-0">
        <dt className="text-xs text-a-text-2">{label}</dt>
        <dd className="truncate text-a-text">{children}</dd>
      </div>
    </div>
  )
}
