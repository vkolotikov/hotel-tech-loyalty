import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../../workspace/ui/Notice'
import { useBrandId } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import type { BrandPayload } from '../../lib/types'
import { useBrand } from '../useBrand'

/**
 * Approvals (spec 2026-10-16 §6.1): whether the brand's posts need a manager's approval — per brand, default off,
 * managers only; everyone reads it. Switching changes no post's status; the bootstrap is read again (useBrand's adopt),
 * so every open page hides or shows what staff may do, and the managers' bell gains or loses its waiting posts.
 */
export function ApprovalsSection({ brand, canEdit }: { brand: BrandPayload; canEdit: boolean }) {
  const { t } = useTranslation()
  const { saveProfile } = useBrand()
  const queryClient = useQueryClient()
  const brandId = useBrandId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string) => t(`content.brand.approvals.${key}`, english)
  const on = brand.profile?.requires_approval === true
  const switchLabel = w('switch', 'Posts need a manager’s approval')

  const toggle = async () => {
    setBusy(true)
    setError(null)
    try {
      await saveProfile({ requires_approval: !on })
      void queryClient.invalidateQueries({ queryKey: ['content', brandId, 'inbox'] })
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="content-approvals" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="space-y-0.5">
        <h2 id="content-approvals" className="font-a-display text-lg font-normal text-a-text">{w('title', 'Approvals')}</h2>
        <p className="text-sm text-a-text-2">{w('intro', 'Whether posts wait for a manager’s approval before they are ready.')}</p>
      </div>
      {canEdit ? (
        <div className="flex items-center gap-3">
          <button type="button" role="switch" aria-checked={on} disabled={busy} aria-labelledby="content-approvals-switch" aria-describedby="content-approvals-line"
            onClick={() => { void toggle() }}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-a-accent' : 'bg-a-surface-2'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-a-surface shadow-a-sm transition ${on ? 'left-[1.375rem]' : 'left-0.5'}`} />
          </button>
          <span id="content-approvals-switch" className="text-sm text-a-text">{switchLabel}</span>
        </div>
      ) : (
        <p className="text-sm">
          <span className="text-a-text-2">{switchLabel}: </span>
          <span className="text-a-text">{on ? t('content.brand.channels.on', 'On') : t('content.brand.channels.off', 'Off')}</span>
        </p>
      )}
      <p id="content-approvals-line" className="text-xs text-a-text-2">
        {on
          ? w('on_line', 'On: staff write, edit and send posts for approval; only managers approve, mark ready and publish.')
          : w('off_line', 'Off: everyone can mark posts ready and published.')}
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  )
}
