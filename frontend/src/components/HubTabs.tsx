import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

/**
 * Tabbed hub container — used by Members / Program / Rewards /
 * Campaigns to consolidate what used to be 11 sidebar entries into
 * 4 hubs. Active tab survives reload via ?tab= query param so
 * deep-linking (and back-button) still work.
 *
 * Tabs render as a horizontal pill bar at the top of the page,
 * consistent with the existing Analytics / Rewards pages.
 */
export interface HubTab {
  key: string
  label: string
  icon?: React.ReactNode
  description?: string
  render: () => React.ReactNode
}

export function HubTabs({
  title,
  subtitle,
  tabs,
  defaultTab,
}: {
  title: string
  subtitle?: string
  tabs: HubTab[]
  defaultTab?: string
}) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initial = params.get('tab') || defaultTab || tabs[0]?.key
  const [active, setActive] = useState<string>(initial)

  // Sync state ⇄ URL so back-button + bookmarks both work.
  useEffect(() => { setActive(params.get('tab') || defaultTab || tabs[0]?.key) }, [params])
  const select = (key: string) => {
    if (key === active) return
    setActive(key)
    const next = new URLSearchParams(window.location.search)
    next.set('tab', key)
    navigate({ search: '?' + next.toString() }, { replace: false })
  }

  const activeTab = tabs.find(t => t.key === active) ?? tabs[0]
  const subText = activeTab?.description || subtitle

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subText && <p className="text-sm text-t-secondary mt-0.5">{subText}</p>}
      </div>

      <div className="flex gap-1 border-b border-dark-border overflow-x-auto -mt-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => select(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 ${
              active === t.key
                ? 'text-primary-400 border-primary-400'
                : 'text-t-secondary border-transparent hover:text-white'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div>{activeTab?.render()}</div>
    </div>
  )
}
