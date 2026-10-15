import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import type { Platform, PostStatus } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { togglePlatform, type PlanFilter, type PlanView } from './planMath'

const VIEWS: PlanView[] = ['week', 'month', 'list']
/** The views' English names, the fallback under the bundles' words. */
const VIEW_TEXT: Record<PlanView, string> = { week: 'Week', month: 'Month', list: 'List' }
const ICON = 'rounded-full p-2 text-a-text-2 hover:bg-a-surface-2 hover:text-a-text'

/** The Plan's toolbar: back and forward, this week, the range's name, the views, Generate (managers) and the filters. */
export function Toolbar({ view, viewLocked, label, refreshing, canGenerate, filter, platforms, statuses, onPrev, onNext, onToday, onView, onFilter, onGenerate, aiPaused = false }: {
  view: PlanView
  /** Below 1024 px the list is the only view. */
  viewLocked: boolean
  label: string
  refreshing: boolean
  canGenerate: boolean
  filter: PlanFilter
  /** The platform chips worth offering (planMath.presentPlatforms). */
  platforms: Platform[]
  statuses: PostStatus[]
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onView: (view: PlanView) => void
  onFilter: (filter: PlanFilter) => void
  onGenerate: () => void
  /** This month's AI budget is used up: Generate waits. */
  aiPaused?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3 px-4 pb-3 pt-4 lg:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={onPrev} aria-label={t('content.plan.prev', 'Previous')} className={ICON}><ChevronLeft size={16} aria-hidden /></button>
          <button type="button" onClick={onToday} className="rounded-full border border-a-border bg-a-surface px-3 py-1.5 text-xs font-semibold text-a-text hover:bg-a-surface-2">
            {t('content.plan.today', 'This week')}
          </button>
          <button type="button" onClick={onNext} aria-label={t('content.plan.next', 'Next')} className={ICON}><ChevronRight size={16} aria-hidden /></button>
        </div>
        <h1 className="font-a-display text-2xl font-normal leading-tight text-a-text">{label}</h1>
        {refreshing && <Loader2 size={14} aria-hidden className="animate-spin text-a-text-2" />}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!viewLocked && (
            <div role="group" aria-label={t('content.plan.views', 'View')} className="inline-flex rounded-full border border-a-border bg-a-surface p-0.5">
              {VIEWS.map(v => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => onView(v)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${view === v ? 'bg-a-surface-2 text-a-text' : 'text-a-text-2 hover:text-a-text'}`}>
                  {t(`content.plan.view.${v}`, VIEW_TEXT[v])}
                </button>
              ))}
            </div>
          )}
          {canGenerate && (
            <Button size="sm" onClick={onGenerate} disabled={aiPaused}
              title={aiPaused ? t('content.generate.error.ai_budget_used_up', "This month's AI budget is used up.") : undefined}>
              <Sparkles size={14} aria-hidden />{t('content.plan.generate', 'Generate')}
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {platforms.length > 1 && (
          <div role="group" aria-label={t('content.plan.filter_platforms', 'Platforms')} className="flex flex-wrap items-center gap-1.5">
            {platforms.map(p => {
              const on = filter.platforms.includes(p)
              return (
                <button key={p} type="button" aria-pressed={on} onClick={() => onFilter({ ...filter, platforms: togglePlatform(filter.platforms, p) })}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${on ? 'border-a-accent-text bg-a-surface-2 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>
                  <PlatformMark platform={p} size="sm" />{t(`content.platform.${p}`, p)}
                </button>
              )
            })}
          </div>
        )}
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-a-text-2">
          <span>{t('content.plan.filter_status', 'Status')}</span>
          <select value={filter.status} onChange={(e) => onFilter({ ...filter, status: e.target.value as PlanFilter['status'] })}
            className="rounded-md border border-a-border bg-a-surface px-1.5 py-1 text-xs text-a-text">
            <option value="all">{t('content.plan.all_statuses', 'All statuses')}</option>
            {statuses.map(s => <option key={s} value={s}>{t(`content.status.${s}`, s)}</option>)}
          </select>
        </label>
      </div>
    </div>
  )
}
