import { useTranslation } from 'react-i18next'
import type { Status } from '../lib/types'

type StepKey = 'confirmed' | 'in_chair' | 'completed'
const KEYS: StepKey[] = ['confirmed', 'in_chair', 'completed']
/** The step a visit is in now: -1 before it is confirmed, KEYS.length once every step is behind it. */
const STAGE: Partial<Record<Status, number>> = { pending: -1, confirmed: 0, in_progress: 1, completed: KEYS.length }

/**
 * Where a visit stands, from its status (spec 4.6): the step it IS in is `now`,
 * the ones before it `done`. Cancelled and no-show visits have no progress.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function visitSteps(status: Status): { key: StepKey; state: 'done' | 'now' | 'todo' }[] | null {
  const stage = STAGE[status]
  if (stage === undefined) return null
  return KEYS.map((key, i) => ({ key, state: i < stage ? 'done' : i === stage ? 'now' : 'todo' }))
}

export function VisitSteps({ status, className = '' }: { status: Status; className?: string }) {
  const { t } = useTranslation()
  const steps = visitSteps(status)
  if (!steps) return null
  const label: Record<StepKey, string> = {
    confirmed: t('appointments.steps.confirmed', 'Confirmed'),
    in_chair: t('appointments.steps.in_chair', 'In progress'),
    completed: t('appointments.steps.completed', 'Completed'),
  }
  return (
    <ol aria-label={t('appointments.steps.label', 'Visit progress')} className={`grid grid-cols-3 gap-2 ${className}`.trim()}>
      {steps.map(s => (
        // A completed visit has finished every step; it stands at the last one.
        <li key={s.key} aria-current={s.state === 'now' || (status === 'completed' && s.key === 'completed') ? 'step' : undefined}
          className={`flex flex-col gap-2 text-xs ${s.state === 'todo' ? 'text-a-text-2' : 'text-a-text'} ${s.state === 'now' ? 'font-semibold' : ''}`}>
          <span aria-hidden className={`h-1.5 rounded-full transition-colors duration-500 ${s.state === 'done' ? 'bg-a-accent' : s.state === 'now' ? 'bg-a-accent/45' : 'bg-a-surface-2'}`} />
          {label[s.key]}
        </li>
      ))}
    </ol>
  )
}
