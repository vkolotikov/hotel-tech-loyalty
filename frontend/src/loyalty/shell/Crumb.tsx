import { useTranslation } from 'react-i18next'
import { initialsOf } from '../../workspace/lib/firstLetter'

/**
 * The top bar's start (spec 2026-10-21 §4): the organisation's mark and name, "/", the page — Content's breadcrumb
 * without a brand menu, since the programme is the organisation's. A long name is cut, never pushing Find off the bar.
 */
export function Crumb({ organization, page }: { organization: string; page: string }) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('loyalty.shell.breadcrumb', 'Breadcrumb')} className="flex min-w-0 items-center gap-2">
      <span className="flex min-w-0 items-center gap-2 px-1">
        <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-a-accent text-xs font-semibold text-a-accent-ink">{initialsOf(organization)}</span>
        <span className="min-w-0 truncate text-sm font-semibold text-a-text">{organization}</span>
      </span>
      <span aria-hidden className="text-a-text-2">/</span>
      <span aria-current="page" className="shrink-0 text-sm text-a-text">{page}</span>
    </nav>
  )
}
