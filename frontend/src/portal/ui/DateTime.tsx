import { useTranslation } from 'react-i18next'
import { usePortal } from '../PortalProvider'
import { formatDateTime, formatDay, formatTime } from '../lib/dates'

export function DateTime({ iso, mode }: { iso: string; mode: 'day' | 'datetime' | 'time' }) {
  const { i18n } = useTranslation()
  const { data } = usePortal()
  const tz = data?.venue.timezone
  const text = mode === 'day' ? formatDay(iso, i18n.language)
    : mode === 'time' ? formatTime(iso, i18n.language, tz)
    : formatDateTime(iso, i18n.language, tz)
  return <time dateTime={iso}>{text}</time>
}
