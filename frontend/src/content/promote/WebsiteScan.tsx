import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { SitePayload } from '../lib/types'
import { catchUp, siteLine, startAddress, summaryNote, updateDefault } from './promoteMath'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * The website's address and its scan (spec 2026-10-20 §3.1, §3.7, §5), on the Brand page and on Promote. Managers enter
 * the address (the organisation's website to start), choose whether the company summary is written again (unticked when
 * someone edited it by hand) and press Scan; everyone reads how the last scan went.
 */
export function WebsiteScan({ payload, canManage }: { payload: SitePayload; canManage: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const site = payload.site
  // Both follow what is stored until the manager changes them (final review, 6-2): a summary edited by hand meanwhile
  // unticks "Update", and the address shows its cleaned form after a scan.
  const [typed, setTyped] = useState<string | null>(null)
  const [choice, setChoice] = useState<boolean | null>(null)
  const address = typed ?? startAddress(payload)
  const update = choice ?? updateDefault(site)
  const editedAt = site?.summary_updated_at ?? null
  const [seenEdit, setSeenEdit] = useState(editedAt)
  if (editedAt !== seenEdit) {
    setSeenEdit(editedAt)
    setChoice(null)
  }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scanning = site?.status === 'scanning'
  const line = siteLine(site, t, locale)
  const note = site?.status === 'ready' ? summaryNote(site, t) : null

  const scan = async () => {
    if (busy || scanning || address.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const answer = await api.scanSite({ url: address.trim(), update_summary: update })
      queryClient.setQueryData(['content', brand, 'site'], answer)
      setTyped(null)
      // Where the queue is sync the scan is already over: the brand may have new summary fields and readiness.
      if (answer.site?.status !== 'scanning') {
        void queryClient.invalidateQueries({ queryKey: ['content', brand, 'brand'] })
        void queryClient.invalidateQueries({ queryKey: ['content', 'bootstrap'] })
      }
    } catch (e) {
      const code = failureOf(e).code
      const [key, text] = errorKey('site', code)
      setError(t(key, text))
      // Another tab is scanning: catch up, so this tab shows it and follows it.
      if (catchUp(code).includes('site')) void queryClient.invalidateQueries({ queryKey: ['content', brand, 'site'] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-website-scan="" className="space-y-3">
      {canManage ? (
        <form onSubmit={(e) => { e.preventDefault(); void scan() }} className="space-y-3">
          <Field label={t('content.site.address', 'Website address')}
            hint={t('content.site.address_hint', 'For example https://example.com. A blog with its own address can be entered as it is, for example https://example.com/blog.')}>
            <input type="url" inputMode="url" autoComplete="url" value={address} onChange={(e) => setTyped(e.target.value)} disabled={scanning}
              placeholder="https://example.com" className={INPUT} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy} disabled={scanning || address.trim() === ''}>
              {site?.scanned_at ? t('content.site.scan_again', 'Scan again') : t('content.site.scan', 'Scan website')}
            </Button>
            <label className="inline-flex items-center gap-2 text-sm text-a-text">
              <input type="checkbox" checked={update} onChange={(e) => setChoice(e.target.checked)} disabled={scanning} />{t('content.site.update_summary', 'Update the company summary')}
            </label>
          </div>
          {update && site?.summary && <p className="text-xs text-a-text-2">{t('content.site.replaces', 'Scanning again replaces the company summary.')}</p>}
        </form>
      ) : site?.url ? (
        <p className="text-sm text-a-text">
          <span className="font-medium text-a-text-2">{t('content.site.address', 'Website address')}: </span>
          <a href={site.url} target="_blank" rel="noopener noreferrer" className="break-all text-a-accent-text hover:underline">{site.url}</a>
        </p>
      ) : (
        <p className="text-sm text-a-text-2">{t('content.site.none_staff', 'Your manager has not added the website yet.')}</p>
      )}
      {line && line.tone === 'danger' && <Notice tone="danger">{line.text}</Notice>}
      {line && line.tone !== 'danger' && (
        <p role="status" className="flex items-start gap-2 text-sm text-a-text-2">
          {scanning && <Loader2 size={14} aria-hidden className="mt-0.5 shrink-0 motion-safe:animate-spin" />}
          <span>{line.text}</span>
        </p>
      )}
      {note && <p className="text-xs text-a-text-2">{note}</p>}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  )
}
