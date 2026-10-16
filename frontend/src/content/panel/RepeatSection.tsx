import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Repeat } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { DateKey, PostDetail, RepeatEvery, Series } from '../lib/types'
import { asksAi, repeatDates, repeatProblem, untilFor } from './repeatMath'

const EVERY: [RepeatEvery, string, string][] = [['week', 'every_week', 'Every week'], ['2weeks', 'every_2weeks', 'Every 2 weeks'], ['month', 'every_month', 'Every month']]
const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs font-medium ${on ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`

/**
 * Repeat (spec 2026-10-15 §8): a saved post with a day comes back every week, two weeks or month until a date, its
 * copies reworded by the AI if asked; the limits are checked here first, so a refusal names the limit. A post in a
 * series says how it runs and while the AI rewords it; Stop repeating removes the unpublished copies from today on,
 * asking with their number (the server's `removable`).
 */
export function RepeatSection({ post, series, dirty, onPost, onGone }: {
  post: PostDetail
  /** The series as last read (the panel reads it again while the AI rewords); null when the post does not repeat. */
  series: Series | null
  dirty: boolean
  /** The post as the server answered (repeated, or out of its series). */
  onPost: (post: PostDetail) => void
  /** Stop repeating removed this very post (a copy dated today or later). */
  onGone: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const boot = useBoot()
  const today = boot.venue.today
  const from = post.scheduled_date
  const [every, setEvery] = useState<RepeatEvery>('week')
  const [picked, setPicked] = useState<DateKey | null>(null)
  const until = untilFor(picked, from, today)
  const [ai, setAi] = useState(false)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const paused = boot.ai.status === 'over'
  // A box ticked before the budget ran out counts as unticked: the copies still repeat, as the notice says.
  const rewrite = asksAi(ai, boot.ai.status)
  // Cancel hands the focus back to Stop repeating, which stays on screen while the question is asked.
  const stopRef = useRef<HTMLSpanElement>(null)
  const w = (key: string, english: string, vars?: Record<string, unknown>) => t(`content.panel.repeat.${key}`, english, vars)
  const say = (code: string) => {
    const [key, text] = errorKey('repeat', code)
    setError(t(key, text))
  }
  const run = async (call: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await call()
    } catch (e) {
      say(failureOf(e).code)
    } finally {
      setBusy(false)
    }
  }
  const title = (
    <h3 id="content-repeat-title" className="flex items-center gap-2 font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">
      <Repeat size={14} aria-hidden />{w('title', 'Repeat')}
    </h3>
  )

  if (series) {
    const date = series.until ? formatDate(series.until, locale, { day: 'numeric', month: 'long', year: 'numeric' }) : ''
    const how = series.every === 'month'
      ? w('line_month', 'Repeats every month until {{date}}', { date })
      : series.every === '2weeks' ? w('line_2weeks', 'Repeats every 2 weeks until {{date}}', { date }) : w('line_week', 'Repeats every week until {{date}}', { date })
    return (
      <section aria-labelledby="content-repeat-title" className="space-y-2">
        {title}
        <p className="text-sm text-a-text">{how} · {w('more', '{{count}} more', { count: series.more })}</p>
        {series.rewriting && <p role="status" className="text-xs text-a-text-2">{w('rewording', 'The AI is rewording the copies…')}</p>}
        <span ref={stopRef} className="inline-flex">
          <Button size="sm" variant="secondary" disabled={busy || dirty} aria-expanded={asking} onClick={() => setAsking(a => !a)}>{w('stop', 'Stop repeating')}</Button>
        </span>
        {asking && (
          <div role="alert" className="space-y-2 rounded-lg border border-a-danger/30 bg-a-danger/10 p-3">
            <p className="text-sm text-a-text">{w('stop_confirm', 'Stop repeating? The copies from today on will be removed ({{count}}); published posts and the original stay.', { count: series.removable })}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="danger" loading={busy}
                onClick={() => { void run(async () => { const { post: kept } = await api.stopRepeat(post.id); setAsking(false); if (kept) onPost(kept); else onGone() }) }}>
                {w('stop_yes', 'Stop repeating')}
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setAsking(false); stopRef.current?.querySelector('button')?.focus() }}>{t('content.common.cancel', 'Cancel')}</Button>
            </div>
          </div>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </section>
    )
  }

  if (from === null) {
    return (
      <section aria-labelledby="content-repeat-title" className="space-y-2">
        {title}
        <p className="text-xs text-a-text-2">{w('needs_day', 'Give the post a day to repeat it.')}</p>
      </section>
    )
  }

  const problem = repeatProblem({ from, every, until, aiRewrite: rewrite, today })
  const count = repeatDates(from, every, until, today).length
  const [problemKey, problemText] = problem ? errorKey('repeat', problem) : (['', ''] as [string, string])
  const submit = () => {
    if (problem) {
      say(problem)
      return
    }
    void run(async () => { onPost((await api.repeatPost(post.id, { every, until, ai_rewrite: rewrite })).post) })
  }

  return (
    <section aria-labelledby="content-repeat-title" className="space-y-3">
      {title}
      <div role="group" aria-label={w('every', 'How often')} className="flex flex-wrap gap-1.5">
        {EVERY.map(([value, key, english]) => (
          <button key={value} type="button" aria-pressed={every === value} onClick={() => setEvery(value)} className={chip(every === value)}>{w(key, english)}</button>
        ))}
      </div>
      <label className="block max-w-xs">
        <span className="mb-1 block text-xs font-medium text-a-text-2">{w('until', 'Until')}</span>
        <input type="date" value={until} min={today} onChange={(e) => setPicked(e.target.value === '' ? null : e.target.value as DateKey)}
          className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text" />
      </label>
      <label className="flex items-center gap-2 text-sm text-a-text">
        <input type="checkbox" checked={rewrite} disabled={paused} onChange={(e) => setAi(e.target.checked)} />
        {w('ai', 'Let the AI rewrite each copy')}
      </label>
      {paused && <p className="text-xs text-a-text-2">{t('content.repeat.error.ai_budget_used_up', "This month's AI budget is used up. The copies can still repeat without rewording.")}</p>}
      <p aria-live="polite" className="text-xs text-a-text-2">{problem ? t(problemKey, problemText) : w('copies', 'Copies: {{count}}', { count })}</p>
      {dirty && <p className="text-xs text-a-text-2">{t('content.panel.ai.save_first', 'Save your changes first.')}</p>}
      <Button size="sm" variant="secondary" loading={busy} disabled={dirty || problem !== null} onClick={submit}>
        <Repeat size={14} aria-hidden />{w('submit', 'Repeat')}
      </Button>
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  )
}
