import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, BookOpen, Bot, Check, Code2, Columns3, ListChecks, MessageCircleReply, PartyPopper, Rocket, Users, type LucideIcon } from 'lucide-react'
import { crmApi } from '../lib/api'
import type { SetupStepKey } from '../lib/types'
import { InfoTip } from '../ui/InfoTip'
import { Page } from '../ui/Page'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { nextStep, progressShare } from './startLogic'

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

const BUTTON = 'inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-a-accent'

/**
 * Get started (2026-11-07; round 2, "a clean checklist with progress"): the six setup steps, each done when the data
 * says so (the server's CrmSetupProgress), the next one to do marked, and each step's action as a button to where it
 * is done.
 */
export function StartPage() {
  const { t } = useTranslation()
  const start = useQuery({ queryKey: ['crm', 'start'], queryFn: crmApi.start })
  const actions = useStepActions()

  return (
    <Page icon={Rocket} title={t('crm.start.title', 'Get started')} line={t('crm.start.line', 'Six steps to a website chat that answers, and a pipeline that follows up.')}>
      <QueryState loading={start.isLoading} error={start.error} onRetry={() => { void start.refetch() }}>
        {start.data && (() => {
          const data = start.data
          const next = nextStep(data.steps)
          const share = progressShare(data.done, data.total)
          return (
            <div className="space-y-5">
              <section aria-label={t('crm.start.progress_label', 'Your progress')} className="rounded-2xl border border-a-border bg-a-surface p-4 shadow-a-sm sm:p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <span aria-hidden className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${data.complete ? 'bg-a-st-confirmed/12 text-a-st-confirmed' : 'bg-a-accent/12 text-a-accent-text'}`}>
                    {data.complete ? <PartyPopper size={22} /> : <ListChecks size={22} />}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-a-display text-3xl leading-none text-a-text">{share} %</span>
                      <span className="text-sm text-a-text-2">{t('crm.start.progress', '{{done}} of {{total}} done', { done: data.done, total: data.total })}</span>
                    </p>
                    <div className="h-2 overflow-hidden rounded-full bg-a-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={data.total} aria-valuenow={data.done}
                      aria-label={t('crm.start.progress', '{{done}} of {{total}} done', { done: data.done, total: data.total })}>
                      <div className={`h-full rounded-full transition-[width] ${data.complete ? 'bg-a-st-confirmed' : 'bg-a-accent'}`} style={{ width: `${share}%` }} />
                    </div>
                    <p className="text-sm text-a-text-2">
                      {data.complete
                        ? t('crm.start.complete', 'Everything is set up. Your chat answers, and your pipeline follows up.')
                        : t('crm.start.next_line', 'Next: {{step}}', { step: next ? t(`crm.start.${next.key}.title`, DEFAULTS[next.key][0]) : '' })}
                    </p>
                  </div>
                  {data.complete
                    ? <Link to="/crm" className={`${BUTTON} bg-a-accent text-a-accent-ink hover:bg-a-accent-deep`}>{t('crm.start.to_today', 'Go to Today')}<ArrowRight size={15} aria-hidden /></Link>
                    : next && <Link to={STEPS[next.key].to} className={`${BUTTON} bg-a-accent text-a-accent-ink hover:bg-a-accent-deep`}>{actions[next.key]}<ArrowRight size={15} aria-hidden /></Link>}
                </div>
              </section>

              {/* Round 5 (owner 2026-11-12, "more icons, minimize copy"): the steps as tiles; each one's sentence is its (i). */}
              <ol aria-label={t('crm.start.list_title', 'The steps')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.steps.map((step, index) => {
                  const { icon: Icon, to: target } = STEPS[step.key]
                  const isNext = next?.key === step.key
                  return (
                    <li key={step.key} className={`flex min-w-0 flex-col gap-3 rounded-2xl border bg-a-surface p-4 shadow-a-sm ${isNext ? 'border-a-accent' : 'border-a-border'}`}>
                      <div className="flex items-start gap-3">
                        <span aria-hidden className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl ${step.done ? 'bg-a-st-confirmed/12 text-a-st-confirmed' : isNext ? 'bg-a-accent text-a-accent-ink' : 'bg-a-surface-2 text-a-text-2'}`}>
                          <Icon size={18} />
                          {step.done && <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-a-surface bg-a-st-confirmed text-a-surface"><Check size={11} strokeWidth={3} /></span>}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5">
                            <span className={`min-w-0 text-sm font-semibold ${step.done ? 'text-a-text-2' : 'text-a-text'}`}>
                              <span className="tabular-nums">{index + 1}.</span> {t(`crm.start.${step.key}.title`, DEFAULTS[step.key][0])}
                            </span>
                            <InfoTip text={t(`crm.start.${step.key}.line`, DEFAULTS[step.key][1])} />
                          </p>
                          <p className="mt-1">
                            {step.done
                              ? <Pill tone="success">{t('crm.start.done', 'Done')}</Pill>
                              : isNext ? <Pill tone="accent">{t('crm.start.up_next', 'Up next')}</Pill> : <span className="text-xs text-a-text-2">{t('crm.start.to_do', 'To do')}</span>}
                          </p>
                        </div>
                      </div>
                      <Link to={target}
                        className={`${BUTTON} mt-auto self-start ${step.done ? 'border border-a-border bg-a-surface text-a-text hover:bg-a-surface-2' : isNext ? 'bg-a-accent text-a-accent-ink hover:bg-a-accent-deep' : 'border border-a-accent/40 bg-a-surface text-a-accent-text hover:bg-a-accent/10'}`}>
                        {step.done ? t('crm.start.open', 'Open') : actions[step.key]}
                        <ArrowRight size={14} aria-hidden />
                      </Link>
                    </li>
                  )
                })}
              </ol>
            </div>
          )
        })()}
      </QueryState>
    </Page>
  )
}

/** Each step's button, written out so every word is found and translated. */
function useStepActions(): Record<SetupStepKey, string> {
  const { t } = useTranslation()
  return {
    widget: t('crm.start.widget.action', 'Get the code'),
    assistant: t('crm.start.assistant.action', 'Set its voice'),
    knowledge: t('crm.start.knowledge.action', 'Add answers'),
    reply: t('crm.start.reply.action', 'Open the inbox'),
    pipeline: t('crm.start.pipeline.action', 'Set up stages'),
    team: t('crm.start.team.action', 'Invite someone'),
  }
}
