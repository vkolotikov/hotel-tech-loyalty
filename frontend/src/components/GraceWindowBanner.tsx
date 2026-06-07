import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, X } from 'lucide-react'
import { useSubscription } from '../hooks/useSubscription'

/**
 * Customer-notice banner for the Pricing v3 grace window.
 *
 * Backstory: the 2026-06-08 v3 ship gated 5 features as Growth+
 * (Email Campaigns / Reviews / Engagement Hub / Wallet config /
 * Chatbot Setup). The matching SaaS migration grants those 5 to
 * Starter as a 14-day grace so existing customers don't get locked
 * out the moment the gate ships. Without this banner, Starter staff
 * would see the features just disappear on the sunset date with no
 * warning.
 *
 * Behavior:
 *   - Renders ONLY for Starter customers.
 *   - Dismissable. Dismissal persists in localStorage so the same
 *     user doesn't see it again. The localStorage key includes the
 *     sunset date so the banner re-appears if we ever extend the
 *     window.
 *   - Auto-suppresses after the sunset date (2026-06-22) — at that
 *     point the gate has fired and the banner is no longer useful.
 *   - Auto-suppresses on the /billing page itself (the user is
 *     already there).
 *
 * Mount location: at the top of `Layout.tsx`'s main content column,
 * above the route outlet. Single-mount component; the dismissal
 * survives navigation because it's localStorage-backed.
 */

const SUNSET_ISO = '2026-06-22'
const DISMISS_KEY = `v3-grace-banner-dismissed:${SUNSET_ISO}`

export default function GraceWindowBanner() {
  const { data } = useSubscription()
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })

  // Refresh dismissal flag when window storage changes (e.g. user
  // dismisses in one tab → other tabs hide the banner too).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DISMISS_KEY) {
        setDismissed(e.newValue === '1')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  if (dismissed) return null

  // Only Starter customers see this. Other plans have these features
  // included long-term so the notice is irrelevant.
  if (data?.plan?.slug !== 'starter') return null

  // Past sunset: gate has fired; the banner is no longer informational.
  // Use Date string comparison since SUNSET_ISO is YYYY-MM-DD format.
  const todayIso = new Date().toISOString().slice(0, 10)
  if (todayIso >= SUNSET_ISO) return null

  // Suppress on /billing itself — the user is already in the right
  // place to take action. Persistent visibility there reads as nag.
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/billing')) return null

  const handleDismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
  }

  return (
    <div className="border-b border-primary-gold/30 bg-primary-gold/10 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center gap-3 text-[13px]">
        <AlertCircle size={16} className="text-primary-gold flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 text-t-primary min-w-0">
          <span className="font-medium">Heads up:</span>{' '}
          Email Campaigns, Reviews, Engagement Hub, Wallet config and Chatbot Setup
          {' '}move to the Growth plan on <span className="font-medium">{SUNSET_ISO}</span>.
          {' '}
          <Link
            to="/billing"
            className="font-medium text-primary-gold hover:text-primary-gold/80 underline underline-offset-2"
          >
            Upgrade to keep using them →
          </Link>
        </div>
        <button
          onClick={handleDismiss}
          type="button"
          aria-label="Dismiss notice"
          className="w-7 h-7 rounded-full flex items-center justify-center text-t-secondary hover:text-white hover:bg-white/[0.06] transition-colors flex-shrink-0"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
