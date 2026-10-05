import { useTranslation } from 'react-i18next'
import type { ClientMessageInfo } from '../lib/types'
import { formatInstant } from '../lib/wallClock'
import { messageLine } from './messageLine'

const KIND: Record<string, string> = { booked: 'Booked', moved: 'Moved', confirmed: 'Confirmed', cancelled: 'Cancelled', reminder: 'Reminder' }

/** Every client message about this appointment, newest first: what it was, when, and sent or why not. */
export function Messages({ messages, zone, locale }: { messages: ClientMessageInfo[]; zone: string; locale: string }) {
  const { t } = useTranslation()
  if (messages.length === 0) return null

  return (
    <section>
      <h3 className="text-sm font-semibold text-a-text mb-1">{t('appointments.messages.title', 'Messages')}</h3>
      <ol className="space-y-1 text-sm">
        {messages.map((m, i) => {
          const line = messageLine(m)
          return (
            <li key={i} className="flex flex-wrap gap-x-2 text-a-text-2">
              <span className="font-medium text-a-text">{t(`appointments.messages.kind.${m.kind}`, KIND[m.kind] ?? m.kind)}</span>
              {m.at && <time dateTime={m.at}>{formatInstant(m.at, locale, zone)}</time>}
              <span>{t(line.key, line.fallback, line.vars)}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
