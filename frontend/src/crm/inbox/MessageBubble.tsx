import { useTranslation } from 'react-i18next'
import { Bot, FileText, GraduationCap, Languages, Lightbulb, ThumbsDown, ThumbsUp } from 'lucide-react'
import { resolveImage } from '../../lib/api'
import { dateTime } from '../lib/format'
import { BUBBLE_CLASS, canTranslate, isSafeAttachment, type Side } from './inboxLogic'
import type { Message } from './types'

export type Translation = { state: 'loading' } | { state: 'failed' } | { state: 'done'; text: string; from: string | null; showing: boolean }

/**
 * One message as a bubble: the visitor's on the left, the team's and the assistant's on the right, the author's name
 * on a group's first bubble and the time on its last. An AI answer can be rated; a visitor's or the AI's words can be
 * put in the person's language (only on a plan with the engagement hub).
 */
export function MessageBubble({ message: m, side, first, last, visitorName, zone, translation, onTranslate, onRate, canTranslateHere }: {
  message: Message
  side: Side
  first: boolean
  last: boolean
  visitorName: string
  zone: string
  translation?: Translation
  onTranslate: () => void
  onRate: (rating: 'good' | 'bad') => void
  canTranslateHere: boolean
}) {
  const { t, i18n } = useTranslation()
  const role = m.sender_type === 'system' ? 'agent' : m.sender_type
  const author = m.sender_type === 'visitor' ? visitorName
    : m.sender_type === 'ai' ? t('crm.inbox.ai_name', 'AI assistant')
    : (m.sender_user?.name ?? t('crm.inbox.team', 'Team'))
  const shown = translation?.state === 'done' && translation.showing ? translation.text : m.content
  const href = isSafeAttachment(m.attachment_url) ? resolveImage(m.attachment_url) ?? undefined : undefined
  const right = side === 'right'

  return (
    <div className={`flex ${right ? 'justify-end' : 'justify-start'} ${first ? 'mt-3' : 'mt-0.5'}`}>
      <div className={`flex max-w-[85%] flex-col sm:max-w-[75%] ${right ? 'items-end' : 'items-start'}`}>
        {first && (
          <span className={`mb-1 flex items-center gap-1 px-1 text-xs font-medium ${m.sender_type === 'ai' ? 'crm-ai-text' : 'text-a-text-2'}`}>
            {m.sender_type === 'ai' && <Bot size={13} aria-hidden />}{author}
          </span>
        )}
        <div className={`${BUBBLE_CLASS[role]} rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${right ? 'rounded-br-md' : 'rounded-bl-md'}`}>
          {shown && <p className="whitespace-pre-wrap wrap-break-word">{shown}</p>}
          {href && (m.attachment_type === 'image'
            ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="mt-1 block">
                <img src={href} alt={m.content || t('crm.inbox.attachment', 'Attachment')} loading="lazy" className="max-h-52 max-w-full rounded-lg border border-a-border" />
              </a>
            )
            : (
              <a href={href} target="_blank" rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-2 rounded-lg border border-a-border bg-a-surface px-3 py-1.5 text-sm text-a-accent-text hover:underline">
                <FileText size={15} aria-hidden />{t('crm.inbox.open_file', 'Open the file')}
              </a>
            ))}
          {translation?.state === 'done' && translation.showing && (
            <p className="mt-1.5 border-t border-a-border pt-1.5 text-xs text-a-text-2">
              {translation.from
                ? t('crm.inbox.translated_from', 'Translated from {{lang}}', { lang: translation.from.toUpperCase() })
                : t('crm.inbox.translated', 'Translated')}
            </p>
          )}
        </div>
        {(last || m.sender_type === 'ai' || translation) && (
          <span className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-a-text-2 ${right ? 'justify-end' : ''}`}>
            {last && m.created_at && <time dateTime={m.created_at}>{dateTime(m.created_at, i18n.language, zone)}</time>}
            {canTranslateHere && canTranslate(m) && (
              <button type="button" onClick={onTranslate} disabled={translation?.state === 'loading'}
                className="inline-flex items-center gap-1 rounded-sm font-medium text-a-accent-text hover:underline disabled:opacity-60">
                <Languages size={13} aria-hidden />
                {translation?.state === 'loading' ? t('crm.inbox.translating', 'Translating…')
                  : translation?.state === 'done' && translation.showing ? t('crm.inbox.show_original', 'Show the original')
                  : translation?.state === 'failed' ? t('crm.inbox.translate_again', 'Translation failed, try again')
                  : t('crm.inbox.translate', 'Translate')}
              </button>
            )}
            {m.sender_type === 'ai' && <Rating message={m} onRate={onRate} />}
          </span>
        )}
      </div>
    </div>
  )
}

/** An AI answer's rating: what was said about it, or the two buttons that rate it. */
function Rating({ message: m, onRate }: { message: Message; onRate: (rating: 'good' | 'bad') => void }) {
  const { t } = useTranslation()
  const saved = m.feedback
  if (saved) {
    return (
      <span className="inline-flex items-center gap-2">
        {saved.rating === 'good'
          ? <span className="inline-flex items-center gap-1 text-a-st-confirmed"><ThumbsUp size={13} aria-hidden />{t('crm.inbox.rated_good', 'Rated good')}</span>
          : <span className="inline-flex items-center gap-1 text-a-danger"><ThumbsDown size={13} aria-hidden />{t('crm.inbox.rated_bad', 'Rated wrong')}</span>}
        {saved.applied_to_training
          ? <span className="inline-flex items-center gap-1 crm-ai-text"><GraduationCap size={13} aria-hidden />{t('crm.inbox.taught', 'Taught')}</span>
          : saved.suggested_answer && <span className="inline-flex items-center gap-1 crm-ai-text" title={t('crm.inbox.suggested_hint', 'A right answer was suggested; a manager will check it.')}><Lightbulb size={13} aria-hidden />{t('crm.inbox.suggested', 'Answer suggested')}</span>}
        <button type="button" onClick={() => onRate(saved.rating)} className="rounded-sm font-medium text-a-accent-text hover:underline">{t('crm.inbox.change_rating', 'Change')}</button>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={() => onRate('good')} aria-label={t('crm.inbox.rate_good', 'A good answer')} title={t('crm.inbox.rate_good', 'A good answer')}
        className="grid h-7 w-7 place-items-center rounded-full text-a-text-2 hover:bg-a-st-confirmed/12 hover:text-a-st-confirmed"><ThumbsUp size={14} aria-hidden /></button>
      <button type="button" onClick={() => onRate('bad')} aria-label={t('crm.inbox.rate_bad', 'A wrong answer')} title={t('crm.inbox.rate_bad', 'A wrong answer')}
        className="grid h-7 w-7 place-items-center rounded-full text-a-text-2 hover:bg-a-danger/12 hover:text-a-danger"><ThumbsDown size={14} aria-hidden /></button>
    </span>
  )
}
