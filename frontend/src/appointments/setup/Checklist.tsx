import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Checklist as ChecklistData, ChecklistKey } from '../lib/types'
import { Notice } from '../ui/Notice'

export type SetupTab = 'services' | 'team' | 'settings'

/** Where each step is done: a Setup tab, or the calendar for the first appointment. */
// eslint-disable-next-line react-refresh/only-export-components
export const STEP_TARGET: Record<ChecklistKey, SetupTab | 'calendar'> = {
  timezone: 'settings', service: 'services', performer: 'services', hours: 'team', online: 'settings', messages: 'settings', first_appointment: 'calendar',
}

const doneCount = (checklist: ChecklistData): number => checklist.steps.filter(s => s.done).length

/** A new venue's way to its first appointment, as the server counts it. */
export function Checklist({ checklist, onTab }: { checklist: ChecklistData; onTab: (tab: SetupTab) => void }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="setup-checklist-title" className="space-y-3 rounded-lg border border-a-border bg-a-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="setup-checklist-title" className="text-base font-semibold text-a-text">{t('appointments.setup.checklist.title', 'Get ready to take bookings')}</h2>
        <span className="text-xs text-a-text-2">{t('appointments.setup.checklist.progress', '{{done}} of {{total}} done', { done: doneCount(checklist), total: checklist.steps.length })}</span>
      </div>
      <ol className="space-y-2">
        {checklist.steps.map((step, i) => {
          const target = STEP_TARGET[step.key]
          const label = t(`appointments.setup.step.${step.key}`)
          return (
            <li key={step.key} className="flex items-center gap-3 text-sm">
              <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${step.done ? 'bg-a-st-confirmed/[0.12] text-a-st-confirmed' : 'bg-a-surface-2 text-a-text-2'}`}>
                {step.done ? <Check size={14} /> : i + 1}
              </span>
              <span className={step.done ? 'text-a-text-2' : 'text-a-text'}>
                {label}
                {step.done && <span className="sr-only"> ({t('appointments.setup.checklist.done', 'Done')})</span>}
              </span>
              {step.optional && <span className="text-xs text-a-text-2">{t('appointments.setup.checklist.optional', 'Optional')}</span>}
              {!step.done && (target === 'calendar'
                ? <Link to="/appointments?new=1" aria-label={label} className="ml-auto text-sm font-semibold text-a-accent-deep">{t('appointments.setup.checklist.go', 'Go')}</Link>
                : <button type="button" onClick={() => onTab(target)} aria-label={label} className="ml-auto text-sm font-semibold text-a-accent-deep">{t('appointments.setup.checklist.go', 'Go')}</button>)}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** On the calendar and the client pages while setup is unfinished: one line and the way to Setup. */
export function ChecklistBanner({ checklist }: { checklist: ChecklistData }) {
  const { t } = useTranslation()
  return (
    <Notice tone="info">
      {t('appointments.setup.checklist.banner', 'Setup is not finished: {{done}} of {{total}} steps done.', { done: doneCount(checklist), total: checklist.steps.length })}{' '}
      <Link to="/appointments/setup" className="font-semibold text-a-accent-deep underline">{t('appointments.setup.checklist.open', 'Continue setup')}</Link>
    </Notice>
  )
}
