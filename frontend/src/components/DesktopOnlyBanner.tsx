import { useEffect, useState } from 'react'
import { Monitor, X } from 'lucide-react'

interface Props {
  pageKey: string
  message?: string
}

export function DesktopOnlyBanner({ pageKey, message }: Props) {
  const storageKey = `desktop-banner-dismissed:${pageKey}`
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(storageKey) === '1')
    } catch {
      setDismissed(false)
    }
  }, [storageKey])

  if (dismissed) return null

  const handleDismiss = () => {
    try {
      localStorage.setItem(storageKey, '1')
    } catch {}
    setDismissed(true)
  }

  return (
    <div className="lg:hidden mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 flex items-start gap-2.5">
      <Monitor size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 text-xs text-amber-100/90 leading-relaxed">
        {message || 'This page is best viewed on a larger screen. You can still use it on mobile, but tables and charts may require horizontal scrolling.'}
      </div>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 p-1 -m-1 text-amber-200/70 hover:text-amber-100"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}
