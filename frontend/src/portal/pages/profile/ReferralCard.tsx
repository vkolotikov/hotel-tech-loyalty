import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Share2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { portalApi } from '../../lib/portalApi'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'

/** The link, not just the code: a friend who taps it lands on the venue's join page with the code filled in. */
export function ReferralCard() {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const { data } = useQuery({ queryKey: ['portal-referral'], queryFn: portalApi.referral })
  const link = data?.referral_link
  if (!data) return null

  const share = async () => {
    if (!link) return
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try { await navigator.share({ url: link }); return } catch { /* dismissed */ }
    }
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) }
    catch { toast.error(t('portal.common.error', 'Something went wrong. Please try again.')) }
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold mb-1">{t('portal.profile.invite_title', 'Invite a friend')}</h2>
      <p className="text-xs text-p-text-2 mb-3">{t('portal.profile.invite_body', "Share your link — you'll both be rewarded when they join.")}</p>
      {link ? (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <code className="flex-1 min-w-0 truncate bg-p-surface-2 border border-p-border rounded-p-control px-3 py-2 text-xs">{link}</code>
          <Button variant="secondary" size="sm" onClick={() => { void share() }}>
            {copied ? <Check size={14} className="text-p-success" aria-hidden /> : typeof navigator !== 'undefined' && 'share' in navigator ? <Share2 size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied ? t('portal.common.copied', 'Copied') : t('portal.profile.invite_share', 'Share my link')}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-p-text-2">{t('portal.profile.invite_unavailable', 'Referral links are not available yet.')}</p>
      )}
      {data.total_referrals > 0 && <p className="text-[11px] text-p-text-2 mt-2">{t('portal.profile.invite_stats', '{{count}} friends joined', { count: data.total_referrals })}</p>}
    </Card>
  )
}
