import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BookOpen, Bot, RotateCcw, Send } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { TextArea } from '../ui/inputs'
import { Pill } from '../ui/Pill'
import { afterReply, starterQuestions, testChatPayload } from './teach'
import type { ChatTurn, TestChatReply } from './types'

/**
 * Try it (chatbot-config/test-chat): a chat with the assistant as it is saved now — its behaviour, its model and the
 * knowledge — without the website, drawn as the visitor sees a chat: bubbles, a typing line and a message box (Enter
 * sends, Shift+Enter starts a new line), with a few starter questions. Nothing is kept. A manager's (each answer
 * counts against the AI allowance; a used-up allowance or a provider failure is said in our words).
 */
export function TryTab({ canManage, assistantName }: { canManage: boolean; assistantName: string | null }) {
  const { t } = useTranslation()
  const [history, setHistory] = useState<ChatTurn[]>([])
  const [message, setMessage] = useState('')
  const [last, setLast] = useState<TestChatReply | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const name = assistantName?.trim() || t('crm.assistant.try.assistant', 'Assistant')

  const ask = useMutation({
    mutationFn: (text: string) => send<TestChatReply>('post', 'chatbot-config/test-chat', testChatPayload(text, history)),
    onSuccess: (reply, text) => {
      setHistory(h => afterReply(h, text, reply.reply))
      setLast(reply)
      setMessage('')
    },
  })

  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }) }, [history, ask.isPending])

  if (!canManage) {
    return <Notice>{t('crm.assistant.try.manager_only', 'Only an owner or a manager can try the assistant here. Ask one, or open your website and write in the chat.')}</Notice>
  }

  const ask1 = (text: string) => { if (text.trim() && !ask.isPending) ask.mutate(text) }
  const restart = () => { setHistory([]); setLast(null); ask.reset() }
  const starters = starterQuestions(t)

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <section aria-label={t('crm.assistant.try.title', 'Chat with your assistant')} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-a-border bg-a-surface shadow-a-sm lg:col-span-2">
        <header className="flex items-center gap-3 border-b border-a-border px-4 py-3">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full crm-ai-fill"><Bot size={17} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-a-text">{name}</span>
            <span className="block truncate text-xs text-a-text-2">{t('crm.assistant.try.subtitle', 'A test chat. Nothing is kept and no visitor sees it.')}</span>
          </span>
          {history.length > 0 && (
            <Button variant="ghost" size="sm" onClick={restart}><RotateCcw size={14} aria-hidden />{t('crm.assistant.try.clear', 'Start again')}</Button>
          )}
        </header>
        <div className="flex h-[min(62vh,34rem)] flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-a-canvas/40 p-4" aria-live="polite">
            {history.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="max-w-sm text-sm text-a-text-2">{t('crm.assistant.try.empty', 'Ask what a visitor would ask: "Do you have parking?" The answer uses what is saved now.')}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {starters.map(q => (
                    <button key={q} type="button" onClick={() => ask1(q)} disabled={ask.isPending}
                      className="min-h-9 rounded-full border border-a-border bg-a-surface px-3 text-sm text-a-text hover:border-a-accent/50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-a-accent">{q}</button>
                  ))}
                </div>
              </div>
            )}
            {history.map((turn, i) => (
              <div key={i} className={`flex items-end gap-2 ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {turn.role === 'assistant' && <Avatar name={name} size="sm" tone="ai" />}
                <p className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm animate-a-pop ${turn.role === 'user' ? 'rounded-br-sm crm-bubble-agent' : 'rounded-bl-sm crm-bubble-ai'}`}>
                  <span className="sr-only">{turn.role === 'user' ? t('crm.assistant.try.you', 'You, as a visitor') : name}: </span>
                  {turn.content}
                </p>
              </div>
            ))}
            {ask.isPending && (
              <div className="flex items-end gap-2" role="status">
                <Avatar name={name} size="sm" tone="ai" />
                <span className="inline-flex items-center gap-1 rounded-2xl rounded-bl-sm px-3 py-3 crm-bubble-ai">
                  <span className="sr-only">{t('crm.assistant.try.thinking', 'The assistant is writing…')}</span>
                  {[0, 1, 2].map(n => <span key={n} aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-a-text-2" />)}
                </span>
              </div>
            )}
            {ask.isError && <Notice tone="danger">{errorText(t, ask.error)}</Notice>}
            <div ref={end} />
          </div>
          <form className="flex items-end gap-2 border-t border-a-border p-3" onSubmit={e => { e.preventDefault(); ask1(message) }}>
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t('crm.assistant.try.message', 'Your message')}</span>
              <TextArea rows={1} value={message} maxLength={2000} placeholder={t('crm.assistant.try.placeholder', 'Write as a visitor would…')}
                className="max-h-32 min-h-11 resize-none"
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask1(message) } }} />
            </label>
            <Button type="submit" className="h-11 w-11 shrink-0 p-0!" disabled={!message.trim()} loading={ask.isPending} aria-label={t('crm.assistant.try.send', 'Send')}>
              {!ask.isPending && <Send size={16} aria-hidden />}
            </Button>
          </form>
        </div>
      </section>

      <Card title={t('crm.assistant.try.behind', 'Behind the answer')} icon={BookOpen} tone="ai"
        description={t('crm.assistant.try.behind_short', 'Where the last answer came from.')}>
        {last ? (
          <div className="space-y-3">
            {last.kb_context_used
              ? <Pill tone="success">{t('crm.assistant.try.used_knowledge', 'Answered from your knowledge')}</Pill>
              : <Pill tone="pending">{t('crm.assistant.try.no_knowledge', 'No answer in your knowledge matched')}</Pill>}
            <p className="text-sm text-a-text-2">{last.kb_context_used
              ? t('crm.assistant.try.used_line', 'The assistant found answers of yours that fit the question.')
              : t('crm.assistant.try.no_line', 'Add an answer in Knowledge if this question comes up often.')}</p>
            <details>
              <summary className="cursor-pointer text-xs font-medium text-a-accent-text">{t('crm.assistant.try.prompt', 'What the assistant was told')}</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-a-surface-2 p-3 text-xs text-a-text-2">{last.system_prompt}</pre>
            </details>
          </div>
        ) : (
          <p className="text-sm text-a-text-2">{t('crm.assistant.try.behind_line', 'After an answer, see whether it came from your knowledge and what the assistant was told.')}</p>
        )}
      </Card>
    </div>
  )
}
