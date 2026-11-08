import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Lightbulb, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../TimeProvider'
import { timeApi } from '../lib/api'
import { errorText } from '../lib/errors'
import { usePeople, useRefresh } from '../lib/queries'
import { assignmentOf, plannerApi } from '../lib/tasks'
import type { Review, ReviewAction } from '../lib/types'
import { useToast } from '../ui/Toast'

type Ask = { kind: 'day'; date: string; person?: string | null } | { kind: 'period'; from: string; to: string; person?: string | null }

/**
 * The AI's read of a day or a period (time/review): a short summary, what stands out, and up to five changes — the ones
 * that are a single move of a single task carry an Apply, done through the full admin's own `planner/tasks/{id}/move`.
 * Nothing is asked of the AI until the person presses the button (each review spends from the month's allowance).
 */
export function ReviewCard({ ask, title, line }: { ask: Ask; title?: string; line?: string }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const people = usePeople().data?.people ?? []
  const [review, setReview] = useState<Review | null>(null)
  const [done, setDone] = useState<Set<number>>(new Set())

  const run = useMutation({
    mutationFn: () => timeApi.review({ ...ask, lang: (i18n.language || 'en').slice(0, 2) }),
    onSuccess: answer => { setReview(answer); setDone(new Set()) },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const act = useMutation({
    mutationFn: async ({ action }: { action: ReviewAction; index: number }) => {
      if (action.type === 'assign') {
        const person = people.find(p => p.key === action.person) ?? null
        return plannerApi.move(action.task_id, { task_date: ask.kind === 'day' ? ask.date : null, ...assignmentOf(person) })
      }
      if (action.type === 'move_day') return plannerApi.move(action.task_id, { task_date: action.date ?? null })
      return plannerApi.move(action.task_id, { task_date: ask.kind === 'day' ? ask.date : null, start_time: action.start_time ?? null })
    },
    onSuccess: (_, { index }) => { refresh(); setDone(s => new Set(s).add(index)); toast(t('time.review.applied', 'Changed')) },
    onError: error => toast(errorText(t, error), 'danger'),
  })

  return (
    <section className="rounded-2xl border bg-a-surface p-4 shadow-a-sm time-ai-border">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl time-ai-soft"><Sparkles size={17} /></span>
        {/* At least 12rem for the words: in a narrow column the button wraps to its own line instead. */}
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="text-sm font-semibold text-a-text">{title ?? t('time.review.title', 'AI review')}</h2>
          <p className="text-xs text-a-text-2">{line ?? t('time.review.line', 'What works, what is at risk, and what to change.')}</p>
        </div>
        <Button size="sm" variant={review ? 'secondary' : 'primary'} onClick={() => run.mutate()} loading={run.isPending} disabled={!boot.ai.ready}>
          {review ? <><RefreshCw size={14} aria-hidden />{t('time.review.again', 'Review again')}</> : t('time.review.run', 'Review with AI')}
        </Button>
      </div>
      {!boot.ai.ready && <div className="mt-3"><Notice tone="info">{t(`time.ai_state.${boot.ai.state}`, t('time.ai_state.unknown', 'The AI cannot be asked just now.'))}</Notice></div>}
      {review && (
        <div className="mt-4 space-y-3">
          <p className="text-sm leading-relaxed text-a-text">{review.summary}</p>
          {review.highlights.length > 0 && (
            <ul className="space-y-1">
              {review.highlights.map((h, i) => <li key={i} className="flex gap-2 text-sm text-a-text-2"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full time-ai-fill" />{h}</li>)}
            </ul>
          )}
          {review.suggestions.length > 0 && (
            <ul className="space-y-2">
              {review.suggestions.map((s, i) => (
                <li key={i} className="flex flex-wrap items-start gap-3 rounded-xl bg-a-surface-2 p-3">
                  <Lightbulb size={16} aria-hidden className="mt-0.5 shrink-0 time-ai-text" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-a-text">{s.title}</p>
                    {s.detail && <p className="text-xs text-a-text-2">{s.detail}</p>}
                  </div>
                  {s.action && (done.has(i)
                    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-a-st-confirmed"><Check size={14} aria-hidden />{t('time.review.done', 'Done')}</span>
                    : <Button size="sm" variant="secondary" loading={act.isPending && act.variables?.index === i} onClick={() => act.mutate({ action: s.action!, index: i })}>{t('time.review.apply', 'Apply')}</Button>)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
