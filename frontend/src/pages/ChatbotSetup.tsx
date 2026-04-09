import { useState, lazy, Suspense } from 'react'
import { Bot, BookOpen, Zap, GraduationCap, MessageCircleQuestion, MessageSquareReply, LayoutTemplate } from 'lucide-react'

const ChatbotConfig  = lazy(() => import('./ChatbotConfig').then(m => ({ default: m.ChatbotConfig })))
const KnowledgeBase  = lazy(() => import('./KnowledgeBase').then(m => ({ default: m.KnowledgeBase })))
const PopupRules     = lazy(() => import('./PopupRules').then(m => ({ default: m.PopupRules })))
const Training       = lazy(() => import('./Training').then(m => ({ default: m.Training })))
const TestAi         = lazy(() => import('./ChatbotTestAi').then(m => ({ default: m.ChatbotTestAi })))
const CannedReplies  = lazy(() => import('./CannedReplies').then(m => ({ default: m.CannedReplies })))
const ChatbotWidget  = lazy(() => import('./ChatbotWidget').then(m => ({ default: m.ChatbotWidget })))

type Tab = 'config' | 'knowledge' | 'widget' | 'canned' | 'popups' | 'training' | 'test'

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'config',    label: 'Behavior & Model', icon: Bot },
  { key: 'knowledge', label: 'Knowledge Base',   icon: BookOpen },
  { key: 'widget',    label: 'Widget',           icon: LayoutTemplate },
  { key: 'canned',    label: 'Canned Replies',   icon: MessageSquareReply },
  { key: 'popups',    label: 'Popup Rules',      icon: Zap },
  { key: 'training',  label: 'AI Training',      icon: GraduationCap },
  { key: 'test',      label: 'Test the AI',      icon: MessageCircleQuestion },
]

// Persist last tab so the page restores its previous view across navigations.
const STORAGE_KEY = 'loyalty-chatbot-setup-tab'

export function ChatbotSetup() {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) as Tab | null
    return saved && TABS.some(t => t.key === saved) ? saved : 'config'
  })

  const switchTab = (next: Tab) => {
    setTab(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Chatbot Setup</h1>
        <p className="text-sm text-t-secondary mt-0.5">All chatbot configuration in one place</p>
      </div>

      <div className="flex gap-1 border-b border-dark-border overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${active ? 'border-primary-500 text-white' : 'border-transparent text-t-secondary hover:text-white'}`}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      <Suspense fallback={<div className="text-center text-[#636366] py-12">Loading...</div>}>
        {tab === 'config'    && <ChatbotConfig />}
        {tab === 'knowledge' && <KnowledgeBase />}
        {tab === 'widget'    && <ChatbotWidget />}
        {tab === 'canned'    && <CannedReplies />}
        {tab === 'popups'    && <PopupRules />}
        {tab === 'training'  && <Training />}
        {tab === 'test'      && <TestAi />}
      </Suspense>
    </div>
  )
}
