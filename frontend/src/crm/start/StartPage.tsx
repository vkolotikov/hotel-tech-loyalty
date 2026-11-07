import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpen, Bot, CheckCircle2, Circle, Code2, Columns3, MessageCircleReply, Users, type LucideIcon } from 'lucide-react'
import { crmApi } from '../lib/api'
import type { SetupStepKey } from '../lib/types'
import { Page } from '../ui/Page'
import { QueryState } from '../ui/QueryState'

/** Where each step is done, and its icon (Team is /account/team, the full admin's team endpoints). */
const STEPS: Record<SetupStepKey, { icon: LucideIcon; to: string }> = {
  widget: { icon: Code2, to: '/crm/widget?tab=install' },
  assistant: { icon: Bot, to: '/crm/assistant' },
  knowledge: { icon: BookOpen, to: '/crm/assistant?tab=knowledge' },
  reply: { icon: MessageCircleReply, to: '/crm/inbox' },
  pipeline: { icon: Columns3, to: '/crm/settings?tab=pipelines' },
  team: { icon: Users, to: '/account/team' },
}

const DEFAULTS: Record<SetupStepKey, [string, string]> = {
  widget: ['Put the chat on your website', 'Copy one line into your site; visitors can write to you from every page.'],
  assistant: ['Give the assistant its voice', 'Its name, tone and what it may promise, so it speaks like your team.'],
  knowledge: ['Teach it your answers', 'At least five questions and answers, or a document with your prices and hours.'],
  reply: ['Answer your first chat', 'Take a chat over from the assistant in the inbox and reply as a person.'],
  pipeline: ['Set up your pipeline', 'The stages a lead goes through, from first contact to won.'],
  team: ['Invite a colleague', 'Share the inbox: everyone sees who is answering which chat.'],
}

/** Get started (2026-11-07): the six setup steps, each done when the data says so (the server's CrmSetupProgress). */
export function StartPage() {
  const { t } = useTranslation()
  const start = useQuery({ queryKey: ['crm', 'start'], queryFn: crmApi.start })

  return (
    <Page title={t('crm.start.title', 'Get started')} line={t('crm.start.line', 'Six steps to a website chat that answers, and a pipeline that follows up.')}>
      <QueryState loading={start.isLoading} error={start.error} onRetry={() => { void start.refetch() }}>
        {start.data && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-a-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={start.data.total} aria-valuenow={start.data.done}
                aria-label={t('crm.start.progress', '{{done}} of {{total}} done', { done: start.data.done, total: start.data.total })}>
                <div className="h-full rounded-full bg-a-accent transition-[width]" style={{ width: `${Math.round((start.data.done / start.data.total) * 100)}%` }} />
              </div>
              <span className="shrink-0 text-sm text-a-text-2">{t('crm.start.progress', '{{done}} of {{total}} done', { done: start.data.done, total: start.data.total })}</span>
            </div>
            <ol className="space-y-2">
              {start.data.steps.map((step, index) => {
                const { icon: Icon, to: target } = STEPS[step.key]
                return (
                  <li key={step.key}>
                    <Link to={target} className={`flex items-center gap-4 rounded-2xl border bg-a-surface p-4 shadow-a-sm transition-colors hover:border-a-accent/40 ${step.done ? 'border-a-border' : 'border-a-accent/30'}`}>
                      <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${step.done ? 'bg-a-st-confirmed/12 text-a-st-confirmed' : 'bg-a-accent/12 text-a-accent-text'}`}><Icon size={18} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-a-text">{index + 1}. {t(`crm.start.${step.key}.title`, DEFAULTS[step.key][0])}</span>
                        <span className="block text-sm text-a-text-2">{t(`crm.start.${step.key}.line`, DEFAULTS[step.key][1])}</span>
                      </span>
                      {step.done
                        ? <CheckCircle2 size={20} className="shrink-0 text-a-st-confirmed" aria-label={t('crm.start.done', 'Done')} />
                        : <Circle size={20} className="shrink-0 text-a-text-2" aria-label={t('crm.start.to_do', 'To do')} />}
                    </Link>
                  </li>
                )
              })}
            </ol>
          </div>
        )}
      </QueryState>
    </Page>
  )
}
