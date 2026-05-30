import { useState, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Bot, BookOpen, Zap, GraduationCap, MessageCircleQuestion, MessageSquareReply, LayoutTemplate,
  ArrowLeft, Search,
} from 'lucide-react'

/**
 * Chatbot Setup hub. Layout (2026-05-30 rev): flat square-tile grid.
 * Section headers (AI Brain / Content / Widget & Triggers) dropped —
 * each tile carries its own accent for identity.
 */

const ChatbotConfig     = lazy(() => import('./ChatbotConfig').then(m => ({ default: m.ChatbotConfig })))
const KnowledgeBase     = lazy(() => import('./KnowledgeBase').then(m => ({ default: m.KnowledgeBase })))
const PopupRules        = lazy(() => import('./PopupRules').then(m => ({ default: m.PopupRules })))
const Training          = lazy(() => import('./Training').then(m => ({ default: m.Training })))
const TestAi            = lazy(() => import('./ChatbotTestAi').then(m => ({ default: m.ChatbotTestAi })))
const CannedReplies     = lazy(() => import('./CannedReplies').then(m => ({ default: m.CannedReplies })))
const ChatbotWidget     = lazy(() => import('./ChatbotWidget').then(m => ({ default: m.ChatbotWidget })))

type Tab = 'config' | 'knowledge' | 'widget' | 'canned' | 'popups' | 'training' | 'test'

interface TileDef {
  key: Tab
  labelKey: string
  label: string
  descKey: string
  desc: string
  icon: any
  accent: string
}

const TILES: TileDef[] = [
  { key: 'config',    labelKey: 'chatbot_setup.tabs.config',    label: 'Behavior & Model', descKey: 'chatbot_setup.descs.config',    desc: 'System prompt, model selection, tone, guardrails',         icon: Bot,                    accent: '#a78bfa' }, // violet
  { key: 'knowledge', labelKey: 'chatbot_setup.tabs.knowledge', label: 'Knowledge Base',   descKey: 'chatbot_setup.descs.knowledge', desc: 'FAQ items, categories, uploaded documents',                icon: BookOpen,               accent: '#fbbf24' }, // amber
  { key: 'widget',    labelKey: 'chatbot_setup.tabs.widget',    label: 'Widget',           descKey: 'chatbot_setup.descs.widget',    desc: 'Appearance, position, colors, copy',                       icon: LayoutTemplate,         accent: '#34d399' }, // emerald
  { key: 'canned',    labelKey: 'chatbot_setup.tabs.canned',    label: 'Canned Replies',   descKey: 'chatbot_setup.descs.canned',    desc: 'Agent quick-insert library for the live chat inbox',       icon: MessageSquareReply,     accent: '#22d3ee' }, // cyan
  { key: 'popups',    labelKey: 'chatbot_setup.tabs.popups',    label: 'Popup Rules',      descKey: 'chatbot_setup.descs.popups',    desc: 'Proactive triggers — time, scroll, exit intent, URL',      icon: Zap,                    accent: '#fb923c' }, // orange
  { key: 'training',  labelKey: 'chatbot_setup.tabs.training',  label: 'AI Training',      descKey: 'chatbot_setup.descs.training',  desc: 'Fine-tune from graded real conversations',                 icon: GraduationCap,          accent: '#f472b6' }, // pink
  { key: 'test',      labelKey: 'chatbot_setup.tabs.test',      label: 'Test the AI',      descKey: 'chatbot_setup.descs.test',      desc: 'Quick playground to chat with your configured bot',        icon: MessageCircleQuestion,  accent: '#60a5fa' }, // blue
]

const tint = (hex: string, alpha: number) => {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function ChatbotSetup() {
  const { t } = useTranslation()
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

  const tile = TILES.find(td => td.key === active)
  const onHome = active === 'home' || !tile

  return (
    <div className="space-y-5">
      {onHome && (
        <div>
          <h1 className="text-2xl font-bold text-white">{t('chatbot_setup.title', 'Chatbot Setup')}</h1>
          <p className="text-sm text-t-secondary mt-0.5">{t('chatbot_setup.subtitle', 'All chatbot configuration in one place')}</p>
        </div>
      )}

      {onHome ? (() => {
        const q = homeSearch.trim().toLowerCase()
        const visibleTiles = q
          ? TILES.filter(td => {
              const label = t(td.labelKey, td.label).toLowerCase()
              const desc = t(td.descKey, td.desc).toLowerCase()
              return label.includes(q) || desc.includes(q)
            })
          : TILES

        return (
          <div className="space-y-5">
            <div className="relative max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
              <input
                value={homeSearch}
                onChange={(e) => setHomeSearch(e.target.value)}
                placeholder={t('chatbot_setup.home_search', 'Search chatbot settings…')}
                className="w-full bg-dark-surface border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-primary-500 transition-colors"
              />
            </div>

            {visibleTiles.length === 0 && (
              <div className="text-center py-12 text-t-secondary text-sm">
                {t('chatbot_setup.home_no_match', 'No tabs match that search.')}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 max-w-[1400px]">
              {visibleTiles.map(td => (
                <Tile
                  key={td.key}
                  tile={td}
                  label={t(td.labelKey, td.label)}
                  desc={t(td.descKey, td.desc)}
                  onClick={() => setActive(td.key)}
                />
              ))}
            </div>
          </div>
        )
      })() : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setActive('home')}
              className="flex items-center gap-1 text-xs text-t-secondary hover:text-white transition-colors px-1.5 py-1 -ml-1.5 rounded-md hover:bg-dark-surface2 flex-shrink-0"
              title={t('chatbot_setup.back_to_home', 'All chatbot settings')}
            >
              <ArrowLeft size={13} />
              <span className="hidden sm:inline">{t('chatbot_setup.title', 'Chatbot Setup')}</span>
            </button>
            <span className="text-t-secondary/40 flex-shrink-0">/</span>
            <div className="flex items-center gap-1.5 min-w-0">
              {tile && <tile.icon size={14} className="text-t-secondary flex-shrink-0" />}
              {tile && <h2 className="text-base font-semibold text-white truncate">{t(tile.labelKey, tile.label)}</h2>}
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

function Tile({ tile, label, desc, onClick }: { tile: TileDef; label: string; desc: string; onClick: () => void }) {
  const Icon = tile.icon
  const { accent } = tile
  return (
    <button
      onClick={onClick}
      className="group relative aspect-square flex flex-col bg-dark-surface border border-dark-border rounded-2xl p-4 sm:p-5 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 text-left"
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent
        e.currentTarget.style.boxShadow = `0 12px 36px ${tint(accent, 0.22)}`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = ''
        e.currentTarget.style.boxShadow = ''
      }}
    >
      <span
        aria-hidden
        className="absolute -right-12 -top-12 w-40 h-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-3xl pointer-events-none"
        style={{ background: tint(accent, 0.30) }}
      />
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${tint(accent, 0.45)}, transparent)` }}
      />

      <div className="relative">
        <span
          className="inline-flex w-11 h-11 sm:w-12 sm:h-12 rounded-2xl items-center justify-center transition-transform group-hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${tint(accent, 0.22)}, ${tint(accent, 0.06)})`,
            border: `1px solid ${tint(accent, 0.35)}`,
            boxShadow: `0 0 24px ${tint(accent, 0.20)}`,
          }}
        >
          <Icon size={20} style={{ color: accent }} />
        </span>
      </div>

      <div className="relative mt-auto">
        <h3 className="text-sm sm:text-base font-bold text-white leading-tight">{label}</h3>
        <p className="text-xs text-t-secondary mt-1 line-clamp-2 leading-relaxed">{desc}</p>
      </div>
    </button>
  )
}
