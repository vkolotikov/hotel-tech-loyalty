import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FileText, Users, Building2, Copy, FilePlus2,
  GitBranch, Sparkles, ArrowLeft, ChevronRight, Search,
} from 'lucide-react'

/**
 * "Leads" hub — top of the CRM funnel. Combines pipeline intake +
 * contact identity (Customers / Companies / Duplicates) into one
 * grid-home page so staff can manage their entire leads-and-contacts
 * workflow from a single sidebar entry.
 *
 * Analytics deliberately not included — pipeline reporting lives in
 * /analytics so this hub stays focused on day-to-day record
 * management.
 *
 * Sibling hub: Deals (`/deals`) for won + working deals.
 */

const Inquiries          = lazy(() => import('../Inquiries').then(m => ({ default: m.Inquiries })))
const Customers          = lazy(() => import('../Customers').then(m => ({ default: m.Customers })))
const Corporate          = lazy(() => import('../Corporate').then(m => ({ default: m.Corporate })))
const CustomerDuplicates = lazy(() => import('../CustomerDuplicates').then(m => ({ default: m.CustomerDuplicates })))
const LeadForms          = lazy(() => import('../LeadForms').then(m => ({ default: m.LeadForms })))

type TabKey = 'inquiries' | 'customers' | 'companies' | 'duplicates' | 'lead-forms'

interface TabDef {
  key: TabKey
  label: string
  desc: string
  icon: any
}

const TABS: TabDef[] = [
  { key: 'inquiries',  label: 'Leads & Inquiries', desc: 'Open leads and inquiries moving through your sales pipeline',  icon: FileText },
  { key: 'customers',  label: 'Customers',         desc: 'Individual contacts — guests, past customers, prospects',     icon: Users },
  { key: 'companies',  label: 'Companies',         desc: 'Corporate accounts and B2B contacts',                         icon: Building2 },
  { key: 'duplicates', label: 'Duplicates',        desc: 'Possible duplicate contacts — review and merge',              icon: Copy },
  { key: 'lead-forms', label: 'Lead forms',        desc: 'Embeddable lead-capture forms — the front door for new leads', icon: FilePlus2 },
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
    id: 'pipeline',
    label: 'Pipeline',
    desc: 'Open leads moving toward a booking',
    icon: GitBranch,
    accent: '#c9a84c', // gold
    tabs: ['inquiries'],
  },
  {
    id: 'contacts',
    label: 'Contacts',
    desc: 'Identity records — who your leads actually are',
    icon: Users,
    accent: '#f472b6', // pink
    tabs: ['customers', 'companies', 'duplicates'],
  },
  {
    id: 'capture',
    label: 'Capture',
    desc: 'How new leads find their way in',
    icon: Sparkles,
    accent: '#a78bfa', // violet
    tabs: ['lead-forms'],
  },
]

const fallback = <div className="text-center text-[#636366] py-8 text-sm">Loading…</div>

export function LeadsHub() {
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
        <h1 className="text-2xl font-bold text-white">Leads</h1>
        <p className="text-sm text-t-secondary mt-0.5">Top-of-funnel inquiries plus everyone you're talking to.</p>
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
                placeholder="Search leads & contacts…"
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
              All leads
            </button>
            <span className="text-t-secondary/40">/</span>
            <div className="flex items-center gap-2 min-w-0">
              {tab && <tab.icon size={14} className="text-t-secondary flex-shrink-0" />}
              {tab && <h2 className="text-sm font-semibold text-white truncate">{tab.label}</h2>}
              {tab && <span className="hidden md:inline text-xs text-t-secondary truncate">— {tab.desc}</span>}
            </div>
          </div>

          <Suspense fallback={fallback}>
            {active === 'inquiries'  && <Inquiries />}
            {active === 'customers'  && <Customers />}
            {active === 'companies'  && <Corporate />}
            {active === 'duplicates' && <CustomerDuplicates />}
            {active === 'lead-forms' && <LeadForms />}
          </Suspense>
        </div>
      )}
    </div>
  )
}
