import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowUp, Sparkles } from 'lucide-react'
import { useBoot } from '../TimeProvider'

/**
 * A question for the assistant from wherever the person is (2026-11-28): one line that opens the assistant with the
 * question already asked (`/time/assistant?q=`). Not shown while the AI cannot be asked.
 */
export function AskBox() {
  const { t } = useTranslation()
  const boot = useBoot()
  const navigate = useNavigate()
  const [question, setQuestion] = useState('')
  if (!boot.ai.ready) return null
  const text = question.trim()
  return (
    <form onSubmit={e => { e.preventDefault(); if (text.length >= 2) navigate(`/time/assistant?q=${encodeURIComponent(text)}`) }}
      className="flex items-center gap-2 rounded-2xl border border-a-border bg-a-surface p-1.5 pl-3.5 shadow-a-sm time-composer">
      <Sparkles size={16} aria-hidden className="shrink-0 time-ai-text" />
      <input value={question} onChange={e => setQuestion(e.target.value)} maxLength={500}
        aria-label={t('time.today.ask', 'Ask the AI about your day')} placeholder={t('time.today.ask_hint', 'Ask the AI about your day…')}
        className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-a-text placeholder:text-a-text-2 focus:outline-hidden" />
      <button type="submit" disabled={text.length < 2} aria-label={t('time.today.ask_send', 'Ask the AI')} title={t('time.today.ask_send', 'Ask the AI')}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full time-ai-fill transition duration-150 hover:opacity-90 disabled:opacity-40">
        <ArrowUp size={15} aria-hidden />
      </button>
    </form>
  )
}
