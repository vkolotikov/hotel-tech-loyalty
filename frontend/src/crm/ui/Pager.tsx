import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Previous and next under a long list (Laravel's paginator: current_page, last_page, total). */
export function Pager({ page, last, total, onPage }: { page: number; last: number; total?: number; onPage: (page: number) => void }) {
  const { t } = useTranslation()
  if (last <= 1) return null
  const button = 'inline-flex min-h-9 items-center gap-1 rounded-full border border-a-border bg-a-surface px-3 text-sm text-a-text disabled:opacity-40'
  return (
    <nav aria-label={t('crm.common.pages', 'Pages')} className="flex items-center justify-between gap-3 pt-2">
      <button type="button" className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={15} aria-hidden />{t('crm.common.previous', 'Previous')}</button>
      <span className="text-sm text-a-text-2">{t('crm.common.page_of', 'Page {{page}} of {{last}}', { page, last })}{total !== undefined ? ` · ${t('crm.common.total', '{{count}} in all', { count: total })}` : ''}</span>
      <button type="button" className={button} disabled={page >= last} onClick={() => onPage(page + 1)}>{t('crm.common.next', 'Next')}<ChevronRight size={15} aria-hidden /></button>
    </nav>
  )
}
