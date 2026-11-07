import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bot, BookOpen, RotateCcw, Send } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { TextInput } from '../ui/inputs'
import { Pill } from '../ui/Pill'
import { afterReply, testChatPayload } from './teach'
import type { ChatTurn, TestChatReply } from './types'

/**
 * Try it (chatbot-config/test-chat): a chat with the assistant as it is saved now — its behaviour, its model and the
 * knowledge — without the website. Nothing is kept. A manager's (the call counts against the AI allowance).
 */
export function TryTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const [history, setHistory] = useState<ChatTurn[]>([])
  const [message, setMessage] = useState('')
  const [last, setLast] = useState<TestChatReply | null>(null)
  const end = useRef<HTMLDivElement>(null)

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

  const submit = () => { if (message.trim() && !ask.isPending) ask.mutate(message) }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2" title={t('crm.assistant.try.title', 'Chat with your assistant')} icon={Bot} padded={false}
        action={history.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => { setHistory([]); setLast(null); ask.reset() }}><RotateCcw size={14} aria-hidden />{t('crm.assistant.try.clear', 'Start again')}</Button>
        ) : undefined}>
        <div className="flex h-[min(60vh,32rem)] flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {history.length === 0 && (
              <p className="py-10 text-center text-sm text-a-text-2">{t('crm.assistant.try.empty', 'Ask what a visitor would ask: "Do you have parking?" The answer uses what is saved now.')}</p>
            )}
            {history.map((turn, i) => (
              <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${turn.role === 'user' ? 'rounded-tr-sm crm-bubble-agent' : 'rounded-tl-sm crm-bubble-ai'}`}>
                  <span className={`block text-xs font-medium ${turn.role === 'user' ? 'text-a-text-2' : 'crm-ai-text'}`}>
                    {turn.role === 'user' ? t('crm.assistant.try.you', 'You, as a visitor') : t('crm.assistant.try.assistant', 'Assistant')}
                  </span>
                  {turn.content}
                </p>
              </div>
            ))}
            {ask.isPending && <p className="text-sm text-a-text-2">{t('crm.assistant.try.thinking', 'The assistant is writing…')}</p>}
            {ask.isError && <Notice tone="danger">{errorText(t, ask.error)}</Notice>}
            <div ref={end} />
          </div>
          <form className="flex gap-2 border-t border-a-border p-3" onSubmit={e => { e.preventDefault(); submit() }}>
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t('crm.assistant.try.message', 'Your message')}</span>
              <TextInput value={message} maxLength={2000} placeholder={t('crm.assistant.try.message', 'Your message')} onChange={e => setMessage(e.target.value)} />
            </label>
            <Button type="submit" disabled={!message.trim()} loading={ask.isPending} aria-label={t('crm.assistant.try.send', 'Send')}><Send size={15} aria-hidden /></Button>
          </form>
        </div>
      </Card>

      <Card title={t('crm.assistant.try.behind', 'Behind the answer')} icon={BookOpen}>
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
