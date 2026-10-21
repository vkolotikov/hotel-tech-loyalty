import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { PANEL_TABS, paneId, tabAfter, tabId, type PanelTab } from './panelMath'

const TEXT: Record<PanelTab, string> = { content: 'Content', ai: 'AI tools', activity: 'Activity' }

/**
 * The panel's tabs (spec 2026-10-21 §7.3): Content, AI tools and Activity — with the number of comments when there are
 * any. One tab stop; the arrows, Home and End move and choose.
 */
export function PanelTabList({ tab, onTab, comments }: { tab: PanelTab; onTab: (tab: PanelTab) => void; comments: number }) {
  const { t } = useTranslation()
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = tabAfter(tab, e.key)
    if (next === null) return
    e.preventDefault()
    onTab(next)
    document.getElementById(tabId(next))?.focus()
  }
  const label = (k: PanelTab) => k === 'activity' && comments > 0
    ? t('content.panel.tab_activity_count', 'Activity ({{count}})', { count: comments })
    : t(`content.panel.tab_${k}`, TEXT[k])
  return (
    <div role="tablist" aria-label={t('content.panel.details', 'Post details')} className="flex gap-5 border-b border-a-border px-5">
      {PANEL_TABS.map(k => (
        <button key={k} type="button" role="tab" id={tabId(k)} aria-selected={tab === k} aria-controls={paneId(k)} tabIndex={tab === k ? 0 : -1}
          onClick={() => onTab(k)} onKeyDown={onKey}
          className={`-mb-px border-b-2 py-2.5 text-sm font-medium ${tab === k ? 'border-a-accent-text text-a-accent-text' : 'border-transparent text-a-text-2 hover:text-a-text'}`}>
          {label(k)}
        </button>
      ))}
    </div>
  )
}
