import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Copy, Check, Loader2, Link2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'

interface LinkPayload { url: string; claim_url: string | null; qr: string }

/**
 * One labelled, copyable link row. Hoisted to module scope — rather than
 * declared inside MemberPortalLinkCard's render body — so its identity is
 * stable across renders: React patches this node's props instead of
 * unmounting/remounting it. That matters because copy() re-renders twice
 * per click (immediately via setCopied, then again ~1.8s later when the
 * checkmark reverts); a remount mid-interaction would destroy a focused
 * copy button under a keyboard or screen-reader user with no warning.
 */
function Row({ label, value, copied, copyLabel, onCopy }: {
  label: string
  value: string
  copied: boolean
  copyLabel: string
  onCopy: () => void
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-t-secondary mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-xs text-white">{value}</code>
        <button
          onClick={onCopy}
          aria-label={copyLabel}
          className="shrink-0 border border-dark-border rounded-lg p-2 text-t-secondary hover:text-white"
        >
          {copied ? <Check size={15} className="text-accent" /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  )
}

/**
 * The join link and its QR, for the desk. Members who already exist from
 * an import use the claim link instead; both are shown so staff can answer
 * "how do I get in" with one glance.
 */
export function MemberPortalLinkCard() {
  const { t } = useTranslation()
  const [copied, setCopied] = useState<string | null>(null)
  const { data, isLoading, isError, error } = useQuery<LinkPayload>({
    queryKey: ['member-portal-link'],
    queryFn: () => api.get('/v1/admin/member-portal/link').then(r => r.data),
    retry: false,
  })

  const copy = async (value: string, which: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(which)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      toast.error(t('members.portal.copy_failed', 'Could not copy — select the link and copy it by hand'))
    }
  }

  if (isLoading) {
    return <div className="flex justify-center py-10 text-t-secondary"><Loader2 className="animate-spin" size={20} /></div>
  }

  if (isError || !data) {
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
    return (
      <div className="rounded-xl border border-dark-border bg-dark-surface p-5 text-sm text-t-secondary">
        {message || t('members.portal.unavailable', 'The portal link is not available yet.')}
      </div>
    )
  }

  const copyLabel = t('members.portal.copy', 'Copy link')

  return (
    <div className="grid md:grid-cols-[1fr_auto] gap-6 rounded-xl border border-dark-border bg-dark-surface p-5">
      <div className="space-y-4 min-w-0">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-primary-400" />
          <h2 className="text-base font-semibold text-white">{t('members.portal.title', 'Member portal')}</h2>
        </div>
        <p className="text-sm text-t-secondary">
          {t('members.portal.intro', 'Share the join link with new customers. People you imported set their password through the second link.')}
        </p>
        <Row
          label={t('members.portal.join_link', 'Join link')}
          value={data.url}
          copied={copied === 'join'}
          copyLabel={copyLabel}
          onCopy={() => copy(data.url, 'join')}
        />
        {data.claim_url && (
          <Row
            label={t('members.portal.claim_link', 'Existing customers')}
            value={data.claim_url}
            copied={copied === 'claim'}
            copyLabel={copyLabel}
            onCopy={() => copy(data.claim_url as string, 'claim')}
          />
        )}
      </div>
      <div className="flex flex-col items-center gap-2">
        <img src={data.qr} alt={t('members.portal.qr_alt', 'QR code for the join link')} className="w-40 h-40 rounded-lg bg-white p-2" />
        <a href={data.qr} download="member-portal-join.png" className="text-xs text-primary-400 hover:text-primary-300">
          {t('members.portal.download_qr', 'Download QR')}
        </a>
      </div>
    </div>
  )
}
