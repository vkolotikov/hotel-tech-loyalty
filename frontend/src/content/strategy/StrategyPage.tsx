import { useEffect, useRef, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import type { StrategySummary } from '../lib/types'
import { PageHeader } from '../ui/PageHeader'
import { PillarBalance } from './PillarBalance'
import { StrategyDocument } from './StrategyDocument'
import { freshFailure, generationFinished, generationState, pickStrategy, safeOutput, serverClock, strategyTitle, type Generation } from './strategyMath'

const STATUS_TEXT: Record<StrategySummary['status'], string> = {
  generating: 'Being made', active: 'Active', superseded: 'Replaced', archived: 'Archived', failed: 'Failed',
}

/** A strategy's status as a small pill; the active one in the accent. */
export function StrategyStatus({ status }: { status: StrategySummary['status'] }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${status === 'active' ? 'border-a-accent-text text-a-accent-text' : 'border-a-border text-a-text-2'}`}>
      {t(`content.strategy.status.${status}`, STATUS_TEXT[status])}
    </span>
  )
}

/**
 * Strategy (spec §4.5): the brand's active strategy read as a document, with
 * this month's pillar balance; `?id=` shows a past one. Everyone reads it;
 * the managers' actions (make a new one, past strategies, make active,
 * archive) arrive in `actions` (StrategyScreen).
 */
export function StrategyPage({ actions }: { actions?: (shown: StrategySummary | null, strategies: StrategySummary[], generation: Generation) => ReactNode } = {}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const [params] = useSearchParams()
  const list = useQuery({
    queryKey: ['content', brand, 'strategies'], queryFn: api.strategies, staleTime: 300_000,
    // While a strategy is being made the list is read every 5 s; it stops once it is made, failed, or stuck.
    refetchInterval: (query) => (generationState(query.state.data?.strategies ?? [], serverClock(query.state.data, query.state.dataUpdatedAt)).state === 'running' ? 5_000 : false),
  })
  const strategies = list.data?.strategies ?? []
  // "Stuck" is judged on the server's clock: this computer's may run fast or slow.
  const generation = generationState(strategies, serverClock(list.data, list.dataUpdatedAt))
  const queryClient = useQueryClient()
  // A finished generation changes which strategy is active: every cached detail (the old active's balance too) is read again.
  const lastState = useRef(generation.state)
  useEffect(() => {
    if (generationFinished(lastState.current, generation.state)) void queryClient.invalidateQueries({ queryKey: ['content', brand, 'strategy'] })
    lastState.current = generation.state
  }, [generation.state, queryClient, brand])
  const asked = Number(params.get('id'))
  const shown = strategies.find(s => s.id === asked) ?? pickStrategy(strategies)
  const finished = shown !== null && shown.status !== 'generating' && shown.status !== 'failed'
  const detail = useQuery({
    queryKey: ['content', brand, 'strategy', shown?.id ?? null], queryFn: () => api.strategy((shown as StrategySummary).id),
    enabled: finished, staleTime: 300_000,
  })
  const strategy = detail.data?.strategy ?? null
  const title = (shown && shown.status !== 'generating' && shown.status !== 'failed' && safeOutput(strategy?.ai_output).title) || (shown ? strategyTitle(shown, t) : '')
  // A new strategy that failed while the old one stays active (and on screen) is said, not just listed.
  const failure = freshFailure(strategies)

  return (
    <div className="space-y-4 px-4 py-4 lg:px-6">
      <PageHeader title={t('content.strategy.title', 'Strategy')}>{actions?.(shown, strategies, generation)}</PageHeader>
      {generation.state === 'running' && (
        <Notice tone="info">
          <span className="inline-flex items-center gap-2">
            <Loader2 size={14} aria-hidden className="animate-spin" />
            {t('content.strategy.running', 'A new strategy is being made. It usually takes one to three minutes.')}
            {generation.minutes > 0 && ` ${t('content.strategy.running_since', 'Started {{minutes}} min ago.', { minutes: generation.minutes })}`}
          </span>
        </Notice>
      )}
      {failure && failure.id !== shown?.id && (
        <Notice tone="danger">{t('content.strategy.new_failed', 'The new strategy could not be made. The current strategy is unchanged; you can try again.')}</Notice>
      )}
      {generation.state === 'stuck' && (
        <Notice tone="warning">
          {boot.staff.can_manage
            ? t('content.strategy.stuck_manager', 'The new strategy is taking far longer than it should and may have stopped. You can make a new one.')
            : t('content.strategy.stuck_staff', 'The new strategy is taking far longer than it should and may have stopped.')}
        </Notice>
      )}

      {list.isLoading && <div role="status" aria-label={t('content.common.loading', 'Loading…')} className="space-y-2"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>}
      {list.isError && !list.data && (
        <div className="space-y-3">
          <Notice tone="danger">{t('content.strategy.load_failed', 'The strategy could not be loaded.')}</Notice>
          <Button variant="secondary" onClick={() => { void list.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}

      {list.data && strategies.length === 0 && (
        <Notice tone="info">
          {boot.staff.can_manage
            ? t('content.strategy.none_manager', 'This brand has no strategy yet. A strategy gives the AI its pillars, its content mix and its weekly rhythm.')
            : t('content.strategy.none_staff', 'Your manager has not made a strategy yet.')}
        </Notice>
      )}

      {shown && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-a-display text-xl text-a-text">{title}</p>
            <StrategyStatus status={shown.status} />
          </div>
          {shown.created_at && (
            <p className="text-xs text-a-text-2">
              {t('content.strategy.made_on', 'Made on {{date}}', { date: formatDay(shown.created_at, locale) })}
            </p>
          )}
          {shown.status === 'failed' && <Notice tone="danger">{t('content.strategy.failed', 'This strategy could not be made.')}</Notice>}
        </div>
      )}

      {finished && detail.isLoading && <Skeleton className="h-64" />}
      {finished && detail.isError && !detail.data && (
        <div className="space-y-3">
          <Notice tone="danger">{t('content.strategy.load_failed', 'The strategy could not be loaded.')}</Notice>
          <Button variant="secondary" onClick={() => { void detail.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}
      {strategy?.balance && <PillarBalance balance={strategy.balance} />}
      {strategy && (strategy.ai_output || strategy.pillars.length > 0) && (
        <StrategyDocument output={strategy.ai_output ?? {}} pillars={strategy.pillars} platforms={boot.platforms} locale={locale} />
      )}
    </div>
  )
}

/** A server time stamp as a day in the reader's language (the day it was made is all the page needs). */
function formatDay(iso: string, locale: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}
