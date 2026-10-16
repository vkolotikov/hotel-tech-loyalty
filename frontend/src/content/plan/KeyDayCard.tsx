import { useTranslation } from 'react-i18next'
import { PenLine } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { dayLabel, dayName, type Words } from '../lib/dayNames'
import type { BuiltInDay, DateKey } from '../lib/types'
import { Dialog } from '../ui/Dialog'
import { KIND_TEXT } from './keyDateMath'

/** A holiday or special day's card (spec 2026-10-16 §3.4): its name and kind, and "Write a post for it" from today on. */
export function KeyDayCard({ day, keyDate, observed, canWrite, onWrite, onClose }: {
  day: DateKey
  keyDate: BuiltInDay
  observed: boolean
  canWrite: boolean
  /** Opens a new post on the day with this topic (the day's name in the interface's language). */
  onWrite: (topic: string) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const words: Words = (key, english, vars) => t(key, english, vars)
  return (
    <Dialog title={dayLabel(words, keyDate, observed)} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-a-text-2">
          {t(`content.keydates.kind.${keyDate.kind}`, KIND_TEXT[keyDate.kind])} · {formatDate(day, i18n.language || 'en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        {canWrite
          ? <Button onClick={() => onWrite(dayName(words, keyDate))}><PenLine size={14} aria-hidden />{t('content.keydates.write_for', 'Write a post for it')}</Button>
          : <p className="text-xs text-a-text-2">{t('content.keydates.gone', 'This day has gone; new posts start from today.')}</p>}
      </div>
    </Dialog>
  )
}
