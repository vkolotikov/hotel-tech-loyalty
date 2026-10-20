import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Megaphone } from 'lucide-react'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBrandId } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import type { SitePayload } from '../../lib/types'
import { catchUp } from '../../promote/promoteMath'
import { useSite } from '../../promote/useSite'
import { WebsiteScan } from '../../promote/WebsiteScan'

const SUMMARY_MAX = 6000

/**
 * Website (spec 2026-10-20 §5), right after Readiness: the address and its scan, and the company summary every AI call
 * reads. Everyone reads it; managers scan, and edit the summary (an edit is kept by the next scan unless they ask).
 */
export function WebsiteSection({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation()
  const query = useSite()

  return (
    <section data-website="" aria-labelledby="content-website" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id="content-website" className="font-a-display text-lg font-normal text-a-text">{t('content.site.title', 'Website')}</h2>
          <p className="text-sm text-a-text-2">{t('content.site.intro', 'Content reads your website to learn about the company and to find articles and pages to promote.')}</p>
        </div>
        <Link to="/content/promote" className="inline-flex items-center gap-1.5 rounded-full border border-a-border px-3 py-1.5 text-sm font-semibold text-a-text hover:bg-a-surface-2">
          <Megaphone size={14} aria-hidden />{t('content.site.open_promote', 'Promote your articles and pages')}
        </Link>
      </div>
      {query.isLoading && <p role="status" className="text-sm text-a-text-2">{t('content.common.loading', 'Loading…')}</p>}
      {query.isError && !query.data && (
        <div className="space-y-2">
          <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button size="sm" variant="secondary" onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}
      {query.data && <WebsiteScan payload={query.data} canManage={canEdit} />}
      {query.data && <CompanySummary payload={query.data} canEdit={canEdit} />}
    </section>
  )
}

function CompanySummary({ payload, canEdit }: { payload: SitePayload; canEdit: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const site = payload.site
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scanning = site?.status === 'scanning'
  const box = useRef<HTMLDivElement>(null)
  const focusAfter = useRef<'textarea' | 'edit' | null>(null)

  // Edit puts the keyboard in the text; Save and Cancel bring it back to Edit (final review, 6-2: the buttons that had it are gone).
  useEffect(() => {
    const want = focusAfter.current
    if (!want) return
    focusAfter.current = null
    box.current?.querySelector<HTMLElement>(want === 'textarea' ? 'textarea' : '[data-summary-edit]')?.focus()
  })

  const close = () => {
    focusAfter.current = 'edit'
    setDraft(null)
  }
  const save = async () => {
    if (draft === null || busy) return
    setBusy(true)
    setError(null)
    try {
      queryClient.setQueryData(['content', brand, 'site'], await api.saveSite({ summary: draft }))
      close()
    } catch (e) {
      const code = failureOf(e).code
      const [key, text] = errorKey('site', code)
      setError(t(key, text))
      // A scan started in another tab: catch up, so this tab shows it.
      if (catchUp(code).includes('site')) void queryClient.invalidateQueries({ queryKey: ['content', brand, 'site'] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={box} data-company-summary="" className="space-y-2 border-t border-a-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-a-text">
          {t('content.site.summary_title', 'Company summary')}
          {site?.summary_edited && <span className="ml-2 text-xs font-normal text-a-text-2">{t('content.site.summary_edited', 'Edited by hand')}</span>}
        </h3>
        {canEdit && draft === null && (
          <Button size="sm" variant="secondary" data-summary-edit="" disabled={scanning}
            onClick={() => { focusAfter.current = 'textarea'; setDraft(site?.summary ?? ''); setError(null) }}>{t('content.site.summary_edit', 'Edit summary')}</Button>
        )}
      </div>
      <p className="text-xs text-a-text-2">{t('content.site.summary_intro', 'What the AI knows about your company from your website. The AI reads it for every post it writes.')}</p>
      {draft === null ? (
        site?.summary
          ? <p className="whitespace-pre-line break-words text-sm text-a-text">{site.summary}</p>
          : <p className="text-sm text-a-text-2">{t('content.site.summary_none', 'No summary yet. Scan the website to write one.')}</p>
      ) : (
        <div className="space-y-2">
          <label className="block">
            <span className="sr-only">{t('content.site.summary_title', 'Company summary')}</span>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={10} maxLength={SUMMARY_MAX}
              className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text" />
          </label>
          <div className="flex gap-2">
            <Button size="sm" loading={busy} onClick={() => { void save() }}>{t('content.site.summary_save', 'Save summary')}</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={close}>{t('content.common.cancel', 'Cancel')}</Button>
          </div>
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  )
}
