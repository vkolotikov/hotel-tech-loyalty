import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarDays, CheckCircle2, FileText, History, Mail, MessageSquare, Phone, StickyNote, Tag } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dateTime, dayLabel } from '../lib/format'
import { Card } from '../ui/Card'
import { TextArea, TextInput } from '../ui/inputs'
import { Pager } from '../ui/Pager'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { useLeadChanged } from './leadData'
import { ACTIVITY_TYPES, activityBody, CONTACT_CHANNELS, dayOf, logContactBody, type ActivityType, type ContactChannel } from './leadLogic'
import type { Activity, LeadDetail, MetaList } from './leadTypes'
import { activityLabel, activityTypeLabel, channelLabel } from './leadWords'

export interface ComposerSeed { n: number; type: ActivityType; subject: string; body: string }

const ICON: Record<string, typeof StickyNote> = {
  note: StickyNote, call: Phone, email: Mail, meeting: CalendarDays, chat: MessageSquare, status_change: Tag,
  task_completed: CheckCircle2, file: FileText,
}

/**
 * The lead's timeline (`GET inquiries/{id}/activities`, newest first), a note, call, email or meeting added to it
 * (`POST …/activities`), and a touch logged in one press (`POST …/log-contact`: the call and email counters and the
 * contact's own history; the timeline keeps what is written to it).
 */
export function LeadTimeline({ lead, seed }: { lead: LeadDetail; seed: ComposerSeed | null }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const [page, setPage] = useState(1)
  const activities = useQuery({
    queryKey: ['crm', 'leads', 'activities', lead.id, page],
    queryFn: () => get<MetaList<Activity>>(`inquiries/${lead.id}/activities${params({ page, per_page: 20 })}`),
    placeholderData: previous => previous,
  })
  const rows = activities.data?.data ?? []

  return (
    <Card title={t('crm.leads.timeline', 'Timeline')} icon={History}>
      <div className="space-y-4">
        <Composer key={seed?.n ?? 0} leadId={lead.id} seed={seed} />
        <Touches lead={lead} />
        <QueryState loading={activities.isLoading} error={activities.error} onRetry={() => { void activities.refetch() }} rows={3}>
          {rows.length === 0 ? (
            <p className="py-4 text-center text-sm text-a-text-2">{t('crm.leads.timeline_empty', 'Nothing here yet. Notes, calls and stage changes show up as they happen.')}</p>
          ) : (
            <ol className="space-y-3 border-l border-a-border pl-4">
              {rows.map(a => {
                const Icon = ICON[a.type] ?? FileText
                return (
                  <li key={a.id} className="relative">
                    <span aria-hidden className="absolute -left-[25px] top-0.5 grid h-[18px] w-[18px] place-items-center rounded-full border border-a-border bg-a-surface text-a-text-2"><Icon size={11} /></span>
                    <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-a-text-2">
                      <span className="font-semibold text-a-text">{activityLabel(t, a.type)}</span>
                      {a.creator?.name && <span>{a.creator.name}</span>}
                      <span>{dateTime(a.occurred_at ?? a.created_at, lang, boot.venue.timezone)}</span>
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
    </Card>
  )
}

function Composer({ leadId, seed }: { leadId: number; seed: ComposerSeed | null }) {
  const { t } = useTranslation()
  const toast = useToast()
  const changed = useLeadChanged()
  const [type, setType] = useState<ActivityType>(seed?.type ?? 'note')
  const [subject, setSubject] = useState(seed?.subject ?? '')
  const [body, setBody] = useState(seed?.body ?? '')
  const payload = activityBody(type, subject, body)
  const add = useMutation({
    mutationFn: () => {
      if (!payload) throw new Error('empty')
      return send<Activity>('post', `inquiries/${leadId}/activities`, payload)
    },
    onSuccess: () => {
      changed()
      setSubject('')
      setBody('')
      toast(t('crm.leads.timeline_added', 'Added to the timeline'))
    },
  })
  return (
    <form className="space-y-2 rounded-xl border border-a-border bg-a-surface-2/50 p-3" onSubmit={e => { e.preventDefault(); if (payload) add.mutate() }}>
      <div role="group" aria-label={t('crm.leads.timeline_kind', 'What to add')} className="flex flex-wrap gap-1.5">
        {ACTIVITY_TYPES.map(k => (
          <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)}
            className={`min-h-8 rounded-full border px-3 text-xs font-medium ${type === k ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
            {activityTypeLabel(t, k)}
          </button>
        ))}
      </div>
      {type !== 'note' && (
        <label className="block">
          <span className="sr-only">{t('crm.leads.timeline_subject', 'Subject')}</span>
          <TextInput value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} placeholder={t('crm.leads.timeline_subject', 'Subject')} />
        </label>
      )}
      <label className="block">
        <span className="sr-only">{t('crm.leads.timeline_body', 'What happened')}</span>
        <TextArea rows={3} value={body} onChange={e => setBody(e.target.value)} maxLength={8000}
          placeholder={type === 'note' ? t('crm.leads.timeline_note_hint', 'Write a note for the team…') : t('crm.leads.timeline_body', 'What happened')} />
      </label>
      {add.isError && <Notice tone="danger">{errorText(t, add.error)}</Notice>}
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={add.isPending} disabled={!payload}>{t('crm.leads.timeline_add', 'Add')}</Button>
      </div>
    </form>
  )
}

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
      <span className="flex flex-wrap gap-1.5 sm:ml-auto" role="group" aria-label={t('crm.leads.log_touch', 'Log a touch')}>
        {CONTACT_CHANNELS.map(channel => (
          <button key={channel} type="button" disabled={log.isPending} onClick={() => log.mutate(channel)}
            className="min-h-8 rounded-full border border-a-border bg-a-surface px-3 font-medium text-a-text-2 hover:text-a-text disabled:opacity-50">
            {channelLabel(t, channel)}
          </button>
        ))}
      </span>
    </div>
  )
}
