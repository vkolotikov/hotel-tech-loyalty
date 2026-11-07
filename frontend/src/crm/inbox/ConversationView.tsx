import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Archive, ArrowLeft, Bot, CheckCircle2, Hand, MoreHorizontal, PanelRight, RotateCcw } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dayLabel } from '../lib/format'
import { Avatar } from '../ui/Avatar'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { Composer } from './Composer'
import { Details } from './Details'
import { FeedbackDialog } from './FeedbackDialog'
import { ContactPanel, LeadPanel } from './forms'
import {
  STATUS_TONE, aiToggle, canReply, channelKey, displayName, statusActions, threadRows, transcriptFileName, translateTarget,
  type StatusAction,
} from './inboxLogic'
import { inboxKeys, pollOnce, useInboxRefresh } from './inboxQueries'
import { MessageBubble, type Translation } from './MessageBubble'
import type { ConversationDetail, ConvStatus, Message } from './types'
import { ACTION_DEFAULTS, ACTION_DONE_DEFAULTS, CHANNEL_DEFAULTS, STATUS_DEFAULTS } from './words'

const ACTION_ICON = { resolve: CheckCircle2, archive: Archive, reopen: RotateCcw } as const

/**
 * One conversation: its header with what can be done to it, the thread (polled every few seconds, as the full admin
 * does, through `chat-inbox/{id}/poll`), the reply box, and the details column beside it on a wide screen (a panel
 * otherwise). On a phone it takes the whole screen, with a way back to the list.
 */
export function ConversationView({ id, onBack }: { id: number; onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const qc = useQueryClient()
  const refresh = useInboxRefresh()
  const zone = boot.venue.timezone

  const detail = useQuery({
    queryKey: inboxKeys.detail(id),
    queryFn: () => get<ConversationDetail>(`chat-inbox/${id}`),
    refetchInterval: 30_000,
  })
  const loaded = Boolean(detail.data)
  useQuery({
    queryKey: inboxKeys.poll(id),
    queryFn: () => pollOnce(qc, id),
    enabled: loaded,
    refetchInterval: 4_000,
    refetchIntervalInBackground: false,
    gcTime: 0,
  })

  const [panel, setPanel] = useState<null | 'details' | 'contact' | 'lead'>(null)
  const [rating, setRating] = useState<{ message: Message; rating: 'good' | 'bad' } | null>(null)
  const [translations, setTranslations] = useState<Record<string, Translation>>({})
  const more = useRef<HTMLDetailsElement>(null)
  const closeMore = () => { if (more.current) more.current.open = false }

  const status = useMutation({
    mutationFn: (next: ConvStatus) => send('put', `chat-inbox/${id}/status`, { status: next }),
    onSuccess: (_, next) => {
      const action: StatusAction = next === 'resolved' ? 'resolve' : next === 'archived' ? 'archive' : 'reopen'
      toast(t(`crm.inbox.action_done.${action}`, ACTION_DONE_DEFAULTS[action]))
      refresh(id)
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const ai = useMutation({
    mutationFn: (enabled: boolean) => send('put', `chat-inbox/${id}/ai-toggle`, { ai_enabled: enabled }),
    onSuccess: (_, enabled) => {
      toast(enabled ? t('crm.inbox.handed_back', 'The assistant answers this chat again') : t('crm.inbox.taken_over', 'You have the chat. The assistant waits.'))
      refresh(id)
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const transcript = useMutation({
    mutationFn: () => get<string>(`chat-inbox/${id}/transcript${params({ format: 'text' })}`),
    onSuccess: text => {
      const url = URL.createObjectURL(new Blob([typeof text === 'string' ? text : JSON.stringify(text)], { type: 'text/plain;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = transcriptFileName(id)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })

  const target = translateTarget(i18n.language)
  const translate = (m: Message) => {
    const key = `${m.id}:${target}`
    const now = translations[key]
    if (now?.state === 'done') { setTranslations(all => ({ ...all, [key]: { ...now, showing: !now.showing } })); return }
    if (now?.state === 'loading' || !m.content) return
    setTranslations(all => ({ ...all, [key]: { state: 'loading' } }))
    send<{ data?: { translated?: string; source_language?: string | null } }>('post', 'engagement/translate', { text: m.content, target })
      .then(answer => setTranslations(all => ({ ...all, [key]: { state: 'done', text: answer?.data?.translated || m.content || '', from: answer?.data?.source_language ?? null, showing: true } })))
      .catch(() => setTranslations(all => ({ ...all, [key]: { state: 'failed' } })))
  }

  // The newest message stays in view: on opening, and when one arrives while the person is near the end.
  const scroller = useRef<HTMLDivElement>(null)
  const nearEnd = useRef(true)
  const messageCount = detail.data?.messages.length ?? 0
  const typing = detail.data?.visitor_typing ?? false
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && nearEnd.current) el.scrollTop = el.scrollHeight
  }, [messageCount, typing, loaded])
  useEffect(() => { nearEnd.current = true }, [id])

  const data = detail.data
  const c = data?.conversation
  const name = c ? (displayName(c) ?? t('crm.common.visitor', 'Visitor')) : ''
  const toggle = c ? aiToggle(c) : null
  const actions = c ? statusActions(c.status) : []
  const channel = c ? channelKey(c.channel) : null
  const rows = data ? threadRows(data.messages, zone) : []
  const today = boot.venue.today

  const details = data && (
    <Details detail={data} onEditContact={() => setPanel('contact')} onCaptureLead={() => setPanel('lead')}
      onTranscript={() => transcript.mutate()} transcriptBusy={transcript.isPending} />
  )
  const menuItem = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-a-text hover:bg-a-surface-2 disabled:opacity-50'

  return (
    <>
      <section aria-label={name || t('crm.inbox.conversation', 'Conversation')}
        className="fixed inset-0 z-40 flex min-h-0 min-w-0 flex-col bg-a-surface md:static md:z-auto">
        <header className="flex items-center gap-2 border-b border-a-border px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] md:pt-2.5">
          <button type="button" onClick={onBack} aria-label={t('crm.inbox.back', 'Back to the conversations')}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-a-text-2 hover:bg-a-surface-2 hover:text-a-text md:hidden"><ArrowLeft size={18} aria-hidden /></button>
          {c && <Avatar name={name} tone={toggle?.aiOn ? 'ai' : 'accent'} />}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-a-text">{name}</h2>
            {c && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-a-text-2">
                <Pill tone={STATUS_TONE[c.status]}>{t(`crm.status.${c.status}`, STATUS_DEFAULTS[c.status])}</Pill>
                {channel ? <span>{t(`crm.inbox.channel.${channel}`, CHANNEL_DEFAULTS[channel])}</span> : c.channel && <span>{c.channel}</span>}
                {c.assigned_agent && <span className="truncate">{t('crm.inbox.assigned_short', 'With {{name}}', { name: c.assigned_agent.name })}</span>}
              </p>
            )}
          </div>
          {c && toggle && boot.features.chatbot && (
            <button type="button" onClick={() => ai.mutate(toggle.next)} disabled={ai.isPending}
              className={`hidden min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold disabled:opacity-60 sm:inline-flex ${toggle.aiOn ? 'crm-ai-fill' : 'crm-ai-soft'}`}>
              {toggle.aiOn ? <Hand size={15} aria-hidden /> : <Bot size={15} aria-hidden />}
              {toggle.action === 'take_over' ? t('crm.inbox.take_over', 'Take over') : t('crm.inbox.hand_back', 'Hand back to AI')}
            </button>
          )}
          {c && actions[0] && (() => {
            const first = actions[0]
            const Icon = ACTION_ICON[first.action]
            return (
              <Button variant="secondary" size="sm" className="hidden shrink-0 sm:inline-flex" loading={status.isPending} onClick={() => status.mutate(first.next)}>
                {!status.isPending && <Icon size={15} aria-hidden />}{t(`crm.inbox.action.${first.action}`, ACTION_DEFAULTS[first.action])}
              </Button>
            )
          })()}
          {c && (
            <details ref={more} className="relative shrink-0">
              <summary aria-label={t('crm.common.more', 'More')} title={t('crm.common.more', 'More')}
                className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-full text-a-text-2 hover:bg-a-surface-2 hover:text-a-text [&::-webkit-details-marker]:hidden">
                <MoreHorizontal size={18} aria-hidden />
              </summary>
              <div className="absolute right-0 top-full z-30 mt-1 w-64 space-y-0.5 rounded-2xl border border-a-border bg-a-surface p-1.5 shadow-a-lg animate-a-pop">
                {toggle && boot.features.chatbot && (
                  <button type="button" className={`${menuItem} sm:hidden`} disabled={ai.isPending} onClick={() => { closeMore(); ai.mutate(toggle.next) }}>
                    {toggle.aiOn ? <Hand size={15} aria-hidden /> : <Bot size={15} aria-hidden />}
                    {toggle.action === 'take_over' ? t('crm.inbox.take_over', 'Take over') : t('crm.inbox.hand_back', 'Hand back to AI')}
                  </button>
                )}
                {actions.map((a, i) => {
                  const Icon = ACTION_ICON[a.action]
                  return (
                    <button key={a.action} type="button" className={`${menuItem} ${i === 0 ? 'sm:hidden' : ''}`} disabled={status.isPending} onClick={() => { closeMore(); status.mutate(a.next) }}>
                      <Icon size={15} aria-hidden />{t(`crm.inbox.action.${a.action}`, ACTION_DEFAULTS[a.action])}
                    </button>
                  )
                })}
                <button type="button" className={`${menuItem} md:hidden`} onClick={() => { closeMore(); setPanel('details') }}>
                  <PanelRight size={15} aria-hidden />{t('crm.inbox.details', 'Details')}
                </button>
              </div>
            </details>
          )}
          {c && (
            <button type="button" onClick={() => setPanel('details')} aria-label={t('crm.inbox.details', 'Details')} title={t('crm.inbox.details', 'Details')}
              className="hidden h-9 w-9 shrink-0 place-items-center rounded-full text-a-text-2 hover:bg-a-surface-2 hover:text-a-text md:grid xl:hidden"><PanelRight size={18} aria-hidden /></button>
          )}
        </header>

        <div ref={scroller} onScroll={e => { const el = e.currentTarget; nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120 }}
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-1 sm:px-5" aria-live="polite" aria-relevant="additions">
          <div className="pt-3">
            <QueryState loading={detail.isLoading} error={detail.error} onRetry={() => { void detail.refetch() }} rows={5}>
              {rows.length === 0 && <p className="py-10 text-center text-sm text-a-text-2">{t('crm.inbox.no_messages', 'No messages yet.')}</p>}
              {rows.map(row => row.kind === 'day'
                ? (
                  <div key={row.key} className="my-4 flex items-center gap-3 text-xs text-a-text-2" role="separator">
                    <span className="h-px flex-1 bg-a-border" />{row.day === today ? t('crm.inbox.today', 'Today') : dayLabel(row.day, i18n.language)}<span className="h-px flex-1 bg-a-border" />
                  </div>
                )
                : row.kind === 'note'
                  ? <p key={row.key} className="my-2 text-center text-xs text-a-text-2"><span className="inline-block rounded-full bg-a-surface-2 px-3 py-1">{row.message.content}</span></p>
                  : (
                    <MessageBubble key={row.key} message={row.message} side={row.side} first={row.first} last={row.last} visitorName={name} zone={zone}
                      translation={translations[`${row.message.id}:${target}`]} onTranslate={() => translate(row.message)}
                      canTranslateHere={boot.features.engagement} onRate={r => setRating({ message: row.message, rating: r })} />
                  ))}
              {typing && (
                <div className="mt-3 flex justify-start" role="status">
                  <span className="crm-bubble-visitor inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md px-3.5 py-2 text-xs">
                    <span aria-hidden className="flex gap-1"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-a-text-2" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-a-text-2 [animation-delay:150ms]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-a-text-2 [animation-delay:300ms]" /></span>
                    {t('crm.inbox.typing', '{{name}} is typing…', { name })}
                  </span>
                </div>
              )}
            </QueryState>
          </div>
        </div>

        {c && (canReply(c.status)
          ? <Composer key={id} conversationId={id} status={c.status} messages={data?.messages ?? []} aiOn={Boolean(toggle?.aiOn)} onTakeOver={() => ai.mutate(false)} takingOver={ai.isPending} />
          : (
            <div className="border-t border-a-border px-3 py-3">
              <Notice tone="info">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1">{t('crm.inbox.archived_line', 'This chat is archived. Reopen it to reply.')}</span>
                  <Button size="sm" variant="secondary" onClick={() => status.mutate('active')} loading={status.isPending}>{t('crm.inbox.action.reopen', ACTION_DEFAULTS.reopen)}</Button>
                </span>
              </Notice>
            </div>
          ))}
      </section>

      <aside aria-label={t('crm.inbox.details', 'Details')} className="hidden min-h-0 overflow-y-auto border-l border-a-border bg-a-surface xl:block">
        {details}
      </aside>

      {panel === 'details' && details && (
        <SidePanel title={t('crm.inbox.details', 'Details')} onClose={() => setPanel(null)}>
          <div className="-mx-5 -my-4">{details}</div>
        </SidePanel>
      )}
      {panel === 'contact' && c && <ContactPanel conversation={c} onClose={() => setPanel(null)} onSaved={() => refresh(id)} />}
      {panel === 'lead' && c && <LeadPanel conversation={c} onClose={() => setPanel(null)} onSaved={() => refresh(id)} />}
      {rating && <FeedbackDialog message={rating.message} rating={rating.rating} onClose={() => setRating(null)} onSaved={() => refresh(id)} />}
    </>
  )
}
