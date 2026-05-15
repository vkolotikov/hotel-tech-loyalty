import { useState, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, BookOpen, Zap, GraduationCap, MessageCircleQuestion, MessageSquareReply, LayoutTemplate } from 'lucide-react'

const ChatbotConfig     = lazy(() => import('./ChatbotConfig').then(m => ({ default: m.ChatbotConfig })))
const KnowledgeBase     = lazy(() => import('./KnowledgeBase').then(m => ({ default: m.KnowledgeBase })))
const PopupRules        = lazy(() => import('./PopupRules').then(m => ({ default: m.PopupRules })))
const Training          = lazy(() => import('./Training').then(m => ({ default: m.Training })))
const TestAi            = lazy(() => import('./ChatbotTestAi').then(m => ({ default: m.ChatbotTestAi })))
const CannedReplies     = lazy(() => import('./CannedReplies').then(m => ({ default: m.CannedReplies })))
const ChatbotWidget     = lazy(() => import('./ChatbotWidget').then(m => ({ default: m.ChatbotWidget })))

// Chatbot analytics moved to /analytics → Chat tab. No tab here.
type Tab = 'config' | 'knowledge' | 'widget' | 'canned' | 'popups' | 'training' | 'test'

const TABS: { key: Tab; labelKey: string; fallback: string; icon: any }[] = [
  { key: 'config',    labelKey: 'chatbot_setup.tabs.config',    fallback: 'Behavior & Model', icon: Bot },
  { key: 'knowledge', labelKey: 'chatbot_setup.tabs.knowledge', fallback: 'Knowledge Base',   icon: BookOpen },
  { key: 'widget',    labelKey: 'chatbot_setup.tabs.widget',    fallback: 'Widget',           icon: LayoutTemplate },
  { key: 'canned',    labelKey: 'chatbot_setup.tabs.canned',    fallback: 'Canned Replies',   icon: MessageSquareReply },
  { key: 'popups',    labelKey: 'chatbot_setup.tabs.popups',    fallback: 'Popup Rules',      icon: Zap },
  { key: 'training',  labelKey: 'chatbot_setup.tabs.training',  fallback: 'AI Training',      icon: GraduationCap },
  { key: 'test',      labelKey: 'chatbot_setup.tabs.test',      fallback: 'Test the AI',      icon: MessageCircleQuestion },
]

// Persist last tab so the page restores its previous view across navigations.
const STORAGE_KEY = 'loyalty-chatbot-setup-tab'

export function ChatbotSetup() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>(() => {
    const saved = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) as Tab | null
    return saved && TABS.some(it => it.key === saved) ? saved : 'config'
  })

  const switchTab = (next: Tab) => {
    setTab(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('chatbot_setup.title', 'Chatbot Setup')}</h1>
        <p className="text-sm text-t-secondary mt-0.5">{t('chatbot_setup.subtitle', 'All chatbot configuration in one place')}</p>
      </div>

      <div className="flex gap-1 border-b border-dark-border overflow-x-auto">
        {TABS.map(tabDef => {
          const Icon = tabDef.icon
          const active = tab === tabDef.key
          return (
            <button key={tabDef.key} onClick={() => switchTab(tabDef.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${active ? 'border-primary-500 text-white' : 'border-transparent text-t-secondary hover:text-white'}`}>
              <Icon size={14} /> {t(tabDef.labelKey, tabDef.fallback)}
            </button>
          )
        })}
      </div>

      <Suspense fallback={<div className="text-center text-[#636366] py-12">{t('chatbot_setup.loading', 'Loading...')}</div>}>
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
