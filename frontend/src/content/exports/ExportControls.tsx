import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import type { PostFilters } from '../lib/types'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'

export function ExportControls({ filters, plan = false, disabled = false }: { filters: PostFilters; plan?: boolean; disabled?: boolean }) {
  const api = useApi(), brand = useBrandId(), { t } = useTranslation()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false)
  const owner = useRef<number | null | undefined>(brand)
  useEffect(() => { owner.current = brand; return () => { owner.current = undefined } }, [brand])
  const download = async (format: 'csv' | 'ics') => {
    setBusy(true); setError(''); setDone(false)
    try {
      const blob = await api.exportSchedule(format, filters)
      if (owner.current !== brand) return
      const url = URL.createObjectURL(blob), anchor = document.createElement('a')
      anchor.href = url; anchor.download = `content-schedule.${format}`; anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDone(true)
    } catch (e) { if (owner.current === brand) setError(failureOf(e).code || 'export_failed') }
    finally { if (owner.current === brand) setBusy(false) }
  }
  return <details className="rounded-lg border border-a-border bg-a-surface p-3 text-sm text-a-text-2">
    <summary className="cursor-pointer font-medium text-a-text">{t('content.exports.title', 'Export filtered posts')}</summary>
    <div className="mt-3 space-y-3">
      <p>{plan ? t('content.exports.plan', 'Exports the displayed date range and chosen platforms/status. The undated tray is separate; use Posts to export it.') : t('content.exports.selection', 'Exports all matching posts, across every page, up to 5,000. Refine the filters for larger selections.')}</p>
      <p>{t('content.exports.schedule', 'CSV can include undated posts. ICS includes scheduled posts only; dates without a time become all-day events. Timed events use the saved planning time zone.')}</p>
      <p className="text-xs">{t('content.exports.csv_note', 'For spreadsheet viewing, formula-like cells receive a leading tab. Programmatic imports may retain it; safety can change after saving and re-importing in a spreadsheet.')}</p>
      <div className="flex flex-wrap gap-2">{(['csv', 'ics'] as const).map(format => <Button variant="secondary" size="sm" key={format} disabled={busy || disabled} onClick={() => { void download(format) }}>{t(`content.exports.${format}`, format === 'csv' ? 'Download CSV' : 'Download calendar (ICS)')}</Button>)}</div>
      {busy && <p role="status">{t('content.exports.preparing', 'Preparing download…')}</p>}
      {done && <p role="status">{t('content.exports.done', 'Download prepared.')}</p>}
      {error && <Notice tone="danger">{error === 'export_empty' ? t('content.exports.empty', 'No exportable posts match. ICS needs a scheduled date; adjust the filters or choose CSV.') : error === 'export_too_many' ? t('content.exports.too_many', 'More than 5,000 posts match. Refine the filters and export again.') : t('content.exports.failed', 'The export could not be prepared. Please try again.')}</Notice>}
    </div>
  </details>
}
