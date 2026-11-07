import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, Eye, Globe, Mail, MapPin, MessageCircle, MessagesSquare, Phone, Trash2, UserRound, type LucideIcon } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { count, dateTime, timeAgo } from '../lib/format'
import { contactPath, conversationPath } from '../lib/links'
import { Confirm } from '../ui/Confirm'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { SidePanel } from '../ui/SidePanel'
import { StatTile } from '../ui/StatTile'
import { TONE_CHIP, type Tone } from '../ui/tones'
import { useToast } from '../ui/Toast'
import type { VisitorDetail } from './types'
import { hostOf, pageLabel, pathOf, placeOf, presence, visitorName, webHref } from './visitorsLogic'
import { PRESENCE_DEFAULTS, PRESENCE_TONE, STATUS_DEFAULTS, STATUS_TONE } from './words'

/**
 * One visitor at a glance, in titled sections (round 2): on the site or when last seen, how to reach them, where they
 * are on the website, their chats and the pages they viewed;
 * "Start a chat" opens their latest conversation in the inbox (or a new one), and Delete removes them with everything
 * of theirs.
 */
export function VisitorPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
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

  return (
    <>
      <SidePanel title={name} onClose={onClose}
        footer={v ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {boot.staff.can.delete_records
              ? (
                <button type="button" onClick={() => setAsking(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-a-danger/30 px-4 py-2.5 text-sm font-semibold text-a-danger hover:bg-a-danger/12">
                  <Trash2 size={15} aria-hidden />{t('crm.common.delete', 'Delete')}
                </button>
              )
              : <span />}
            <Button onClick={() => chat.mutate()} loading={chat.isPending}><MessageCircle size={15} aria-hidden />{chats.length ? t('crm.visitors.open_chat', 'Open their chat') : t('crm.visitors.start_chat', 'Start a chat')}</Button>
          </div>
        ) : undefined}>
        <QueryState loading={detail.isLoading} error={detail.error} onRetry={() => { void detail.refetch() }}>
          {v && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={PRESENCE_TONE[state]}>
                  <span aria-hidden className={`h-2 w-2 rounded-full ${state === 'online' ? 'bg-a-st-confirmed' : state === 'recent' ? 'bg-a-st-pending' : 'bg-a-text-2'}`} />
                  {state === 'online' ? t('crm.visitors.presence.online', PRESENCE_DEFAULTS.online) : t('crm.visitors.seen', 'Seen {{when}}', { when: timeAgo(v.last_seen_at, lang) || '—' })}
                </Pill>
                {v.is_lead && <Pill tone="accent">{t('crm.visitors.lead', 'Lead')}</Pill>}
                {v.guest && (
                  <Link to={contactPath(v.guest.id)} className="inline-flex items-center gap-1 text-sm font-medium text-a-accent-text hover:underline">
                    <UserRound size={14} aria-hidden />{t('crm.visitors.open_contact', 'Open the contact')}
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <StatTile label={t('crm.visitors.views', 'Pages viewed')} value={count(v.page_views_count ?? 0, lang)} />
                <StatTile label={t('crm.visitors.visits', 'Visits')} value={count(v.visit_count ?? 1, lang)} />
                <StatTile label={t('crm.visitors.messages', 'Messages')} value={count(v.messages_count ?? 0, lang)} />
              </div>

              <PanelSection icon={UserRound} tone="accent" title={t('crm.visitors.reach_title', 'How to reach them')}>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-a-text-2">{t('crm.visitors.email', 'Email')}</dt>
                    <dd className="truncate text-a-text">{email ? <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 hover:underline"><Mail size={14} aria-hidden />{email}</a> : '—'}</dd></div>
                  <div><dt className="text-xs text-a-text-2">{t('crm.visitors.phone', 'Phone')}</dt>
                    <dd className="truncate text-a-text">{phone ? <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 hover:underline"><Phone size={14} aria-hidden />{phone}</a> : '—'}</dd></div>
                </dl>
                {!email && !phone && <p className="text-xs text-a-text-2">{t('crm.visitors.no_reach', 'They have not left an email or phone yet. Start a chat and ask.')}</p>}
              </PanelSection>

              <PanelSection icon={Globe} title={t('crm.visitors.site_title', 'On the website')}>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-a-text-2">{t('crm.visitors.where', 'Where')}</dt>
                    <dd className="truncate text-a-text">{place ? <span className="inline-flex items-center gap-1.5"><MapPin size={14} aria-hidden />{place}</span> : '—'}</dd></div>
                  <div><dt className="text-xs text-a-text-2">{t('crm.visitors.first_seen', 'First seen')}</dt>
                    <dd className="text-a-text">{dateTime(v.first_seen_at, lang, zone) || '—'}</dd></div>
                  {v.referrer && (
                    <div className="sm:col-span-2"><dt className="text-xs text-a-text-2">{t('crm.visitors.came_from', 'Came from')}</dt>
                      <dd className="break-all text-a-text">{hostOf(v.referrer)}</dd></div>
                  )}
                  {v.current_page && (
                    <div className="sm:col-span-2"><dt className="text-xs text-a-text-2">{state === 'online' ? t('crm.visitors.on_page', 'On the page') : t('crm.visitors.last_page', 'Last page')}</dt>
                      <dd className="break-all text-a-text">
                        {here
                          ? <a href={here} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">{pageLabel(v.current_page_title, v.current_page)}<ArrowUpRight size={13} aria-hidden /></a>
                          : pageLabel(v.current_page_title, v.current_page)}
                      </dd></div>
                  )}
                </dl>
              </PanelSection>

              <PanelSection icon={MessagesSquare} tone="progress" title={t('crm.visitors.chats', 'Chats')} count={count(chats.length, lang)}>
                {chats.length === 0
                  ? <p className="rounded-xl bg-a-surface-2 px-3 py-3 text-sm text-a-text-2">{t('crm.visitors.no_chats', 'No chat yet. Start one and it opens in the inbox.')}</p>
                  : (
                    <ul className="divide-y divide-a-border overflow-hidden rounded-xl border border-a-border">
                      {chats.map(c => (
                        <li key={c.id}>
                          <Link to={conversationPath(c.id)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-a-accent">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-a-text">{dateTime(c.last_message_at ?? c.created_at, lang, zone) || `#${c.id}`}</span>
                              <span className="block text-xs text-a-text-2">{t('crm.visitors.chat_messages', '{{count}} messages', { count: c.messages_count ?? 0 })}{c.lead_captured ? ` · ${t('crm.visitors.lead_made', 'lead made')}` : ''}</span>
                            </span>
                            <Pill tone={STATUS_TONE[c.status] ?? 'neutral'}>{t(`crm.status.${c.status}`, STATUS_DEFAULTS[c.status] ?? c.status)}</Pill>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
              </PanelSection>

              <PanelSection icon={Eye} title={t('crm.visitors.journey', 'Pages they viewed')} count={count(pages.length, lang)}>
                {pages.length === 0
                  ? <p className="rounded-xl bg-a-surface-2 px-3 py-3 text-sm text-a-text-2">{t('crm.visitors.no_pages', 'No pages recorded yet.')}</p>
                  : (
                    <ol className="relative space-y-1 border-l border-a-border pl-4">
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
                  )}
              </PanelSection>
              {chat.isError && <Notice tone="danger">{errorText(t, chat.error)}</Notice>}
            </div>
          )}
        </QueryState>
      </SidePanel>

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

/** One titled section of the visitor panel: its icon in a tone's chip, its title and what it counts, then its body. */
function PanelSection({ icon: Icon, tone = 'neutral', title, count: total, children }: { icon: LucideIcon; tone?: Tone; title: string; count?: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-a-text">
        <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${TONE_CHIP[tone]}`}><Icon size={13} /></span>
        {title}
        {total !== undefined && <span className="font-normal text-a-text-2">{total}</span>}
      </h3>
      {children}
    </section>
  )
}
