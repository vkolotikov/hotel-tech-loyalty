import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  Activity, AlarmClock, ArrowRight, BarChart3, CalendarClock, CalendarPlus, Check, CheckSquare, Coins, Inbox, Loader2, MessageCircle,
  PartyPopper, Rocket, Sun, UserPlus, UserX,
} from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../CrmProvider'
import { PulseCard } from '../../workspace/pulse/PulseCard'
import { crmApi, get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { count, dayLabel, money, percent, timeAgo } from '../lib/format'
import { conversationPath } from '../lib/links'
import type { Today } from '../lib/types'
import { useRecords } from '../lib/useRecords'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { IconButton } from '../ui/IconButton'
import { Page } from '../ui/Page'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { sectionAfter } from '../ui/SectionNav'
import { StatTile } from '../ui/StatTile'
import { useToast } from '../ui/Toast'
import { TONE_CHIP, type Tone } from '../ui/tones'
import { nextStepWord, TASK_ICONS } from '../tasks/taskWords'
import { TaskOpen } from '../tasks/TaskOpen'
import { sourceLabel } from '../leads/leadWords'
import {
  ACTIVITY_PER_PAGE, activityTarget, chatRows, figuresOf, firstName, followUpRows, greetingOf, hasMore, needCounts, NEED_PARAM, NEED_TABS,
  needTabOf, nextActivityPage, NOW_ROWS, taskRows, venueClock, type ActivityPage, type ActivityRow, type NeedTab,
} from './todayLogic'
import { activityIcon, activityLabel } from './todayWords'

const TEXT_LINK = 'inline-flex items-center gap-1 rounded-sm text-sm font-medium text-a-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-a-accent'
const ROW = 'flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-a-accent sm:px-4'

/**
 * Today (2026-11-07; round 5, owner 2026-11-12: "minimize copy, more icons … opening tabs, slides or popups"): the venue's
 * clock and weather in one line, the few figures that are not zero, then what needs a person now as three tabs with their
 * counts — chats waiting, follow-ups, your tasks — five rows each, every row opening what it names (a chat in the inbox,
 * a lead in its panel, a task in the task form), then the team's activity; the new leads and the website chat's week
 * beside them. Every figure is the server's (CrmToday, CrmActivityFeed); the page only orders, picks and words them.
 */
export function TodayPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const records = useRecords()
  const lang = i18n.language
  const zone = boot.venue.timezone
  const today = useQuery({ queryKey: ['crm', 'today'], queryFn: crmApi.today, staleTime: 20_000, refetchInterval: 60_000 })
  // The venue's clock and weather (2026-11-09); the page stands without it.
  const pulse = useQuery({ queryKey: ['crm', 'pulse'], queryFn: crmApi.pulse, staleTime: 10 * 60_000, refetchInterval: 15 * 60_000, retry: false })
  const name = firstName(boot.staff.name)
  const greeting = greetingOf(venueClock(new Date(), zone).hour)
  const hello = greeting === 'morning' ? t('crm.today.greeting.morning', 'Good morning, {{name}}', { name })
    : greeting === 'afternoon' ? t('crm.today.greeting.afternoon', 'Good afternoon, {{name}}', { name })
    : t('crm.today.greeting.evening', 'Good evening, {{name}}', { name })

  return (
    <Page icon={Sun} title={name ? hello : t('crm.today.title', 'Today')}
      line={t('crm.today.line', 'What needs you now, from the website chat and your pipeline.')}
      actions={(
        // A phone has the frame's New button at the top; here the greeting keeps the width.
        <div className="hidden items-center gap-2 sm:flex">
          <IconButton icon={CalendarPlus} label={t('crm.today.add_task', 'Add a task')} onClick={() => records.create('task')} />
          <Button onClick={() => records.create('lead')} className="min-h-10 rounded-full"><UserPlus size={15} aria-hidden />{t('crm.today.add_lead', 'Add a lead')}</Button>
        </div>
      )}>
      {!boot.setup.complete && <SetupBanner done={boot.setup.done} total={boot.setup.total} />}
      <PulseCard pulse={pulse.data} greet={false} variant="strip" />
      <QueryState loading={today.isLoading} error={today.error} onRetry={() => { void today.refetch() }} rows={5}>
        {today.data && <TodayBody data={today.data} lang={lang} zone={zone} currency={boot.venue.currency} />}
      </QueryState>
    </Page>
  )
}

/** While setup is not done: how far it is, in one line, and the way on. */
function SetupBanner({ done, total }: { done: number; total: number }) {
  const { t } = useTranslation()
  const share = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <Link to="/crm/start" className="flex items-center gap-3 rounded-2xl border border-a-accent/30 bg-a-accent/8 px-3 py-2 text-sm text-a-text transition-colors hover:border-a-accent/60 focus-visible:outline-2 focus-visible:outline-a-accent">
      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-a-accent text-a-accent-ink"><Rocket size={16} /></span>
      <span className="min-w-0 truncate font-semibold">{t('crm.today.setup_title', 'Finish setting up HexaTech CRM')}</span>
      <span className="shrink-0 text-xs tabular-nums text-a-text-2">{t('crm.today.setup_count', '{{done}}/{{total}}', { done, total })}</span>
      <span aria-hidden className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-a-surface-2 sm:block">
        <span className="block h-full rounded-full bg-a-accent" style={{ width: `${share}%` }} />
      </span>
      <ArrowRight size={16} aria-hidden className="ml-auto shrink-0 text-a-accent-text" />
    </Link>
  )
}

function TodayBody({ data, lang, zone, currency }: { data: Today; lang: string; zone: string; currency: string }) {
  const { t } = useTranslation()
  const figures = figuresOf(data)

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="min-w-0 space-y-4 lg:col-span-2">
        <NeedsNow data={data} lang={lang} zone={zone} currency={currency} />
        <TeamActivity lang={lang} />
      </div>
      <div className="min-w-0 space-y-4">
        {/* The figures that are not nought, beside the work rather than above it (a phone shows the work first). */}
        {figures.length > 0 && (
          <div role="group" aria-label={t('crm.today.figures', 'The day at a glance')} className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-1">
            {figures.map((key, i) => {
              const last = i === figures.length - 1 && figures.length % 2 === 1
              const tile = key === 'open_chats'
                ? <StatTile icon={Inbox} tone="progress" label={t('crm.today.open_chats', 'Open chats')} value={count(data.chats.open, lang)}
                    hint={data.chats.unassigned > 0 ? t('crm.today.with_nobody', '{{count}} with nobody', { count: data.chats.unassigned }) : undefined} to="/crm/inbox" />
                : key === 'new_leads'
                  ? <StatTile icon={UserPlus} tone="accent" label={t('crm.today.new_leads', 'New leads')} value={count(data.leads.new, lang)} hint={t('crm.today.last_24h_short', '24 h')} to="/crm/leads" />
                  : <StatTile icon={Coins} tone="success" label={t('crm.today.pipeline', 'Open pipeline')} value={money(data.pipeline.open_value, currency, lang)}
                      hint={t('crm.today.open_short', '{{count}} open', { count: data.pipeline.open_count })} to="/crm/pipeline" />
              return <div key={key} className={last ? 'col-span-2 lg:col-span-1' : undefined}>{tile}</div>
            })}
          </div>
        )}
        <NewLeads data={data} lang={lang} currency={currency} />
        <Week data={data} lang={lang} />
      </div>
    </div>
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
      void qc.invalidateQueries({ queryKey: ['crm', 'activity'] })
      void qc.invalidateQueries({ queryKey: ['crm', item.kind === 'follow_up' ? 'leads' : 'tasks'] })
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const busy = mutation.isPending && mutation.variables ? `${mutation.variables.kind}-${mutation.variables.id}` : null
  return { done: item => mutation.mutate(item), busy }
}

/** "Done" as an icon with its tooltip, named for what it completes. */
function DoneButton({ item, label, state }: { item: Done; label: string; state: ReturnType<typeof useDone> }) {
  const { t } = useTranslation()
  const working = state.busy === `${item.kind}-${item.id}`
  return (
    <IconButton icon={working ? Loader2 : Check} label={t('crm.today.mark_done', 'Mark “{{name}}” done', { name: label })}
      onClick={() => state.done(item)} disabled={state.busy !== null} className={`hover:text-a-st-confirmed ${working ? '[&>svg]:animate-spin' : ''}`} />
  )
}

/** A row's icon in its tone's chip. */
function Chip({ icon: Icon, tone }: { icon: LucideIcon; tone: Tone }) {
  return <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONE_CHIP[tone]}`}><Icon size={15} /></span>
}

/** A row's two lines: the name, then one fact, each cut to the width. */
function Lines({ title, line }: { title: string; line?: string | null }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-a-text">{title}</span>
      {line && <span className="block truncate text-xs text-a-text-2">{line}</span>}
    </span>
  )
}

/** What needs a person now: three tabs with their counts, the first with work open unless the address names one. */
function NeedsNow({ data, lang, zone, currency }: { data: Today; lang: string; zone: string; currency: string }) {
  const { t } = useTranslation()
  const [search, setSearch] = useSearchParams()
  const counts = needCounts(data)
  const tab = needTabOf(search.get(NEED_PARAM), counts)
  const state = useDone()
  const [openTask, setOpenTask] = useState<number | null>(null)
  const choose = (next: NeedTab) => setSearch(prev => {
    const out = new URLSearchParams(prev)
    out.set(NEED_PARAM, next)
    return out
  }, { replace: true })
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = sectionAfter(NEED_TABS, tab, e.key)
    if (!next) return
    e.preventDefault()
    choose(next)
    document.getElementById(`crm-need-${next}`)?.focus()
  }
  const meta: Record<NeedTab, { icon: LucideIcon; label: string; tone: Tone }> = {
    chats: { icon: MessageCircle, label: t('crm.today.tab_chats', 'Chats waiting'), tone: 'pending' },
    follow_ups: { icon: CalendarClock, label: t('crm.today.tab_follow_ups', 'Follow-ups'), tone: data.leads.overdue > 0 ? 'danger' : 'pending' },
    tasks: { icon: CheckSquare, label: t('crm.today.tab_tasks', 'Your tasks'), tone: data.tasks.overdue > 0 ? 'danger' : 'pending' },
  }

  return (
    <Card title={t('crm.today.now_title', 'Needs you now')} icon={AlarmClock} tone={counts.chats + counts.follow_ups + counts.tasks > 0 ? 'pending' : 'success'} padded={false}>
      <div role="tablist" aria-label={t('crm.today.now_title', 'Needs you now')} className="flex gap-1 overflow-x-auto border-b border-a-border px-2 py-1.5 [scrollbar-width:none]">
        {NEED_TABS.map(key => {
          const on = key === tab
          const { icon: Icon, label, tone } = meta[key]
          return (
            <button key={key} type="button" role="tab" id={`crm-need-${key}`} aria-selected={on} aria-controls="crm-need-panel" tabIndex={on ? 0 : -1}
              onClick={() => choose(key)} onKeyDown={onKey} title={label}
              className={`flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-a-accent ${on ? 'bg-a-accent/15 text-a-text' : 'text-a-text-2 hover:bg-a-surface-2 hover:text-a-text'}`}>
              <Icon size={15} aria-hidden />
              {/* On a phone only the chosen tab spells its name; the others are their icon and count (name as tooltip). */}
              <span className={on ? 'whitespace-nowrap' : 'sr-only sm:not-sr-only sm:whitespace-nowrap'}>{label}</span>
              <span className={`min-w-6 rounded-full px-1.5 text-center text-xs font-semibold leading-5 ${counts[key] > 0 ? TONE_CHIP[tone] : 'bg-a-surface-2 text-a-text-2'}`}>{count(counts[key], lang)}</span>
            </button>
          )
        })}
      </div>
      <div id="crm-need-panel" role="tabpanel" aria-labelledby={`crm-need-${tab}`}>
        {tab === 'chats' && <ChatList data={data} lang={lang} />}
        {tab === 'follow_ups' && <FollowUpList data={data} lang={lang} currency={currency} state={state} />}
        {tab === 'tasks' && <TaskRows data={data} lang={lang} zone={zone} state={state} onOpen={setOpenTask} />}
      </div>
      {openTask !== null && <TaskOpen id={openTask} onClose={() => setOpenTask(null)} />}
    </Card>
  )
}

/** Nothing in a tab: a short word, and none of the other tabs' figures. */
function AllClear({ title }: { title: string }) {
  return (
    <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-a-text-2">
      <PartyPopper size={16} aria-hidden className="text-a-st-confirmed" />{title}
    </p>
  )
}

/** "Show all" under a tab whose server count is more than its rows. */
function ShowAll({ to, total, shown }: { to: string; total: number; shown: number }) {
  const { t } = useTranslation()
  if (!hasMore(total, shown)) return null
  return (
    <div className="border-t border-a-border px-4 py-2">
      <Link to={to} className={TEXT_LINK}>{t('crm.today.show_all', 'Show all {{count}}', { count: total })}<ArrowRight size={14} aria-hidden /></Link>
    </div>
  )
}

function ChatList({ data, lang }: { data: Today; lang: string }) {
  const { t } = useTranslation()
  const rows = chatRows(data).slice(0, NOW_ROWS)
  if (rows.length === 0) return <AllClear title={t('crm.today.clear_chats', 'Nobody is waiting')} />
  return (
    <>
      <ul className="divide-y divide-a-border">
        {rows.map(chat => (
          <li key={chat.id} className="flex">
            <Link to={conversationPath(chat.id)} className={ROW}>
              <Chip icon={MessageCircle} tone="pending" />
              <Lines title={chat.name ?? chat.email ?? t('crm.common.visitor', 'Visitor')} line={chat.excerpt} />
              {!chat.assigned_to && <span title={t('crm.today.nobody', 'Nobody assigned')} className="shrink-0 text-a-danger"><UserX size={15} aria-hidden /><span className="sr-only">{t('crm.today.nobody', 'Nobody assigned')}</span></span>}
              <span className="shrink-0 text-xs tabular-nums text-a-text-2">{timeAgo(chat.last_at, lang)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <ShowAll to="/crm/inbox?status=waiting" total={data.chats.waiting} shown={rows.length} />
    </>
  )
}

function FollowUpList({ data, lang, currency, state }: { data: Today; lang: string; currency: string; state: ReturnType<typeof useDone> }) {
  const { t } = useTranslation()
  const records = useRecords()
  const rows = followUpRows(data).slice(0, NOW_ROWS)
  if (rows.length === 0) return <AllClear title={t('crm.today.clear_follow_ups', 'No follow-up due')} />
  return (
    <>
      <ul className="divide-y divide-a-border">
        {rows.map(lead => {
          const title = `${lead.name ?? t('crm.common.no_name', 'No name')}${lead.company ? ` · ${lead.company}` : ''}`
          return (
            <li key={lead.id} className="flex items-center pr-2">
              <Link to={records.href('lead', lead.id)} className={ROW}>
                <Chip icon={CalendarClock} tone={lead.overdue ? 'danger' : 'pending'} />
                <Lines title={title} line={lead.task_note ?? nextStepWord(t, lead.task_type) ?? lead.status} />
                {lead.value !== null && <span className="hidden shrink-0 text-xs tabular-nums text-a-text-2 sm:inline">{money(lead.value, currency, lang)}</span>}
                <Pill tone={lead.overdue ? 'danger' : 'pending'}>{lead.overdue ? dayLabel(lead.due, lang) : t('crm.today.due_today', 'Today')}</Pill>
              </Link>
              <DoneButton item={{ kind: 'follow_up', id: lead.id }} label={title} state={state} />
            </li>
          )
        })}
      </ul>
      <ShowAll to="/crm/leads?due=1" total={data.leads.due_today + data.leads.overdue} shown={rows.length} />
    </>
  )
}

function TaskRows({ data, lang, zone, state, onOpen }: { data: Today; lang: string; zone: string; state: ReturnType<typeof useDone>; onOpen: (id: number) => void }) {
  const { t } = useTranslation()
  const rows = taskRows(data, zone).slice(0, NOW_ROWS)
  if (rows.length === 0) return <AllClear title={t('crm.today.clear_tasks', 'No task due')} />
  return (
    <>
      <ul className="divide-y divide-a-border">
        {rows.map(({ task, time }) => {
          const Icon = (task.type ? TASK_ICONS[task.type as keyof typeof TASK_ICONS] : null) ?? CheckSquare
          const day = task.due_at ? venueClock(new Date(task.due_at), zone).date : null
          const when = task.overdue ? [dayLabel(day, lang), time].filter(Boolean).join(', ') : (time ?? t('crm.today.due_today', 'Today'))
          return (
            <li key={task.id} className="flex items-center pr-2">
              <button type="button" onClick={() => onOpen(task.id)} data-task-open={task.id} className={ROW}
                aria-label={t('crm.today.open_task', 'Open the task “{{name}}”', { name: task.title })}>
                <Chip icon={Icon} tone={task.overdue ? 'danger' : 'progress'} />
                <Lines title={task.title} line={task.contact} />
                <Pill tone={task.overdue ? 'danger' : time ? 'progress' : 'pending'}>{when}</Pill>
              </button>
              <DoneButton item={{ kind: 'task', id: task.id }} label={task.title} state={state} />
            </li>
          )
        })}
      </ul>
      <ShowAll to="/crm/tasks" total={data.tasks.due_today + data.tasks.overdue} shown={rows.length} />
    </>
  )
}

/** The team's activity (`GET crm/activity`): who did what, on which lead, a page at a time. */
function TeamActivity({ lang }: { lang: string }) {
  const { t } = useTranslation()
  const records = useRecords()
  const feed = useInfiniteQuery({
    queryKey: ['crm', 'activity'],
    queryFn: ({ pageParam }) => get<ActivityPage>(`crm/activity${params({ page: pageParam, per_page: ACTIVITY_PER_PAGE })}`),
    initialPageParam: 1,
    getNextPageParam: last => nextActivityPage(last),
    staleTime: 30_000,
    refetchInterval: 120_000,
  })
  const rows = feed.data?.pages.flatMap(p => p.data) ?? []
  const total = feed.data?.pages[0]?.meta.total ?? 0
  const where = (row: ActivityRow): string | null => {
    const target = activityTarget(row)
    if (!target) return null
    return target.kind === 'chat' ? conversationPath(target.id) : records.href(target.kind, target.id)
  }

  return (
    <Card title={t('crm.today.activity_title', 'Team activity')} icon={Activity} tone="accent" padded={false}
      hint={total > 0 ? count(total, lang) : undefined}>
      <div className={feed.data ? '' : 'p-4'}>
        <QueryState loading={feed.isLoading} error={feed.error} onRetry={() => { void feed.refetch() }} rows={3}>
          {rows.length === 0
            ? <AllClear title={t('crm.today.no_activity', 'Nothing logged yet')} />
            : (
              <ul className="divide-y divide-a-border">
                {rows.map(row => {
                  const to = where(row)
                  const what = row.subject ?? row.excerpt ?? activityLabel(t, row.type)
                  const about = row.lead?.name ?? row.contact?.name ?? null
                  const body: ReactNode = (
                    <>
                      <Chip icon={activityIcon(row.type)} tone="neutral" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-a-text">
                          <span className="font-medium">{row.by?.name ?? t('crm.today.by_system', 'System')}</span>
                          <span className="text-a-text-2"> · {activityLabel(t, row.type)}</span>
                        </span>
                        <span className="block truncate text-xs text-a-text-2">{[about, what].filter(Boolean).join(' — ')}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-a-text-2">{timeAgo(row.occurred_at, lang)}</span>
                    </>
                  )
                  return (
                    <li key={row.id} className="flex">
                      {to ? <Link to={to} className={ROW}>{body}</Link> : <div className={ROW.replace('hover:bg-a-surface-2', '')}>{body}</div>}
                    </li>
                  )
                })}
              </ul>
            )}
        </QueryState>
      </div>
      {feed.hasNextPage && (
        <div className="border-t border-a-border px-4 py-2">
          <button type="button" onClick={() => { void feed.fetchNextPage() }} disabled={feed.isFetchingNextPage} className={TEXT_LINK}>
            {feed.isFetchingNextPage ? <Loader2 size={14} aria-hidden className="animate-spin" /> : null}{t('crm.today.more', 'Show more')}
          </button>
        </div>
      )}
    </Card>
  )
}

/** The leads that came in during the last 24 hours, each opening in its panel. */
function NewLeads({ data, lang, currency }: { data: Today; lang: string; currency: string }) {
  const { t } = useTranslation()
  const records = useRecords()
  const rows = data.leads.new_list.slice(0, NOW_ROWS)
  return (
    <Card title={t('crm.today.new_title', 'New leads')} icon={UserPlus} tone="accent" padded={false} hint={t('crm.today.last_24h_short', '24 h')}
      action={<IconButton icon={ArrowRight} size="sm" label={t('crm.today.all_leads', 'All leads')} to="/crm/leads" />}>
      {rows.length === 0
        ? <AllClear title={t('crm.today.no_new', 'No new leads today')} />
        : (
          <ul className="divide-y divide-a-border">
            {rows.map(lead => (
              <li key={lead.id} className="flex">
                <Link to={records.href('lead', lead.id)} className={ROW}>
                  <Avatar name={lead.name} size="sm" />
                  <Lines title={lead.name ?? t('crm.common.no_name', 'No name')} line={[lead.company, timeAgo(lead.created_at, lang)].filter(Boolean).join(' · ')} />
                  {lead.value !== null
                    ? <span className="shrink-0 text-xs tabular-nums text-a-text-2">{money(lead.value, currency, lang)}</span>
                    : lead.source && <Pill>{sourceLabel(t, lead.source)}</Pill>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      <ShowAll to="/crm/leads" total={data.leads.new} shown={rows.length} />
    </Card>
  )
}

/** The website chat over the last seven days (the server's counts), in one row. */
function Week({ data, lang }: { data: Today; lang: string }) {
  const { t } = useTranslation()
  const aiShare = percent(data.week.ai_resolved, data.week.conversations)
  const cell = 'flex min-w-0 flex-col justify-between rounded-xl px-2.5 py-2'
  return (
    <Card title={t('crm.today.week_title', 'The website chat this week')} icon={MessageCircle} tone="ai"
      action={<IconButton icon={BarChart3} size="sm" label={t('crm.today.week_more', 'Insights')} to="/crm/insights?days=7" />}>
      <dl className="grid grid-cols-3 gap-2">
        <div className={`${cell} bg-a-surface-2`}>
          <dt className="text-xs leading-tight text-a-text-2" title={t('crm.today.week_chats', 'Conversations')}>{t('crm.today.week_chats', 'Conversations')}</dt>
          <dd className="font-a-display text-xl leading-tight text-a-text">{count(data.week.conversations, lang)}</dd>
        </div>
        <div className={`${cell} crm-ai-soft`}>
          <dt className="text-xs leading-tight" title={t('crm.today.week_hint', 'Chats the assistant closed with nobody from your team stepping in.')}>{t('crm.today.week_ai', 'Closed by the AI')}</dt>
          <dd className="font-a-display text-xl leading-tight">{aiShare === null ? '—' : `${aiShare} %`}</dd>
        </div>
        <div className={`${cell} bg-a-surface-2`}>
          <dt className="text-xs leading-tight text-a-text-2" title={t('crm.today.week_leads', 'Leads from chat')}>{t('crm.today.week_leads', 'Leads from chat')}</dt>
          <dd className="font-a-display text-xl leading-tight text-a-text">{count(data.week.leads_from_chat, lang)}</dd>
        </div>
      </dl>
    </Card>
  )
}
