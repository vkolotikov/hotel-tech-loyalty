import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarDays, CheckCircle2, FileText, Loader2, Mail, MessageCircle, MessageSquare, Mic, Phone, Plus, Square, StickyNote, Tag } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dateTime, dayLabel } from '../lib/format'
import { TextArea, TextInput } from '../ui/inputs'
import { Pager } from '../ui/Pager'
import { QueryState } from '../ui/QueryState'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { useLeadChanged } from './leadData'
import { ACTIVITY_TYPES, activityBody, CONTACT_CHANNELS, dayOf, logContactBody, type ActivityType, type ContactChannel } from './leadLogic'
import { minutesOf, TIMELINE_KINDS, type TimelineKind } from './listLogic'
import type { Activity, LeadDetail } from './leadTypes'
import { useLeadActivities } from './recordData'
import { canRecord, useVoiceNote } from './useVoiceNote'
import { appendWords } from './voice'
import { activityLabel, activityTypeLabel, channelLabel, timelineKindLabel } from './leadWords'

export interface ComposerSeed { n: number; type: ActivityType; subject: string; body: string }

const ICON: Record<string, typeof StickyNote> = {
  note: StickyNote, call: Phone, email: Mail, meeting: CalendarDays, chat: MessageSquare, status_change: Tag,
  task_completed: CheckCircle2, file: FileText,
}

/**
 * The Activity tab (round 5; round 2's timeline): a note, call, email or meeting added (`POST …/activities`, a call's
 * or meeting's length, a voice note written down, Ctrl or ⌘ + Enter to add), a touch logged in one press
 * (`POST …/log-contact`), then the timeline (`GET inquiries/{id}/activities`, newest first, filtered by kind as the
 * full admin's lead page filters it).
 */
export function LeadTimeline({ lead, seed }: { lead: LeadDetail; seed: ComposerSeed | null }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const [page, setPage] = useState(1)
  const [kind, setKind] = useState<TimelineKind>('')
  const activities = useLeadActivities(lead.id, kind, page)
  const rows = activities.data?.data ?? []

  return (
    <section aria-label={t('crm.leads.timeline', 'Timeline')}>
      <div className="space-y-4">
        <Composer key={seed?.n ?? 0} leadId={lead.id} seed={seed} />
        <Touches lead={lead} />
        <Tabs label={t('crm.leads.timeline_filter', 'Show')} value={kind} onChange={next => { setKind(next); setPage(1) }}
          items={TIMELINE_KINDS.map(k => ({ key: k, label: timelineKindLabel(t, k) }))} />
        <QueryState loading={activities.isLoading} error={activities.error} onRetry={() => { void activities.refetch() }} rows={3}>
          {rows.length === 0 ? (
            <p className="py-4 text-center text-sm text-a-text-2">{kind ? t('crm.leads.timeline_none_kind', 'Nothing of this kind yet.') : t('crm.leads.timeline_empty_short', 'Nothing yet.')}</p>
          ) : (
            <ol className="space-y-4 border-l border-a-border pl-5">
              {rows.map(a => {
                const Icon = ICON[a.type] ?? FileText
                return (
                  <li key={a.id} className="relative">
                    <span aria-hidden className="absolute -left-[31px] top-0 grid h-[22px] w-[22px] place-items-center rounded-full border border-a-border bg-a-surface text-a-text-2"><Icon size={12} /></span>
                    <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-a-text-2">
                      <span className="font-semibold text-a-text">{activityLabel(t, a.type)}</span>
                      {a.creator?.name && <span>{a.creator.name}</span>}
                      {typeof a.duration_minutes === 'number' && a.duration_minutes > 0 && <span>{t('crm.leads.minutes', '{{count}} min', { count: a.duration_minutes })}</span>}
                      <span className="ml-auto">{dateTime(a.occurred_at ?? a.created_at, lang, boot.venue.timezone)}</span>
                    </p>
                    {a.subject && <p className="mt-0.5 text-sm font-medium text-a-text">{a.subject}</p>}
                    {a.body && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-a-text">{a.body}</p>}
                  </li>
                )
              })}
            </ol>
          )}
        </QueryState>
        {activities.data && <Pager page={activities.data.meta.current_page} last={activities.data.meta.last_page} total={activities.data.meta.total} onPage={setPage} />}
      </div>
    </section>
  )
}

function Composer({ leadId, seed }: { leadId: number; seed: ComposerSeed | null }) {
  const { t } = useTranslation()
  const toast = useToast()
  const changed = useLeadChanged()
  const [type, setType] = useState<ActivityType>(seed?.type ?? 'note')
  const [subject, setSubject] = useState(seed?.subject ?? '')
  const [body, setBody] = useState(seed?.body ?? '')
  const [minutes, setMinutes] = useState('')
  const timed = type === 'call' || type === 'meeting'
  const payload = activityBody(type, subject, body, timed ? minutesOf(minutes) : null)
  const mic = useVoiceNote({
    onText: words => setBody(before => appendWords(before, words)),
    onFail: why => toast(why === 'denied' ? t('crm.leads.voice_denied', 'The browser did not allow the microphone.')
      : why === 'no_speech' ? t('crm.leads.voice_none', 'Nothing was heard. Try again a little closer.')
      : why === 'off' ? t('crm.leads.voice_off', 'Writing down voice notes is not set up for your organisation.')
      : t('crm.leads.voice_failed', 'The voice note could not be written down. Try again.'), 'danger'),
  })
  const add = useMutation({
    mutationFn: () => {
      if (!payload) throw new Error('empty')
      return send<Activity>('post', `inquiries/${leadId}/activities`, payload)
    },
    onSuccess: () => {
      changed()
      setSubject('')
      setBody('')
      setMinutes('')
      toast(t('crm.leads.timeline_added', 'Added to the timeline'))
    },
  })
  const submit = () => { if (payload && !add.isPending) add.mutate() }
  return (
    <form className="space-y-2 rounded-xl border border-a-border bg-a-surface-2/50 p-3" onSubmit={e => { e.preventDefault(); submit() }}>
      <div role="group" aria-label={t('crm.leads.timeline_kind', 'What to add')} className="flex flex-wrap gap-1.5">
        {ACTIVITY_TYPES.map(k => {
          const Icon = ICON[k] ?? StickyNote
          return (
            <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${type === k ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
              <Icon size={13} aria-hidden />{activityTypeLabel(t, k)}
            </button>
          )
        })}
      </div>
      {type !== 'note' && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="block flex-1">
            <span className="sr-only">{t('crm.leads.timeline_subject', 'Subject')}</span>
            <TextInput value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} placeholder={t('crm.leads.timeline_subject', 'Subject')} />
          </label>
          {timed && (
            <label className="block sm:w-36">
              <span className="sr-only">{t('crm.leads.minutes_label', 'How long, in minutes')}</span>
              <TextInput type="number" inputMode="numeric" min={0} max={1440} step={1} value={minutes} onChange={e => setMinutes(e.target.value)} placeholder={t('crm.leads.minutes_hint', 'Minutes')} />
            </label>
          )}
        </div>
      )}
      <label className="block">
        <span className="sr-only">{t('crm.leads.timeline_body', 'What happened')}</span>
        <TextArea rows={3} value={body} onChange={e => setBody(e.target.value)} maxLength={8000}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }}
          placeholder={type === 'note' ? t('crm.leads.timeline_note_hint', 'Write a note for the team…') : t('crm.leads.timeline_body', 'What happened')} />
      </label>
      {add.isError && <Notice tone="danger">{errorText(t, add.error)}</Notice>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {mic.state !== 'idle' && <span className="mr-auto text-xs text-a-text-2" role="status">{mic.state === 'recording' ? t('crm.leads.voice_recording', 'Recording… press stop when you are done.') : t('crm.leads.voice_writing', 'Writing it down…')}</span>}
        {canRecord() && (
          <button type="button" onClick={mic.toggle} disabled={mic.state === 'transcribing'} aria-pressed={mic.state === 'recording'}
            aria-label={mic.state === 'recording' ? t('crm.leads.voice_stop', 'Stop the voice note') : t('crm.leads.voice_start', 'Speak a note')}
            className={`grid h-9 w-9 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-a-accent disabled:opacity-50 ${mic.state === 'recording' ? 'border-transparent bg-a-danger text-a-danger-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
            {mic.state === 'transcribing' ? <Loader2 size={15} aria-hidden className="animate-spin" /> : mic.state === 'recording' ? <Square size={14} aria-hidden /> : <Mic size={15} aria-hidden />}
          </button>
        )}
        <Button type="submit" size="sm" loading={add.isPending} disabled={!payload} title={t('crm.leads.timeline_keys', 'Ctrl or ⌘ + Enter adds it')}><Plus size={14} aria-hidden />{t('crm.leads.timeline_add', 'Add')}</Button>
      </div>
    </form>
  )
}

const CHANNEL_ICON: Record<ContactChannel, typeof Phone> = { call: Phone, email: Mail, whatsapp: MessageCircle, sms: MessageSquare }

/** "Called", "Emailed"…: one press counts a touch and keeps the date of the last one. */
function Touches({ lead }: { lead: LeadDetail }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const changed = useLeadChanged()
  const log = useMutation({
    mutationFn: (channel: ContactChannel) => send('post', `inquiries/${lead.id}/log-contact`, logContactBody(channel, '')),
    onSuccess: () => { changed(); toast(t('crm.leads.touch_logged', 'Logged')) },
    onError: e => toast(errorText(t, e), 'danger'),
  })
  const last = dayOf(lead.last_contacted_at)
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-a-text-2">
      <span>
        {t('crm.leads.touches', '{{calls}} calls · {{emails}} emails', { calls: lead.phone_calls_made ?? 0, emails: lead.emails_sent ?? 0 })}
        {last ? ` · ${t('crm.leads.last_touch', 'last {{day}}', { day: dayLabel(last, i18n.language) })}` : ''}
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-1" role="group" aria-label={t('crm.leads.log_touch', 'Log a touch')}>
        <span className="mr-1">{t('crm.leads.log_touch', 'Log a touch')}</span>
        {CONTACT_CHANNELS.map(channel => {
          const Icon = CHANNEL_ICON[channel]
          const label = channelLabel(t, channel)
          return (
            <button key={channel} type="button" disabled={log.isPending} onClick={() => log.mutate(channel)} aria-label={label} title={label}
              className="grid h-8 w-8 place-items-center rounded-full border border-a-border bg-a-surface text-a-text-2 hover:text-a-text disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-a-accent">
              <Icon size={14} aria-hidden />
            </button>
          )
        })}
      </span>
    </div>
  )
}
