import { useTranslation } from 'react-i18next'
import { ACCESS_OFF_REASON } from '../lib/accessOff'

/** What the sign-in screen tells someone whose access was switched off (the API client sent them here). */
export function AccessOffNotice({ reason }: { reason: string | null }) {
  const { t } = useTranslation()
  if (reason !== ACCESS_OFF_REASON) return null
  return (
    <div role="status" className="bg-amber-500/10 border border-amber-500/20 text-amber-300 px-4 py-3 rounded-lg mb-4 text-sm">
      {t('auth.access_off', 'Your access to this organisation has been switched off. Ask an owner or a manager to turn it back on.')}
    </div>
  )
}
