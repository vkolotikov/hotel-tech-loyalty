import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react'
import { viewAfter, VIEW_ORDER, type PlanView } from './planMath'

/** The views' English names, the fallback under the bundles' words. */
const VIEW_TEXT: Record<PlanView, string> = { week: 'Week', month: 'Month', list: 'List' }
const ICON = 'rounded-lg border border-a-border bg-a-surface p-1.5 text-a-text-2 hover:bg-a-surface-2 hover:text-a-text'

/**
 * The Plan's calendar bar (spec 2026-10-21 §6.3): the range's name in the display face, back, forward and Today, and
 * one group with Generate (managers, the AI violet) and the views as a radio group. The filters are FilterRow's, above it.
 */
export function Toolbar({ view, viewLocked, label, refreshing, canGenerate, onPrev, onNext, onToday, onView, onGenerate, aiPaused = false }: {
  view: PlanView
  /** Below 1024 px the list is the only view. */
  viewLocked: boolean
  label: string
  refreshing: boolean
  canGenerate: boolean
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onView: (view: PlanView) => void
  onGenerate: () => void
  /** This month's AI budget is used up: Generate waits. */
  aiPaused?: boolean
}) {
  const { t } = useTranslation()
  // The radio group's keys: the arrows move and choose, the focus follows the choice.
  const onViewKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = viewAfter(view, e.key)
    if (next === null) return
    e.preventDefault()
    onView(next)
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-view="${next}"]`)?.focus())
  }
  return (
    <div className="px-4 pb-3 lg:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-1 font-a-display text-[28px] font-normal leading-tight text-a-text">{label}</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onPrev} aria-label={t('content.plan.prev', 'Previous')} className={ICON}><ChevronLeft size={16} aria-hidden /></button>
          <button type="button" onClick={onNext} aria-label={t('content.plan.next', 'Next')} className={ICON}><ChevronRight size={16} aria-hidden /></button>
        </div>
        <button type="button" onClick={onToday} className="rounded-lg border border-a-border bg-a-surface px-3 py-1.5 text-sm font-semibold text-a-text hover:bg-a-surface-2">
          {t('content.common.today', 'Today')}
        </button>
        {refreshing && <Loader2 size={14} aria-hidden className="animate-spin text-a-text-2" />}
        {(canGenerate || !viewLocked) && (
          <div data-views="" className="ml-auto inline-flex items-center gap-1 rounded-xl border border-a-border bg-a-surface p-1">
            {canGenerate && (
              <button type="button" onClick={onGenerate} disabled={aiPaused}
                title={aiPaused ? t('content.generate.error.ai_budget_used_up', "This month's AI budget is used up.") : undefined}
                className="c-ai inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold shadow-a-sm disabled:opacity-60">
                <Sparkles size={14} aria-hidden />{t('content.plan.generate', 'Generate')}
              </button>
            )}
            {!viewLocked && (
              <div role="radiogroup" aria-label={t('content.plan.views', 'View')} className="flex items-center gap-1">
                {VIEW_ORDER.map(v => (
                  <button key={v} type="button" role="radio" aria-checked={view === v} tabIndex={view === v ? 0 : -1} data-view={v}
                    onClick={() => onView(v)} onKeyDown={onViewKey}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${view === v ? 'bg-a-accent text-a-accent-ink' : 'text-a-text-2 hover:text-a-text'}`}>
                    {t(`content.plan.view.${v}`, VIEW_TEXT[v])}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
