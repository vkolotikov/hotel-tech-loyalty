import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useApi } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { BrandPayload, Readiness as ReadinessData } from '../lib/types'
import { GAP_TEXT, SECTION_TEXT } from './readinessWords'

/**
 * Knowledge and readiness (spec §4.6): how well the AI knows the brand,
 * section by section, with what is missing in the portal's words (the gap
 * codes; never the server's English hints). Managers can have the
 * organisation's FAQ, chatbot knowledge and services read again.
 */
export function Readiness({ readiness, canRefresh, lastSync, locale, onRefreshed }: {
  readiness: ReadinessData
  canRefresh: boolean
  lastSync: string | null
  locale: string
  onRefreshed: (payload: BrandPayload) => void
}) {
  const { t } = useTranslation()
  const api = useApi()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const refresh = async () => {
    setBusy(true)
    setNote(null)
    try {
      onRefreshed(await api.refreshKnowledge())
      setNote({ tone: 'success', text: t('content.brand.refreshed', 'Knowledge read again.') })
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setNote({ tone: 'danger', text: t(key, text) })
    } finally {
      setBusy(false)
    }
  }

  const synced = lastSync ? new Date(lastSync) : null
  return (
    <section aria-labelledby="content-readiness" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id="content-readiness" className="font-a-display text-lg font-normal text-a-text">{t('content.brand.readiness', 'Knowledge and readiness')}</h2>
          <p className="text-sm text-a-text-2">{t('content.brand.readiness_intro', 'How well the AI knows this brand. Every gap makes its posts more generic.')}</p>
        </div>
        <p className="font-a-display text-4xl text-a-text">{readiness.overall} %</p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {readiness.sections.map(section => (
          <li key={section.key} className="space-y-1.5 rounded-lg border border-a-border p-3">
            <div className="flex justify-between gap-2 text-sm">
              <span className="font-medium text-a-text">{t(`content.brand.section.${section.key}`, SECTION_TEXT[section.key] ?? section.key)}</span>
              <span className="text-a-text-2">{section.score} %</span>
            </div>
            <div className="h-1.5 rounded-full bg-a-surface-2" aria-hidden><div className="h-1.5 rounded-full bg-a-accent" style={{ width: `${section.score}%` }} /></div>
            {(section.missing ?? []).length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-a-text-2">
                {(section.missing ?? []).filter(code => code in GAP_TEXT).map(code => (
                  <li key={code}>{t(`content.brand.gap.${code}`, GAP_TEXT[code], { count: section.faq_count ?? 0 })}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-a-text-2">
          {synced && !Number.isNaN(synced.getTime())
            ? t('content.brand.synced', 'Knowledge read on {{date}}', { date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(synced) })
            : t('content.brand.never_synced', 'Knowledge not read yet')}
        </span>
        {canRefresh && (
          <Button size="sm" variant="secondary" loading={busy} onClick={() => { void refresh() }}>
            <RefreshCw size={14} aria-hidden />{t('content.brand.refresh', 'Refresh knowledge')}
          </Button>
        )}
        {note && <span role="status" className={`text-sm ${note.tone === 'danger' ? 'text-a-danger' : 'text-a-text-2'}`}>{note.text}</span>}
      </div>
    </section>
  )
}
