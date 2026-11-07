import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  AlarmClock, ArrowRight, BarChart3, Bot, CalendarClock, CalendarDays, Check, CheckSquare, ChevronRight, Clock, Coins, Inbox, Loader2, MessageCircle,
  PartyPopper, Rocket, Sparkles, Sun, Target, UserPlus,
} from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { crmApi, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { count, dateTime, dayLabel, money, percent, timeAgo } from '../lib/format'
import { conversationPath, leadPath } from '../lib/links'
import type { Today } from '../lib/types'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Page } from '../ui/Page'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { StatTile } from '../ui/StatTile'
import { useToast } from '../ui/Toast'
import { TONE_CHIP, type Tone } from '../ui/tones'
import { firstName, greetingOf, hasMore, longDay, needsNow, scheduleOf, taskTarget, venueClock, type NowItem, type ScheduleItem } from './todayLogic'

const PRIMARY_LINK = 'inline-flex min-h-11 items-center gap-2 rounded-full bg-a-accent px-4 py-2.5 text-sm font-semibold text-a-accent-ink shadow-a-sm hover:bg-a-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-a-accent'
const TEXT_LINK = 'inline-flex items-center gap-1 rounded-sm text-sm font-medium text-a-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-a-accent'
const ROW_LINK = 'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-a-accent'

/**
 * Today (2026-11-07; round 2, "a calmer, clearer cockpit"): a greeting with the venue's date, the few figures that
 * decide the day, then what needs a person now (waiting chats, overdue follow-ups and tasks, in that order), today's
 * schedule, the new leads and the week's website chat. Every figure is the server's (CrmToday); the page only orders,
 * groups, places and words them. The setup banner shows only while setup is incomplete.
 */
export function TodayPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const zone = boot.venue.timezone
  const today = useQuery({ queryKey: ['crm', 'today'], queryFn: crmApi.today, staleTime: 20_000, refetchInterval: 60_000 })
  const clock = venueClock(new Date(), zone)
  const name = firstName(boot.staff.name)
  const greeting = greetingOf(clock.hour)
  const hello = greeting === 'morning' ? t('crm.today.greeting.morning', 'Good morning, {{name}}', { name })
    : greeting === 'afternoon' ? t('crm.today.greeting.afternoon', 'Good afternoon, {{name}}', { name })
    : t('crm.today.greeting.evening', 'Good evening, {{name}}', { name })
  const day = today.data?.today ?? boot.venue.today

  return (
    <Page title={name ? hello : t('crm.today.title', 'Today')}
      line={t('crm.today.line', 'What needs you now, from the website chat and your pipeline.')}
      below={(
        <p className="inline-flex items-center gap-2 text-sm text-a-text-2">
          <CalendarDays size={15} aria-hidden className="shrink-0" />
          <span><span className="font-medium text-a-text">{t('crm.today.title', 'Today')}</span> · {longDay(day, lang)}</span>
        </p>
      )}
      actions={<Link to="/crm/leads?new=1" className={PRIMARY_LINK}><UserPlus size={15} aria-hidden />{t('crm.today.add_lead', 'Add a lead')}</Link>}>
      {!boot.setup.complete && <SetupBanner done={boot.setup.done} total={boot.setup.total} />}
      <QueryState loading={today.isLoading} error={today.error} onRetry={() => { void today.refetch() }} rows={5}>
        {today.data && <TodayBody data={today.data} lang={lang} zone={zone} currency={boot.venue.currency} />}
      </QueryState>
    </Page>
  )
}

/** While setup is not done: how far it is, and the way to the next step. */
function SetupBanner({ done, total }: { done: number; total: number }) {
  const { t } = useTranslation()
  const share = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <Link to="/crm/start" className="group flex items-center gap-3 rounded-2xl border border-a-accent/30 bg-a-accent/8 px-4 py-3 text-sm text-a-text transition-colors hover:border-a-accent/60 focus-visible:outline-2 focus-visible:outline-a-accent">
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-a-accent text-a-accent-ink"><Rocket size={18} /></span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="block font-semibold">{t('crm.today.setup_title', 'Finish setting up HexaTech CRM')}</span>
        <span className="block text-a-text-2">{t('crm.today.setup_line', '{{done}} of {{total}} steps done. Put the chat on your website, teach the assistant and you are ready.', { done, total })}</span>
        <span aria-hidden className="block h-1.5 max-w-sm overflow-hidden rounded-full bg-a-surface-2">
          <span className="block h-full rounded-full bg-a-accent" style={{ width: `${share}%` }} />
        </span>
      </span>
      <span className="hidden shrink-0 items-center gap-1 font-medium text-a-accent-text sm:inline-flex">{t('crm.today.setup_go', 'Continue')}<ArrowRight size={15} aria-hidden /></span>
      <ArrowRight size={16} aria-hidden className="shrink-0 text-a-text-2 sm:hidden" />
    </Link>
  )
}

function TodayBody({ data, lang, zone, currency }: { data: Today; lang: string; zone: string; currency: string }) {
  const { t } = useTranslation()
  const followUpsDue = data.leads.due_today + data.leads.overdue
  const tasksDue = data.tasks.due_today + data.tasks.overdue

  return (
    <div className="space-y-5">
      <section aria-label={t('crm.today.figures', 'The day at a glance')} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile icon={Inbox} tone={data.chats.waiting > 0 ? 'pending' : 'neutral'} label={t('crm.today.waiting', 'Waiting for a reply')} value={count(data.chats.waiting, lang)}
          hint={t('crm.today.open_unassigned', '{{open}} open chats · {{unassigned}} with nobody', { open: count(data.chats.open, lang), unassigned: count(data.chats.unassigned, lang) })}
          to="/crm/inbox?status=waiting" />
        <StatTile icon={CalendarClock} tone={data.leads.overdue > 0 ? 'danger' : 'neutral'} label={t('crm.today.follow_ups', 'Follow-ups due')} value={count(followUpsDue, lang)}
          hint={t('crm.today.overdue', '{{count}} overdue', { count: data.leads.overdue })} to="/crm/leads?due=1" />
        <StatTile icon={CheckSquare} tone={data.tasks.overdue > 0 ? 'danger' : 'neutral'} label={t('crm.today.your_tasks', 'Your tasks')} value={count(tasksDue, lang)}
          hint={t('crm.today.overdue', '{{count}} overdue', { count: data.tasks.overdue })} to="/crm/tasks" />
        <StatTile icon={UserPlus} tone="accent" label={t('crm.today.new_leads', 'New leads')} value={count(data.leads.new, lang)}
          hint={t('crm.today.last_24h', 'In the last 24 hours')} to="/crm/leads" />
        <div className="col-span-2 md:col-span-1">
          <StatTile icon={Coins} tone="success" label={t('crm.today.pipeline', 'Open pipeline')} value={money(data.pipeline.open_value, currency, lang)}
            hint={t('crm.today.open_leads', '{{count}} open leads', { count: data.pipeline.open_count })} to="/crm/pipeline" />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <NeedsNow data={data} lang={lang} zone={zone} currency={currency} />
          <Schedule data={data} lang={lang} zone={zone} currency={currency} />
        </div>
        <div className="min-w-0 space-y-5">
          <NewLeads data={data} lang={lang} currency={currency} />
          <Week data={data} lang={lang} />
        </div>
      </div>
    </div>
  )
}

/** One row of a list: its kind in a tone's chip, a title and a line, when, and what state it is in; its quick action beside it. */
function Row({ to, icon: Icon, tone, title, line, when, pills, action }: { to: string; icon: LucideIcon; tone: Tone; title: string; line?: string | null; when?: string; pills?: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex items-stretch">
      <Link to={to} className={`${ROW_LINK} min-w-0 flex-1`}>
        <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE_CHIP[tone]}`}><Icon size={16} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 truncate text-sm font-medium text-a-text">{title}</span>
            {when && <span className="ml-auto shrink-0 text-xs text-a-text-2">{when}</span>}
          </span>
          {line && <span className="mt-0.5 line-clamp-2 block text-sm text-a-text-2">{line}</span>}
          {pills && <span className="mt-1.5 flex flex-wrap items-center gap-1.5">{pills}</span>}
        </span>
        {!action && <ChevronRight size={16} aria-hidden className="mt-2.5 hidden shrink-0 text-a-text-2 sm:block" />}
      </Link>
      {action && <span className="flex shrink-0 items-center pr-3">{action}</span>}
    </li>
  )
}

type Done = { kind: 'follow_up' | 'task'; id: number }

/** Mark a follow-up or a task done from Today; Today, the frame's counts and the area's lists read again. */
function useDone(): { done: (item: Done) => void; busy: string | null } {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const mutation = useMutation({
    // A lead's follow-up is completed as the full admin's lead insights complete it; a task through the Tasks endpoint.
    mutationFn: (item: Done) => item.kind === 'follow_up'
      ? send('post', `inquiries/${item.id}/complete-task`)
      : send('post', `tasks/${item.id}/complete`, {}),
    onSuccess: (_, item) => {
      toast(item.kind === 'follow_up' ? t('crm.today.done_follow_up', 'Follow-up marked done') : t('crm.today.done_task', 'Task marked done'))
      void qc.invalidateQueries({ queryKey: ['crm', 'today'] })
      void qc.invalidateQueries({ queryKey: ['crm', 'bootstrap'] })
      void qc.invalidateQueries({ queryKey: ['crm', item.kind === 'follow_up' ? 'leads' : 'tasks'] })
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const busy = mutation.isPending && mutation.variables ? `${mutation.variables.kind}-${mutation.variables.id}` : null
  return { done: item => mutation.mutate(item), busy }
}

/** The quick "Done" beside a follow-up or a task (a 40 px target, named for what it completes). */
function DoneButton({ item, label, state }: { item: Done; label: string; state: ReturnType<typeof useDone> }) {
  const { t } = useTranslation()
  const working = state.busy === `${item.kind}-${item.id}`
  return (
    <button type="button" onClick={() => state.done(item)} disabled={state.busy !== null}
      aria-label={t('crm.today.mark_done', 'Mark “{{name}}” done', { name: label })} title={t('crm.today.done', 'Done')}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-a-border bg-a-surface px-3 text-sm font-medium text-a-text-2 transition-colors hover:border-a-st-confirmed/50 hover:text-a-st-confirmed focus-visible:outline-2 focus-visible:outline-a-accent disabled:opacity-60">
      {working ? <Loader2 size={14} aria-hidden className="animate-spin" /> : <Check size={14} aria-hidden />}
      <span className="hidden sm:inline">{t('crm.today.done', 'Done')}</span>
    </button>
  )
}

/** "See all": where the rest is, when the server holds more than its short list. */
function SeeAll({ links }: { links: { to: string; label: string; show: boolean }[] }) {
  const shown = links.filter(l => l.show)
  if (shown.length === 0) return null
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-a-border px-4 py-2.5">
      {shown.map(l => <Link key={l.to} to={l.to} className={TEXT_LINK}>{l.label}<ArrowRight size={14} aria-hidden /></Link>)}
    </div>
  )
}

/** What needs a person now: chats waiting for a reply, then overdue follow-ups, then overdue tasks. */
function NeedsNow({ data, lang, zone, currency }: { data: Today; lang: string; zone: string; currency: string }) {
  const { t } = useTranslation()
  const items = needsNow(data)
  const state = useDone()
  const overdueLeads = items.filter(i => i.kind === 'follow_up').length
  const overdueTasks = items.filter(i => i.kind === 'task').length

  return (
    <Card title={t('crm.today.now_title', 'Needs you now')} description={t('crm.today.now_line', 'Waiting chats first, then what is overdue.')}
      icon={AlarmClock} tone={items.length > 0 ? 'pending' : 'success'} padded={false}
      action={data.chats.list.length > 0 ? <Link to="/crm/inbox?status=waiting" className={TEXT_LINK}>{t('crm.today.open_inbox', 'Open the inbox')}</Link> : undefined}>
      {items.length === 0
        ? <EmptyState icon={PartyPopper} title={t('crm.today.all_clear', 'All clear')} line={t('crm.today.all_clear_line', 'Nobody is waiting for a reply and nothing is overdue.')} />
        : (
          <ul className="divide-y divide-a-border">
            {items.map(item => <NowRow key={item.key} item={item} lang={lang} zone={zone} currency={currency} state={state} />)}
          </ul>
        )}
      <SeeAll links={[
        { to: '/crm/inbox?status=waiting', label: t('crm.today.all_waiting', 'All {{count}} waiting chats', { count: data.chats.waiting }), show: hasMore(data.chats.waiting, data.chats.list.length) },
        { to: '/crm/leads?due=1', label: t('crm.today.all_overdue_leads', 'All {{count}} overdue follow-ups', { count: data.leads.overdue }), show: hasMore(data.leads.overdue, overdueLeads) },
        { to: '/crm/tasks', label: t('crm.today.all_overdue_tasks', 'All {{count}} overdue tasks', { count: data.tasks.overdue }), show: hasMore(data.tasks.overdue, overdueTasks) },
      ]} />
    </Card>
  )
}

function NowRow({ item, lang, zone, currency, state }: { item: NowItem; lang: string; zone: string; currency: string; state: ReturnType<typeof useDone> }) {
  const { t } = useTranslation()
  if (item.kind === 'chat') {
    const chat = item.chat
    return (
      <Row to={conversationPath(chat.id)} icon={MessageCircle} tone="pending"
        title={chat.name ?? chat.email ?? t('crm.common.visitor', 'Visitor')} line={chat.excerpt} when={timeAgo(chat.last_at, lang)}
        pills={<>
          <Pill tone="pending">{t('crm.today.kind_chat', 'Waiting for a reply')}</Pill>
          {chat.assigned_to ? <Pill>{chat.assigned_to.name}</Pill> : <Pill tone="danger">{t('crm.today.nobody', 'Nobody assigned')}</Pill>}
        </>} />
    )
  }
  if (item.kind === 'follow_up') {
    const lead = item.lead
    const title = `${lead.name ?? t('crm.common.no_name', 'No name')}${lead.company ? ` · ${lead.company}` : ''}`
    return (
      <Row to={leadPath(lead.id)} icon={CalendarClock} tone="danger" title={title}
        line={lead.task_note ?? lead.task_type ?? lead.status} when={lead.value !== null ? money(lead.value, currency, lang) : undefined}
        pills={<Pill tone="danger">{t('crm.today.kind_follow_up', 'Follow-up overdue since {{day}}', { day: dayLabel(lead.due, lang) })}</Pill>}
        action={<DoneButton item={{ kind: 'follow_up', id: lead.id }} label={title} state={state} />} />
    )
  }
  const task = item.task
  return (
    <Row to={taskTarget(task)} icon={CheckSquare} tone="danger" title={task.title} line={task.contact}
      pills={<Pill tone="danger">{t('crm.today.kind_task', 'Task overdue · was due {{when}}', { when: dateTime(task.due_at, lang, zone) })}</Pill>}
      action={<DoneButton item={{ kind: 'task', id: task.id }} label={task.title} state={state} />} />
  )
}

/** Today's schedule: your tasks at a time, then what is due during the day (follow-ups, tasks without a time). */
function Schedule({ data, lang, zone, currency }: { data: Today; lang: string; zone: string; currency: string }) {
  const { t } = useTranslation()
  const { timed, allDay } = scheduleOf(data, zone)
  const state = useDone()
  const empty = timed.length === 0 && allDay.length === 0

  return (
    <Card title={t('crm.today.schedule_title', 'Today’s schedule')} description={t('crm.today.schedule_line', 'Follow-ups and your tasks due today, in the venue’s time.')}
      icon={CalendarDays} tone="progress" padded={false}
      action={<Link to="/crm/tasks" className={TEXT_LINK}>{t('crm.today.all_tasks', 'All tasks')}</Link>}>
      {empty
        ? <EmptyState icon={Sun} title={t('crm.today.no_schedule', 'Nothing scheduled for today')} line={t('crm.today.no_schedule_line', 'Set a next step on a lead or add a task, and it shows here on its day.')} />
        : (
          <div className="divide-y divide-a-border">
            {timed.length > 0 && (
              <ol aria-label={t('crm.today.at_a_time', 'At a time')} className="divide-y divide-a-border">
                {timed.map(item => <ScheduleRow key={item.key} item={item} lang={lang} currency={currency} state={state} />)}
              </ol>
            )}
            {allDay.length > 0 && (
              <div>
                <p className="bg-a-surface-2/60 px-4 py-1.5 text-xs font-semibold text-a-text-2">{t('crm.today.during_day', 'During the day')}</p>
                <ul className="divide-y divide-a-border">
                  {allDay.map(item => <ScheduleRow key={item.key} item={item} lang={lang} currency={currency} state={state} />)}
                </ul>
              </div>
            )}
          </div>
        )}
      <SeeAll links={[{ to: '/crm/leads?due=1', label: t('crm.today.all_leads_due', 'All follow-ups due'), show: hasMore(data.leads.due_today + data.leads.overdue, data.leads.follow_ups.length) }]} />
    </Card>
  )
}

function ScheduleRow({ item, lang, currency, state }: { item: ScheduleItem; lang: string; currency: string; state: ReturnType<typeof useDone> }) {
  const { t } = useTranslation()
  if (item.kind === 'task') {
    const task = item.task
    return (
      <li className="flex items-stretch">
        <Link to={taskTarget(task)} className={`${ROW_LINK} min-w-0 flex-1 items-center`}>
          <span className={`w-12 shrink-0 text-sm font-semibold tabular-nums ${item.time ? 'text-a-text' : 'text-a-text-2'}`}>
            {item.time ?? <><Clock size={15} aria-hidden /><span className="sr-only">{t('crm.today.no_time', 'No set time')}</span></>}
          </span>
          <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONE_CHIP.progress}`}><CheckSquare size={15} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-a-text">{task.title}</span>
            <span className="block truncate text-xs text-a-text-2">{[t('crm.today.kind_task_today', 'Task'), task.contact].filter(Boolean).join(' · ')}</span>
          </span>
        </Link>
        <span className="flex shrink-0 items-center pr-3"><DoneButton item={{ kind: 'task', id: task.id }} label={task.title} state={state} /></span>
      </li>
    )
  }
  const lead = item.lead
  const title = `${lead.name ?? t('crm.common.no_name', 'No name')}${lead.company ? ` · ${lead.company}` : ''}`
  return (
    <li className="flex items-stretch">
      <Link to={leadPath(lead.id)} className={`${ROW_LINK} min-w-0 flex-1 items-center`}>
        <span className="w-12 shrink-0 text-a-text-2"><Clock size={15} aria-hidden /><span className="sr-only">{t('crm.today.no_time', 'No set time')}</span></span>
        <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONE_CHIP.accent}`}><Target size={15} /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-a-text">{title}</span>
          <span className="block truncate text-xs text-a-text-2">{[t('crm.today.kind_follow_up_today', 'Follow-up'), lead.task_note ?? lead.task_type ?? lead.status].filter(Boolean).join(' · ')}</span>
        </span>
        {lead.value !== null && <span className="shrink-0 text-xs tabular-nums text-a-text-2">{money(lead.value, currency, lang)}</span>}
      </Link>
      <span className="flex shrink-0 items-center pr-3"><DoneButton item={{ kind: 'follow_up', id: lead.id }} label={title} state={state} /></span>
    </li>
  )
}

/** The leads that came in during the last 24 hours. */
function NewLeads({ data, lang, currency }: { data: Today; lang: string; currency: string }) {
  const { t } = useTranslation()
  const rows = data.leads.new_list
  return (
    <Card title={t('crm.today.new_title', 'New leads')} description={t('crm.today.last_24h', 'In the last 24 hours')} icon={UserPlus} tone="accent" padded={false}
      action={<Link to="/crm/leads" className={TEXT_LINK}>{t('crm.today.all_leads', 'All leads')}</Link>}>
      {rows.length === 0
        ? <EmptyState icon={Target} title={t('crm.today.no_new', 'No new leads today')} line={t('crm.today.no_new_line', 'Leads from the website chat, your forms and your team show here as they come in.')} />
        : (
          <ul className="divide-y divide-a-border">
            {rows.map(lead => (
              <li key={lead.id}>
                <Link to={leadPath(lead.id)} className={`${ROW_LINK} items-center`}>
                  <Avatar name={lead.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-a-text">{lead.name ?? t('crm.common.no_name', 'No name')}</span>
                    <span className="block truncate text-xs text-a-text-2">{[lead.company, timeAgo(lead.created_at, lang)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {lead.source && <Pill>{lead.source}</Pill>}
                    {lead.value !== null && <span className="text-xs tabular-nums text-a-text-2">{money(lead.value, currency, lang)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      <SeeAll links={[{ to: '/crm/leads', label: t('crm.today.all_new', 'All {{count}} new leads', { count: data.leads.new }), show: hasMore(data.leads.new, rows.length) }]} />
    </Card>
  )
}

/** The website chat over the last seven days (the server's counts). */
function Week({ data, lang }: { data: Today; lang: string }) {
  const { t } = useTranslation()
  const aiShare = percent(data.week.ai_resolved, data.week.conversations)
  const figure = 'mt-1 font-a-display text-2xl leading-none'
  return (
    <Card title={t('crm.today.week_title', 'The website chat this week')} description={t('crm.today.week_line', 'The last seven days')} icon={Bot} tone="ai"
      action={<Link to="/crm/insights?days=7" className={TEXT_LINK}><BarChart3 size={14} aria-hidden />{t('crm.today.week_more', 'Insights')}</Link>}>
      <dl className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-a-surface-2 px-2.5 py-2.5">
          <dt className="text-xs text-a-text-2">{t('crm.today.week_chats', 'Conversations')}</dt>
          <dd className={`${figure} text-a-text`}>{count(data.week.conversations, lang)}</dd>
        </div>
        <div className="rounded-xl crm-ai-soft px-2.5 py-2.5">
          <dt className="text-xs">{t('crm.today.week_ai', 'Closed by the AI')}</dt>
          <dd className={figure}>{aiShare === null ? '—' : `${aiShare} %`}</dd>
        </div>
        <div className="rounded-xl bg-a-surface-2 px-2.5 py-2.5">
          <dt className="text-xs text-a-text-2">{t('crm.today.week_leads', 'Leads from chat')}</dt>
          <dd className={`${figure} text-a-text`}>{count(data.week.leads_from_chat, lang)}</dd>
        </div>
      </dl>
      <p className="mt-3 flex items-start gap-2 text-xs text-a-text-2">
        <Sparkles size={13} aria-hidden className="mt-0.5 shrink-0 crm-ai-text" />
        {t('crm.today.week_hint', 'Chats the assistant closed with nobody from your team stepping in.')}
      </p>
    </Card>
  )
}
