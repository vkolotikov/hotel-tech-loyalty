import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Wallet } from 'lucide-react'
import { portalApi, apiMessage } from '../lib/portalApi'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'

/**
 * Apple needs a Safari navigation to a one-time URL (the token never rides
 * a query string); Google hands back a save URL. Either endpoint answers
 * 503 when the venue has not set the pass up, which is a sentence, not an
 * error.
 */
export function WalletButtons() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const isApple = typeof navigator !== 'undefined' && /iPhone|iPad|Macintosh/.test(navigator.userAgent)

  const open = async (which: 'apple' | 'google') => {
    setBusy(which); setNotice(null)
    try {
      if (which === 'apple') {
        const { url } = await portalApi.appleWalletLink()
        window.location.href = url
      } else {
        const res = await portalApi.googleWallet()
        const url = res.saveUrl ?? res.save_url
        if (!url) throw new Error('no url')
        window.location.href = url
      }
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setNotice(status === 503 || status === 404
        ? t('portal.home.wallet_unavailable', 'Wallet passes are not set up for this venue yet.')
        : apiMessage(e, t('portal.home.wallet_error', 'Could not prepare the pass. Please try again.')))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="relative mt-4 space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        {isApple && (
          <Button variant="secondary" size="sm" loading={busy === 'apple'} onClick={() => { void open('apple') }}>
            <Wallet size={14} aria-hidden /> {t('portal.home.wallet_apple', 'Add to Apple Wallet')}
          </Button>
        )}
        <Button variant="secondary" size="sm" loading={busy === 'google'} onClick={() => { void open('google') }}>
          <Wallet size={14} aria-hidden /> {t('portal.home.wallet_google', 'Add to Google Wallet')}
        </Button>
      </div>
      {notice && <Notice tone="info">{notice}</Notice>}
    </div>
  )
}
