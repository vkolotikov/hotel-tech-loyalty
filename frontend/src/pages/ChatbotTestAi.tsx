import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { Send, Bot, User, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import { BrandRequired } from '../components/BrandRequired'

type Msg = { role: 'user' | 'assistant'; content: string }

/**
 * Test the AI panel — lets admins try the chatbot's current behavior + KB
 * config without going through the public widget. Same prompt-building logic
 * as the embedded widget on the backend.
 */
export function ChatbotTestAi() {
  const { t } = useTranslation()
  const [history, setHistory] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [lastPrompt, setLastPrompt] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [history])

  const send = useMutation({
    mutationFn: (message: string) =>
      api.post('/v1/admin/chatbot-config/test-chat', { message, history }).then(r => r.data),
    onSuccess: (data, message) => {
      setHistory(prev => [...prev, { role: 'user', content: message }, { role: 'assistant', content: data.reply }])
      setLastPrompt(data.system_prompt || '')
      setInput('')
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || t('chatbot_test.toast_failed', 'AI call failed')),
  })

  const handleSend = () => {
    const msg = input.trim()
    if (!msg) return
    send.mutate(msg)
  }

  return (
    <BrandRequired feature={t('chatbot_test.brand_required', 'the AI test playground')}>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-dark-surface border border-dark-border rounded-xl flex flex-col" style={{ height: '70vh' }}>
        <div className="p-3 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary-400" />
            <h2 className="text-sm font-semibold text-white">{t('chatbot_test.header', 'Test the AI')}</h2>
          </div>
          <button onClick={() => { setHistory([]); setLastPrompt('') }}
            className="text-xs text-t-secondary hover:text-white">{t('chatbot_test.clear', 'Clear')}</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {history.length === 0 && (
            <div className="text-center text-t-secondary text-xs py-10">
              {t('chatbot_test.empty_hint', "Send a message to try your chatbot's current behavior, model, and knowledge base.")}
            </div>
          )}
          {history.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-primary-600/30 flex items-center justify-center flex-shrink-0">
                  <Bot size={12} className="text-primary-400" />
                </div>
              )}
              <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-xs whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary-600 text-white' : 'bg-dark-surface2 text-white border border-dark-border'}`}>
                {m.content}
              </div>
              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-dark-surface2 flex items-center justify-center flex-shrink-0">
                  <User size={12} className="text-t-secondary" />
                </div>
              )}
            </div>
          ))}
          {send.isPending && (
            <div className="text-xs text-t-secondary">{t('chatbot_test.thinking', 'Thinking…')}</div>
          )}
          <div ref={endRef} />
        </div>

        <div className="p-3 border-t border-dark-border flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
            placeholder={t('chatbot_test.input_placeholder', 'Ask anything to test your AI…')}
            className="flex-1 bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
          />
          <button onClick={handleSend} disabled={!input.trim() || send.isPending}
            className="bg-primary-600 text-white px-4 rounded-lg hover:bg-primary-700 disabled:opacity-50">
            <Send size={14} />
          </button>
        </div>
      </div>

      <div className="bg-dark-surface border border-dark-border rounded-xl p-4 space-y-3" style={{ height: '70vh', overflowY: 'auto' }}>
        <h3 className="text-sm font-semibold text-white">{t('chatbot_test.prompt_title', 'Active System Prompt')}</h3>
        <p className="text-[10px] text-t-secondary">{t('chatbot_test.prompt_help', 'This is the prompt the AI sees, built from your behavior config + matched knowledge base entries.')}</p>
        <button onClick={() => setShowPrompt(v => !v)}
          className="text-xs text-primary-400 hover:underline">{showPrompt ? t('chatbot_test.hide_prompt', 'Hide prompt') : t('chatbot_test.show_prompt', 'Show prompt')}</button>
        {showPrompt && (
          <pre className="text-[10px] text-t-secondary whitespace-pre-wrap bg-dark-bg p-3 rounded-lg border border-dark-border">
            {lastPrompt || t('chatbot_test.prompt_placeholder', 'Send a message to see the prompt that was used.')}
          </pre>
        )}
      </div>
    </div>
    </BrandRequired>
  )
}
