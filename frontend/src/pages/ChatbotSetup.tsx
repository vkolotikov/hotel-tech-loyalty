import { useState, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Bot, BookOpen, Zap, GraduationCap, MessageCircleQuestion, MessageSquareReply, LayoutTemplate,
  Brain, FileText, Sparkles, ArrowLeft, ChevronRight, Search,
} from 'lucide-react'

const ChatbotConfig     = lazy(() => import('./ChatbotConfig').then(m => ({ default: m.ChatbotConfig })))
const KnowledgeBase     = lazy(() => import('./KnowledgeBase').then(m => ({ default: m.KnowledgeBase })))
const PopupRules        = lazy(() => import('./PopupRules').then(m => ({ default: m.PopupRules })))
const Training          = lazy(() => import('./Training').then(m => ({ default: m.Training })))
const TestAi            = lazy(() => import('./ChatbotTestAi').then(m => ({ default: m.ChatbotTestAi })))
const CannedReplies     = lazy(() => import('./CannedReplies').then(m => ({ default: m.CannedReplies })))
const ChatbotWidget     = lazy(() => import('./ChatbotWidget').then(m => ({ default: m.ChatbotWidget })))

type Tab = 'config' | 'knowledge' | 'widget' | 'canned' | 'popups' | 'training' | 'test'

interface TabDef {
  key: Tab
  labelKey: string
  label: string
  descKey: string
  desc: string
  icon: any
}

const TABS: TabDef[] = [
  { key: 'config',    labelKey: 'chatbot_setup.tabs.config',    label: 'Behavior & Model', descKey: 'chatbot_setup.descs.config',    desc: 'System prompt, model selection, tone and guardrails',         icon: Bot },
  { key: 'knowledge', labelKey: 'chatbot_setup.tabs.knowledge', label: 'Knowledge Base',   descKey: 'chatbot_setup.descs.knowledge', desc: 'FAQ items, categories, and uploaded documents',               icon: BookOpen },
  { key: 'widget',    labelKey: 'chatbot_setup.tabs.widget',    label: 'Widget',           descKey: 'chatbot_setup.descs.widget',    desc: 'Widget appearance, position, colors, and copy',               icon: LayoutTemplate },
  { key: 'canned',    labelKey: 'chatbot_setup.tabs.canned',    label: 'Canned Replies',   descKey: 'chatbot_setup.descs.canned',    desc: 'Agent quick-insert library for the live chat inbox',          icon: MessageSquareReply },
  { key: 'popups',    labelKey: 'chatbot_setup.tabs.popups',    label: 'Popup Rules',      descKey: 'chatbot_setup.descs.popups',    desc: 'Proactive triggers — time on page, scroll, exit intent, URL', icon: Zap },
  { key: 'training',  labelKey: 'chatbot_setup.tabs.training',  label: 'AI Training',      descKey: 'chatbot_setup.descs.training',  desc: 'Fine-tune from graded real conversations',                    icon: GraduationCap },
  { key: 'test',      labelKey: 'chatbot_setup.tabs.test',      label: 'Test the AI',      descKey: 'chatbot_setup.descs.test',      desc: 'Quick playground to chat with your configured bot',           icon: MessageCircleQuestion },
]

interface Section {
  id: string
  labelKey: string
  label: string
  descKey: string
  desc: string
  icon: any
  accent: string
  tabs: Tab[]
}

const SECTIONS: Section[] = [
  {
    id: 'brain',
    labelKey: 'chatbot_setup.sections.brain.label', label: 'AI Brain',
    descKey:  'chatbot_setup.sections.brain.desc',  desc:  'How the chatbot thinks, learns, and how you sanity-check it',
    icon: Brain,
    accent: '#a78bfa',
    tabs: ['config', 'training', 'test'],
  },
  {
    id: 'content',
    labelKey: 'chatbot_setup.sections.content.label', label: 'Content',
    descKey:  'chatbot_setup.sections.content.desc',  desc:  'What the chatbot knows about your hotel',
    icon: FileText,
    accent: '#fbbf24',
    tabs: ['knowledge', 'canned'],
  },
  {
    id: 'widget',
    labelKey: 'chatbot_setup.sections.widget.label', label: 'Widget & Triggers',
    descKey:  'chatbot_setup.sections.widget.desc',  desc:  'How the widget looks on the customer site and when it engages',
    icon: Sparkles,
    accent: '#34d399',
    tabs: ['widget', 'popups'],
  },
]

export function ChatbotSetup() {
  const { t } = useTranslation()

  // URL-driven active tab via ?tab=<id>. 'home' = the sectioned grid
  // (default). Keeps refresh + deep links + browser back behaving the
  // same as the new Settings page.
  const [searchParams, setSearchParams] = useSearchParams()
  const active = (searchParams.get('tab') as Tab | 'home' | null) || 'home'
  const setActive = (next: Tab | 'home') => {
    if (next === 'home') {
      const sp = new URLSearchParams(searchParams)
      sp.delete('tab')
      setSearchParams(sp, { replace: true })
    } else {
      setSearchParams({ tab: next }, { replace: true })
    }
  }

  const [homeSearch, setHomeSearch] = useState('')

  // Hex → rgba — accent washes for tile backgrounds + glow shadows.
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
        <h1 className="text-2xl font-bold text-white">{t('chatbot_setup.title', 'Chatbot Setup')}</h1>
        <p className="text-sm text-t-secondary mt-0.5">{t('chatbot_setup.subtitle', 'All chatbot configuration in one place')}</p>
      </div>

      {onHome ? (() => {
        // Apply the quick filter once.
        const q = homeSearch.trim().toLowerCase()
        const filteredSections = SECTIONS
          .map(s => ({
            ...s,
            visibleTabs: s.tabs
              .map(id => TABS.find(td => td.key === id))
              .filter((td): td is TabDef => !!td)
              .filter(td => {
                if (!q) return true
                const label = t(td.labelKey, td.label).toLowerCase()
                const desc = t(td.descKey, td.desc).toLowerCase()
                const secLabel = t(s.labelKey, s.label).toLowerCase()
                return label.includes(q) || desc.includes(q) || secLabel.includes(q)
              }),
          }))
          .filter(s => s.visibleTabs.length > 0)

        return (
          <div className="space-y-8">
            {/* Quick filter */}
            <div className="relative max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
              <input
                value={homeSearch}
                onChange={(e) => setHomeSearch(e.target.value)}
                placeholder={t('chatbot_setup.home_search', 'Search chatbot settings…')}
                className="w-full bg-dark-surface border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-primary-500 transition-colors"
              />
            </div>

            {filteredSections.length === 0 && (
              <div className="text-center py-12 text-t-secondary text-sm">
                {t('chatbot_setup.home_no_match', 'No tabs match that search.')}
              </div>
            )}

            {filteredSections.map(section => {
              const SIcon = section.icon
              const tileCount = section.visibleTabs.length
              const gridCols = tileCount === 1 ? 'sm:grid-cols-1 lg:grid-cols-2'
                : tileCount === 2 ? 'sm:grid-cols-2 lg:grid-cols-2'
                : 'sm:grid-cols-2 lg:grid-cols-3'
              return (
                <section key={section.id} className="space-y-3">
                  {/* Section header */}
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
                        <h2 className="text-base font-bold text-white">
                          {t(section.labelKey, section.label)}
                        </h2>
                        <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: section.accent }} />
                        <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: section.accent }}>
                          {tileCount}
                        </span>
                      </div>
                      <p className="text-xs text-t-secondary">
                        {t(section.descKey, section.desc)}
                      </p>
                    </div>
                  </div>

                  {/* Tiles */}
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
                              <h3 className="text-sm font-semibold text-white">
                                {t(tile.labelKey, tile.label)}
                              </h3>
                              <p className="text-xs text-t-secondary mt-1 line-clamp-2 leading-relaxed">
                                {t(tile.descKey, tile.desc)}
                              </p>
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
        // Leaf: slim breadcrumb + lazy-loaded tab content.
        <div className="space-y-5">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setActive('home')}
              className="flex items-center gap-1.5 text-xs text-t-secondary hover:text-white transition-colors px-2 py-1 -ml-2 rounded-md hover:bg-dark-surface2"
            >
              <ArrowLeft size={13} />
              {t('chatbot_setup.back_to_home', 'All chatbot settings')}
            </button>
            <span className="text-t-secondary/40">/</span>
            <div className="flex items-center gap-2 min-w-0">
              {tab && <tab.icon size={14} className="text-t-secondary flex-shrink-0" />}
              {tab && <h2 className="text-sm font-semibold text-white truncate">{t(tab.labelKey, tab.label)}</h2>}
              {tab && <span className="hidden md:inline text-xs text-t-secondary truncate">— {t(tab.descKey, tab.desc)}</span>}
            </div>
          </div>

          <Suspense fallback={<div className="text-center text-[#636366] py-12">{t('chatbot_setup.loading', 'Loading...')}</div>}>
            {active === 'config'    && <ChatbotConfig />}
            {active === 'knowledge' && <KnowledgeBase />}
            {active === 'widget'    && <ChatbotWidget />}
            {active === 'canned'    && <CannedReplies />}
            {active === 'popups'    && <PopupRules />}
            {active === 'training'  && <Training />}
            {active === 'test'      && <TestAi />}
          </Suspense>
        </div>
      )}
    </div>
  )
}
