import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Bot, CalendarClock, CheckSquare, Coins, Inbox, MessagesSquare, Rocket, Sparkles, Target, UserPlus } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { crmApi } from '../lib/api'
import { count, dayLabel, money, percent, timeAgo } from '../lib/format'
import { conversationPath, leadPath } from '../lib/links'
import type { Today } from '../lib/types'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Page } from '../ui/Page'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { StatTile } from '../ui/StatTile'

/**
 * Today (2026-11-07): what needs a person now — chats waiting for a reply, follow-ups due, your tasks, new leads —
 * and how the website chat went this week. Every figure is the server's (CrmToday); the page only places and words them.
 */
export function TodayPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const today = useQuery({ queryKey: ['crm', 'today'], queryFn: crmApi.today, staleTime: 20_000, refetchInterval: 60_000 })

  return (
    <Page title={t('crm.today.title', 'Today')} line={t('crm.today.line', 'What needs you now, from the website chat and your pipeline.')}
      actions={<Link to="/crm/leads?new=1" className="inline-flex items-center gap-2 rounded-full bg-a-accent px-4 py-2.5 text-sm font-semibold text-a-accent-ink shadow-a-sm hover:bg-a-accent-deep"><UserPlus size={15} aria-hidden />{t('crm.today.add_lead', 'Add a lead')}</Link>}>
      {!boot.setup.complete && (
        <Link to="/crm/start" className="flex items-center gap-3 rounded-2xl border border-a-accent/30 bg-a-accent/8 px-4 py-3 text-sm text-a-text hover:border-a-accent/60">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-a-accent text-a-accent-ink"><Rocket size={17} /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t('crm.today.setup_title', 'Finish setting up HexaTech CRM')}</span>
            <span className="block text-a-text-2">{t('crm.today.setup_line', '{{done}} of {{total}} steps done. Put the chat on your website, teach the assistant and you are ready.', { done: boot.setup.done, total: boot.setup.total })}</span>
          </span>
          <ArrowRight size={16} aria-hidden className="shrink-0 text-a-text-2" />
        </Link>
      )}
      <QueryState loading={today.isLoading} error={today.error} onRetry={() => { void today.refetch() }}>
        {today.data && <TodayBody data={today.data} lang={lang} currency={boot.venue.currency} />}
      </QueryState>
    </Page>
  )
}

function TodayBody({ data, lang, currency }: { data: Today; lang: string; currency: string }) {
  const { t } = useTranslation()
  const due = data.leads.due_today + data.leads.overdue
  const aiShare = percent(data.week.ai_resolved, data.week.conversations)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile icon={Inbox} tone={data.chats.waiting > 0 ? 'pending' : 'neutral'} label={t('crm.today.waiting', 'Waiting for a reply')} value={count(data.chats.waiting, lang)}
          hint={t('crm.today.unassigned', '{{count}} open with nobody assigned', { count: data.chats.unassigned })} to="/crm/inbox?status=waiting" />
        <StatTile icon={MessagesSquare} tone="progress" label={t('crm.today.open_chats', 'Open chats')} value={count(data.chats.open, lang)}
          hint={t('crm.today.last_24h', 'In the last 24 hours')} to="/crm/inbox" />
        <StatTile icon={UserPlus} tone="accent" label={t('crm.today.new_leads', 'New leads')} value={count(data.leads.new, lang)}
          hint={t('crm.today.last_24h', 'In the last 24 hours')} to="/crm/leads" />
        <StatTile icon={CalendarClock} tone={data.leads.overdue > 0 ? 'danger' : 'neutral'} label={t('crm.today.follow_ups', 'Follow-ups due')} value={count(due, lang)}
          hint={t('crm.today.overdue', '{{count}} overdue', { count: data.leads.overdue })} to="/crm/leads?due=1" />
        <StatTile icon={CheckSquare} tone={data.tasks.overdue > 0 ? 'danger' : 'neutral'} label={t('crm.today.your_tasks', 'Your tasks')} value={count(data.tasks.due_today + data.tasks.overdue, lang)}
          hint={t('crm.today.overdue', '{{count}} overdue', { count: data.tasks.overdue })} to="/crm/tasks" />
        <StatTile icon={Coins} tone="success" label={t('crm.today.pipeline', 'Open pipeline')} value={money(data.pipeline.open_value, currency, lang)}
          hint={t('crm.today.open_leads', '{{count}} open leads', { count: data.pipeline.open_count })} to="/crm/pipeline" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t('crm.today.chats_title', 'Chats waiting for a reply')} icon={Inbox} padded={false}
          action={<Link to="/crm/inbox" className="text-sm font-medium text-a-accent-text hover:underline">{t('crm.today.open_inbox', 'Open the inbox')}</Link>}>
          {data.chats.list.length === 0
            ? <EmptyState icon={Sparkles} title={t('crm.today.no_chats', 'Nobody is waiting')} line={t('crm.today.no_chats_line', 'The assistant answers visitors; a chat comes here when it hands one to your team.')} />
            : (
              <ul className="divide-y divide-a-border">
                {data.chats.list.map(chat => (
                  <li key={chat.id}>
                    <Link to={conversationPath(chat.id)} className="flex items-start gap-3 px-4 py-3 hover:bg-a-surface-2">
                      <Avatar name={chat.name ?? chat.email} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-a-text">{chat.name ?? chat.email ?? t('crm.common.visitor', 'Visitor')}</span>
                          <span className="ml-auto shrink-0 text-xs text-a-text-2">{timeAgo(chat.last_at, lang)}</span>
                        </span>
                        {chat.excerpt && <span className="mt-0.5 line-clamp-2 block text-sm text-a-text-2">{chat.excerpt}</span>}
                        <span className="mt-1 flex flex-wrap gap-1.5">
                          <Pill tone="pending">{t('crm.status.waiting', 'Waiting')}</Pill>
                          {chat.assigned_to ? <Pill>{chat.assigned_to.name}</Pill> : <Pill tone="danger">{t('crm.today.nobody', 'Nobody assigned')}</Pill>}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </Card>

        <Card title={t('crm.today.follow_ups_title', 'Follow-ups')} icon={CalendarClock} padded={false}
          action={<Link to="/crm/leads" className="text-sm font-medium text-a-accent-text hover:underline">{t('crm.today.all_leads', 'All leads')}</Link>}>
          {data.leads.follow_ups.length === 0
            ? <EmptyState icon={Target} title={t('crm.today.no_follow_ups', 'No follow-ups due')} line={t('crm.today.no_follow_ups_line', 'Set a next step on a lead and it shows here on its day.')} />
            : (
              <ul className="divide-y divide-a-border">
                {data.leads.follow_ups.map(lead => (
                  <li key={lead.id}>
                    <Link to={leadPath(lead.id)} className="flex items-center gap-3 px-4 py-3 hover:bg-a-surface-2">
                      <Avatar name={lead.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-a-text">{lead.name ?? t('crm.common.no_name', 'No name')}{lead.company ? ` · ${lead.company}` : ''}</span>
                        <span className="block truncate text-xs text-a-text-2">{lead.task_note ?? lead.task_type ?? lead.status}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <Pill tone={lead.overdue ? 'danger' : 'pending'}>{lead.overdue ? t('crm.today.overdue_since', 'Since {{day}}', { day: dayLabel(lead.due, lang) }) : t('crm.today.due_today', 'Today')}</Pill>
                        {lead.value !== null && <span className="mt-1 block text-xs text-a-text-2">{money(lead.value, currency, lang)}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </Card>

        <Card title={t('crm.today.tasks_title', 'Your tasks')} icon={CheckSquare} padded={false}
          action={<Link to="/crm/tasks" className="text-sm font-medium text-a-accent-text hover:underline">{t('crm.today.all_tasks', 'All tasks')}</Link>}>
          {data.tasks.list.length === 0
            ? <EmptyState icon={CheckSquare} title={t('crm.today.no_tasks', 'Nothing due today')} />
            : (
              <ul className="divide-y divide-a-border">
                {data.tasks.list.map(task => (
                  <li key={task.id}>
                    <Link to={task.inquiry_id ? leadPath(task.inquiry_id) : '/crm/tasks'} className="flex items-center gap-3 px-4 py-3 hover:bg-a-surface-2">
                      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${task.overdue ? 'bg-a-danger' : 'bg-a-st-pending'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-a-text">{task.title}</span>
                        {task.contact && <span className="block truncate text-xs text-a-text-2">{task.contact}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-a-text-2">{timeAgo(task.due_at, lang)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </Card>

        <Card title={t('crm.today.week_title', 'The website chat this week')} icon={Bot}>
          <dl className="grid grid-cols-3 gap-3 text-center">
            <div><dt className="text-xs text-a-text-2">{t('crm.today.week_chats', 'Conversations')}</dt><dd className="mt-1 font-a-display text-2xl text-a-text">{count(data.week.conversations, lang)}</dd></div>
            <div><dt className="text-xs text-a-text-2">{t('crm.today.week_ai', 'Closed by the AI')}</dt><dd className="mt-1 font-a-display text-2xl crm-ai-text">{aiShare === null ? '—' : `${aiShare} %`}</dd></div>
            <div><dt className="text-xs text-a-text-2">{t('crm.today.week_leads', 'Leads from chat')}</dt><dd className="mt-1 font-a-display text-2xl text-a-text">{count(data.week.leads_from_chat, lang)}</dd></div>
          </dl>
          {data.leads.new_list.length > 0 && (
            <div className="mt-4 border-t border-a-border pt-3">
              <p className="mb-2 text-xs font-medium text-a-text-2">{t('crm.today.newest', 'Newest leads')}</p>
              <ul className="space-y-1.5">
                {data.leads.new_list.slice(0, 4).map(lead => (
                  <li key={lead.id}>
                    <Link to={leadPath(lead.id)} className="flex items-center gap-2 text-sm text-a-text hover:underline">
                      <span className="min-w-0 flex-1 truncate">{lead.name ?? t('crm.common.no_name', 'No name')}</span>
                      {lead.source && <Pill>{lead.source}</Pill>}
                      <span className="shrink-0 text-xs text-a-text-2">{timeAgo(lead.created_at, lang)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
