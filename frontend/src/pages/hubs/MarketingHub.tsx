import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Bell, Mail, Star,
  Send, MessageCircle, ArrowLeft, ChevronRight, Search,
} from 'lucide-react'

/**
 * "Marketing" hub — outbound communication + customer feedback. The
 * three legacy standalone pages (Notifications/Campaigns, Email
 * Templates, Reviews) live here as tabs so all marketing-adjacent
 * surfaces share one sidebar entry.
 *
 * Detail routes (/notifications/:id, /reviews/forms/:id,
 * /reviews/submissions/:id) stay outside the hub — they're leaves.
 */

const Notifications  = lazy(() => import('../Notifications').then(m => ({ default: m.Notifications })))
const EmailTemplates = lazy(() => import('../EmailTemplates').then(m => ({ default: m.EmailTemplates })))
const Reviews        = lazy(() => import('../Reviews').then(m => ({ default: m.Reviews })))

type TabKey = 'campaigns' | 'email-templates' | 'reviews'

interface TabDef {
  key: TabKey
  label: string
  desc: string
  icon: any
}

const TABS: TabDef[] = [
  { key: 'campaigns',       label: 'Campaigns',       desc: 'Scheduled and one-off push + email campaigns to your audience', icon: Bell },
  { key: 'email-templates', label: 'Email Templates', desc: 'Reusable email designs you can send to anyone, anytime',         icon: Mail },
  { key: 'reviews',         label: 'Reviews',         desc: 'Post-stay reviews and the forms used to collect them',           icon: Star },
]

interface Section {
  id: string
  label: string
  desc: string
  icon: any
  accent: string
  tabs: TabKey[]
}

const SECTIONS: Section[] = [
  {
    id: 'outreach',
    label: 'Outreach',
    desc: 'How you reach guests and prospects',
    icon: Send,
    accent: '#a78bfa', // violet
    tabs: ['campaigns', 'email-templates'],
  },
  {
    id: 'feedback',
    label: 'Feedback',
    desc: 'What guests are telling you in return',
    icon: MessageCircle,
    accent: '#c9a84c', // gold
    tabs: ['reviews'],
  },
]

const fallback = <div className="text-center text-[#636366] py-8 text-sm">Loading…</div>

export function MarketingHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  const active = (searchParams.get('tab') as TabKey | 'home' | null) || 'home'
  const setActive = (next: TabKey | 'home') => {
    if (next === 'home') {
      const sp = new URLSearchParams(searchParams)
      sp.delete('tab')
      setSearchParams(sp, { replace: true })
    } else {
      setSearchParams({ tab: next }, { replace: true })
    }
  }

  const [homeSearch, setHomeSearch] = useState('')

  const tint = (hex: string, alpha: number) => {
    const h = hex.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }

  const tab = TABS.find(td => td.key === active)
  const onHome = active === 'home' || !tab

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Marketing</h1>
        <p className="text-sm text-t-secondary mt-0.5">Reach guests with campaigns and listen to what they say back.</p>
      </div>

      {onHome ? (() => {
        const q = homeSearch.trim().toLowerCase()
        const filteredSections = SECTIONS
          .map(s => ({
            ...s,
            visibleTabs: s.tabs
              .map(id => TABS.find(td => td.key === id))
              .filter((td): td is TabDef => !!td)
              .filter(td => !q
                || td.label.toLowerCase().includes(q)
                || td.desc.toLowerCase().includes(q)
                || s.label.toLowerCase().includes(q)),
          }))
          .filter(s => s.visibleTabs.length > 0)

        return (
          <div className="space-y-8">
            <div className="relative max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
              <input
                value={homeSearch}
                onChange={(e) => setHomeSearch(e.target.value)}
                placeholder="Search marketing…"
                className="w-full bg-dark-surface border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-primary-500 transition-colors"
              />
            </div>

            {filteredSections.length === 0 && (
              <div className="text-center py-12 text-t-secondary text-sm">No matches.</div>
            )}

            {filteredSections.map(section => {
              const SIcon = section.icon
              const tileCount = section.visibleTabs.length
              const gridCols = tileCount === 1 ? 'sm:grid-cols-1 lg:grid-cols-2'
                : tileCount === 2 ? 'sm:grid-cols-2 lg:grid-cols-2'
                : 'sm:grid-cols-2 lg:grid-cols-3'
              return (
                <section key={section.id} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${tint(section.accent, 0.22)}, ${tint(section.accent, 0.08)})`,
                        border: `1px solid ${tint(section.accent, 0.35)}`,
                        boxShadow: `0 0 24px ${tint(section.accent, 0.18)}`,
                      }}
                    >
                      <SIcon size={18} style={{ color: section.accent }} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-white">{section.label}</h2>
                        <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: section.accent }} />
                        <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: section.accent }}>{tileCount}</span>
                      </div>
                      <p className="text-xs text-t-secondary">{section.desc}</p>
                    </div>
                  </div>

                  <div className={`grid grid-cols-1 ${gridCols} gap-3`}>
                    {section.visibleTabs.map(tile => {
                      const TIcon = tile.icon
                      return (
                        <button
                          key={tile.key}
                          onClick={() => setActive(tile.key)}
                          className="group relative text-left bg-dark-surface border border-dark-border rounded-xl p-4 overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = section.accent
                            e.currentTarget.style.boxShadow = `0 8px 30px ${tint(section.accent, 0.18)}`
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = ''
                            e.currentTarget.style.boxShadow = ''
                          }}
                        >
                          <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: section.accent }} />
                          <span aria-hidden className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-2xl pointer-events-none" style={{ background: tint(section.accent, 0.18) }} />
                          <div className="relative flex items-start gap-3">
                            <span
                              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                              style={{
                                background: `linear-gradient(135deg, ${tint(section.accent, 0.18)}, ${tint(section.accent, 0.04)})`,
                                border: `1px solid ${tint(section.accent, 0.3)}`,
                              }}
                            >
                              <TIcon size={20} style={{ color: section.accent }} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-semibold text-white">{tile.label}</h3>
                              <p className="text-xs text-t-secondary mt-1 line-clamp-2 leading-relaxed">{tile.desc}</p>
                            </div>
                            <ChevronRight size={16} className="text-t-secondary transition-all flex-shrink-0 mt-1 group-hover:translate-x-0.5" />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )
      })() : (
        <div className="space-y-5">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setActive('home')}
              className="flex items-center gap-1.5 text-xs text-t-secondary hover:text-white transition-colors px-2 py-1 -ml-2 rounded-md hover:bg-dark-surface2"
            >
              <ArrowLeft size={13} />
              All marketing
            </button>
            <span className="text-t-secondary/40">/</span>
            <div className="flex items-center gap-2 min-w-0">
              {tab && <tab.icon size={14} className="text-t-secondary flex-shrink-0" />}
              {tab && <h2 className="text-sm font-semibold text-white truncate">{tab.label}</h2>}
              {tab && <span className="hidden md:inline text-xs text-t-secondary truncate">— {tab.desc}</span>}
            </div>
          </div>

          <Suspense fallback={fallback}>
            {active === 'campaigns'       && <Notifications />}
            {active === 'email-templates' && <EmailTemplates />}
            {active === 'reviews'         && <Reviews />}
          </Suspense>
        </div>
      )}
    </div>
  )
}
